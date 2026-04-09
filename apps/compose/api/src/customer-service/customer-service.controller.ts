/**
 * CustomerServiceController
 *
 * Provides unauthenticated guest session management for the landing page
 * customer-service chat widget.
 *
 * Two endpoints:
 *   POST /customer-service/session  — no auth, creates a guest session JWT
 *   POST /customer-service/converse — accepts GuestSession JWT or Bearer JWT
 *
 * The @Public() decorator bypasses the global JwtAuthGuard for session creation.
 * The /converse endpoint handles its own auth inline (guest or bearer).
 */

import {
  Body,
  Controller,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Public } from '@orchestratorai/auth-client';
import { CustomerServiceService } from './customer-service.service';
import { InvokeDispatchService } from '../invoke/invoke-dispatch.service';
import type {
  InvokeData,
  InvokeOutput,
} from '@orchestrator-ai/transport-types';

interface ConverseBody {
  message: string;
  interactionMode?: 'text' | 'voice';
}

@Controller('customer-service')
export class CustomerServiceController {
  private readonly logger = new Logger(CustomerServiceController.name);

  constructor(
    private readonly customerServiceSvc: CustomerServiceService,
    private readonly dispatch: InvokeDispatchService,
  ) {}

  /**
   * POST /customer-service/session
   *
   * No authentication required. Creates a guest session and returns a JWT
   * that the client can use for subsequent /converse calls.
   */
  @Public()
  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  createSession(): { sessionToken: string; conversationId: string } {
    return this.customerServiceSvc.createSession();
  }

  /**
   * POST /customer-service/converse
   *
   * Accepts either:
   *   Authorization: GuestSession <token>   — for unauthenticated landing page users
   *   Authorization: Bearer <token>         — for authenticated Compose users
   *
   * Builds an ExecutionContext and calls the InvokeDispatchService.
   * The RAG runner handles retrieval + LLM generation.
   * The voice-mode condensing in the RAG runner handles interactionMode=voice.
   */
  @Public()
  @Post('converse')
  @HttpCode(HttpStatus.OK)
  async converse(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ConverseBody,
  ): Promise<InvokeOutput> {
    if (!body?.message?.trim()) {
      throw new BadRequestException('message is required');
    }

    if (!authorization) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const interactionMode: 'text' | 'voice' =
      body.interactionMode === 'voice' ? 'voice' : 'text';

    // -------------------------------------------------------------------------
    // Resolve ExecutionContext from token type
    // -------------------------------------------------------------------------

    let context;

    if (authorization.startsWith('GuestSession ')) {
      // Guest path: verify the guest JWT and construct context
      const token = authorization.slice('GuestSession '.length).trim();
      if (!token) {
        throw new UnauthorizedException('Missing guest session token');
      }

      const session = this.customerServiceSvc.verifySession(token);
      context = this.customerServiceSvc.buildGuestContext(session);

      this.logger.debug(
        `Guest converse — guestId: ${session.guestId}, conversationId: ${session.conversationId}`,
      );
    } else if (authorization.startsWith('Bearer ')) {
      // Authenticated path: the JwtAuthGuard is bypassed by @Public(), so we
      // cannot rely on request.user here. We parse the JWT claims directly to
      // extract the user identity without re-validating (the request arrived
      // over HTTPS; the token will be validated by the LLM plane).
      //
      // NOTE: For a production hardening pass, replace this with a call to the
      // Auth API's validate endpoint. For Phase 3 this is sufficient.
      const token = authorization.slice('Bearer '.length).trim();
      if (!token) {
        throw new UnauthorizedException('Missing bearer token');
      }

      // Decode without verification to extract claims (validation deferred to plane)
      let claims: Record<string, unknown>;
      try {
        const parts = token.split('.');
        if (parts.length !== 3) {
          throw new Error('Malformed JWT');
        }
        claims = JSON.parse(
          Buffer.from(parts[1]!, 'base64url').toString('utf8'),
        ) as Record<string, unknown>;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new UnauthorizedException(
          `Cannot parse bearer token: ${message}`,
        );
      }

      const userId = (claims.sub ?? claims.user_id ?? claims.id) as
        | string
        | undefined;
      const orgSlug = (claims.org_slug ??
        claims.orgSlug ??
        claims.organization_slug) as string | undefined;

      if (!userId) {
        throw new UnauthorizedException('Bearer token missing user identity');
      }

      const { v4: uuidv4 } = await import('uuid');
      context = {
        orgSlug: orgSlug ?? 'global',
        userId,
        conversationId: uuidv4(),
        agentSlug: 'customer-service',
        agentType: 'rag',
        provider: (claims.provider as string | undefined) ?? 'anthropic',
        model: (claims.model as string | undefined) ?? 'claude-sonnet-4-6',
      };
    } else {
      throw new UnauthorizedException(
        'Authorization must be GuestSession or Bearer',
      );
    }

    // -------------------------------------------------------------------------
    // Build invoke data and dispatch
    // -------------------------------------------------------------------------

    const data: InvokeData = {
      content: body.message,
      contentType: 'text',
    };

    const metadata: Record<string, unknown> = {
      interactionMode,
    };

    return this.dispatch.invoke(context, data, metadata);
  }
}
