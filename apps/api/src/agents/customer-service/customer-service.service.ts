import {
  Injectable,
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validate as validateUuid } from 'uuid';
import * as jwt from 'jsonwebtoken';
import {
  ExecutionContext,
  isExecutionContext,
} from '@orchestrator-ai/transport-types';

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
  context: ExecutionContext;
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
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new InternalServerErrorException(
        'GUEST_SESSION_SECRET must be configured with at least 32 bytes',
      );
    }
    return secret;
  }

  private getDefaultLlmProvider(): string {
    const provider = this.configService.get<string>('DEFAULT_LLM_PROVIDER');
    if (!provider) {
      throw new InternalServerErrorException(
        'DEFAULT_LLM_PROVIDER is required for guest sessions',
      );
    }
    return provider;
  }

  private getDefaultLlmModel(): string {
    const model = this.configService.get<string>('DEFAULT_LLM_MODEL');
    if (!model) {
      throw new InternalServerErrorException(
        'DEFAULT_LLM_MODEL is required for guest sessions',
      );
    }
    return model;
  }

  getClientContextConfig(): { provider: string; model: string } {
    return {
      provider: this.getDefaultLlmProvider(),
      model: this.getDefaultLlmModel(),
    };
  }

  /** Sign the complete guest context created by the browser edge. */
  createSession(
    context: unknown,
  ): { sessionToken: string; conversationId: string } {
    const config = this.getClientContextConfig();
    this.assertValidGuestContext(context, config);
    const now = Math.floor(Date.now() / 1000);

    const payload: GuestSessionTokenPayload = {
      sub: context.userId,
      conversationId: context.conversationId,
      context,
      iat: now,
      exp: now + this.SESSION_TTL_SECONDS,
    };

    const sessionToken = jwt.sign(payload, this.getSessionSecret(), {
      algorithm: 'HS256',
    });

    this.logger.log(
      `Guest session created: userId=${context.userId}, conversationId=${context.conversationId}`,
    );

    return { sessionToken, conversationId: context.conversationId };
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
    const secret = this.getSessionSecret();
    const config = this.getClientContextConfig();
    try {
      const decoded = jwt.verify(token, secret);
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        typeof decoded.sub !== 'string' ||
        typeof decoded.conversationId !== 'string' ||
        !isExecutionContext(decoded.context) ||
        decoded.sub !== decoded.context.userId ||
        decoded.conversationId !== decoded.context.conversationId
      ) {
        return null;
      }
      this.assertValidGuestContext(decoded.context, config);
      const payload = decoded as GuestSessionTokenPayload;
      return {
        ...payload,
        executionContext: Object.freeze({ ...payload.context }),
      };
    } catch (error) {
      this.logger.warn(
        `Guest session token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private assertValidGuestContext(
    context: unknown,
    config: { provider: string; model: string },
  ): asserts context is ExecutionContext {
    if (
      !isExecutionContext(context) ||
      !this.hasOnlyContextKeys(context) ||
      !validateUuid(context.userId) ||
      !validateUuid(context.conversationId) ||
      context.orgSlug !== 'public' ||
      context.agentSlug !== 'customer-service' ||
      context.agentType !== 'langgraph' ||
      context.provider !== config.provider ||
      context.model !== config.model ||
      context.sovereignMode === true
    ) {
      throw new BadRequestException('Guest ExecutionContext is invalid');
    }
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
