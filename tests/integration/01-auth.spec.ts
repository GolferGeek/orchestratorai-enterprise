/**
 * 01 — Auth API Integration Tests (port 6100)
 *
 * Real HTTP calls against the running Auth API.
 * No mocking. Tests login, user context, entitlements, RBAC, and admin endpoints.
 */
import { createTestClient, TestClient } from './helpers/http-client';
import { login, getUserContext, clearAuthCache } from './helpers/auth';
import { apiUrl } from './helpers/ports';
import { requireService } from './helpers/service-check';

const AUTH_BASE = apiUrl('auth');

let authedClient: TestClient;
let unauthClient: TestClient;
let userId: string;
let orgSlug: string;

beforeAll(async () => {
  await requireService('auth');

  const token = await login();
  authedClient = createTestClient(AUTH_BASE, token);
  unauthClient = createTestClient(AUTH_BASE);

  const ctx = await getUserContext();
  userId = ctx.user.id;
  orgSlug = ctx.organizations[0]?.slug ?? 'marketing';
});

// ─── Login ──────────────────────────────────────────────────────────────────

describe('Auth / Login', () => {
  it('POST /auth/login with valid credentials returns accessToken', async () => {
    clearAuthCache();
    const res = await unauthClient.post<{ accessToken: string; refreshToken: string }>(
      '/auth/login',
      { email: 'golfergeek@orchestratorai.io', password: 'GolferGeek123!' },
    );
    expect(res.accessToken).toBeTruthy();
    expect(typeof res.accessToken).toBe('string');
  });

  it('POST /auth/login with wrong password returns 401', async () => {
    const res = await unauthClient.raw('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'golfergeek@orchestratorai.io', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /auth/login with nonexistent user returns 401', async () => {
    const res = await unauthClient.raw('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'nope' }),
    });
    expect(res.status).toBe(401);
  });
});

// ─── User Context ───────────────────────────────────────────────────────────

describe('Auth / User Context', () => {
  it('GET /users/me/context returns user and organizations', async () => {
    const ctx = await authedClient.get<{
      user: { id: string; email: string };
      organizations: Array<{ slug: string }>;
    }>('/users/me/context');

    expect(ctx.user).toBeDefined();
    expect(ctx.user.id).toBeTruthy();
    expect(ctx.user.email).toBe('golfergeek@orchestratorai.io');
    expect(ctx.organizations).toBeInstanceOf(Array);
    expect(ctx.organizations.length).toBeGreaterThan(0);
  });

  it('GET /users/me/context without auth returns 401', async () => {
    const res = await unauthClient.raw('/users/me/context');
    expect(res.status).toBe(401);
  });
});

// ─── Auth Me / Validate / Entitlements / Permissions ────────────────────────

describe('Auth / Identity Endpoints', () => {
  it('GET /auth/me returns current user', async () => {
    const me = await authedClient.get<{ id: string; email: string }>('/auth/me');
    expect(me.id).toBe(userId);
    expect(me.email).toBe('golfergeek@orchestratorai.io');
  });

  it('GET /auth/validate returns valid=true', async () => {
    const result = await authedClient.get<{ valid: boolean }>('/auth/validate');
    expect(result.valid).toBe(true);
  });

  it('GET /auth/entitlements returns entitlements data', async () => {
    const result = await authedClient.get<Record<string, unknown>>('/auth/entitlements');
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('GET /auth/permissions requires organizationSlug param', async () => {
    const result = await authedClient.get<Record<string, unknown>>(
      `/auth/permissions?organizationSlug=${orgSlug}`,
    );
    expect(result).toBeDefined();
  });
});

// ─── RBAC ───────────────────────────────────────────────────────────────────

describe('Auth / RBAC', () => {
  it('GET /api/rbac/roles returns roles data', async () => {
    const result = await authedClient.get<Record<string, unknown>>('/api/rbac/roles');
    expect(result).toBeDefined();
    // May return { roles: [...] } or a direct array
    const roles = Array.isArray(result) ? result : (result.roles ?? result.data ?? result);
    expect(roles).toBeDefined();
  });

  it('GET /api/rbac/me/roles returns current user roles', async () => {
    const result = await authedClient.get<Record<string, unknown>>('/api/rbac/me/roles');
    expect(result).toBeDefined();
  });

  it('GET /api/rbac/me/is-super-admin returns boolean', async () => {
    const result = await authedClient.get<{ isSuperAdmin: boolean }>('/api/rbac/me/is-super-admin');
    expect(typeof result.isSuperAdmin).toBe('boolean');
    // Test user is super-admin
    expect(result.isSuperAdmin).toBe(true);
  });

  it('GET /api/rbac/me/permissions returns permissions', async () => {
    const result = await authedClient.get<Record<string, unknown>>('/api/rbac/me/permissions');
    expect(result).toBeDefined();
  });

  it('GET /api/rbac/me/organizations returns org assignments', async () => {
    const result = await authedClient.get<Record<string, unknown>>('/api/rbac/me/organizations');
    expect(result).toBeDefined();
    // May be { organizations: [...] } or direct array
    const orgs = Array.isArray(result) ? result : (result.organizations ?? result.data ?? result);
    expect(orgs).toBeDefined();
  });

  it('GET /api/rbac/permissions returns all permissions', async () => {
    const result = await authedClient.get<Record<string, unknown>>('/api/rbac/permissions');
    expect(result).toBeDefined();
  });
});

// ─── Admin Users ────────────────────────────────────────────────────────────

describe('Auth / Admin Users', () => {
  it('GET /auth/admin/users returns users list', async () => {
    const users = await authedClient.get<unknown[]>('/auth/admin/users');
    expect(users).toBeInstanceOf(Array);
    expect(users.length).toBeGreaterThan(0);
  });

  it('GET /auth/admin/users/:userId returns specific user', async () => {
    const user = await authedClient.get<{ id: string }>(`/auth/admin/users/${userId}`);
    expect(user.id).toBe(userId);
  });
});

// ─── Organizations ──────────────────────────────────────────────────────────

describe('Auth / Organizations', () => {
  it('GET /admin/organizations returns org list', async () => {
    const orgs = await authedClient.get<unknown[]>('/admin/organizations');
    expect(orgs).toBeInstanceOf(Array);
    expect(orgs.length).toBeGreaterThan(0);
  });
});

// ─── Teams ──────────────────────────────────────────────────────────────────

describe('Auth / Teams', () => {
  it('GET /teams returns teams for current user', async () => {
    const teams = await authedClient.get<unknown[]>('/teams');
    expect(teams).toBeInstanceOf(Array);
  });

  it('GET /orgs/:orgSlug/teams returns teams for org', async () => {
    const teams = await authedClient.get<unknown[]>(`/orgs/${orgSlug}/teams`);
    expect(teams).toBeInstanceOf(Array);
  });
});

// ─── Token Refresh ──────────────────────────────────────────────────────────

describe('Auth / Token Refresh', () => {
  it('POST /auth/refresh with valid refreshToken returns new accessToken', async () => {
    // Get a fresh login to have the refresh token
    const loginRes = await unauthClient.post<{ accessToken: string; refreshToken: string }>(
      '/auth/login',
      { email: 'golfergeek@orchestratorai.io', password: 'GolferGeek123!' },
    );

    const refreshRes = await unauthClient.post<{ accessToken: string }>(
      '/auth/refresh',
      { refreshToken: loginRes.refreshToken },
    );
    expect(refreshRes.accessToken).toBeTruthy();
  });
});

// ─── Health ─────────────────────────────────────────────────────────────────

describe('Auth / Health', () => {
  it('GET /health returns OK', async () => {
    const res = await unauthClient.get<{ status: string }>('/health');
    expect(res.status).toBeDefined();
  });
});
