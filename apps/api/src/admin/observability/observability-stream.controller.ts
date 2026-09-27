import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ObservabilityEventsService,
  type ObservabilityEventRecord,
} from '@orchestratorai/planes/observability';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { SupabaseAuthUserDto } from '../../auth/dto/auth.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  StreamTokenService,
  type StreamTokenClaims,
} from '../../auth/services/stream-token.service';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { boundOrganization } from './observability.controller';

/** The purpose a token must name to open the admin stream. */
export const ADMIN_STREAM_PURPOSE = 'admin-observability';

interface StreamRequest {
  organizationSlug?: string;
  streamTokenClaims?: StreamTokenClaims;
}

/**
 * The live admin event stream: every event the observability plane emits,
 * as it fires, for the admin's org (every org for a super-admin with none
 * selected).
 *
 * POST /admin/observability/stream-token  (Bearer)  → { token, expiresAt }
 * GET  /admin/observability/stream?token=…          → text/event-stream
 *
 * EventSource cannot send headers, so the stream takes a short-lived token
 * bound to this purpose, this user and this org; a token issued for any
 * other stream (a workflow conversation) is refused here.
 */
@Controller('admin/observability')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class ObservabilityStreamController {
  constructor(
    private readonly events: ObservabilityEventsService,
    private readonly streamTokens: StreamTokenService,
  ) {}

  @Post('stream-token')
  @HttpCode(HttpStatus.CREATED)
  issueStreamToken(
    @CurrentUser() user: SupabaseAuthUserDto,
    @Req() request: StreamRequest,
  ): { token: string; expiresAt: string } {
    const issued = this.streamTokens.issueToken({
      user,
      taskId: ADMIN_STREAM_PURPOSE,
      agentSlug: ADMIN_STREAM_PURPOSE,
      organizationSlug: boundOrganization(request),
      conversationId: null,
    });
    return { token: issued.token, expiresAt: issued.expiresAt.toISOString() };
  }

  @Get('stream')
  stream(
    @CurrentUser() user: SupabaseAuthUserDto,
    @Req() request: StreamRequest,
    @Res() response: Response,
    @Query('agentSlug') agentSlug?: string,
    @Query('conversationId') conversationId?: string,
  ): void {
    const claims = request.streamTokenClaims;
    const org = boundOrganization(request);
    if (
      !claims ||
      claims.agentSlug !== ADMIN_STREAM_PURPOSE ||
      claims.taskId !== ADMIN_STREAM_PURPOSE ||
      claims.sub !== user.id ||
      claims.organizationSlug !== org
    ) {
      throw new ForbiddenException('The admin event stream needs an admin stream token');
    }
    const visible = (event: ObservabilityEventRecord): boolean =>
      (org === '*' || event.context.orgSlug === org) &&
      (!agentSlug || event.context.agentSlug === agentSlug) &&
      (!conversationId || event.context.conversationId === conversationId);

    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-store');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    const write = (payload: unknown) => {
      if (!response.writableEnded) response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    write({ event_type: 'connected', organizationSlug: org });
    for (const event of this.events.getSnapshot()) {
      if (visible(event)) write(event);
    }
    const subscription = this.events.events$.subscribe((event) => {
      if (visible(event)) write(event);
    });
    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(': heartbeat\n\n');
    }, 30_000);
    response.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
    });
  }
}
