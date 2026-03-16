import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AUTH_SERVICE } from './interfaces/auth-service.interface';
import { IDENTITY_PROVIDER } from './interfaces/identity-provider.interface';
import { RbacService } from '../rbac/rbac.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import {
  TokenResponseDto,
  AuthenticatedUserResponseDto,
  SupabaseAuthUserDto,
} from './dto/auth.dto';

const mockTokenResponse: TokenResponseDto = {
  accessToken: 'access-token-123',
  refreshToken: 'refresh-token-123',
  tokenType: 'bearer',
  expiresIn: 3600,
};

const mockCurrentUser: SupabaseAuthUserDto = {
  id: 'user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  appMetadata: { provider: 'email' },
  userMetadata: {},
  identities: [],
};

const mockAuthUserResponse: AuthenticatedUserResponseDto = {
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  organizationAccess: ['test-org'],
  roles: ['member'],
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

describe('AuthController', () => {
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

  describe('signup', () => {
    it('should call authService.signup and return token response', async () => {
      mockAuthService.signup.mockResolvedValue(mockTokenResponse);

      const result = await controller.signup({
        email: 'test@example.com',
        password: 'Password123!',
        displayName: 'Test User',
      });

      expect(result).toEqual(mockTokenResponse);
      expect(mockAuthService.signup).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123!',
        displayName: 'Test User',
      });
    });

    it('should propagate BadRequestException from service', async () => {
      mockAuthService.signup.mockRejectedValue(
        new BadRequestException('User already registered'),
      );

      await expect(
        controller.signup({ email: 'test@example.com', password: 'pass' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('should call authService.login and return token response', async () => {
      mockAuthService.login.mockResolvedValue(mockTokenResponse);

      const result = await controller.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(result).toEqual(mockTokenResponse);
      expect(mockAuthService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123!',
      });
    });

    it('should propagate UnauthorizedException from service', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(
        controller.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should call authService.logout with token from Authorization header', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const mockRequest = {
        headers: { authorization: 'Bearer valid-token-123' },
      };

      await controller.logout(mockRequest as any);

      expect(mockAuthService.logout).toHaveBeenCalledWith('valid-token-123');
    });

    it('should throw error when no token in Authorization header', async () => {
      const mockRequest = {
        headers: {},
      };

      await expect(controller.logout(mockRequest as any)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should handle Bearer prefix correctly', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const mockRequest = {
        headers: { authorization: 'Bearer my-actual-token' },
      };

      await controller.logout(mockRequest as any);

      // Token should be without "Bearer " prefix
      expect(mockAuthService.logout).toHaveBeenCalledWith('my-actual-token');
    });
  });

  describe('refreshToken', () => {
    it('should call authService.refreshToken and return new token', async () => {
      const newTokenResponse = {
        ...mockTokenResponse,
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };
      mockAuthService.refreshToken.mockResolvedValue(newTokenResponse);

      const result = await controller.refreshToken('old-refresh-token');

      expect(result).toEqual(newTokenResponse);
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('old-refresh-token');
    });

    it('should throw error when refreshToken is not provided', async () => {
      await expect(controller.refreshToken(undefined as any)).rejects.toThrow(
        'Refresh token is required',
      );
    });

    it('should propagate UnauthorizedException from service', async () => {
      mockAuthService.refreshToken.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(controller.refreshToken('invalid-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user profile', async () => {
      mockAuthService.getCurrentUser.mockResolvedValue(mockAuthUserResponse);

      const mockRequest = {
        headers: { authorization: 'Bearer valid-token' },
      };

      const result = await controller.getCurrentUser(mockCurrentUser, mockRequest as any);

      expect(result).toEqual(mockAuthUserResponse);
      expect(mockAuthService.getCurrentUser).toHaveBeenCalledWith(
        mockCurrentUser,
        'valid-token',
      );
    });

    it('should throw when no token in request', async () => {
      const mockRequest = {
        headers: {},
      };

      await expect(
        controller.getCurrentUser(mockCurrentUser, mockRequest as any),
      ).rejects.toThrow('No token provided');
    });
  });

  describe('setUserRoles (PUT /auth/admin/users/:userId/roles)', () => {
    it('should assign roles to user via rbacService', async () => {
      mockRbacService.assignRole.mockResolvedValue(undefined);

      const result = await controller.setUserRoles(
        'user-456',
        { roles: ['admin', 'member'], organizationSlug: 'test-org' },
        mockCurrentUser,
      );

      expect(result.success).toBe(true);
      expect(mockRbacService.assignRole).toHaveBeenCalledTimes(2);
      expect(mockRbacService.assignRole).toHaveBeenCalledWith(
        'user-456',
        'test-org',
        'admin',
        'user-123',
      );
    });

    it('should use demo-org as default when organizationSlug not provided', async () => {
      mockRbacService.assignRole.mockResolvedValue(undefined);

      await controller.setUserRoles(
        'user-456',
        { roles: ['member'] },
        mockCurrentUser,
      );

      expect(mockRbacService.assignRole).toHaveBeenCalledWith(
        'user-456',
        'demo-org',
        'member',
        'user-123',
      );
    });
  });

  describe('addUserRole (POST /auth/admin/users/:userId/roles)', () => {
    it('should add a single role to a user', async () => {
      mockRbacService.assignRole.mockResolvedValue(undefined);

      const result = await controller.addUserRole(
        'user-456',
        { role: 'admin', organizationSlug: 'test-org' },
        mockCurrentUser,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('admin');
      expect(mockRbacService.assignRole).toHaveBeenCalledWith(
        'user-456',
        'test-org',
        'admin',
        'user-123',
      );
    });
  });

  describe('removeUserRole (DELETE /auth/admin/users/:userId/roles/:role)', () => {
    it('should remove a role from a user', async () => {
      mockRbacService.revokeRole.mockResolvedValue(undefined);

      const result = await controller.removeUserRole(
        'user-456',
        'member',
        { organizationSlug: 'test-org' },
        mockCurrentUser,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('member');
      expect(mockRbacService.revokeRole).toHaveBeenCalledWith(
        'user-456',
        'test-org',
        'member',
        'user-123',
      );
    });

    it('should use demo-org as default when organizationSlug not provided', async () => {
      mockRbacService.revokeRole.mockResolvedValue(undefined);

      await controller.removeUserRole(
        'user-456',
        'member',
        {},
        mockCurrentUser,
      );

      expect(mockRbacService.revokeRole).toHaveBeenCalledWith(
        'user-456',
        'demo-org',
        'member',
        'user-123',
      );
    });
  });

  describe('deleteUser (DELETE /auth/admin/users/:userId)', () => {
    it('should delete a user', async () => {
      mockAuthService.deleteUser.mockResolvedValue({
        success: true,
        message: 'User deleted successfully',
      });

      const result = await controller.deleteUser('user-456', mockCurrentUser);

      expect(result.success).toBe(true);
      expect(mockAuthService.deleteUser).toHaveBeenCalledWith('user-456', 'user-123');
    });
  });

  describe('changeUserPassword (PUT /auth/admin/users/:userId/password)', () => {
    it('should change user password', async () => {
      mockAuthService.changeUserPassword.mockResolvedValue({
        success: true,
        message: 'Password updated successfully',
      });

      const result = await controller.changeUserPassword(
        'user-456',
        'NewPassword123!',
        mockCurrentUser,
      );

      expect(result.success).toBe(true);
      expect(mockAuthService.changeUserPassword).toHaveBeenCalledWith(
        'user-456',
        'NewPassword123!',
        'user-123',
      );
    });

    it('should throw error when password is too short', async () => {
      await expect(
        controller.changeUserPassword('user-456', '123', mockCurrentUser),
      ).rejects.toThrow('Password must be at least 6 characters');
    });

    it('should throw error when password is empty', async () => {
      await expect(
        controller.changeUserPassword('user-456', '', mockCurrentUser),
      ).rejects.toThrow('Password must be at least 6 characters');
    });
  });

  describe('getAllUsers (GET /auth/admin/users)', () => {
    it('should return all users', async () => {
      const mockUsers = [
        { id: 'user-1', email: 'user1@example.com', roles: [] },
        { id: 'user-2', email: 'user2@example.com', roles: [] },
      ];
      mockAuthService.getAllUsers.mockResolvedValue(mockUsers);

      const result = await controller.getAllUsers(mockCurrentUser);

      expect(result).toHaveLength(2);
      expect(mockAuthService.getAllUsers).toHaveBeenCalledWith('user-123');
    });
  });

  describe('getUserById (GET /auth/admin/users/:userId)', () => {
    it('should return user by ID', async () => {
      const mockUser = { id: 'user-456', email: 'other@example.com', roles: [] };
      mockAuthService.getUserById.mockResolvedValue(mockUser);

      const result = await controller.getUserById('user-456', mockCurrentUser);

      expect(result).toEqual(mockUser);
      expect(mockAuthService.getUserById).toHaveBeenCalledWith('user-456', 'user-123');
    });

    it('should propagate errors from service (getUserById returns promise directly without await)', async () => {
      // Note: the controller uses `return this.authService.getUserById(...)` without await,
      // so the try/catch does NOT catch async rejections — they propagate directly.
      mockAuthService.getUserById.mockRejectedValue(
        new Error('User not found in database'),
      );

      await expect(
        controller.getUserById('nonexistent', mockCurrentUser),
      ).rejects.toThrow('User not found in database');
    });
  });
});
