/**
 * SecureConversationsJwtAuthGuard — Secure Conversations JWT authentication guard.
 *
 * Validates Bearer tokens for Secure Conversations invoke endpoints.
 * Accepts:
 * - Valid JWT tokens (Bearer header)
 * - Test API keys (x-test-api-key header, when explicitly configured)
 *
 * Secure Conversations is externally-facing, so auth is mandatory on invoke endpoints.
 * External inbound A2A uses separate signature-based auth (ExternalSigningGuard).
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

interface SecureConversationsRequest {
  headers: Record<string, string | string[] | undefined>;
  url: string;
}

@Injectable()
export class SecureConversationsJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(SecureConversationsJwtAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SecureConversationsRequest>();

    // Dev/testing: accept test API key
    const rawTestApiKey = request.headers['x-test-api-key'];
    const testApiKey = Array.isArray(rawTestApiKey)
      ? rawTestApiKey[0]
      : rawTestApiKey;
    const configuredTestKey =
      this.configService.get<string>('TEST_API_SECRET_KEY') ||
      process.env.TEST_API_SECRET_KEY;

    if (configuredTestKey && testApiKey) {
      if (this.safeCompare(testApiKey, configuredTestKey)) {
        return true;
      }
    }

    const token = this.extractBearer(request);
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    // Validate token against the unified platform Auth endpoint.
    const authApiUrl =
      this.configService.get<string>('PLATFORM_API_URL') ||
      process.env.PLATFORM_API_URL;

    if (!authApiUrl) {
      throw new UnauthorizedException('Platform auth endpoint is not configured');
    }

    try {
      const response = await fetch(`${authApiUrl}/auth/validate`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new UnauthorizedException('Token validation failed');
      }

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.error(
        `Platform auth endpoint call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnauthorizedException('Authentication service unavailable');
    }
  }

  private extractBearer(request: SecureConversationsRequest): string | null {
    const rawAuth = request.headers.authorization;
    const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
    if (!auth?.startsWith('Bearer ')) {
      return null;
    }
    return auth.slice('Bearer '.length).trim() || null;
  }

  private safeCompare(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a, 'utf8');
      const bufB = Buffer.from(b, 'utf8');
      if (bufA.length !== bufB.length) return false;
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }
}
