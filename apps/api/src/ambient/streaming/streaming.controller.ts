import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Logger,
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
import { StreamingService } from './streaming.service';

/**
 * SSE streaming endpoint.
 *
 * Platform-standard SSE format:
 *   Content-Type: text/event-stream
 *   Cache-Control: no-cache
 *   Connection: keep-alive
 *   data: <JSON>\n\n
 *
 * This matches the format used by Workflows and Secure Conversations.
 */
// SSE streaming accepts Bearer JWTs or short-lived stream tokens.
@Controller('ambient/streaming')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class StreamingController {
  private readonly logger = new Logger(StreamingController.name);

  constructor(
    private readonly streamingService: StreamingService,
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

  @Get('events')
  stream(@Req() req: Request, @Res() res: Response): void {
    const orgSlug = (req as Request & { organizationSlug?: string })
      .organizationSlug;
    if (!orgSlug || orgSlug === '*') {
      throw new BadRequestException(
        'A specific authorized organization is required',
      );
    }
    const authenticatedRequest = req as Request & {
      streamTokenClaims?: StreamTokenClaims;
      user?: SupabaseAuthUserDto;
    };
    const claims = authenticatedRequest.streamTokenClaims;
    if (
      claims &&
      (claims.sub !== authenticatedRequest.user?.id ||
        claims.agentSlug !== 'ambient' ||
        claims.organizationSlug !== orgSlug)
    ) {
      throw new UnauthorizedException('Ambient stream token is not valid');
    }
    // Platform-standard SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial connection event
    res.write(
      `data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`,
    );

    // Subscribe to events and forward to client
    const subscription = this.streamingService
      .eventsForOrganization(orgSlug)
      .subscribe({
        next: (event) => {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        },
        error: (err: Error) => {
          this.logger.error(`Streaming error: ${err.message}`);
          if (!res.writableEnded) {
            res.write(
              `data: ${JSON.stringify({ type: 'error', message: 'Ambient stream failed' })}\n\n`,
            );
            res.end();
          }
        },
      });

    // Heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`,
        );
      }
    }, 30000);

    // Clean up on client disconnect
    res.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
      this.logger.debug('SSE client disconnected');
    });
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
      context.agentSlug !== 'ambient' ||
      context.agentType !== 'ambient' ||
      !authorizedOrganization ||
      (authorizedOrganization !== '*' &&
        context.orgSlug !== authorizedOrganization)
    ) {
      throw new BadRequestException('Ambient ExecutionContext is invalid');
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
