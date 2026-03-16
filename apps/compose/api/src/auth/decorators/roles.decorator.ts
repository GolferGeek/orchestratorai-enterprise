import { SetMetadata } from '@nestjs/common';

/**
 * Valid user roles in the system
 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  EVALUATION_MONITOR = 'evaluation-monitor',
  BETA_TESTER = 'beta-tester',
  SUPPORT = 'support',
}

/**
 * Metadata key for storing required roles
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for accessing an endpoint
 *
 * @param roles - Array of roles that are allowed to access the endpoint
 *
 * @example
 * ```typescript
 * @Roles(UserRole.ADMIN)
 * @Get('admin/users')
 * async getAdminUsers() {
 *   // Only users with 'admin' role can access this
 * }
 *
 * @Roles(UserRole.ADMIN, UserRole.EVALUATION_MONITOR)
 * @Get('admin/evaluations')
 * async getEvaluations() {
 *   // Users with either 'admin' or 'evaluation-monitor' role can access this
 * }
 * ```
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Decorator for admin-only endpoints
 * Shorthand for @Roles(UserRole.ADMIN)
 *
 * @example
 * ```typescript
 * @AdminOnly()
 * @Delete('admin/users/:id')
 * async deleteUser(@Param('id') id: string) {
 *   // Only admins can access this
 * }
 * ```
 */
export const AdminOnly = () => Roles(UserRole.ADMIN);

/**
 * Decorator for evaluation monitoring endpoints
 * Allows both admins and evaluation monitors
 *
 * @example
 * ```typescript
 * @EvaluationMonitor()
 * @Get('admin/evaluations/stats')
 * async getEvaluationStats() {
 *   // Admins and evaluation monitors can access this
 * }
 * ```
 */
export const EvaluationMonitor = () =>
  Roles(UserRole.ADMIN, UserRole.EVALUATION_MONITOR);

/**
 * Decorator for developer endpoints
 * Allows admins and developers
 *
 * @example
 * ```typescript
 * @DeveloperAccess()
 * @Get('admin/debug/logs')
 * async getDebugLogs() {
 *   // Admins and developers can access this
 * }
 * ```
 */
export const DeveloperAccess = () => Roles(UserRole.ADMIN, UserRole.DEVELOPER);

/**
 * Decorator for support endpoints
 * Allows admins and support staff
 *
 * @example
 * ```typescript
 * @SupportAccess()
 * @Get('admin/support/tickets')
 * async getSupportTickets() {
 *   // Admins and support staff can access this
 * }
 * ```
 */
export const SupportAccess = () => Roles(UserRole.ADMIN, UserRole.SUPPORT);

/**
 * Type guard to check if a string is a valid UserRole
 */
export function isValidUserRole(role: string): role is UserRole {
  return Object.values(UserRole).includes(role as UserRole);
}

/**
 * Helper function to get all roles that have admin-level permissions
 */
export function getAdminLevelRoles(): UserRole[] {
  return [UserRole.ADMIN];
}

/**
 * Helper function to get all roles that have evaluation monitoring permissions
 */
export function getEvaluationMonitorRoles(): UserRole[] {
  return [UserRole.ADMIN, UserRole.EVALUATION_MONITOR, UserRole.DEVELOPER];
}

/**
 * Helper function to get all roles that have developer-level permissions
 */
export function getDeveloperLevelRoles(): UserRole[] {
  return [UserRole.ADMIN, UserRole.DEVELOPER];
}
