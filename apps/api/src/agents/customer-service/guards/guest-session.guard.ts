import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { CustomerServiceService } from '../customer-service.service';

/**
 * GuestSessionGuard
 *
 * Validates the sessionToken on requests to speech + customer-service endpoints.
 * The sessionToken is provided in the Authorization header as "GuestSession <token>"
 * or in the request body as `sessionToken`.
 *
 * This guard does NOT look up a database — the session token is a signed JWT
 * that carries the session data inline. Verification is done via the
 * CustomerServiceService which holds the signing secret.
 */
@Injectable()
export class GuestSessionGuard implements CanActivate {
  private readonly logger = new Logger(GuestSessionGuard.name);

  constructor(
    private readonly customerServiceService: CustomerServiceService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Guest session token is required');
    }

    const session = this.customerServiceService.verifySessionToken(token);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired guest session token');
    }

    // Attach session to request for downstream use
    (request as Request & { guestSession: typeof session }).guestSession =
      session;

    return true;
  }

  private extractToken(request: Request): string | null {
    // Try Authorization header first: "GuestSession <token>"
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('GuestSession ')) {
      return authHeader.slice('GuestSession '.length).trim() || null;
    }

    // Try body
    const body = request.body as Record<string, unknown> | undefined;
    if (body?.sessionToken && typeof body.sessionToken === 'string') {
      return body.sessionToken;
    }

    return null;
  }
}
