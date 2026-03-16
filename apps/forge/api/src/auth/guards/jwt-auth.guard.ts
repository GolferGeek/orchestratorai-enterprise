import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Request } from 'express';
import { SupabaseAuthUserDto } from '../dto/auth.dto';
import {
  StreamTokenClaims,
  StreamTokenService,
} from '../services/stream-token.service';
import { timingSafeEqual } from 'crypto';
import {
  IDENTITY_PROVIDER,
  IdentityProvider,
} from '../interfaces/identity-provider.interface';
import { AuthenticatedPrincipal } from '../interfaces/authenticated-principal.interface';
import {
  AUTH_SERVICE,
  AuthServiceProvider,
} from '../interfaces/auth-service.interface';

interface AuthenticatedRequest extends Request {
  user?: SupabaseAuthUserDto;
  streamTokenClaims?: StreamTokenClaims;
  sanitizedUrl?: string;
  originalUrl: string;
}

/**
 * JWT Authentication Guard
 *
 * SECURITY CRITICAL: This guard validates JWT tokens for user authentication.
 * It supports multiple authentication methods:
 * - Supabase JWT tokens (via Authorization header or query param)
 * - Stream tokens for SSE endpoints
 * - Test API keys for development/testing
 *
 * Security considerations:
 * - Tokens are validated via configured identity provider
 * - Test API keys are only accepted when explicitly configured
 * - Query param tokens are sanitized from URLs in logs
 * - Invalid tokens result in generic error messages to prevent information leakage
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject(IDENTITY_PROVIDER)
    private readonly identityProvider: IdentityProvider,
    private readonly configService: ConfigService,
    @Inject(AUTH_SERVICE)
    private readonly authService: AuthServiceProvider,
    private readonly streamTokenService: StreamTokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // SECURITY: Check for test API key authentication (development/testing only)
    // This should only be enabled in non-production environments
    const testApiKey = request.headers['x-test-api-key'] as string;
    const configuredTestKey = process.env.TEST_API_SECRET_KEY;

    // SECURITY: Use timing-safe comparison even for test keys to prevent timing attacks
    if (
      configuredTestKey &&
      testApiKey &&
      this.safeCompareStrings(testApiKey, configuredTestKey)
    ) {
      // Prefer configured test user from environment to satisfy DB FKs in development
      const devUserId =
        process.env.SUPABASE_TEST_USERID ||
        '00000000-0000-0000-0000-000000000001';
      const devEmail =
        process.env.SUPABASE_TEST_USER || 'test_api_key_user@example.com';

      request.user = {
        id: devUserId,
        email: devEmail,
        aud: 'authenticated',
        role: 'authenticated',
        appMetadata: { provider: 'api_key', providers: ['api_key'] },
        userMetadata: { name: 'Test API Key User' },
        identities: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return true;
    }

    const bearerToken = this.extractBearerToken(request);
    const queryToken = this.extractQueryToken(request);

    // For query-param tokens (SSE/EventSource), try stream token first since
    // EventSource can't set Authorization headers. Stream tokens are HS256
    // (symmetric) while OIDC tokens are RS256 (asymmetric) — trying OIDC first
    // causes "invalid algorithm" errors on non-Supabase providers.
    if (queryToken && !bearerToken) {
      try {
        const claims = this.streamTokenService.verifyToken(queryToken);
        request.user = this.buildUserFromClaims(claims);
        request.streamTokenClaims = claims;
        request.sanitizedUrl = this.streamTokenService.stripTokenFromUrl(
          request.originalUrl ?? request.url,
        );
        return true;
      } catch {
        // Not a stream token — fall through to identity provider validation
      }
    }

    // Try bearer token first, then query token via identity provider
    const token = bearerToken || queryToken;

    if (token) {
      try {
        const principal = await this.identityProvider.validateToken(token);
        const resolvedUserId =
          await this.authService.resolveInternalUserId(principal);
        request.user = this.mapPrincipalToAuthUser(principal, resolvedUserId);

        // If token came from query params, also extract stream claims if present
        if (queryToken && !bearerToken) {
          request.sanitizedUrl = this.streamTokenService.stripTokenFromUrl(
            request.originalUrl ?? request.url,
          );
        }

        return true;
      } catch (err) {
        this.logger.error('Token validation failed', {
          source: bearerToken ? 'header' : 'query',
          error: err instanceof Error ? err.message : String(err),
        });
        throw new UnauthorizedException('Invalid token');
      }
    }

    throw new UnauthorizedException('No token provided');
  }

  /**
   * Extract JWT token from Authorization header
   * SECURITY: Validates header format before extraction
   */
  private extractBearerToken(request: AuthenticatedRequest): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.slice('Bearer '.length).trim();
    return token || null;
  }

  /**
   * Extract JWT token from query parameters
   * SECURITY: Validates and sanitizes query parameter input
   * Note: Query param tokens are primarily used for SSE/streaming endpoints
   * where Authorization headers may not be easily set by browser EventSource
   */
  private extractQueryToken(request: AuthenticatedRequest): string | null {
    const query: Record<string, unknown> | undefined = request.query as
      | Record<string, unknown>
      | undefined;
    if (!query) {
      return null;
    }
    const raw = query.token ?? query.streamToken;
    if (!raw) {
      return null;
    }
    // Handle array values (multiple tokens) - take first one
    if (Array.isArray(raw)) {
      return raw.length ? String(raw[0]) : null;
    }
    if (typeof raw === 'string') {
      return raw.trim() ? raw : null;
    }
    return null;
  }

  private buildUserFromClaims(claims: StreamTokenClaims): SupabaseAuthUserDto {
    return {
      id: claims.sub,
      email: claims.email,
      aud: claims.aud ?? 'authenticated',
      role: claims.role ?? 'authenticated',
      appMetadata: {
        provider: 'stream_token',
        providers: ['stream_token'],
      },
      userMetadata: {},
      identities: [],
    };
  }

  private mapPrincipalToAuthUser(
    principal: AuthenticatedPrincipal,
    userId: string,
  ): SupabaseAuthUserDto {
    return {
      id: userId,
      email: principal.email,
      aud: principal.aud ?? 'authenticated',
      role: principal.role ?? 'authenticated',
      appMetadata: principal.appMetadata ?? {},
      userMetadata: principal.userMetadata ?? {},
      phone: principal.phone,
      emailConfirmedAt: principal.emailConfirmedAt,
      confirmedAt: principal.confirmedAt,
      lastSignInAt: principal.lastSignInAt,
      createdAt: principal.createdAt,
      updatedAt: principal.updatedAt,
      identities: principal.identities ?? [],
    };
  }

  /**
   * SECURITY: Timing-safe string comparison to prevent timing attacks
   * Uses constant-time algorithm to compare strings of equal length
   */
  private safeCompareStrings(a: string, b: string): boolean {
    try {
      const bufferA = Buffer.from(a, 'utf8');
      const bufferB = Buffer.from(b, 'utf8');

      // Fast reject on length mismatch (length is not secret)
      if (bufferA.length !== bufferB.length) {
        return false;
      }

      // Use Node.js crypto.timingSafeEqual for constant-time comparison
      return timingSafeEqual(bufferA, bufferB);
    } catch {
      this.logger.error('Failed to compare strings securely');
      return false;
    }
  }
}
