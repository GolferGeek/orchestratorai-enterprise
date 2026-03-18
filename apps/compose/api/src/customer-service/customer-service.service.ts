/**
 * CustomerServiceService
 *
 * Handles guest session lifecycle for the unauthenticated landing page
 * customer-service experience.
 *
 * Guest sessions are the ONE exception in Compose where the backend constructs
 * an ExecutionContext (analogous to Pulse's createSystemTriggeredContext).
 * The guest has no Supabase account; we issue a short-lived JWT that carries
 * conversationId and guestId so the RAG runner can attribute the call.
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

export interface GuestSessionPayload {
  conversationId: string;
  guestId: string;
  iat: number;
  exp: number;
}

export interface GuestSession {
  sessionToken: string;
  conversationId: string;
}

@Injectable()
export class CustomerServiceService {
  private readonly logger = new Logger(CustomerServiceService.name);
  private readonly secret: string;
  private readonly defaultProvider: string;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    this.secret =
      this.configService.get<string>('GUEST_SESSION_SECRET') ??
      'compose-guest-secret-dev';

    this.defaultProvider =
      this.configService.get<string>('CUSTOMER_SERVICE_DEFAULT_PROVIDER') ??
      this.configService.get<string>('DEFAULT_LLM_PROVIDER') ??
      'anthropic';

    this.defaultModel =
      this.configService.get<string>('CUSTOMER_SERVICE_DEFAULT_MODEL') ??
      this.configService.get<string>('DEFAULT_LLM_MODEL') ??
      'claude-sonnet-4-6';
  }

  /**
   * Create a new guest session. Returns a signed JWT and the conversation ID.
   * The JWT expires in 24 hours.
   */
  createSession(): GuestSession {
    const conversationId = uuidv4();
    const guestId = uuidv4();

    const payload: Omit<GuestSessionPayload, 'iat' | 'exp'> = {
      conversationId,
      guestId,
    };

    const sessionToken = jwt.sign(payload, this.secret, {
      expiresIn: '24h',
    });

    this.logger.debug(
      `Guest session created — conversationId: ${conversationId}`,
    );

    return { sessionToken, conversationId };
  }

  /**
   * Verify a guest session JWT. Throws UnauthorizedException if invalid.
   */
  verifySession(token: string): GuestSessionPayload {
    try {
      const decoded = jwt.verify(token, this.secret) as GuestSessionPayload;
      return decoded;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UnauthorizedException(`Invalid guest session: ${message}`);
    }
  }

  /**
   * Build an ExecutionContext for a guest user.
   *
   * This is the ONE location in Compose where the backend constructs an
   * ExecutionContext. It follows the same pattern as Pulse's
   * createSystemTriggeredContext() — the session JWT provides the identity.
   */
  buildGuestContext(
    session: GuestSessionPayload,
    provider?: string,
    model?: string,
  ): ExecutionContext {
    return {
      orgSlug: 'global',
      userId: session.guestId,
      conversationId: session.conversationId,
      agentSlug: 'customer-service',
      agentType: 'rag',
      provider: provider ?? this.defaultProvider,
      model: model ?? this.defaultModel,
    };
  }
}
