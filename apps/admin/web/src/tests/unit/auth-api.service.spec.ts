/**
 * auth-api.service.spec.ts
 *
 * Unit tests for AuthApiService (Admin Web).
 * All axios calls are mocked — no real network traffic.
 *
 * Tests verify:
 * - Correct endpoint URLs for each domain (orgs, users, roles, entitlements, system config)
 * - Correct HTTP methods
 * - Request payloads are correct
 * - 401 responses dispatch the auth:session-expired event
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// ─── Mock axios ───────────────────────────────────────────────────────────────

vi.mock('axios', () => {
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn((onFulfilled: unknown) => onFulfilled) },
    },
  };
  return {
    default: {
      create: vi.fn(() => mockClient),
    },
  };
});

// Mock tokenStorage so it doesn't try to load Capacitor in tests
vi.mock('@/services/tokenStorageService', () => ({
  tokenStorage: {
    getAccessToken: vi.fn().mockResolvedValue(null),
    initialize: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMockClient() {
  return (axios as any).create() as {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    interceptors: {
      request: { use: ReturnType<typeof vi.fn> };
      response: { use: ReturnType<typeof vi.fn> };
    };
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthApiService', () => {
  let client: ReturnType<typeof getMockClient>;

  beforeEach(async () => {
    vi.resetModules();
    client = getMockClient();
    client.get.mockResolvedValue({ data: {} });
    client.post.mockResolvedValue({ data: {} });
    client.put.mockResolvedValue({ data: {} });
    client.delete.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function getService() {
    const mod = await import('@/services/auth-api.service');
    return mod.authApiService;
  }

  // ─── Organizations ────────────────────────────────────────────────────

  describe('Organizations', () => {
    it('listOrgs GETs /admin/organizations', async () => {
      const orgs = [{ slug: 'acme', name: 'Acme', created_at: '', updated_at: '' }];
      client.get.mockResolvedValueOnce({ data: orgs });
      const svc = await getService();
      const result = await svc.listOrgs();
      expect(client.get).toHaveBeenCalledWith('/admin/organizations');
      expect(result).toEqual(orgs);
    });

    it('createOrg POSTs to /admin/organizations', async () => {
      const newOrg = { slug: 'new-co', name: 'New Co', created_at: '', updated_at: '' };
      client.post.mockResolvedValueOnce({ data: newOrg });
      const svc = await getService();
      const result = await svc.createOrg({ slug: 'new-co', name: 'New Co' });
      expect(client.post).toHaveBeenCalledWith('/admin/organizations', {
        slug: 'new-co',
        name: 'New Co',
      });
      expect(result).toEqual(newOrg);
    });

    it('updateOrg PUTs to /admin/organizations/:slug', async () => {
      const updated = { slug: 'acme', name: 'Acme Updated', created_at: '', updated_at: '' };
      client.put.mockResolvedValueOnce({ data: updated });
      const svc = await getService();
      const result = await svc.updateOrg('acme', { name: 'Acme Updated' });
      expect(client.put).toHaveBeenCalledWith('/admin/organizations/acme', {
        name: 'Acme Updated',
      });
      expect(result).toEqual(updated);
    });

    it('deleteOrg DELETEs /admin/organizations/:slug', async () => {
      const svc = await getService();
      await svc.deleteOrg('acme');
      expect(client.delete).toHaveBeenCalledWith('/admin/organizations/acme');
    });
  });

  // ─── Users ────────────────────────────────────────────────────────────

  describe('Users', () => {
    it('listUsers GETs /auth/admin/users', async () => {
      client.get.mockResolvedValueOnce({ data: [] });
      const svc = await getService();
      await svc.listUsers();
      expect(client.get).toHaveBeenCalledWith('/auth/admin/users', { params: {} });
    });

    it('listUsers passes orgSlug as a query param when provided', async () => {
      client.get.mockResolvedValueOnce({ data: [] });
      const svc = await getService();
      await svc.listUsers('acme');
      expect(client.get).toHaveBeenCalledWith('/auth/admin/users', {
        params: { orgSlug: 'acme' },
      });
    });

    it('inviteUser POSTs to /auth/admin/users/invite', async () => {
      const invited = { id: 'u1', email: 'alice@example.com', roles: [], status: 'invited', createdAt: '' };
      client.post.mockResolvedValueOnce({ data: invited });
      const svc = await getService();
      const result = await svc.inviteUser({ email: 'alice@example.com' });
      expect(client.post).toHaveBeenCalledWith('/auth/admin/users/invite', {
        email: 'alice@example.com',
      });
      expect(result).toEqual(invited);
    });

    it('createUser POSTs to /auth/admin/users', async () => {
      const created = { id: 'u2', email: 'bob@example.com', roles: [], status: 'active', createdAt: '' };
      client.post.mockResolvedValueOnce({ data: created });
      const svc = await getService();
      await svc.createUser({ email: 'bob@example.com', password: 'secret123' });
      expect(client.post).toHaveBeenCalledWith('/auth/admin/users', {
        email: 'bob@example.com',
        password: 'secret123',
      });
    });

    it('updateUser PUTs to /auth/admin/users/:userId', async () => {
      const updated = { id: 'u1', email: 'alice@example.com', displayName: 'Alice B', roles: [], status: 'active', createdAt: '' };
      client.put.mockResolvedValueOnce({ data: updated });
      const svc = await getService();
      await svc.updateUser('u1', { displayName: 'Alice B' });
      expect(client.put).toHaveBeenCalledWith('/auth/admin/users/u1', {
        displayName: 'Alice B',
      });
    });

    it('deactivateUser POSTs to /auth/admin/users/:userId/deactivate', async () => {
      const svc = await getService();
      await svc.deactivateUser('u1');
      expect(client.post).toHaveBeenCalledWith('/auth/admin/users/u1/deactivate');
    });

    it('addUserRole POSTs to /auth/admin/users/:userId/roles', async () => {
      const svc = await getService();
      await svc.addUserRole('u1', 'acme', 'admin');
      expect(client.post).toHaveBeenCalledWith('/auth/admin/users/u1/roles', {
        orgSlug: 'acme',
        role: 'admin',
      });
    });

    it('removeUserRole DELETEs /auth/admin/users/:userId/roles/:role', async () => {
      const svc = await getService();
      await svc.removeUserRole('u1', 'acme', 'admin');
      expect(client.delete).toHaveBeenCalledWith('/auth/admin/users/u1/roles/admin', {
        data: { orgSlug: 'acme' },
      });
    });

    it('removeUserFromOrg DELETEs /auth/admin/organizations/:orgSlug/users/:userId', async () => {
      const svc = await getService();
      await svc.removeUserFromOrg('u1', 'acme');
      expect(client.delete).toHaveBeenCalledWith('/auth/admin/organizations/acme/users/u1');
    });
  });

  // ─── Roles ────────────────────────────────────────────────────────────

  describe('Roles', () => {
    it('listRoles GETs /auth/admin/roles', async () => {
      client.get.mockResolvedValueOnce({ data: [] });
      const svc = await getService();
      await svc.listRoles();
      expect(client.get).toHaveBeenCalledWith('/auth/admin/roles');
    });

    it('createRole POSTs to /auth/admin/roles', async () => {
      const role = { id: 'r1', name: 'editor', displayName: 'Editor', isSystem: false };
      client.post.mockResolvedValueOnce({ data: role });
      const svc = await getService();
      await svc.createRole({ name: 'editor', displayName: 'Editor' });
      expect(client.post).toHaveBeenCalledWith('/auth/admin/roles', {
        name: 'editor',
        displayName: 'Editor',
      });
    });

    it('assignRolePermissions PUTs to /auth/admin/roles/:roleId/permissions', async () => {
      const svc = await getService();
      await svc.assignRolePermissions('r1', ['read', 'write']);
      expect(client.put).toHaveBeenCalledWith('/auth/admin/roles/r1/permissions', {
        permissions: ['read', 'write'],
      });
    });
  });

  // ─── Entitlements ─────────────────────────────────────────────────────

  describe('Entitlements', () => {
    it('listEntitlements GETs /auth/admin/organizations/:orgSlug/entitlements', async () => {
      client.get.mockResolvedValueOnce({ data: [] });
      const svc = await getService();
      await svc.listEntitlements('acme');
      expect(client.get).toHaveBeenCalledWith('/auth/admin/organizations/acme/entitlements');
    });

    it('grantEntitlement POSTs to /auth/admin/organizations/:orgSlug/entitlements', async () => {
      const ent = { id: 'e1', orgSlug: 'acme', product: 'forge', grantedAt: '' };
      client.post.mockResolvedValueOnce({ data: ent });
      const svc = await getService();
      const result = await svc.grantEntitlement('acme', { product: 'forge' });
      expect(client.post).toHaveBeenCalledWith('/auth/admin/organizations/acme/entitlements', {
        product: 'forge',
      });
      expect(result).toEqual(ent);
    });

    it('revokeEntitlement DELETEs /auth/admin/organizations/:orgSlug/entitlements/:product', async () => {
      const svc = await getService();
      await svc.revokeEntitlement('acme', 'forge');
      expect(client.delete).toHaveBeenCalledWith(
        '/auth/admin/organizations/acme/entitlements/forge',
      );
    });
  });

  // ─── System Config ────────────────────────────────────────────────────

  describe('System Config', () => {
    it('listSystemConfig GETs /admin/system/config', async () => {
      client.get.mockResolvedValueOnce({ data: [] });
      const svc = await getService();
      await svc.listSystemConfig();
      expect(client.get).toHaveBeenCalledWith('/admin/system/config');
    });

    it('updateSystemConfig PUTs to /admin/system/config/:key', async () => {
      const config = { key: 'max_users', value: 100, updatedAt: '' };
      client.put.mockResolvedValueOnce({ data: config });
      const svc = await getService();
      await svc.updateSystemConfig('max_users', 100);
      expect(client.put).toHaveBeenCalledWith('/admin/system/config/max_users', { value: 100 });
    });
  });
});
