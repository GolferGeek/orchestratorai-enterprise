/**
 * Who may do what on the role and admin APIs, against the real authz tables
 * and functions, through the real RbacGuard and the real controllers'
 * @RequirePermission / @RequireSuperAdmin / @TargetOrg:
 *
 * - every route that requires a permission (or a super-admin) has RbacGuard
 *   among its guards: without it Nest never checks the permission, which is
 *   how any signed-in user could make themselves super-admin through
 *   POST /api/rbac/users/:id/roles;
 * - a member (the demo persona) cannot grant themselves super-admin in '*',
 *   over HTTP or through the service, and the role is not granted;
 * - public sign-up is gone (POST /auth/signup is a 404);
 * - only a super-admin changes what a role grants, grants super-admin or a
 *   role in every organization ('*'), or calls a platform-wide route
 *   (organizations list/stats/create/delete, entitlements, system config,
 *   privacy, the Claude pane, the database, the agent registry);
 * - a permission is checked in the organization the route acts on (URL,
 *   query or body), not the header's, and a route that names none is refused;
 * - an org admin manages only users who work in their organization alone,
 *   never a super-admin, and lists only their organization's users.
 *
 * Set SECURITY_TEST_DATABASE_URL to run it (skipped otherwise; npm run
 * test:all sets it). It creates two spec-* organizations and five users,
 * removed after.
 */
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { RemoteJwtAuthGuard } from '@orchestratorai/planes/auth';
import {
  AUTH_SERVICE,
  type AuthServiceProvider,
} from '@orchestratorai/planes/auth/interfaces/auth-service.interface';
import {
  IDENTITY_PROVIDER,
  type IdentityProvider,
} from '@orchestratorai/planes/auth/interfaces/identity-provider.interface';
import { RbacGuard } from './guards/rbac.guard';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import type { WorkflowRegistry } from '../workflows/catalog/workflow.registry';
import {
  PERMISSION_KEY,
  SUPER_ADMIN_KEY,
} from './decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { AuthController } from '../auth/auth.controller';
import { StreamTokenService } from '../auth/services/stream-token.service';
import { configureApplication } from '../app-bootstrap';
import { AppModule } from '../app.module';
import { AgentRegistryController } from '../admin/agent-registry/agent-registry.controller';
import { OrganizationsController } from '../admin/organizations/organizations.controller';
import { EntitlementsController } from '../auth/entitlements/entitlements.controller';
import { SystemConfigController } from '../admin/system-config/system-config.controller';
import { PrivacyAdminController } from '../admin/privacy/privacy-admin.controller';
import { ClaudePaneController } from '../admin/claude-pane/claude-pane.controller';
import { DatabaseAdminController } from '../admin/database-admin/database-admin.controller';
import { RagManagementController } from '../rag/rag.controller';
import { RagManagementService } from '../rag/rag-management.service';
import type { DocumentProcessorService } from '../rag/document-processor.service';

const url = process.env.SECURITY_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

type NestClass = { prototype: object; name: string };
type Named = {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

/** A controller's route handlers (Nest's @Get, @Post... set 'path'), not helper methods. */
function routes(controller: NestClass): string[] {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter(
    (name) =>
      name !== 'constructor' &&
      typeof proto[name] === 'function' &&
      Reflect.getMetadata('path', proto[name] as object) !== undefined,
  );
}

/** What a route requires: its permission (its own or its controller's), or 'super-admin'; undefined when nothing. */
function requirement(controller: NestClass, method: string): string | undefined {
  const handler = (controller.prototype as Record<string, object>)[method]!;
  if (Reflect.getMetadata(IS_PUBLIC_KEY, handler) || Reflect.getMetadata(IS_PUBLIC_KEY, controller)) return undefined;
  const permission = (Reflect.getMetadata(PERMISSION_KEY, handler) ?? Reflect.getMetadata(PERMISSION_KEY, controller)) as string | undefined;
  if (permission) return permission;
  const superAdmin = (Reflect.getMetadata(SUPER_ADMIN_KEY, handler) ?? Reflect.getMetadata(SUPER_ADMIN_KEY, controller)) as boolean | undefined;
  return superAdmin ? 'super-admin' : undefined;
}

/**
 * The guards that check a route's permission: RbacGuard in the API, and the
 * planes' RemoteJwtAuthGuard, which asks the API's POST /auth/authorize (the
 * same ladder as RbacGuard) for the route's @RequirePermission.
 */
const PERMISSION_GUARDS: unknown[] = [RbacGuard, RemoteJwtAuthGuard];

/** The guards Nest runs on a route: its controller's and its own. */
function guardsOf(controller: NestClass, method: string): unknown[] {
  const handler = (controller.prototype as Record<string, object>)[method]!;
  return [
    ...((Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ?? []),
  ];
}

/** Every controller the API registers: AppModule and everything it imports (Nest's @Module metadata, dynamic modules and forwardRef included). */
function registeredControllers(): NestClass[] {
  const seen = new Set<unknown>();
  const controllers = new Set<NestClass>();
  const queue: unknown[] = [AppModule];
  while (queue.length) {
    let entry = queue.pop();
    if (entry && typeof entry === 'object' && 'forwardRef' in entry) {
      entry = (entry as { forwardRef: () => unknown }).forwardRef();
    }
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    if (typeof entry === 'object' && 'module' in entry) {
      const dynamic = entry as { module: unknown; imports?: unknown[]; controllers?: NestClass[] };
      queue.push(dynamic.module, ...(dynamic.imports ?? []));
      for (const c of dynamic.controllers ?? []) controllers.add(c);
      continue;
    }
    if (typeof entry !== 'function') continue;
    for (const c of (Reflect.getMetadata('controllers', entry) as NestClass[] | undefined) ?? []) controllers.add(c);
    queue.push(...((Reflect.getMetadata('imports', entry) as unknown[] | undefined) ?? []));
  }
  return [...controllers];
}

describeWithDb('RBAC escalation holes against Postgres', () => {
  const run = randomUUID().slice(0, 8);
  const org = `spec-rbac-${run}`;
  const otherOrg = `spec-other-${run}`;
  const demoId = randomUUID(); // the demo persona: a member, nothing more
  const adminId = randomUUID(); // admin of `org`
  const superId = randomUUID(); // super-admin in '*'
  const otherId = randomUUID(); // member of `otherOrg` only
  const bothId = randomUUID(); // member of both
  const managerId = randomUUID(); // manager of `org`: admin:users, not an admin
  const rolerId = randomUUID(); // holds a spec role granting admin:roles in `org`, not an admin
  const everyone = [demoId, adminId, superId, otherId, bothId, managerId, rolerId];
  const rolerRole = `spec-roles-${run}`;
  const email = (id: string): string => `spec-${id.slice(0, 8)}-${run}@example.test`;
  let db: PostgresqlDatabaseService;
  let rbac: RbacService;
  let guard: RbacGuard;

  async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as T[];
  }

  async function grant(userId: string, role: string, orgSlug: string): Promise<void> {
    await sql(
      `INSERT INTO authz.rbac_user_org_roles (user_id, organization_slug, role_id) SELECT $1::uuid, $2, id FROM authz.rbac_roles WHERE name = $3`,
      [userId, orgSlug, role],
    );
  }

  async function rolesOf(userId: string): Promise<string[]> {
    const rows = await sql<{ role: string }>(
      `SELECT ur.organization_slug || ':' || r.name AS role FROM authz.rbac_user_org_roles ur JOIN authz.rbac_roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY 1`,
      [userId],
    );
    return rows.map((r) => r.role);
  }

  /**
   * Run the real RbacGuard for this route, as `userId` with `headerOrg` in
   * x-organization-slug. The route must have RbacGuard among its guards, or
   * Nest would never run it (as the RBAC routes once did not): that throws.
   */
  async function call(
    userId: string,
    controller: NestClass,
    method: string,
    headerOrg: string | null = org, // null: no x-organization-slug header
    named: Named = {},
  ): Promise<200 | 403> {
    const handler = (controller.prototype as Record<string, object>)[method];
    if (typeof handler !== 'function') throw new Error(`${controller.name} has no ${method}`);
    const required = requirement(controller, method);
    if (required && !guardsOf(controller, method).includes(RbacGuard)) {
      throw new Error(`${controller.name}.${method} requires ${required} but RbacGuard never runs on it`);
    }
    const context = {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: userId },
          headers: headerOrg ? { 'x-organization-slug': headerOrg } : {},
          query: named.query ?? {},
          body: named.body ?? {},
          params: named.params ?? {},
        }),
      }),
    } as unknown as ExecutionContext;
    try {
      await guard.canActivate(context);
      return 200;
    } catch (error) {
      if (error instanceof ForbiddenException) return 403;
      throw error;
    }
  }

  /** An AuthController whose auth service is a spy: the admin calls it makes (or must not make). */
  function authController(authService: Partial<Record<keyof AuthServiceProvider, jest.Mock>>): AuthController {
    return new AuthController(
      authService as unknown as AuthServiceProvider,
      {} as IdentityProvider,
      rbac,
      new ConfigService({}),
    );
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    const registry = { list: () => [] } as unknown as WorkflowRegistry;
    rbac = new RbacService(db, registry);
    guard = new RbacGuard(new Reflector(), rbac);
    await sql(`INSERT INTO public.organizations (slug, name) VALUES ($1, 'Spec RBAC org'), ($2, 'Spec other org')`, [org, otherOrg]);
    for (const id of everyone) {
      await sql(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, email(id)]);
      await sql(`INSERT INTO authz.users (id, email) VALUES ($1, $2)`, [id, email(id)]);
    }
    await grant(demoId, 'member', org);
    await grant(adminId, 'admin', org);
    await grant(superId, 'super-admin', '*');
    await grant(otherId, 'member', otherOrg);
    await grant(bothId, 'member', org);
    await grant(bothId, 'member', otherOrg);
    await grant(managerId, 'manager', org);
    await sql(`INSERT INTO authz.rbac_roles (name, display_name, description, is_system) VALUES ($1, $1, 'Spec: admin:roles without admin', false)`, [rolerRole]);
    await sql(
      `INSERT INTO authz.rbac_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM authz.rbac_roles r, authz.rbac_permissions p WHERE r.name = $1 AND p.name = 'admin:roles'`,
      [rolerRole],
    );
    await grant(rolerId, rolerRole, org);
  });

  afterAll(async () => {
    await sql(`DELETE FROM authz.rbac_audit_log WHERE actor_id = ANY($1::uuid[]) OR target_user_id = ANY($1::uuid[])`, [everyone]);
    await sql(`DELETE FROM rag_data.rag_documents WHERE organization_slug = ANY($1::text[])`, [[org, otherOrg]]);
    await sql(`DELETE FROM rag_data.rag_collections WHERE organization_slug = ANY($1::text[])`, [[org, otherOrg]]);
    await sql(`DELETE FROM authz.users WHERE id = ANY($1::uuid[])`, [everyone]);
    await sql(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [everyone]);
    await sql(`DELETE FROM authz.rbac_roles WHERE name = $1`, [rolerRole]);
    await sql(`DELETE FROM public.organizations WHERE slug = ANY($1::text[])`, [[org, otherOrg]]);
    await db.onModuleDestroy();
  });

  it('runs RbacGuard on every route that requires a permission or a super-admin', () => {
    const controllers = registeredControllers();
    // The sweep reached the API's controllers (it would pass on an empty list).
    for (const expected of [RbacController, AuthController, OrganizationsController, EntitlementsController, SystemConfigController, AgentRegistryController]) {
      expect([expected.name, controllers.includes(expected)]).toEqual([expected.name, true]);
    }
    const unguarded: string[] = [];
    let guarded = 0;
    for (const controller of controllers) {
      for (const method of routes(controller)) {
        const required = requirement(controller, method);
        if (!required) continue;
        if (guardsOf(controller, method).some((g) => PERMISSION_GUARDS.includes(g))) guarded += 1;
        else unguarded.push(`${controller.name}.${method} (${required})`);
      }
    }
    expect(unguarded).toEqual([]);
    expect(guarded).toBeGreaterThan(50);
  });

  it('refuses a member (the demo persona) a self-grant of super-admin in *, and does not grant it', async () => {
    const selfGrant = { params: { userId: demoId }, body: { organizationSlug: '*', roleName: 'super-admin' } };
    expect(await call(demoId, RbacController, 'assignRole', org, selfGrant)).toBe(403);
    expect(await call(demoId, RbacController, 'assignRole', '*', selfGrant)).toBe(403);
    expect(await call(demoId, RbacController, 'assignRole', null, selfGrant)).toBe(403);
    expect(await call(demoId, AuthController, 'addUserRole', org, { body: { organizationSlug: '*', role: 'super-admin' } })).toBe(403);
    expect(await call(demoId, AuthController, 'setUserRoles', org, { body: { organizationSlug: '*', roles: ['super-admin'] } })).toBe(403);
    expect(await call(demoId, AuthController, 'createUser', org, { body: { organizationAccess: ['*'], roles: ['super-admin'] } })).toBe(403);
    await expect(rbac.assignRole(demoId, '*', 'super-admin', demoId)).rejects.toThrow(ForbiddenException);
    await expect(rbac.assignRole(demoId, org, 'super-admin', demoId)).rejects.toThrow(ForbiddenException);
    await expect(rbac.assignRole(demoId, org, 'admin', demoId)).rejects.toThrow(/cannot manage roles in/);
    expect(await rolesOf(demoId)).toEqual([`${org}:member`]);
    expect(await rbac.isSuperAdmin(demoId)).toBe(false);
  });

  describe('over HTTP (the real JwtAuthGuard, RbacGuard and global pipes)', () => {
    let app: INestApplication;
    let base: string;
    const authService = { resolveInternalUserId: jest.fn(async (principal: { id: string }) => principal.id) };

    beforeAll(async () => {
      // A bearer token here is the user's id: the identity provider is the only stand-in.
      const identityProvider = { validateToken: jest.fn(async (token: string) => ({ id: token, issuer: 'spec', subject: token, rawClaims: {} })) };
      const module = await Test.createTestingModule({
        controllers: [RbacController, AuthController],
        providers: [
          { provide: RbacService, useValue: rbac },
          { provide: AUTH_SERVICE, useValue: authService },
          { provide: IDENTITY_PROVIDER, useValue: identityProvider },
          { provide: StreamTokenService, useValue: { verifyToken: () => { throw new Error('not a stream token'); } } },
          { provide: ConfigService, useValue: new ConfigService({}) },
        ],
      }).compile();
      const express = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
      configureApplication(express);
      app = express;
      await app.listen(0, '127.0.0.1');
      base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    });

    afterAll(() => app.close());

    const post = (path: string, as: string, body: unknown, headerOrg?: string): Promise<Response> =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${as}`,
          ...(headerOrg ? { 'x-organization-slug': headerOrg } : {}),
        },
        body: JSON.stringify(body),
      });

    it('has no public sign-up: POST /auth/signup is a 404 and creates nothing', async () => {
      const response = await fetch(`${base}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `spec-signup-${run}@example.test`, password: 'Spec-password-1' }),
      });
      expect(response.status).toBe(404);
      expect(routes(AuthController)).not.toContain('signup');
      expect(await sql(`SELECT id FROM auth.users WHERE email = $1`, [`spec-signup-${run}@example.test`])).toEqual([]);
    });

    it('refuses the demo persona POST /api/rbac/users/<self>/roles {"organizationSlug":"*","roleName":"super-admin"} with a 403', async () => {
      for (const headerOrg of [org, '*', undefined]) {
        const response = await post(`/api/rbac/users/${demoId}/roles`, demoId, { organizationSlug: '*', roleName: 'super-admin' }, headerOrg);
        expect([headerOrg, response.status]).toEqual([headerOrg, 403]);
      }
      expect(await rolesOf(demoId)).toEqual([`${org}:member`]);
      expect(await rbac.isSuperAdmin(demoId)).toBe(false);
    });

    it('refuses the demo persona adding a permission to a role (POST /api/rbac/roles/:roleId/permissions/:permissionId) with a 403', async () => {
      const [member] = await sql<{ id: string }>(`SELECT id FROM authz.rbac_roles WHERE name = 'member'`);
      const [all] = await sql<{ id: string }>(`SELECT id FROM authz.rbac_permissions ORDER BY name LIMIT 1`);
      const before = await sql(`SELECT permission_id FROM authz.rbac_role_permissions WHERE role_id = $1 ORDER BY 1`, [member!.id]);
      const response = await post(`/api/rbac/roles/${member!.id}/permissions/${all!.id}`, demoId, {}, org);
      expect(response.status).toBe(403);
      expect(await sql(`SELECT permission_id FROM authz.rbac_role_permissions WHERE role_id = $1 ORDER BY 1`, [member!.id])).toEqual(before);
    });
  });

  it('lets only a super-admin change what a role grants', async () => {
    const [adminRole] = await sql<{ id: string }>(`SELECT id FROM authz.rbac_roles WHERE name = 'admin'`);
    for (const method of ['addPermissionToRole', 'removePermissionFromRole']) {
      expect([method, await call(adminId, RbacController, method)]).toEqual([method, 403]);
      expect([method, await call(demoId, RbacController, method)]).toEqual([method, 403]);
      expect([method, await call(superId, RbacController, method)]).toEqual([method, 200]);
    }
    await expect(rbac.assertMayEditRole(adminId, adminRole!.id)).rejects.toThrow(ForbiddenException);
    await expect(rbac.assertMayEditRole(demoId, adminRole!.id)).rejects.toThrow(ForbiddenException);
    await expect(rbac.assertMayEditRole(superId, adminRole!.id)).resolves.toBeUndefined();
    await expect(rbac.assertMayEditRole(superId, randomUUID())).rejects.toThrow(NotFoundException);
  });

  it('lets an org admin grant roles in their own org only, never super-admin or every org', async () => {
    await expect(rbac.assignRole(demoId, org, 'super-admin', adminId)).rejects.toThrow(/Only a super-admin/);
    await expect(rbac.assignRole(adminId, '*', 'admin', adminId)).rejects.toThrow(/Only a super-admin/);
    await expect(rbac.assignRole(demoId, '*', 'member', adminId)).rejects.toThrow(/Only a super-admin/);
    await expect(rbac.assignRole(demoId, otherOrg, 'admin', adminId)).rejects.toThrow(/cannot manage roles in spec-other/);
    await expect(rbac.revokeRole(otherId, otherOrg, 'member', adminId)).rejects.toThrow(/cannot manage roles in spec-other/);
    await expect(rbac.revokeRole(superId, '*', 'super-admin', adminId)).rejects.toThrow(/Only a super-admin/);
    expect(await rolesOf(superId)).toEqual(['*:super-admin']);
    expect(await rolesOf(otherId)).toEqual([`${otherOrg}:member`]);

    // A super-admin may grant anything anywhere.
    await rbac.assignRole(demoId, otherOrg, 'viewer', superId);
    await rbac.revokeRole(demoId, otherOrg, 'viewer', superId);

    await rbac.assignRole(demoId, org, 'viewer', adminId);
    expect(await rolesOf(demoId)).toEqual([`${org}:member`, `${org}:viewer`]);
    await rbac.revokeRole(demoId, org, 'viewer', adminId);
    expect(await rolesOf(demoId)).toEqual([`${org}:member`]);
  });

  it('checks a permission in the organization a route acts on, not the header\'s', async () => {
    // Org admin of `org`, header `org`, acting on `otherOrg` (URL, query or body).
    const crossOrg: Array<[NestClass, string, Named]> = [
      [RbacController, 'getOrganizationUsers', { params: { orgSlug: otherOrg } }],
      [RbacController, 'getUserRoles', { query: { organizationSlug: otherOrg } }],
      [RbacController, 'getUserPermissions', { query: { organizationSlug: otherOrg } }],
      [RbacController, 'assignRole', { body: { organizationSlug: otherOrg, roleName: 'member' } }],
      [RbacController, 'revokeRole', { query: { organizationSlug: otherOrg } }],
      [RbacController, 'getAuditLog', { query: { organizationSlug: otherOrg } }],
      [AuthController, 'setUserRoles', { body: { organizationSlug: otherOrg, roles: ['member'] } }],
      [AuthController, 'addUserRole', { body: { organizationSlug: otherOrg, role: 'member' } }],
      [AuthController, 'removeUserRole', { body: { organizationSlug: otherOrg } }],
      [OrganizationsController, 'findOne', { params: { slug: otherOrg } }],
      [OrganizationsController, 'update', { params: { slug: otherOrg } }],
    ];
    for (const [controller, method, named] of crossOrg) {
      const route = `${controller.name}.${method}`;
      expect([route, 'other org', await call(adminId, controller, method, org, named)]).toEqual([route, 'other org', 403]);
      const own = JSON.parse(JSON.stringify(named).split(otherOrg).join(org)) as Named;
      expect([route, 'own org', await call(adminId, controller, method, otherOrg, own)]).toEqual([route, 'own org', 200]);
      expect([route, 'member', await call(demoId, controller, method, org, own)]).toEqual([route, 'member', 403]);
      expect([route, 'super-admin', await call(superId, controller, method, null, named)]).toEqual([route, 'super-admin', 200]);
    }
    // No organization named: refused (every organization's audit log, a role change with no org).
    expect(await call(adminId, RbacController, 'getAuditLog', org)).toBe(403);
    expect(await call(adminId, RbacController, 'assignRole', org, { body: { roleName: 'member' } })).toBe(403);
    expect(await call(adminId, AuthController, 'addUserRole', org, { body: { role: 'member' } })).toBe(403);
    expect(await call(adminId, AuthController, 'removeUserRole', org)).toBe(403);
    // Every organization ('*') is a super-admin's, by name or by header.
    expect(await call(adminId, RbacController, 'getOrganizationUsers', org, { params: { orgSlug: '*' } })).toBe(403);
    expect(await call(adminId, RbacController, 'getAuditLog', org, { query: { organizationSlug: '*' } })).toBe(403);
    expect(await call(adminId, AuthController, 'getAllUsers', '*')).toBe(403);
    expect(await call(adminId, AuthController, 'getAllUsers', org)).toBe(200);
  });

  it('wants the organization of a role change: no silent demo-org', async () => {
    const controller = authController({});
    const asSuper = { id: superId } as never;
    await expect(controller.addUserRole(demoId, { role: 'viewer' }, asSuper)).rejects.toThrow(BadRequestException);
    await expect(controller.setUserRoles(demoId, { roles: ['viewer'] }, asSuper)).rejects.toThrow(BadRequestException);
    await expect(controller.removeUserRole(demoId, 'viewer', {}, asSuper)).rejects.toThrow(BadRequestException);
    await expect(new RbacController(rbac).assignRole(demoId, { roleName: 'viewer' } as never, { id: superId })).rejects.toThrow(BadRequestException);
    await expect(new RbacController(rbac).revokeRole(demoId, 'viewer', undefined as never, { id: superId })).rejects.toThrow(BadRequestException);
    expect(await rolesOf(demoId)).toEqual([`${org}:member`]);
  });

  it('checks every role a new user is created with in the organization it is granted in', async () => {
    const createUser = jest.fn(async () => ({}));
    const controller = authController({ createUser });
    const asAdmin = { id: adminId } as never;
    const user = { email: `spec-new-${run}@example.test`, password: 'Spec-password-1' };
    await expect(controller.createUser({ ...user, roles: ['super-admin'], organizationAccess: [org] }, asAdmin)).rejects.toThrow(ForbiddenException);
    await expect(controller.createUser({ ...user, roles: ['member'], organizationAccess: ['*'] }, asAdmin)).rejects.toThrow(ForbiddenException);
    await expect(controller.createUser({ ...user, roles: ['member'], organizationAccess: [org, otherOrg] }, asAdmin)).rejects.toThrow(/cannot manage roles in spec-other/);
    await expect(controller.createUser({ ...user, roles: ['member'] }, asAdmin)).rejects.toThrow(BadRequestException);
    await expect(controller.createUser({ ...user, organizationAccess: [org] }, asAdmin)).rejects.toThrow(BadRequestException);
    expect(createUser).not.toHaveBeenCalled();
    await controller.createUser({ ...user, roles: ['member'], organizationAccess: [org] }, asAdmin);
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it('keeps platform-wide routes for super-admins: org admins and members are refused every one', async () => {
    const platformWide: Array<[NestClass, string, Named]> = [
      [OrganizationsController, 'findAll', {}],
      [OrganizationsController, 'getStats', {}],
      [OrganizationsController, 'create', {}],
      [OrganizationsController, 'delete', { params: { slug: org } }],
      ...routes(EntitlementsController).map((m): [NestClass, string, Named] => [EntitlementsController, m, { params: { orgSlug: org } }]),
      ...[SystemConfigController, PrivacyAdminController, ClaudePaneController, DatabaseAdminController, AgentRegistryController].flatMap((c) =>
        routes(c).map((m): [NestClass, string, Named] => [c, m, {}]),
      ),
    ];
    expect(platformWide.length).toBeGreaterThan(30);
    for (const [controller, method, named] of platformWide) {
      const route = `${controller.name}.${method}`;
      expect([route, 'admin', await call(adminId, controller, method, org, named)]).toEqual([route, 'admin', 403]);
      expect([route, 'admin, header *', await call(adminId, controller, method, '*', named)]).toEqual([route, 'admin, header *', 403]);
      expect([route, 'member', await call(demoId, controller, method, org, named)]).toEqual([route, 'member', 403]);
      expect([route, 'super-admin', await call(superId, controller, method, org, named)]).toEqual([route, 'super-admin', 200]);
    }
  });

  it('answers POST /auth/authorize (the planes\' permission check) by the same rule: every organization is a super-admin\'s', async () => {
    const controller = authController({});
    const authorize = (userId: string, permission: string, organizationSlug?: string) =>
      controller.authorize({ id: userId } as never, { headers: {}, query: {} }, { permission, organizationSlug });
    // No organization means every organization ('*').
    await expect(authorize(adminId, 'admin:audit')).rejects.toThrow(ForbiddenException);
    await expect(authorize(adminId, 'admin:audit', '*')).rejects.toThrow(ForbiddenException);
    await expect(authorize(adminId, 'admin:audit', otherOrg)).rejects.toThrow(ForbiddenException);
    await expect(authorize(adminId, 'admin:audit', org)).resolves.toMatchObject({ allowed: true, orgSlug: org });
    // '*:*' (the planes' platform-wide routes, e.g. every user's evaluations) is the super-admin role's alone.
    await expect(authorize(adminId, '*:*', org)).rejects.toThrow(ForbiddenException);
    await expect(authorize(demoId, 'agents:execute', '*')).rejects.toThrow(ForbiddenException);
    await expect(authorize(demoId, 'agents:execute', org)).resolves.toMatchObject({ allowed: true });
    await expect(authorize(superId, '*:*')).resolves.toMatchObject({ allowed: true, orgSlug: '*' });
  });

  it('lets an org admin manage only users who work in their organization alone, never a super-admin', async () => {
    await expect(rbac.assertMayManageUser(adminId, demoId)).resolves.toBeUndefined();
    await expect(rbac.assertMayManageUser(adminId, otherId)).rejects.toThrow(/also works in spec-other/);
    await expect(rbac.assertMayManageUser(adminId, bothId)).rejects.toThrow(/also works in spec-other/);
    await expect(rbac.assertMayManageUser(adminId, superId)).rejects.toThrow(/Only a super-admin manages a super-admin/);
    await expect(rbac.assertMayManageUser(demoId, demoId)).rejects.toThrow(ForbiddenException);
    await expect(rbac.assertMayManageUserByEmail(adminId, email(otherId))).rejects.toThrow(ForbiddenException);
    await expect(rbac.assertMayManageUserByEmail(adminId, email(superId))).rejects.toThrow(ForbiddenException);
    await expect(rbac.assertMayManageUserByEmail(adminId, `nobody-${run}@example.test`)).rejects.toThrow(NotFoundException);
    await expect(rbac.assertMayManageUserByEmail(adminId, email(demoId))).resolves.toBeUndefined();
    await expect(rbac.assertMayManageUser(superId, otherId)).resolves.toBeUndefined();
  });

  it('stops an org admin reading, deleting, resetting or setting the password of a super-admin or another org\'s user', async () => {
    const authService = {
      getUserById: jest.fn(async () => ({})),
      deleteUser: jest.fn(async () => ({ success: true, message: '' })),
      changeUserPassword: jest.fn(async () => ({ success: true, message: '' })),
      initiatePasswordReset: jest.fn(async () => ({ success: true, message: '' })),
    };
    const controller = authController(authService);
    const asAdmin = { id: adminId } as never;
    for (const target of [superId, otherId, bothId]) {
      await expect(controller.getUserById(target, asAdmin)).rejects.toThrow(ForbiddenException);
      await expect(controller.deleteUser(target, asAdmin)).rejects.toThrow(ForbiddenException);
      await expect(controller.changeUserPassword(target, 'Spec-password-2', asAdmin)).rejects.toThrow(ForbiddenException);
      await expect(controller.initiatePasswordReset({ email: email(target) }, asAdmin)).rejects.toThrow(ForbiddenException);
    }
    for (const spy of Object.values(authService)) expect(spy).not.toHaveBeenCalled();

    // Their own organization's user: yes.
    await controller.getUserById(demoId, asAdmin);
    await controller.changeUserPassword(demoId, 'Spec-password-2', asAdmin);
    await controller.initiatePasswordReset({ email: email(demoId) }, asAdmin);
    await controller.deleteUser(demoId, asAdmin);
    for (const spy of Object.values(authService)) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('lists to an org admin only the users of their organization; every user only to a super-admin', async () => {
    const all = everyone.map((id) => ({ id, email: email(id) }));
    const controller = authController({ getAllUsers: jest.fn(async () => all) });
    const listed = (await controller.getAllUsers({ id: adminId } as never, { organizationSlug: org })).map((u) => u.id);
    // The organization's users (a super-admin's role in '*' counts in every organization), never another's.
    expect(listed).toEqual(expect.arrayContaining([demoId, adminId, bothId]));
    expect(listed).not.toContain(otherId);
    await expect(controller.getAllUsers({ id: adminId } as never, {})).rejects.toThrow(ForbiddenException);
    expect((await controller.getAllUsers({ id: superId } as never, { organizationSlug: '*' })).length).toBe(everyone.length);
  });
  it('keeps an org admin\'s accounts from anyone who is not an admin of that org (a manager holds admin:users, not admin)', async () => {
    // A manager still manages the plain members of their organization...
    await expect(rbac.assertMayManageUser(managerId, demoId)).resolves.toBeUndefined();
    // ...but not its admin, nor anyone holding admin:roles there.
    await expect(rbac.assertMayManageUser(managerId, adminId)).rejects.toThrow(/is an admin in spec-rbac/);
    await expect(rbac.assertMayManageUser(managerId, rolerId)).rejects.toThrow(/is an admin in spec-rbac/);
    await expect(rbac.assertMayManageUserByEmail(managerId, email(adminId))).rejects.toThrow(ForbiddenException);
    // An admin of the organization may.
    await expect(rbac.assertMayManageUser(adminId, rolerId)).resolves.toBeUndefined();
    await expect(rbac.assertMayManageUser(adminId, managerId)).resolves.toBeUndefined();

    const authService = {
      changeUserPassword: jest.fn(async () => ({ success: true, message: '' })),
      initiatePasswordReset: jest.fn(async () => ({ success: true, message: '' })),
      deleteUser: jest.fn(async () => ({ success: true, message: '' })),
      getUserById: jest.fn(async () => ({})),
    };
    const controller = authController(authService);
    const asManager = { id: managerId } as never;
    expect(await call(managerId, AuthController, 'changeUserPassword', org)).toBe(200); // the guard lets a manager in...
    await expect(controller.changeUserPassword(adminId, 'Spec-password-3', asManager)).rejects.toThrow(ForbiddenException); // ...not to the admin
    await expect(controller.initiatePasswordReset({ email: email(adminId) }, asManager)).rejects.toThrow(ForbiddenException);
    await expect(controller.deleteUser(adminId, asManager)).rejects.toThrow(ForbiddenException);
    await expect(controller.getUserById(adminId, asManager)).rejects.toThrow(ForbiddenException);
    for (const spy of Object.values(authService)) expect(spy).not.toHaveBeenCalled();
    await controller.changeUserPassword(demoId, 'Spec-password-3', asManager);
    expect(authService.changeUserPassword).toHaveBeenCalledTimes(1);
  });

  it('lets only an admin of the org grant or revoke the admin role, or any role that manages roles', async () => {
    // admin:roles without being admin: plain roles yes, admin-level roles no.
    await expect(rbac.assignRole(demoId, org, 'admin', rolerId)).rejects.toThrow(/Only an admin of spec-rbac/);
    await expect(rbac.assignRole(demoId, org, rolerRole, rolerId)).rejects.toThrow(/Only an admin of spec-rbac/);
    await expect(rbac.revokeRole(adminId, org, 'admin', rolerId)).rejects.toThrow(/Only an admin of spec-rbac/);
    expect(await rolesOf(adminId)).toEqual([`${org}:admin`]);
    await rbac.assignRole(demoId, org, 'viewer', rolerId);
    await rbac.revokeRole(demoId, org, 'viewer', rolerId);
    // A manager (admin:users, no admin:roles) grants nothing.
    await expect(rbac.assignRole(demoId, org, 'viewer', managerId)).rejects.toThrow(/cannot manage roles in/);
    await expect(rbac.assignRole(managerId, org, 'admin', managerId)).rejects.toThrow(ForbiddenException);
    // The org admin may grant and revoke admin in their own org.
    await rbac.assignRole(demoId, org, 'admin', adminId);
    await rbac.revokeRole(demoId, org, 'admin', adminId);
    expect(await rolesOf(demoId)).toEqual([`${org}:member`]);
  });

  describe('RAG collections: rag:admin binds to the organization it was checked in', () => {
    let ragService: RagManagementService;
    let controller: RagManagementController;
    let ownId: string;
    let otherCollectionId: string;
    const asAdmin = { organizationSlug: org }; // what RbacGuard binds for the admin of `org`
    const asSuper = { organizationSlug: '*' }; // a super-admin with no organization selected
    const file = { originalname: 'spec.md', mimetype: 'text/markdown', size: 4, buffer: Buffer.from('spec') } as Express.Multer.File;

    beforeAll(async () => {
      ragService = new RagManagementService(db, { getDimensions: () => 768 } as never, new ConfigService({ EMBEDDING_MODEL: 'spec-embedding' }));
      const processor = { processDocument: jest.fn(async () => ({ status: 'completed' })) } as unknown as DocumentProcessorService;
      controller = new RagManagementController(ragService, processor);
      ownId = (await ragService.createCollection({ name: `spec own ${run}`, orgSlug: org })).id;
      otherCollectionId = (await ragService.createCollection({ name: `spec other ${run}`, orgSlug: otherOrg })).id;
    });

    it('lets the guard bind only the org it checked: missing or * is refused to a non-super-admin', async () => {
      expect(await call(adminId, RagManagementController, 'listCollections', org)).toBe(200);
      expect(await call(adminId, RagManagementController, 'listCollections', otherOrg)).toBe(403);
      expect(await call(adminId, RagManagementController, 'listCollections', '*')).toBe(403);
      expect(await call(adminId, RagManagementController, 'listCollections', null)).toBe(403);
      expect(await call(demoId, RagManagementController, 'listCollections', org)).toBe(403);
      expect(await call(superId, RagManagementController, 'listCollections', null)).toBe(200);
    });

    it('refuses an admin of one org every collection route of another', async () => {
      await expect(controller.listCollections(asAdmin, otherOrg)).rejects.toThrow(ForbiddenException);
      const listed = (await controller.listCollections(asAdmin)).collections.map((c) => c.id);
      expect(listed).toContain(ownId);
      expect(listed).not.toContain(otherCollectionId);
      await expect(controller.getCollection(asAdmin, otherCollectionId)).rejects.toThrow(ForbiddenException);
      await expect(controller.getCollection(asAdmin, ownId, otherOrg)).rejects.toThrow(ForbiddenException);
      await expect(controller.createCollection(asAdmin, { name: `spec sneak ${run}`, orgSlug: otherOrg })).rejects.toThrow(ForbiddenException);
      await expect(controller.createCollection(asAdmin, { name: `spec none ${run}` } as never)).rejects.toThrow(BadRequestException);
      await expect(controller.updateCollection(asAdmin, otherCollectionId, { name: 'spec renamed' })).rejects.toThrow(ForbiddenException);
      await expect(controller.listDocuments(asAdmin, otherCollectionId)).rejects.toThrow(ForbiddenException);
      await expect(controller.uploadDocument(asAdmin, otherCollectionId, file)).rejects.toThrow(ForbiddenException);
      await expect(controller.deleteDocument(asAdmin, otherCollectionId, randomUUID())).rejects.toThrow(ForbiddenException);
      await expect(controller.getDocumentChunks(asAdmin, otherCollectionId, randomUUID())).rejects.toThrow(ForbiddenException);
      await expect(controller.deleteCollection(asAdmin, otherCollectionId)).rejects.toThrow(ForbiddenException);
      // The other org's collection is untouched, and nothing was made there.
      const other = await ragService.getCollection(otherCollectionId);
      expect(other.name).toBe(`spec other ${run}`);
      expect((await ragService.listCollections(otherOrg)).collections.map((c) => c.id)).toEqual([otherCollectionId]);
      expect((await ragService.listDocuments(otherCollectionId)).documents).toEqual([]);
    });

    it('lets the admin work in their own org, and a super-admin in any', async () => {
      expect((await controller.getCollection(asAdmin, ownId)).id).toBe(ownId);
      expect((await controller.updateCollection(asAdmin, ownId, { description: 'spec' })).description).toBe('spec');
      expect((await controller.listDocuments(asAdmin, ownId)).documents).toEqual([]);
      const listed = (await controller.listCollections(asSuper)).collections.map((c) => c.id);
      expect(listed).toEqual(expect.arrayContaining([ownId, otherCollectionId]));
      expect((await controller.getCollection(asSuper, otherCollectionId)).id).toBe(otherCollectionId);
      await expect(controller.getCollection(asSuper, otherCollectionId, org)).rejects.toThrow(ForbiddenException);
      const made = await controller.createCollection(asAdmin, { name: `spec made ${run}`, orgSlug: org });
      expect(made.orgSlug).toBe(org);
      await controller.deleteCollection(asAdmin, made.id);
    });
  });
});
