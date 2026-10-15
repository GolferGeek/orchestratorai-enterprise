import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestratorai/planes/database';
import { WorkflowRegistry } from '../workflows/catalog/workflow.registry';

/**
 * Database row types for RPC and table queries
 */
interface RpcPermissionRow {
  permission_name: string;
  resource_type?: string;
  resource_id?: string;
}

interface RpcRoleRow {
  role_id: string;
  role_name: string;
  role_display_name: string;
  is_global: boolean;
  assigned_at: string;
  expires_at?: string;
}

interface RpcOrganizationRow {
  organization_slug: string;
  organization_name: string;
  role_name: string;
  is_global: boolean;
}

interface RpcOrganizationUserRow {
  user_id: string;
  email: string;
  display_name?: string;
  role_id: string;
  role_name: string;
  role_display_name: string;
  is_global: boolean;
  assigned_at: string;
  expires_at?: string;
}

interface RbacRoleDbRow {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  is_system: boolean;
}

interface RbacPermissionDbRow {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  category?: string;
}

interface RbacAuditLogDbRow {
  id: string;
  action: string;
  actor_id: string;
  target_user_id: string;
  target_role_id: string;
  organization_slug: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface PermissionCheck {
  permission: string;
  resourceType?: string;
  resourceId?: string;
}

export interface UserRole {
  id: string;
  name: string;
  displayName: string;
  isGlobal: boolean;
  assignedAt: Date;
  expiresAt?: Date;
}

export interface UserPermission {
  permission: string;
  resourceType?: string;
  resourceId?: string;
}

export interface UserOrganization {
  organizationSlug: string;
  organizationName: string;
  roleName: string;
  isGlobal: boolean;
}

export interface OrganizationUser {
  userId: string;
  email: string;
  displayName?: string;
  roles: Array<{
    id: string;
    name: string;
    displayName: string;
    isGlobal: boolean;
    assignedAt: Date;
    expiresAt?: Date;
  }>;
}

export interface RbacRole {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
}

export interface RbacPermission {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category?: string;
}

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly workflowRegistry: WorkflowRegistry,
  ) {}

  /**
   * Check if user has permission in organization
   */
  async hasPermission(
    userId: string,
    organizationSlug: string,
    permission: string,
    resourceType?: string,
    resourceId?: string,
  ): Promise<boolean> {
    const { data, error } = (await this.db.rpc(
      'rbac_has_permission',
      {
        p_user_id: userId,
        p_organization_slug: organizationSlug,
        p_permission: permission,
        p_resource_type: resourceType ?? null,
        p_resource_id: resourceId ?? null,
      },
      'authz',
    )) as {
      data: Array<{ rbac_has_permission: boolean }> | boolean | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Permission check failed: ${error.message}`, error);
      return false;
    }

    // The planes database rpc() returns { data: rows[] } where each row is the
    // function's return row (e.g. [{ rbac_has_permission: true }]). Older callers
    // that wrapped Supabase's client directly saw a raw boolean. Support both.
    if (Array.isArray(data)) {
      return data[0]?.rbac_has_permission === true;
    }
    return data === true;
  }

  /**
   * Require permission - throws ForbiddenException if not authorized
   */
  async requirePermission(
    userId: string,
    organizationSlug: string,
    permission: string,
    resourceType?: string,
    resourceId?: string,
  ): Promise<void> {
    const hasAccess = await this.hasPermission(
      userId,
      organizationSlug,
      permission,
      resourceType,
      resourceId,
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        `Permission denied: ${permission}${resourceType ? ` on ${resourceType}` : ''}`,
      );
    }
  }

  /**
   * Get all permissions for user in organization
   */
  async getUserPermissions(
    userId: string,
    organizationSlug: string,
  ): Promise<UserPermission[]> {
    const { data, error } = (await this.db.rpc(
      'rbac_get_user_permissions',
      {
        p_user_id: userId,
        p_organization_slug: organizationSlug,
      },
      'authz',
    )) as {
      data: RpcPermissionRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to get user permissions: ${error.message}`,
        error,
      );
      return [];
    }

    return (data ?? []).map((row) => ({
      permission: row.permission_name,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
    }));
  }

  /**
   * Get user's roles in organization
   */
  async getUserRoles(
    userId: string,
    organizationSlug: string,
  ): Promise<UserRole[]> {
    const { data, error } = (await this.db.rpc(
      'rbac_get_user_roles',
      {
        p_user_id: userId,
        p_organization_slug: organizationSlug,
      },
      'authz',
    )) as {
      data: RpcRoleRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get user roles: ${error.message}`, error);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.role_id,
      name: row.role_name,
      displayName: row.role_display_name,
      isGlobal: row.is_global,
      assignedAt: new Date(row.assigned_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    }));
  }

  /**
   * Get all organizations user has access to
   */
  async getUserOrganizations(userId: string): Promise<UserOrganization[]> {
    const { data, error } = (await this.db.rpc(
      'rbac_get_user_organizations',
      {
        p_user_id: userId,
      },
      'authz',
    )) as {
      data: RpcOrganizationRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(`Failed to get user organizations: ${error.message}`);
    }

    const orgs = (data || []).map((row) => ({
      organizationSlug: row.organization_slug,
      organizationName: row.organization_name,
      roleName: row.role_name,
      isGlobal: row.is_global,
    }));

    const orgsWithCapability = await this.getOrganizationsWithCapability();

    // An organization is worth showing if the user can actually do something in
    // it. That used to mean "has an active agent", which is now wrong twice
    // over — see below.
    return orgs.filter(
      (org) =>
        org.organizationSlug === '*' ||
        orgsWithCapability.has(org.organizationSlug),
    );
  }

  /**
   * Organizations that have something a user can run: an active agent, or a
   * registered workflow.
   *
   * Two bugs lived here.
   *
   * 1. The query read `WHERE status = 'active'`. No `agents.status` column
   *    exists in either database — 20260316100001_agent_table_v2.sql adds it
   *    and has never been applied anywhere. Status has always lived in
   *    `metadata.status`, which is what every TypeScript reader uses
   *    (`requireAgentStatus(metadata.status)`) and what the admin edits. So the
   *    query always errored.
   *
   *    The fix is not to add the column. A `status` column that nothing writes
   *    would sit at its default forever and quietly report disabled agents as
   *    active — a worse failure, and a second source of truth for one fact.
   *
   * 2. The error was swallowed by `?? []`, which turned a failing query into
   *    "no organization has any agents". Every user then saw only wildcard
   *    orgs, and nobody saw an error. That is the exact silent failure
   *    CLAUDE.md forbids, so it now throws.
   *
   * And a design gap, which is why `corporate` would still have been invisible:
   * an org whose only capability is a WORKFLOW had nothing to match on, because
   * workflows deliberately have no row in `agents`. The registry is the other
   * half of the answer.
   */
  private async getOrganizationsWithCapability(): Promise<Set<string>> {
    const result = (await this.db.rawQuery(
      `SELECT DISTINCT unnest(organization_slug) AS org
         FROM public.agents
        WHERE metadata->>'status' = 'active'`,
    )) as {
      data: Array<{ org: string }> | null;
      error: { message?: string } | null;
    };

    if (result.error) {
      throw new Error(
        `Could not determine which organizations have active agents: ${
          result.error.message ?? String(result.error)
        }`,
      );
    }

    const slugs = new Set((result.data ?? []).map((row) => row.org));

    for (const workflow of this.workflowRegistry.list()) {
      for (const slug of workflow.organizationSlugs) {
        slugs.add(slug);
      }
    }

    return slugs;
  }

  /**
   * Get all users in an organization with their roles
   */
  async getOrganizationUsers(
    organizationSlug: string,
  ): Promise<OrganizationUser[]> {
    const { data, error } = (await this.db.rpc(
      'rbac_get_organization_users',
      {
        p_organization_slug: organizationSlug,
      },
      'authz',
    )) as {
      data: RpcOrganizationUserRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to get organization users: ${error.message}`,
        error,
      );
      return [];
    }

    // Group roles by user and deduplicate
    const userMap = new Map<string, OrganizationUser>();

    (data || []).forEach((row) => {
      if (!userMap.has(row.user_id)) {
        userMap.set(row.user_id, {
          userId: row.user_id,
          email: row.email,
          displayName: row.display_name,
          roles: [],
        });
      }

      const user = userMap.get(row.user_id)!;

      // Check if this role already exists for this user
      // Prefer org-specific role over global role for this org
      const existingRoleIndex = user.roles.findIndex(
        (r) => r.name === row.role_name,
      );

      if (existingRoleIndex === -1) {
        // Role doesn't exist, add it
        user.roles.push({
          id: row.role_id,
          name: row.role_name,
          displayName: row.role_display_name,
          isGlobal: row.is_global,
          assignedAt: new Date(row.assigned_at),
          expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
        });
      } else if (!row.is_global) {
        // Role exists but this one is org-specific, prefer it over global
        user.roles[existingRoleIndex] = {
          id: row.role_id,
          name: row.role_name,
          displayName: row.role_display_name,
          isGlobal: row.is_global,
          assignedAt: new Date(row.assigned_at),
          expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
        };
      }
      // If role exists and new one is global, skip it (keep org-specific)
    });

    return Array.from(userMap.values());
  }

  /**
   * Get all available roles
   */
  async getAllRoles(): Promise<RbacRole[]> {
    const { data, error } = (await this.db
      .from('authz', 'rbac_roles')
      .select('id, name, display_name, description, is_system')
      .order('name')) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get roles: ${error.message}`, error);
      return [];
    }

    const typedData = data as RbacRoleDbRow[] | null;
    return (typedData || []).map((row) => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      isSystem: row.is_system,
    }));
  }

  /**
   * Get all available permissions
   */
  async getAllPermissions(): Promise<RbacPermission[]> {
    const { data, error } = (await this.db
      .from('authz', 'rbac_permissions')
      .select('id, name, display_name, description, category')
      .order('category')
      .order('name')) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get permissions: ${error.message}`, error);
      return [];
    }

    const typedData = data as RbacPermissionDbRow[] | null;
    return (typedData || []).map((row) => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      category: row.category,
    }));
  }

  /**
   * Get permissions for a specific role
   */
  async getRolePermissions(roleId: string): Promise<string[]> {
    // Get permission IDs for this role
    const { data: rpData, error: rpError } = (await this.db
      .from('authz', 'rbac_role_permissions')
      .select('permission_id')
      .eq('role_id', roleId)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (rpError) {
      this.logger.error(
        `Failed to get role permissions: ${rpError.message}`,
        rpError,
      );
      return [];
    }

    if (!rpData || (rpData as unknown[]).length === 0) {
      return [];
    }

    const permissionIds = (rpData as Array<{ permission_id: string }>).map(
      (row) => row.permission_id,
    );

    // Get permission names
    const { data: permData, error: permError } = (await this.db
      .from('authz', 'rbac_permissions')
      .select('id, name')
      .in('id', permissionIds)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (permError || !permData) {
      return [];
    }

    return (permData as Array<{ id: string; name: string }>).map(
      (row) => row.name,
    );
  }

  /**
   * Add permission to a role
   */
  async addPermissionToRole(
    roleId: string,
    permissionId: string,
  ): Promise<void> {
    const { error } = (await this.db
      .from('authz', 'rbac_role_permissions')
      .insert({
        role_id: roleId,
        permission_id: permissionId,
      })) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to add permission to role: ${error.message}`,
        error,
      );
      throw new Error(`Failed to add permission to role: ${error.message}`);
    }
  }

  /**
   * Remove permission from a role
   */
  async removePermissionFromRole(
    roleId: string,
    permissionId: string,
  ): Promise<void> {
    const { error } = (await this.db
      .from('authz', 'rbac_role_permissions')
      .delete()
      .eq('role_id', roleId)
      .eq('permission_id', permissionId)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to remove permission from role: ${error.message}`,
        error,
      );
      throw new Error(
        `Failed to remove permission from role: ${error.message}`,
      );
    }
  }

  /**
   * Roles are shared by every organization, so only a super-admin changes
   * what a role grants (404 when there is no such role).
   */
  async assertMayEditRole(actorId: string, roleId: string): Promise<void> {
    if (!(await this.isSuperAdmin(actorId))) {
      throw new ForbiddenException(
        'Roles are shared by every organization; only a super-admin changes what a role grants',
      );
    }
    const { data, error } = (await this.db
      .from('authz', 'rbac_roles')
      .select('id')
      .eq('id', roleId)
      .maybeSingle()) as {
      data: { id: string } | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`Failed to read role ${roleId}: ${error.message}`);
    }
    if (!data) throw new NotFoundException(`No role ${roleId}`);
  }

  /**
   * Whether `actorId` may grant or revoke `roleName` in `organizationSlug`:
   * a super-admin anywhere; otherwise an org admin (or holder of admin:roles)
   * of that same organization, and never super-admin or a role in every
   * organization ('*'). The admin role, or any role granting admin:roles, is
   * granted or revoked only by an admin of that organization. Checked here, against the organization the role is
   * granted in, whatever organization the request's header names.
   */
  async assertMayGrant(
    actorId: string,
    organizationSlug: string,
    roleName: string,
  ): Promise<void> {
    if (await this.isSuperAdmin(actorId)) return;
    if (organizationSlug === '*' || roleName === 'super-admin') {
      throw new ForbiddenException(
        'Only a super-admin grants super-admin or a role in every organization',
      );
    }
    const actorIsAdmin = await this.isAdmin(actorId, organizationSlug);
    const allowed =
      actorIsAdmin ||
      (await this.hasPermission(actorId, organizationSlug, 'admin:roles'));
    if (!allowed) {
      throw new ForbiddenException(
        `You cannot manage roles in ${organizationSlug}`,
      );
    }
    // The admin role, or any role that manages roles, is an org admin's to
    // grant or revoke: holding admin:roles without being admin is not enough.
    if (!actorIsAdmin && (await this.isAdminLevelRole(roleName))) {
      throw new ForbiddenException(
        `Only an admin of ${organizationSlug} grants or revokes ${roleName}`,
      );
    }
  }

  /** Whether a role is admin-level: the admin role, or one granting admin:roles (directly or through admin:* or *:*). */
  private async isAdminLevelRole(roleName: string): Promise<boolean> {
    if (roleName === 'admin') return true;
    const { data, error } = (await this.db.rawQuery(
      `SELECT 1 FROM authz.rbac_roles r
         JOIN authz.rbac_role_permissions rp ON rp.role_id = r.id
         JOIN authz.rbac_permissions p ON p.id = rp.permission_id
        WHERE r.name = $1 AND p.name IN ('admin:roles', 'admin:*', '*:*')
        LIMIT 1`,
      [roleName],
    )) as { data: unknown[] | null; error: { message?: string } | null };
    if (error) {
      throw new Error(
        `Failed to read the permissions of role ${roleName}: ${error.message ?? String(error)}`,
      );
    }
    if (!data) {
      throw new Error(`Reading the permissions of role ${roleName} returned no rows array`);
    }
    return data.length > 0;
  }

  /**
   * Whether `actorId` may act on a platform user (read, delete, reset or set
   * their password): a super-admin may on anyone; anyone else only on a user
   * who is not a super-admin, has a role somewhere, and has every role in an
   * organization where the actor is an org admin or holds admin:users. A
   * user who is an admin there (or holds admin:roles there) is managed only
   * by an admin of that organization. A user is one account across
   * organizations, so an admin of one of them does not speak for the others.
   */
  async assertMayManageUser(
    actorId: string,
    targetUserId: string,
  ): Promise<void> {
    if (await this.isSuperAdmin(actorId)) return;
    if (await this.isSuperAdmin(targetUserId)) {
      throw new ForbiddenException('Only a super-admin manages a super-admin');
    }
    const { data, error } = (await this.db.rawQuery(
      `SELECT DISTINCT organization_slug FROM authz.rbac_user_org_roles
        WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())`,
      [targetUserId],
    )) as {
      data: Array<{ organization_slug: string }> | null;
      error: { message?: string } | null;
    };
    if (error) {
      throw new Error(
        `Failed to read the roles of user ${targetUserId}: ${error.message ?? String(error)}`,
      );
    }
    if (!data) {
      throw new Error(`Reading the roles of user ${targetUserId} returned no rows array`);
    }
    const orgs = data.map((row) => row.organization_slug);
    if (orgs.length === 0 || orgs.includes('*')) {
      throw new ForbiddenException(
        'Only a super-admin manages a user with no organization or a role in every organization',
      );
    }
    for (const org of orgs) {
      const actorIsAdmin = await this.isAdmin(actorId, org);
      const allowed =
        actorIsAdmin ||
        (await this.hasPermission(actorId, org, 'admin:users'));
      if (!allowed) {
        throw new ForbiddenException(
          `This user also works in ${org}, where you do not manage users`,
        );
      }
      // An admin of the org (or a holder of admin:roles there) is managed only
      // by an admin of that org: a manager's admin:users does not reach them.
      if (
        !actorIsAdmin &&
        ((await this.isAdmin(targetUserId, org)) ||
          (await this.hasPermission(targetUserId, org, 'admin:roles')))
      ) {
        throw new ForbiddenException(
          `This user is an admin in ${org}; only an admin of ${org} manages them`,
        );
      }
    }
  }

  /** assertMayManageUser for the platform user with this email (404 when there is none). */
  async assertMayManageUserByEmail(
    actorId: string,
    email: string,
  ): Promise<void> {
    const { data, error } = (await this.db.rawQuery(
      `SELECT id FROM authz.users WHERE lower(email) = lower($1)`,
      [email],
    )) as {
      data: Array<{ id: string }> | null;
      error: { message?: string } | null;
    };
    if (error) {
      throw new Error(
        `Failed to find the user ${email}: ${error.message ?? String(error)}`,
      );
    }
    const user = data?.[0];
    if (!user) throw new NotFoundException(`No user ${email}`);
    await this.assertMayManageUser(actorId, user.id);
  }

  /**
   * Assign role to user in organization
   */
  async assignRole(
    targetUserId: string,
    organizationSlug: string,
    roleName: string,
    assignedBy: string,
    expiresAt?: Date,
  ): Promise<void> {
    await this.assertMayGrant(assignedBy, organizationSlug, roleName);

    // Get role ID
    const { data: role, error: roleError } = (await this.db
      .from('authz', 'rbac_roles')
      .select('id')
      .eq('name', roleName)
      .single()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (roleError || !role) {
      throw new Error(`Role not found: ${roleName}`);
    }

    const typedRole = role as { id: string };

    // Insert assignment
    const { error } = await this.db.from('authz', 'rbac_user_org_roles').upsert(
      {
        user_id: targetUserId,
        organization_slug: organizationSlug,
        role_id: typedRole.id,
        assigned_by: assignedBy,
        expires_at: expiresAt?.toISOString() || null,
      },
      {
        onConflict: 'user_id,organization_slug,role_id',
      },
    );

    if (error) {
      throw new Error(`Failed to assign role: ${error.message}`);
    }

    // Audit log
    await this.logAudit(
      'grant',
      assignedBy,
      targetUserId,
      typedRole.id,
      organizationSlug,
      {
        role_name: roleName,
        expires_at: expiresAt?.toISOString(),
      },
    );
  }

  /**
   * Revoke role from user in organization
   */
  async revokeRole(
    targetUserId: string,
    organizationSlug: string,
    roleName: string,
    revokedBy: string,
  ): Promise<void> {
    await this.assertMayGrant(revokedBy, organizationSlug, roleName);

    // Get role ID
    const { data: role, error: roleError } = (await this.db
      .from('authz', 'rbac_roles')
      .select('id')
      .eq('name', roleName)
      .single()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (roleError || !role) {
      throw new Error(`Role not found: ${roleName}`);
    }

    const typedRole = role as { id: string };

    // Delete assignment
    const { error } = (await this.db
      .from('authz', 'rbac_user_org_roles')
      .delete()
      .eq('user_id', targetUserId)
      .eq('organization_slug', organizationSlug)
      .eq('role_id', typedRole.id)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      throw new Error(`Failed to revoke role: ${error.message}`);
    }

    // Audit log
    await this.logAudit(
      'revoke',
      revokedBy,
      targetUserId,
      typedRole.id,
      organizationSlug,
      {
        role_name: roleName,
      },
    );
  }

  /**
   * Check if user is super-admin
   * Super-admin is determined by having the 'super-admin' role
   * Can be assigned with organization_slug = '*' (global access) or to specific organizations
   * If user has super-admin role in ANY organization, they are considered super-admin
   */
  async isSuperAdmin(userId: string): Promise<boolean> {
    // Check if user has super-admin role by joining user_org_roles with roles
    const { data, error } = (await this.db
      .from('authz', 'rbac_user_org_roles')
      .select('id, role_id, organization_slug')
      .eq('user_id', userId)
      .limit(100)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(
        `[RbacService] Error checking super admin: ${error.message}`,
      );
      return false;
    }

    if (!data || (data as unknown[]).length === 0) {
      return false;
    }

    // Get the super-admin role ID
    const { data: superAdminRole, error: roleError } = (await this.db
      .from('authz', 'rbac_roles')
      .select('id')
      .eq('name', 'super-admin')
      .maybeSingle()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (roleError || !superAdminRole) {
      return false;
    }

    const saRoleId = (superAdminRole as { id: string }).id;
    const typedData = data as Array<{
      id: string;
      role_id: string;
      organization_slug: string;
    }>;
    return typedData.some((record) => record.role_id === saRoleId);
  }

  /**
   * Check if user is admin for a specific organization
   * Admin is determined by having the 'admin' role for the organization
   * Also returns true if user is super-admin (global access)
   * If organizationSlug is '*', checks if user is admin for any organization
   */
  async isAdmin(userId: string, organizationSlug: string): Promise<boolean> {
    // Super admins are admins everywhere
    const isSuperAdmin = await this.isSuperAdmin(userId);
    if (isSuperAdmin) {
      return true;
    }

    // Get the admin role ID
    const { data: adminRole, error: roleError } = (await this.db
      .from('authz', 'rbac_roles')
      .select('id')
      .eq('name', 'admin')
      .maybeSingle()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (roleError || !adminRole) {
      return false;
    }

    const adminRoleId = (adminRole as { id: string }).id;

    // If organizationSlug is '*', check if user is admin for any organization
    if (organizationSlug === '*') {
      const { data, error } = (await this.db
        .from('authz', 'rbac_user_org_roles')
        .select('id, role_id')
        .eq('user_id', userId)
        .eq('role_id', adminRoleId)
        .limit(1)) as {
        data: Record<string, unknown> | Record<string, unknown>[] | null;
        error: { message: string; code?: string } | null;
      };

      if (error) {
        this.logger.error(
          `[RbacService] Error checking admin (any org): ${error.message}`,
        );
        return false;
      }

      return !!data && (data as unknown[]).length > 0;
    }

    // Check if user has admin role for the specific organization
    const { data, error } = (await this.db
      .from('authz', 'rbac_user_org_roles')
      .select('id, role_id')
      .eq('user_id', userId)
      .eq('organization_slug', organizationSlug)
      .eq('role_id', adminRoleId)
      .limit(1)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`[RbacService] Error checking admin: ${error.message}`);
      return false;
    }

    return !!data && (data as unknown[]).length > 0;
  }

  /**
   * Get audit log entries
   */
  async getAuditLog(
    organizationSlug?: string,
    limit = 100,
  ): Promise<
    Array<{
      id: string;
      action: string;
      actorId: string;
      targetUserId: string;
      targetRoleId: string;
      organizationSlug: string;
      details: Record<string, unknown>;
      createdAt: Date;
    }>
  > {
    let query = this.db
      .from('authz', 'rbac_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (organizationSlug) {
      query = query.eq('organization_slug', organizationSlug);
    }

    const { data, error } = (await query) as {
      data: RbacAuditLogDbRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get audit log: ${error.message}`, error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actor_id,
      targetUserId: row.target_user_id,
      targetRoleId: row.target_role_id,
      organizationSlug: row.organization_slug,
      details: row.details,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Log an audit entry
   */
  private async logAudit(
    action: string,
    actorId: string,
    targetUserId: string | null,
    targetRoleId: string | null,
    organizationSlug: string | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.db.from('authz', 'rbac_audit_log').insert({
      action,
      actor_id: actorId,
      target_user_id: targetUserId,
      target_role_id: targetRoleId,
      organization_slug: organizationSlug,
      details,
    });
  }
}
