import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../rbac.service';
import {
  PERMISSION_KEY,
  RESOURCE_PARAM_KEY,
} from '../decorators/require-permission.decorator';
import { SupabaseAuthUserDto } from '../../auth/dto/auth.dto';

/**
 * Request user type from JWT authentication
 */
interface RequestUser extends Partial<SupabaseAuthUserDto> {
  id: string;
}

/**
 * Typed request interface for HTTP requests with auth
 */
interface TypedRequest {
  user?: RequestUser;
  streamTokenClaims?: {
    organizationSlug?: string | null;
  };
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body: Record<string, unknown>;
  params: Record<string, string | undefined>;
  organizationSlug?: string;
}

/**
 * Guard to enforce permission-based access control
 *
 * This guard works in conjunction with the @RequirePermission() decorator
 * to ensure users have the required permissions to access protected endpoints.
 *
 * The organization slug is read from:
 * 1. Organization bound into a verified short-lived stream token
 * 2. x-organization-slug header
 * 3. organizationSlug query parameter
 * 4. organizationSlug in request body or invoke ExecutionContext
 *
 * @example
 * ```typescript
 * @RequirePermission('rag:write')
 * @Post('documents')
 * async uploadDocument() {
 *   // Only users with 'rag:write' permission can access this
 * }
 * ```
 */
@Injectable()
export class RbacGuard implements CanActivate {
  private readonly logger = new Logger(RbacGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permission from route metadata
    const permission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permission is specified, allow access
    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TypedRequest>();
    const user = request.user;

    // Ensure user is authenticated (JwtAuthGuard should have run first)
    if (!user || !user.id) {
      this.logger.warn(
        '[RbacGuard] No user found on request - JwtAuthGuard should run first',
      );
      throw new ForbiddenException('Authentication required');
    }

    const isSuperAdmin = await this.rbacService.isSuperAdmin(user.id);
    if (isSuperAdmin) {
      request.organizationSlug = this.getOrganizationSlug(request) ?? '*';
      return true;
    }

    const orgSlug = this.getOrganizationSlug(request);
    if (!orgSlug) {
      throw new ForbiddenException('Organization context required');
    }

    // For admin permissions (admin:*), also check if user is admin for the organization
    // This allows org admins to access admin endpoints without needing explicit permission grants
    if (permission.startsWith('admin:')) {
      const isAdmin = await this.rbacService.isAdmin(user.id, orgSlug);
      if (isAdmin) {
        request.organizationSlug = orgSlug;
        return true;
      }
    }

    // Check for resource-specific permission
    const resourceParam = this.reflector.get<string>(
      RESOURCE_PARAM_KEY,
      context.getHandler(),
    );
    const resourceId = resourceParam
      ? request.params[resourceParam]
      : undefined;

    // Check permission
    const hasAccess = await this.rbacService.hasPermission(
      user.id,
      orgSlug,
      permission,
      undefined,
      resourceId,
    );

    if (!hasAccess) {
      this.logger.warn(
        `Permission denied: user=${user.id}, org=${orgSlug}, permission=${permission}`,
      );
      throw new ForbiddenException(`Permission denied: ${permission}`);
    }

    // Add organization slug to request for use in controllers
    request.organizationSlug = orgSlug;

    return true;
  }

  /**
   * Extract organization slug from request
   * Priority: header > query > body
   * Safely handles SSE and other request types that may not have all properties
   */
  private getOrganizationSlug(request: TypedRequest): string | undefined {
    const params =
      typeof request.body?.params === 'object' && request.body.params !== null
        ? (request.body.params as Record<string, unknown>)
        : undefined;
    const context =
      typeof params?.context === 'object' && params.context !== null
        ? (params.context as Record<string, unknown>)
        : undefined;
    const contextOrgSlug =
      typeof context?.orgSlug === 'string' ? context.orgSlug : undefined;

    return (
      request.streamTokenClaims?.organizationSlug ||
      request.headers?.['x-organization-slug'] ||
      request.query?.organizationSlug ||
      (typeof request.body?.organizationSlug === 'string'
        ? request.body.organizationSlug
        : undefined) ||
      contextOrgSlug ||
      undefined
    );
  }
}
