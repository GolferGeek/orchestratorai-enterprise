/**
 * BridgeJwtAuthGuard — Bridge JWT authentication guard.
 *
 * Validates Bearer tokens for the Bridge invoke endpoint.
 * Accepts:
 * - Valid JWT tokens (Bearer header)
 * - Test API keys (x-test-api-key header, dev only)
 *
 * Bridge is externally-facing, so auth is mandatory on the /invoke endpoint.
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

interface BridgeRequest {
  headers: Record<string, string | string[] | undefined>;
  url: string;
}

@Injectable()
export class BridgeJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(BridgeJwtAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BridgeRequest>();

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

    // Validate token against Auth API
    const authApiUrl =
      this.configService.get<string>('AUTH_API_URL') ||
      process.env.AUTH_API_URL;

    if (!authApiUrl) {
      // Development mode without Auth API: accept any non-empty token
      this.logger.warn(
        'AUTH_API_URL not set — accepting any Bearer token (development mode)',
      );
      return true;
    }

    try {
      const response = await fetch(`${authApiUrl}/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        `Auth API call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnauthorizedException('Authentication service unavailable');
    }
  }

  private extractBearer(request: BridgeRequest): string | null {
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
