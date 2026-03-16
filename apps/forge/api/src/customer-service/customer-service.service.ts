import {
  Injectable,
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import * as jwt from 'jsonwebtoken';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

export interface GuestSession {
  sessionToken: string;
  conversationId: string;
  userId: string;
  createdAt: number;
  executionContext: ExecutionContext;
}

interface GuestSessionTokenPayload {
  sub: string;
  conversationId: string;
  iat: number;
  exp: number;
}

@Injectable()
export class CustomerServiceService {
  private readonly logger = new Logger(CustomerServiceService.name);
  private readonly SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

  constructor(private readonly configService: ConfigService) {}

  private getSessionSecret(): string {
    const secret = this.configService.get<string>('GUEST_SESSION_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'GUEST_SESSION_SECRET environment variable is required',
      );
    }
    return secret;
  }

  private getDefaultLlmProvider(): string {
    const provider =
      this.configService.get<string>('CUSTOMER_SERVICE_LLM_PROVIDER') ||
      this.configService.get<string>('DEFAULT_LLM_PROVIDER');
    if (!provider) {
      throw new InternalServerErrorException(
        'CUSTOMER_SERVICE_LLM_PROVIDER or DEFAULT_LLM_PROVIDER environment variable is required for guest sessions',
      );
    }
    return provider;
  }

  private getDefaultLlmModel(): string {
    const model =
      this.configService.get<string>('CUSTOMER_SERVICE_LLM_MODEL') ||
      this.configService.get<string>('DEFAULT_LLM_MODEL');
    if (!model) {
      throw new InternalServerErrorException(
        'CUSTOMER_SERVICE_LLM_MODEL or DEFAULT_LLM_MODEL environment variable is required for guest sessions',
      );
    }
    return model;
  }

  /**
   * Create an anonymous guest session.
   * Constructs an ExecutionContext server-side for the landing page visitor.
   * The sessionToken is a signed JWT carrying the userId and conversationId.
   */
  createSession(): { sessionToken: string; conversationId: string } {
    const userId = uuidv4();
    const conversationId = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    const payload: GuestSessionTokenPayload = {
      sub: userId,
      conversationId,
      iat: now,
      exp: now + this.SESSION_TTL_SECONDS,
    };

    const sessionToken = jwt.sign(payload, this.getSessionSecret(), {
      algorithm: 'HS256',
    });

    this.logger.log(
      `Guest session created: userId=${userId}, conversationId=${conversationId}`,
    );

    return { sessionToken, conversationId };
  }

  /**
   * Build the ExecutionContext for a guest session from its verified token payload.
   * ExecutionContext is constructed server-side for public guest sessions —
   * this is the one legitimate case where the backend constructs it.
   */
  buildExecutionContext(payload: GuestSessionTokenPayload): ExecutionContext {
    return {
      orgSlug: 'public',
      userId: payload.sub,
      conversationId: payload.conversationId,
      taskId: NIL_UUID,
      planId: NIL_UUID,
      deliverableId: NIL_UUID,
      agentSlug: 'customer-service',
      agentType: 'langgraph',
      provider: this.getDefaultLlmProvider(),
      model: this.getDefaultLlmModel(),
    };
  }

  /**
   * Build ExecutionContext for an authenticated user (Bearer token).
   * Used when /customer-service/converse is called with Bearer auth from the Agent Pool.
   * orgSlug must be explicitly provided — no default; callers must pass valid context.orgSlug.
   */
  buildExecutionContextForAuthenticatedUser(
    userId: string,
    conversationId: string,
    orgSlug: string,
  ): ExecutionContext {
    return {
      orgSlug,
      userId,
      conversationId,
      taskId: NIL_UUID,
      planId: NIL_UUID,
      deliverableId: NIL_UUID,
      agentSlug: 'customer-service',
      agentType: 'langgraph',
      provider: this.getDefaultLlmProvider(),
      model: this.getDefaultLlmModel(),
    };
  }

  /**
   * Verify a guest session token and return the decoded payload.
   * Returns null if the token is invalid or expired.
   */
  verifySessionToken(
    token: string,
  ):
    | (GuestSessionTokenPayload & { executionContext: ExecutionContext })
    | null {
    try {
      const payload = jwt.verify(
        token,
        this.getSessionSecret(),
      ) as GuestSessionTokenPayload;

      const executionContext = this.buildExecutionContext(payload);

      return { ...payload, executionContext };
    } catch (error) {
      this.logger.warn(
        `Guest session token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Save lead info associated with a session.
   * Associates email/name/company with the anonymous session's conversationId.
   * In Phase 1 this logs the lead; a proper CRM table can be added later.
   */
  saveTranscript(
    sessionToken: string,
    email: string,
    name?: string,
    company?: string,
  ): { success: boolean } {
    const session = this.verifySessionToken(sessionToken);

    if (!session) {
      this.logger.warn(`saveTranscript: invalid session token`);
      throw new UnauthorizedException('Invalid or expired session token');
    }

    this.logger.log(
      `Lead captured: email=${email}, name=${name ?? 'n/a'}, company=${company ?? 'n/a'}, conversationId=${session.conversationId}`,
    );

    // TODO: persist to a leads table in a future migration

    return { success: true };
  }
}
