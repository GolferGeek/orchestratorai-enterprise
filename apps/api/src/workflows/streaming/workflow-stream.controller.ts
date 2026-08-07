import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  isExecutionContext,
  type ExecutionContext,
} from '@orchestrator-ai/transport-types';
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

interface AuthorizedRequest {
  organizationSlug?: string;
  streamTokenClaims?: StreamTokenClaims;
}

@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class WorkflowStreamController {
  constructor(
    private readonly events: ObservabilityEventsService,
    private readonly streamTokens: StreamTokenService,
  ) {}

  @Post('stream-token')
  issueStreamToken(
    @Body() body: unknown,
    @CurrentUser() user: SupabaseAuthUserDto,
    @Req() request: AuthorizedRequest,
  ): { token: string; expiresAt: string } {
    const context = this.validateContextBody(body, user.id, request);
    const issued = this.streamTokens.issueToken({
      user,
      taskId: context.conversationId,
      agentSlug: context.agentSlug,
      organizationSlug: context.orgSlug,
      conversationId: context.conversationId,
    });
    return { token: issued.token, expiresAt: issued.expiresAt.toISOString() };
  }

  @Get('stream')
  stream(
    @Query('conversationId') conversationId: string,
    @CurrentUser() user: SupabaseAuthUserDto,
    @Req() request: AuthorizedRequest,
    @Res() response: Response,
  ): void {
    const claims = request.streamTokenClaims;
    if (
      !claims ||
      claims.sub !== user.id ||
      claims.agentSlug !== 'marketing-swarm' ||
      claims.taskId !== conversationId ||
      claims.conversationId !== conversationId ||
      claims.organizationSlug !== request.organizationSlug
    ) {
      throw new UnauthorizedException('Workflow stream token is not valid');
    }

    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-store');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    response.write(
      `data: ${JSON.stringify({ event_type: 'connected', conversationId })}\n\n`,
    );

    for (const event of this.events.getSnapshot()) {
      if (
        this.isAuthorizedEvent(
          event,
          user.id,
          request.organizationSlug!,
          conversationId,
        )
      ) {
        this.writeEvent(response, event);
      }
    }

    const subscription = this.events.events$.subscribe((event) => {
      if (
        this.isAuthorizedEvent(
          event,
          user.id,
          request.organizationSlug!,
          conversationId,
        )
      ) {
        this.writeEvent(response, event);
      }
    });
    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(': heartbeat\n\n');
    }, 30_000);
    response.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
    });
  }

  private validateContextBody(
    body: unknown,
    userId: string,
    request: AuthorizedRequest,
  ): ExecutionContext {
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !('context' in body)
    ) {
      throw new BadRequestException('A complete ExecutionContext is required');
    }
    const context = (body as { context: unknown }).context;
    if (
      !isExecutionContext(context) ||
      !this.hasOnlyContextKeys(context) ||
      context.userId !== userId ||
      context.agentSlug !== 'marketing-swarm' ||
      context.agentType !== 'workflow' ||
      !request.organizationSlug ||
      (request.organizationSlug !== '*' &&
        context.orgSlug !== request.organizationSlug)
    ) {
      throw new BadRequestException('Workflow ExecutionContext is invalid');
    }
    return context;
  }

  private hasOnlyContextKeys(context: ExecutionContext): boolean {
    const allowed = new Set([
      'orgSlug',
      'userId',
      'conversationId',
      'agentSlug',
      'agentType',
      'provider',
      'model',
      'sovereignMode',
    ]);
    return Object.keys(context).every((key) => allowed.has(key));
  }

  private isAuthorizedEvent(
    event: ObservabilityEventRecord,
    userId: string,
    organizationSlug: string,
    conversationId: string,
  ): boolean {
    return (
      event.context.userId === userId &&
      event.context.conversationId === conversationId &&
      event.context.agentSlug === 'marketing-swarm' &&
      (organizationSlug === '*' || event.context.orgSlug === organizationSlug)
    );
  }

  private writeEvent(
    response: Response,
    event: ObservabilityEventRecord,
  ): void {
    if (!response.writableEnded) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
}
