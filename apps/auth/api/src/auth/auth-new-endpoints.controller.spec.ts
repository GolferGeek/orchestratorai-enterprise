/**
 * Tests for the new Auth API endpoints:
 * - GET /auth/validate
 * - GET /auth/entitlements
 * - GET /auth/permissions
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AUTH_SERVICE } from './interfaces/auth-service.interface';
import { IDENTITY_PROVIDER } from './interfaces/identity-provider.interface';
import { RbacService } from '../rbac/rbac.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { SupabaseAuthUserDto } from './dto/auth.dto';

const mockCurrentUser: SupabaseAuthUserDto = {
  id: 'user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  appMetadata: { provider: 'email' },
  userMetadata: {},
  identities: [],
};

const mockPrincipal = {
  id: 'user-123',
  issuer: 'https://supabase.example.com',
  subject: 'user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  appMetadata: {
    organization_slug: 'my-org',
    organization_id: 'org-uuid-123',
    roles: ['admin', 'member'],
  },
  userMetadata: {},
  identities: [],
  rawClaims: {
    app_metadata: {
      organization_slug: 'my-org',
      organization_id: 'org-uuid-123',
      roles: ['admin', 'member'],
    },
  },
};

const mockAuthService = {
  signup: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  refreshToken: jest.fn(),
  getCurrentUser: jest.fn(),
  validateUser: jest.fn(),
  resolveInternalUserId: jest.fn(),
  getAllUsers: jest.fn(),
  getUserById: jest.fn(),
  createUser: jest.fn(),
  deleteUser: jest.fn(),
  changeUserPassword: jest.fn(),
  getUserProfile: jest.fn(),
  getOrganizationAccessForUser: jest.fn(),
  initiatePasswordReset: jest.fn(),
};

const mockIdentityProvider = {
  validateToken: jest.fn(),
};

const mockRbacService = {
  assignRole: jest.fn(),
  revokeRole: jest.fn(),
  hasPermission: jest.fn(),
  getUserPermissions: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

describe('AuthController — new endpoints', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AUTH_SERVICE, useValue: mockAuthService },
        { provide: IDENTITY_PROVIDER, useValue: mockIdentityProvider },
        { provide: RbacService, useValue: mockRbacService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  // ==================== GET /auth/validate ====================

  describe('validateToken (GET /auth/validate)', () => {
    it('should return valid claims when token is valid', async () => {
      mockIdentityProvider.validateToken.mockResolvedValue(mockPrincipal);
      mockAuthService.resolveInternalUserId.mockResolvedValue('user-123');

      const result = await controller.validateToken({
        headers: { authorization: 'Bearer valid-token' },
      } as unknown as Record<string, unknown>);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.email).toBe('test@example.com');
      expect(result.orgSlug).toBe('my-org');
      expect(result.orgId).toBe('org-uuid-123');
      expect(result.roles).toEqual(['admin', 'member']);
      expect(mockIdentityProvider.validateToken).toHaveBeenCalledWith(
        'valid-token',
      );
      expect(mockAuthService.resolveInternalUserId).toHaveBeenCalledWith(
        mockPrincipal,
      );
    });

    it('should throw UnauthorizedException when no token is provided', async () => {
      await expect(
        controller.validateToken({
          headers: {},
        } as unknown as Record<string, unknown>),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when Authorization header is missing', async () => {
      await expect(
        controller.validateToken({
          headers: undefined,
        } as unknown as Record<string, unknown>),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should propagate errors from identity provider', async () => {
      mockIdentityProvider.validateToken.mockRejectedValue(
        new UnauthorizedException('Invalid token'),
      );

      await expect(
        controller.validateToken({
          headers: { authorization: 'Bearer bad-token' },
        } as unknown as Record<string, unknown>),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle missing orgSlug in principal gracefully', async () => {
      const principalWithoutOrg = {
        ...mockPrincipal,
        appMetadata: {},
        rawClaims: {},
      };
      mockIdentityProvider.validateToken.mockResolvedValue(principalWithoutOrg);
      mockAuthService.resolveInternalUserId.mockResolvedValue('user-123');

      const result = await controller.validateToken({
        headers: { authorization: 'Bearer token-without-org' },
      } as unknown as Record<string, unknown>);

      expect(result.valid).toBe(true);
      expect(result.orgSlug).toBeUndefined();
      expect(result.orgId).toBeUndefined();
      expect(result.roles).toEqual([]);
    });
  });

  // ==================== GET /auth/entitlements ====================

  describe('getEntitlements (GET /auth/entitlements)', () => {
    it('should return all products with hasAccess true', () => {
      const result = controller.getEntitlements(mockCurrentUser);

      expect(result.products).toBeInstanceOf(Array);
      expect(result.products.length).toBeGreaterThan(0);

      for (const product of result.products) {
        expect(product).toHaveProperty('slug');
        expect(product).toHaveProperty('name');
        expect(product).toHaveProperty('webUrl');
        expect(product.hasAccess).toBe(true);
      }
    });

    it('should include core products', () => {
      const result = controller.getEntitlements(mockCurrentUser);
      const slugs = result.products.map((p) => p.slug);

      expect(slugs).toContain('forge');
      expect(slugs).toContain('compose');
      expect(slugs).toContain('pulse');
    });

    it('should accept an optional orgSlug query parameter', () => {
      const result = controller.getEntitlements(mockCurrentUser, 'my-org');

      expect(result.products).toBeInstanceOf(Array);
      expect(result.products.length).toBeGreaterThan(0);
    });
  });

  // ==================== GET /auth/permissions ====================

  describe('getPermissions (GET /auth/permissions)', () => {
    it('should return user permissions for the given organization', async () => {
      const mockPermissions = [
        {
          permission: 'admin:users',
          resourceType: undefined,
          resourceId: undefined,
        },
        {
          permission: 'read:agents',
          resourceType: 'agent',
          resourceId: undefined,
        },
      ];
      mockRbacService.getUserPermissions.mockResolvedValue(mockPermissions);

      const result = await controller.getPermissions(mockCurrentUser, 'my-org');

      expect(result.permissions).toHaveLength(2);
      expect(result.permissions[0]!.permission).toBe('admin:users');
      expect(mockRbacService.getUserPermissions).toHaveBeenCalledWith(
        'user-123',
        'my-org',
      );
    });

    it('should throw BadRequestException when organizationSlug is missing', async () => {
      await expect(
        controller.getPermissions(mockCurrentUser, ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate errors from rbac service', async () => {
      mockRbacService.getUserPermissions.mockRejectedValue(
        new Error('DB connection failed'),
      );

      await expect(
        controller.getPermissions(mockCurrentUser, 'my-org'),
      ).rejects.toThrow('DB connection failed');
    });

    it('should return empty array when user has no permissions', async () => {
      mockRbacService.getUserPermissions.mockResolvedValue([]);

      const result = await controller.getPermissions(mockCurrentUser, 'my-org');

      expect(result.permissions).toHaveLength(0);
    });
  });
});
