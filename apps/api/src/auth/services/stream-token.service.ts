import {
  Injectable,
  Logger,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';
import { SupabaseAuthUserDto } from '../dto/auth.dto';

export interface StreamTokenClaims {
  sub: string; // User ID
  taskId: string;
  agentSlug: string;
  organizationSlug: string | null;
  streamId?: string;
  conversationId?: string | null;
  email?: string;
  role?: string;
  aud?: string;
  iss?: string;
  exp?: number;
  iat?: number;
}

interface IssueTokenParams {
  user: SupabaseAuthUserDto;
  taskId: string;
  agentSlug: string;
  organizationSlug: string | null;
  streamId?: string;
  conversationId?: string | null;
}

interface TokenRateLimitState {
  count: number;
  windowStart: number;
}

@Injectable()
export class StreamTokenService {
  private readonly logger = new Logger(StreamTokenService.name);
  private readonly secret: string;
  private readonly ttlSeconds: number;
  private readonly rateLimitWindowMs: number;
  private readonly maxTokensPerWindow: number;
  private readonly issuanceTracker = new Map<string, TokenRateLimitState>();

  constructor() {
    this.secret =
      process.env.STREAM_TOKEN_SECRET ||
      process.env.JWT_SECRET ||
      'dev-stream-token-secret';

    this.ttlSeconds = Number(process.env.STREAM_TOKEN_TTL_SECONDS ?? 600);
    this.rateLimitWindowMs = Number(
      process.env.STREAM_TOKEN_RATE_WINDOW_MS ?? 30_000,
    );
    this.maxTokensPerWindow = Number(process.env.STREAM_TOKEN_RATE_MAX ?? 5);
  }

  issueToken(params: IssueTokenParams): { token: string; expiresAt: Date } {
    const key = this.rateLimitKey(params.user.id, params.taskId);
    this.enforceRateLimit(key);

    const payload: StreamTokenClaims = {
      sub: params.user.id,
      taskId: params.taskId,
      agentSlug: params.agentSlug,
      organizationSlug: params.organizationSlug,
      streamId: params.streamId,
      conversationId: params.conversationId,
      email: params.user.email,
      role: params.user.role ?? 'authenticated',
      // aud and iss are set via sign options below
    };

    const token = sign(payload, this.secret, {
      expiresIn: this.ttlSeconds,
      audience: 'sse',
      issuer: 'orchestrator-ai',
    });

    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    return { token, expiresAt };
  }

  verifyToken(token: string): StreamTokenClaims {
    try {
      const decoded = verify(token, this.secret, {
        audience: 'sse',
        issuer: 'orchestrator-ai',
      }) as StreamTokenClaims;

      if (!decoded?.sub || !decoded.taskId || !decoded.agentSlug) {
        throw new UnauthorizedException('Invalid token claims');
      }

      return decoded;
    } catch (error) {
      this.logger.warn('Failed to verify stream token', {
        reason: (error as Error)?.message,
      });
      throw new UnauthorizedException('Invalid token');
    }
  }

  stripTokenFromUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return url;
    }

    try {
      const [rawPath, query] = url.split('?');
      const path = rawPath ?? '';
      if (!query) {
        return url;
      }
      const search = new URLSearchParams(query);
      if (search.has('token')) {
        search.set('token', '[redacted]');
      }
      const serialized = search.toString();
      return serialized ? `${path}?${serialized}` : path;
    } catch {
      return url.replace(/token=([^&]+)/, 'token=[redacted]');
    }
  }

  private rateLimitKey(userId: string, taskId: string): string {
    return `${userId}:${taskId}`;
  }

  private enforceRateLimit(key: string): void {
    const now = Date.now();
    const existing = this.issuanceTracker.get(key);

    if (!existing || now - existing.windowStart > this.rateLimitWindowMs) {
      this.issuanceTracker.set(key, { count: 1, windowStart: now });
      return;
    }

    if (existing.count >= this.maxTokensPerWindow) {
      throw new HttpException(
        'Too many stream tokens requested in a short period. Please retry shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
  }
}
