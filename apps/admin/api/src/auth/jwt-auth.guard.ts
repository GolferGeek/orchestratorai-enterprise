import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthClient, AuthorizeResult } from './auth-client.service';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { PERMISSION_KEY } from './decorators/require-permission.decorator';

interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
  user?: AuthorizeResult;
}

/**
 * JwtAuthGuard — extracts Bearer token, resolves @RequirePermission metadata,
 * and delegates both checks to Auth API via AuthClient in a single round-trip.
 * Populates request.user on success.
 *
 * See PRD §4.1 for the full rationale behind the remote-authorization model.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authClient: AuthClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawHeader = request.headers?.['authorization'];
    const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or malformed Authorization header',
      );
    }
    const token = authHeader.slice('Bearer '.length);

    const permission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) {
      // Coding bug: every non-public controller must declare @RequirePermission.
      throw new InternalServerErrorException(
        'Controller is missing @RequirePermission decorator',
      );
    }

    // Org slug resolution: body > header > query > '*'
    const body = request.body ?? {};
    const headerOrgRaw = request.headers?.['x-organization-slug'];
    const headerOrg = Array.isArray(headerOrgRaw)
      ? headerOrgRaw[0]
      : headerOrgRaw;
    const queryOrg =
      typeof request.query?.['organizationSlug'] === 'string'
        ? request.query['organizationSlug']
        : undefined;
    const bodyOrg =
      typeof body['organizationSlug'] === 'string'
        ? body['organizationSlug']
        : undefined;
    const orgSlug = bodyOrg ?? headerOrg ?? queryOrg ?? '*';

    const result = await this.authClient.authorize(token, permission, orgSlug);
    request.user = result;
    return true;
  }
}
