import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';

export interface AuthorizeResult {
  allowed: true;
  userId: string;
  email: string | null;
  orgSlug: string | null;
  orgId: string | null;
  roles: string[];
  permission: string;
}

/**
 * HTTP client for Auth API's POST /auth/authorize endpoint.
 *
 * Combines token validation and RBAC permission check in a single round-trip.
 * All failure modes throw a specific Nest exception — no fallbacks, no silent
 * allows, no silent denies. If Auth API is unreachable, admin-api returns 503
 * to the caller. That is the intended failure mode (see PRD §4.1).
 */
@Injectable()
export class AuthClient {
  private readonly logger = new Logger(AuthClient.name);
  private readonly authApiUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    const url = process.env['AUTH_API_URL'];
    if (!url) {
      throw new Error(
        'AUTH_API_URL environment variable is required. ' +
          'Set AUTH_API_URL=http://localhost:5100 in your .env file.',
      );
    }
    this.authApiUrl = url.replace(/\/$/, '');
    this.timeoutMs = parseInt(process.env['AUTH_API_TIMEOUT_MS'] ?? '2000', 10);
  }

  async authorize(
    token: string,
    permission: string,
    organizationSlug?: string,
    resourceType?: string,
    resourceId?: string,
  ): Promise<AuthorizeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.authApiUrl}/auth/authorize`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          permission,
          organizationSlug,
          resourceType,
          resourceId,
        }),
      });
    } catch (err) {
      this.logger.error(
        `[authorize] network/timeout calling auth-api: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Auth service unavailable');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401) {
      throw new UnauthorizedException('Invalid or missing credentials');
    }
    if (response.status === 403) {
      throw new ForbiddenException(`Permission denied: ${permission}`);
    }
    if (response.status >= 500) {
      this.logger.error(`[authorize] auth-api returned ${response.status}`);
      throw new ServiceUnavailableException('Auth service error');
    }
    if (response.status !== 200) {
      this.logger.error(`[authorize] unexpected status ${response.status}`);
      throw new InternalServerErrorException('Unexpected auth-api response');
    }

    const body = (await response.json()) as AuthorizeResult;
    if (!body || body.allowed !== true || typeof body.userId !== 'string') {
      throw new InternalServerErrorException('Malformed auth-api response');
    }
    return body;
  }
}
