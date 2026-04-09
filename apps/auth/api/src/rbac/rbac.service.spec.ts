import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { DATABASE_SERVICE } from '@/database';

/**
 * Create a chainable query builder mock that resolves to the given result.
 */
function makeQueryChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.upsert = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue(chain);
  chain.delete = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.neq = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn().mockReturnValue(chain);
  chain.then = jest.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

const defaultChain = makeQueryChain({ data: null, error: null });

const mockSupabaseClient = {
  rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  from: jest.fn().mockReturnValue(defaultChain),
};

describe('RbacService', () => {
  let service: RbacService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockSupabaseClient,
        },
      ],
    }).compile();

    service = module.get<RbacService>(RbacService);
  });

  describe('hasPermission', () => {
    it('should return true when user has permission', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });

      const result = await service.hasPermission(
        'user-123',
        'test-org',
        'read:agents',
      );

      expect(result).toBe(true);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'rbac_has_permission',
        {
          p_user_id: 'user-123',
          p_organization_slug: 'test-org',
          p_permission: 'read:agents',
          p_resource_type: null,
          p_resource_id: null,
        },
        'authz',
      );
    });

    it('should return false when user lacks permission', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: false, error: null });

      const result = await service.hasPermission(
        'user-123',
        'test-org',
        'delete:agents',
      );

      expect(result).toBe(false);
    });

    it('should return false on RPC error', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      });

      const result = await service.hasPermission(
        'user-123',
        'test-org',
        'read:agents',
      );

      expect(result).toBe(false);
    });

    it('should return true when planes rpc returns array of rows with true', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ rbac_has_permission: true }],
        error: null,
      });

      const result = await service.hasPermission(
        'user-123',
        'test-org',
        'llm:admin',
      );

      expect(result).toBe(true);
    });

    it('should return false when planes rpc returns array of rows with false', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ rbac_has_permission: false }],
        error: null,
      });

      const result = await service.hasPermission(
        'user-123',
        'test-org',
        'llm:admin',
      );

      expect(result).toBe(false);
    });

    it('should return false when planes rpc returns empty array', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });

      const result = await service.hasPermission(
        'user-123',
        'test-org',
        'llm:admin',
      );

      expect(result).toBe(false);
    });

    it('should pass resource type and ID when provided', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });

      await service.hasPermission(
        'user-123',
        'test-org',
        'read:agents',
        'agent',
        'agent-456',
      );

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'rbac_has_permission',
        {
          p_user_id: 'user-123',
          p_organization_slug: 'test-org',
          p_permission: 'read:agents',
          p_resource_type: 'agent',
          p_resource_id: 'agent-456',
        },
        'authz',
      );
    });
  });

  describe('requirePermission', () => {
    it('should not throw when user has permission', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });

      await expect(
        service.requirePermission('user-123', 'test-org', 'read:agents'),
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException when user lacks permission', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: false, error: null });

      await expect(
        service.requirePermission('user-123', 'test-org', 'delete:agents'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should include permission name in error message', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: false, error: null });

      try {
        await service.requirePermission(
          'user-123',
          'test-org',
          'delete:agents',
        );
      } catch (error) {
        expect((error as ForbiddenException).message).toContain(
          'delete:agents',
        );
      }
    });

    it('should include resource type in error message when provided', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: false, error: null });

      try {
        await service.requirePermission(
          'user-123',
          'test-org',
          'delete:agents',
          'agent',
        );
      } catch (error) {
        expect((error as ForbiddenException).message).toContain('agent');
      }
    });
  });

  describe('getUserPermissions', () => {
    it('should return user permissions', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [
          {
            permission_name: 'read:agents',
            resource_type: null,
            resource_id: null,
          },
          {
            permission_name: 'write:agents',
            resource_type: 'agent',
            resource_id: 'agent-1',
          },
        ],
        error: null,
      });

      const result = await service.getUserPermissions('user-123', 'test-org');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        permission: 'read:agents',
        resourceType: null,
        resourceId: null,
      });
      expect(result[1]).toEqual({
        permission: 'write:agents',
        resourceType: 'agent',
        resourceId: 'agent-1',
      });
    });

    it('should return empty array on error', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      });

      const result = await service.getUserPermissions('user-123', 'test-org');

      expect(result).toEqual([]);
    });

    it('should return empty array when no permissions', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });

      const result = await service.getUserPermissions('user-123', 'test-org');

      expect(result).toEqual([]);
    });
  });

  describe('getUserRoles', () => {
    it('should return user roles with dates', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [
          {
            role_id: 'role-1',
            role_name: 'admin',
            role_display_name: 'Administrator',
            is_global: false,
            assigned_at: '2024-01-01T00:00:00Z',
            expires_at: null,
          },
        ],
        error: null,
      });

      const result = await service.getUserRoles('user-123', 'test-org');

      expect(result).toHaveLength(1);
      const firstRole = result[0]!;
      expect(firstRole.id).toBe('role-1');
      expect(firstRole.name).toBe('admin');
      expect(firstRole.displayName).toBe('Administrator');
      expect(firstRole.isGlobal).toBe(false);
      expect(firstRole.assignedAt).toBeInstanceOf(Date);
      expect(firstRole.expiresAt).toBeUndefined();
    });

    it('should return empty array on error', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      });

      const result = await service.getUserRoles('user-123', 'test-org');

      expect(result).toEqual([]);
    });
  });

  describe('getUserOrganizations', () => {
    it('should return user organizations', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [
          {
            organization_slug: 'org-1',
            organization_name: 'Organization 1',
            role_name: 'admin',
            is_global: false,
          },
          {
            organization_slug: 'org-2',
            organization_name: 'Organization 2',
            role_name: 'member',
            is_global: true,
          },
        ],
        error: null,
      });

      const result = await service.getUserOrganizations('user-123');

      expect(result).toHaveLength(2);
      expect(result[0]!.organizationSlug).toBe('org-1');
      expect(result[0]!.roleName).toBe('admin');
      expect(result[1]!.isGlobal).toBe(true);
    });

    it('should return empty array on error', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      });

      const result = await service.getUserOrganizations('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('getOrganizationUsers', () => {
    it('should return users with their roles', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [
          {
            user_id: 'user-1',
            email: 'user1@example.com',
            display_name: 'User One',
            role_id: 'role-1',
            role_name: 'admin',
            role_display_name: 'Administrator',
            is_global: false,
            assigned_at: '2024-01-01T00:00:00Z',
          },
          {
            user_id: 'user-1',
            email: 'user1@example.com',
            display_name: 'User One',
            role_id: 'role-2',
            role_name: 'member',
            role_display_name: 'Member',
            is_global: false,
            assigned_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
      });

      const result = await service.getOrganizationUsers('test-org');

      expect(result).toHaveLength(1); // Same user with multiple roles
      expect(result[0]!.userId).toBe('user-1');
      expect(result[0]!.roles).toHaveLength(2);
    });

    it('should prefer org-specific roles over global roles', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [
          {
            user_id: 'user-1',
            email: 'user1@example.com',
            role_id: 'role-1',
            role_name: 'admin',
            role_display_name: 'Admin (Global)',
            is_global: true,
            assigned_at: '2024-01-01T00:00:00Z',
          },
          {
            user_id: 'user-1',
            email: 'user1@example.com',
            role_id: 'role-2',
            role_name: 'admin',
            role_display_name: 'Admin (Org)',
            is_global: false,
            assigned_at: '2024-01-02T00:00:00Z',
          },
        ],
        error: null,
      });

      const result = await service.getOrganizationUsers('test-org');

      expect(result[0]!.roles).toHaveLength(1);
      expect(result[0]!.roles[0]!.isGlobal).toBe(false); // Org-specific preferred
    });

    it('should return empty array on error', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      });

      const result = await service.getOrganizationUsers('test-org');

      expect(result).toEqual([]);
    });
  });

  describe('getAllRoles', () => {
    it('should return all roles', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: 'role-1',
                name: 'admin',
                display_name: 'Administrator',
                description: 'Full access',
                is_system: true,
              },
            ],
            error: null,
          }),
        }),
      });

      mockSupabaseClient.from = mockFrom;

      const result = await service.getAllRoles();

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('admin');
      expect(result[0]!.isSystem).toBe(true);
    });

    it('should return empty array on error', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Error' },
          }),
        }),
      });

      mockSupabaseClient.from = mockFrom;

      const result = await service.getAllRoles();

      expect(result).toEqual([]);
    });
  });

  describe('assignRole', () => {
    it('should assign role to user', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'role-123' },
              error: null,
            }),
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      mockSupabaseClient.from = mockFrom;

      await expect(
        service.assignRole('user-123', 'test-org', 'admin', 'admin-user'),
      ).resolves.toBeUndefined();
    });

    it('should throw error when role not found', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      });

      mockSupabaseClient.from = mockFrom;

      await expect(
        service.assignRole('user-123', 'test-org', 'nonexistent', 'admin-user'),
      ).rejects.toThrow('Role not found: nonexistent');
    });
  });

  describe('revokeRole', () => {
    it('should revoke role from user', async () => {
      const mockDelete = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'role-123' },
              error: null,
            }),
          }),
        }),
        delete: mockDelete,
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      mockSupabaseClient.from = mockFrom;

      await expect(
        service.revokeRole('user-123', 'test-org', 'admin', 'admin-user'),
      ).resolves.toBeUndefined();
    });

    it('should throw error when role not found', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      });

      mockSupabaseClient.from = mockFrom;

      await expect(
        service.revokeRole('user-123', 'test-org', 'nonexistent', 'admin-user'),
      ).rejects.toThrow('Role not found: nonexistent');
    });
  });

  describe('isSuperAdmin', () => {
    it('should return true when user has super-admin role', async () => {
      // First call: get user role assignments
      const rolesChain = makeQueryChain({
        data: [
          { id: 'assignment-1', role_id: 'role-1', organization_slug: '*' },
        ],
        error: null,
      });
      // Second call: get super-admin role ID
      const saRoleChain = makeQueryChain({
        data: { id: 'role-1' },
        error: null,
      });

      mockSupabaseClient.from
        .mockReturnValueOnce(rolesChain)
        .mockReturnValueOnce(saRoleChain);

      const result = await service.isSuperAdmin('user-123');

      expect(result).toBe(true);
    });

    it('should return false when user does not have super-admin role', async () => {
      // User has roles but none match super-admin role ID
      const rolesChain = makeQueryChain({
        data: [
          {
            id: 'assignment-1',
            role_id: 'role-1',
            organization_slug: 'test-org',
          },
        ],
        error: null,
      });
      const saRoleChain = makeQueryChain({
        data: { id: 'different-role-id' },
        error: null,
      });

      mockSupabaseClient.from
        .mockReturnValueOnce(rolesChain)
        .mockReturnValueOnce(saRoleChain);

      const result = await service.isSuperAdmin('user-123');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const errorChain = makeQueryChain({
        data: null,
        error: { message: 'Error' },
      });

      mockSupabaseClient.from.mockReturnValueOnce(errorChain);

      const result = await service.isSuperAdmin('user-123');

      expect(result).toBe(false);
    });

    it('should return false when user has no roles', async () => {
      const emptyChain = makeQueryChain({ data: [], error: null });

      mockSupabaseClient.from.mockReturnValueOnce(emptyChain);

      const result = await service.isSuperAdmin('user-123');

      expect(result).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return true for super-admin', async () => {
      // isSuperAdmin: 1) get user roles, 2) get super-admin role ID
      const rolesChain = makeQueryChain({
        data: [
          { id: 'assignment-1', role_id: 'role-1', organization_slug: '*' },
        ],
        error: null,
      });
      const saRoleChain = makeQueryChain({
        data: { id: 'role-1' },
        error: null,
      });

      mockSupabaseClient.from
        .mockReturnValueOnce(rolesChain)
        .mockReturnValueOnce(saRoleChain);

      const result = await service.isAdmin('user-123', 'any-org');

      expect(result).toBe(true);
    });

    it('should return true when user is admin for specific org', async () => {
      // isSuperAdmin returns false: 1) empty roles
      const emptyRolesChain = makeQueryChain({ data: [], error: null });
      // isAdmin: 2) get admin role ID
      const adminRoleChain = makeQueryChain({
        data: { id: 'admin-role-id' },
        error: null,
      });
      // isAdmin: 3) check user has admin role for org
      const userAdminChain = makeQueryChain({
        data: [
          {
            id: 'assignment-1',
            role_id: 'admin-role-id',
            organization_slug: 'test-org',
          },
        ],
        error: null,
      });

      mockSupabaseClient.from
        .mockReturnValueOnce(emptyRolesChain) // isSuperAdmin: get user roles (empty -> early return false)
        .mockReturnValueOnce(adminRoleChain) // isAdmin: get admin role ID
        .mockReturnValueOnce(userAdminChain); // isAdmin: check user has role for org

      const result = await service.isAdmin('user-123', 'test-org');

      expect(result).toBe(true);
    });

    it('should return false when user is not admin', async () => {
      // isSuperAdmin returns false: 1) empty roles
      const emptyRolesChain = makeQueryChain({ data: [], error: null });
      // isAdmin: 2) get admin role ID
      const adminRoleChain = makeQueryChain({
        data: { id: 'admin-role-id' },
        error: null,
      });
      // isAdmin: 3) user has no matching admin role for org
      const noAdminChain = makeQueryChain({
        data: [],
        error: null,
      });

      mockSupabaseClient.from
        .mockReturnValueOnce(emptyRolesChain)
        .mockReturnValueOnce(adminRoleChain)
        .mockReturnValueOnce(noAdminChain);

      const result = await service.isAdmin('user-123', 'test-org');

      expect(result).toBe(false);
    });
  });

  describe('getAuditLog', () => {
    it('should return audit log entries', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'log-1',
                  action: 'grant',
                  actor_id: 'admin-1',
                  target_user_id: 'user-1',
                  target_role_id: 'role-1',
                  organization_slug: 'test-org',
                  details: { role_name: 'admin' },
                  created_at: '2024-01-01T00:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        }),
      });

      mockSupabaseClient.from = mockFrom;

      const result = await service.getAuditLog();

      expect(result).toHaveLength(1);
      expect(result[0]!.action).toBe('grant');
      expect(result[0]!.createdAt).toBeInstanceOf(Date);
    });

    it('should filter by organization when provided', async () => {
      // The query chain is: from().select().order().limit()
      // Then if organizationSlug is provided, .eq() is called on the result
      // So .limit() needs to return an object with .eq() that resolves
      const mockEq = jest.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      const mockLimit = jest.fn().mockReturnValue({
        eq: mockEq,
        then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
          resolve({ data: [], error: null }),
      });

      const mockOrder = jest.fn().mockReturnValue({
        limit: mockLimit,
      });

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: mockOrder,
        }),
      });

      mockSupabaseClient.from = mockFrom;

      await service.getAuditLog('test-org');

      // Verify the query chain was built correctly
      expect(mockFrom).toHaveBeenCalledWith('authz', 'rbac_audit_log');
      expect(mockEq).toHaveBeenCalledWith('organization_slug', 'test-org');
    });

    it('should return empty array on error', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Error' },
            }),
          }),
        }),
      });

      mockSupabaseClient.from = mockFrom;

      const result = await service.getAuditLog();

      expect(result).toEqual([]);
    });
  });
});
