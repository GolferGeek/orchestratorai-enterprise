import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '../../database';
import {
  ROLES_KEY,
  UserRole,
  isValidUserRole,
} from '../decorators/roles.decorator';

/**
 * Interface for user profile data from the database
 */
interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  roles: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Guard to enforce role-based access control
 *
 * SECURITY CRITICAL: This guard ensures only users with required roles
 * can access protected endpoints. It validates roles from the database
 * to prevent client-side tampering.
 *
 * This guard works in conjunction with role decorators (@Roles, @AdminOnly, etc.)
 * to ensure users have the required roles to access protected endpoints.
 *
 * Security considerations:
 * - Roles are fetched from database, not from JWT claims (prevents tampering)
 * - Uses service client to bypass RLS for role lookups
 * - Validates role values against known enum values
 * - Error messages are intentionally generic to prevent role enumeration
 *
 * Usage:
 * 1. Apply the guard globally or to individual controllers/routes
 * 2. Use role decorators to specify required roles
 * 3. The guard will automatically check user roles from the database
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @AdminOnly()
 * @Get('admin/users')
 * async getAdminUsers() {
 *   // Only users with admin role can access this
 * }
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private reflector: Reflector,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required roles from the route metadata
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are specified, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get the request object
    const request: { user?: { id: string } } = context
      .switchToHttp()
      .getRequest();
    const user = request.user;

    // Ensure user is authenticated (should be handled by JwtAuthGuard first)
    if (!user || !user.id) {
      throw new ForbiddenException('Authentication required');
    }

    try {
      // Fetch user profile with roles from database
      const userProfile = await this.getUserProfile(user.id);

      if (!userProfile) {
        throw new ForbiddenException('User profile not found');
      }

      // Check if user has any of the required roles
      const hasRequiredRole = this.userHasAnyRole(
        userProfile.roles,
        requiredRoles,
      );

      if (!hasRequiredRole) {
        throw new ForbiddenException('Insufficient permissions');
      }

      // Add user profile to request for use in controllers
      (request as Record<string, unknown>).userProfile = userProfile;

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      throw new ForbiddenException('Error verifying user permissions');
    }
  }

  /**
   * Fetch user profile with roles from the database
   * SECURITY: Uses service client to bypass RLS for admin role checks
   * This is intentional - role validation must not be subject to user RLS policies
   */
  private async getUserProfile(userId: string): Promise<UserProfile | null> {
    // SECURITY: Input validation - userId should be a valid UUID
    if (!userId || typeof userId !== 'string') {
      return null;
    }

    // Use service client to bypass RLS issues
    const { data: result, error } = (await this.db
      .from('authz', 'users')
      .select('id, email, display_name, roles, created_at, updated_at')
      .eq('id', userId)
      .single()) as QueryResult<unknown>;

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw new Error('Failed to fetch user profile');
    }

    const data = result as UserProfile | null;
    return data;
  }

  /**
   * Check if user has any of the required roles
   * SECURITY: Only validates against known role enum values to prevent injection
   */
  private userHasAnyRole(
    userRoles: string[],
    requiredRoles: UserRole[],
  ): boolean {
    if (!userRoles || userRoles.length === 0) {
      // If user has no roles, they only have implicit 'user' role
      userRoles = [UserRole.USER];
    }

    // SECURITY: Validate and filter user roles against known enum values
    // This prevents malicious role values from the database
    const validUserRoles = userRoles.filter((role) => isValidUserRole(role));

    // Check if any user role matches any required role
    return requiredRoles.some((requiredRole) =>
      validUserRoles.includes(requiredRole),
    );
  }
}

/**
 * Decorator to add user profile to request
 * Use this in conjunction with @CurrentUser to get enhanced user data
 */
export interface RequestWithUserProfile extends Request {
  user: Record<string, unknown>; // From JWT auth
  userProfile: UserProfile; // From RolesGuard
}
