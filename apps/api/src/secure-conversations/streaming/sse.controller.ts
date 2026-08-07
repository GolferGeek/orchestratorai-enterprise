import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  isExecutionContext,
  type ExecutionContext,
} from '@orchestrator-ai/transport-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { SupabaseAuthUserDto } from '../../auth/dto/auth.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  StreamTokenService,
  type StreamTokenClaims,
} from '../../auth/services/stream-token.service';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { SseService } from './sse.service';

// SSE streaming accepts Bearer JWTs or short-lived stream tokens.
@Controller('secure-conversations/stream')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:audit')
export class SseController {
  constructor(
    private readonly sse: SseService,
    private readonly streamTokens: StreamTokenService,
  ) {}

  @Post('token')
  issueStreamToken(
    @Body() body: unknown,
    @CurrentUser() user: SupabaseAuthUserDto,
    @Req() request: Request,
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

  /**
   * SSE endpoint for Secure Conversations event stream.
   * Clients connect and receive real-time events as Secure Conversations processes A2A traffic.
   *
   * GET /stream/events
   */
  @Get('events')
  stream(@Req() req: Request, @Res() res: Response): void {
    const organizationSlug = this.getOrganizationSlug(req);
    const authenticatedRequest = req as Request & {
      streamTokenClaims?: StreamTokenClaims;
      user?: SupabaseAuthUserDto;
    };
    const claims = authenticatedRequest.streamTokenClaims;
    if (
      claims &&
      (claims.sub !== authenticatedRequest.user?.id ||
        claims.agentSlug !== 'secure-conversations' ||
        claims.organizationSlug !== organizationSlug)
    ) {
      throw new UnauthorizedException(
        'Secure Conversations stream token is not valid',
      );
    }
    this.sse.addClient(res, organizationSlug);
    // Response stays open — SSE connection is long-lived
  }

  @Get('status')
  getStatus(@Req() request: Request) {
    const organizationSlug = this.getOrganizationSlug(request);
    return {
      clients: this.sse.getClientCount(organizationSlug),
      timestamp: new Date().toISOString(),
    };
  }

  private getOrganizationSlug(request: Request): string {
    const orgSlug = (request as Request & { organizationSlug?: string })
      .organizationSlug;
    if (!orgSlug || orgSlug === '*') {
      throw new BadRequestException(
        'A specific authorized organization is required',
      );
    }
    return orgSlug;
  }

  private validateContextBody(
    body: unknown,
    userId: string,
    request: Request,
  ): ExecutionContext {
    const authorizedOrganization = (
      request as Request & { organizationSlug?: string }
    ).organizationSlug;
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
      context.agentSlug !== 'secure-conversations' ||
      context.agentType !== 'secure-conversations' ||
      !authorizedOrganization ||
      (authorizedOrganization !== '*' &&
        context.orgSlug !== authorizedOrganization)
    ) {
      throw new BadRequestException(
        'Secure Conversations ExecutionContext is invalid',
      );
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
}
