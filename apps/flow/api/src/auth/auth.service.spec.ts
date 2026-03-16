import { Test, TestingModule } from '@nestjs/testing';
import {
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseAuthService } from '../planes/auth/services/supabase-auth.service';
import { SupabaseService } from '../planes/database/supabase-client.service';
import { IDENTITY_PROVIDER } from './interfaces/identity-provider.interface';
import { DATABASE_SERVICE } from '@/database';
import { InternalIdentityLinkService } from './services/internal-identity-link.service';

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
    getUser: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    admin: {
      createUser: jest.fn(),
      deleteUser: jest.fn(),
      updateUserById: jest.fn(),
      getUserById: jest.fn(),
    },
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
      })),
      in: jest.fn(),
      order: jest.fn(() => ({
        ascending: jest.fn(),
      })),
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
    delete: jest.fn(() => ({
      eq: jest.fn(),
      or: jest.fn(),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(),
    })),
  })),
  rpc: jest.fn(),
};

const mockSupabaseService = {
  getAnonClient: jest.fn(() => mockSupabaseClient),
  getServiceClient: jest.fn(() => mockSupabaseClient),
  createAuthenticatedClient: jest.fn(() => mockSupabaseClient),
};

const mockIdentityProvider = {
  validateToken: jest.fn(),
};

const mockQueryBuilder = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  then: jest.fn((resolve: (v: any) => void) =>
    resolve({ data: null, error: null }),
  ),
};

const mockDb = {
  from: jest.fn().mockReturnValue(mockQueryBuilder),
  rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
};

const mockIdentityLinkService = {
  findInternalUserId: jest.fn(),
  upsertIdentityLink: jest.fn(),
};

describe('SupabaseAuthService', () => {
  let service: SupabaseAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseAuthService,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
        {
          provide: IDENTITY_PROVIDER,
          useValue: mockIdentityProvider,
        },
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
        {
          provide: InternalIdentityLinkService,
          useValue: mockIdentityLinkService,
        },
      ],
    }).compile();

    service = module.get<SupabaseAuthService>(SupabaseAuthService);
  });

  describe('signup', () => {
    const validSignupDto = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
      displayName: 'Test User',
    };

    it('should successfully sign up a user with session', async () => {
      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: {
          user: { id: 'user-123', email: validSignupDto.email },
          session: {
            access_token: 'access-token-123',
            refresh_token: 'refresh-token-123',
            expires_in: 3600,
          },
        },
        error: null,
      });

      const result = await service.signup(validSignupDto);

      expect(result).toEqual({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        tokenType: 'bearer',
        expiresIn: 3600,
      });
    });

    it('should handle signup with email confirmation required', async () => {
      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: {
          user: { id: 'user-123', email: validSignupDto.email },
          session: null,
        },
        error: null,
      });

      await expect(service.signup(validSignupDto)).rejects.toThrow(
        HttpException,
      );
      await expect(service.signup(validSignupDto)).rejects.toMatchObject({
        status: HttpStatus.ACCEPTED,
      });
    });

    it('should throw BadRequestException for existing user', async () => {
      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      });

      await expect(service.signup(validSignupDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid input', async () => {
      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid email format' },
      });

      await expect(service.signup(validSignupDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should use email prefix as display name when not provided', async () => {
      const dtoWithoutDisplayName = {
        email: 'john@example.com',
        password: 'pass123',
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: {
          user: { id: 'user-123' },
          session: { access_token: 'token', expires_in: 3600 },
        },
        error: null,
      });

      await service.signup(dtoWithoutDisplayName);

      expect(mockSupabaseClient.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            data: expect.objectContaining({
              display_name: 'john',
            }),
          }),
        }),
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      mockSupabaseClient.auth.signUp.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.signup(validSignupDto)).rejects.toThrow(
        HttpException,
      );
      await expect(service.signup(validSignupDto)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });

  describe('login', () => {
    const validLoginDto = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
    };

    it('should successfully log in a user', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: 'user-123', email: validLoginDto.email },
          session: {
            access_token: 'access-token-123',
            refresh_token: 'refresh-token-123',
            expires_in: 3600,
          },
        },
        error: null,
      });

      const result = await service.login(validLoginDto);

      expect(result).toEqual({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        tokenType: 'bearer',
        expiresIn: 3600,
      });
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      await expect(service.login(validLoginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw BadRequestException when no session returned', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123' }, session: null },
        error: null,
      });

      await expect(service.login(validLoginDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.login(validLoginDto)).rejects.toThrow(HttpException);
    });
  });

  describe('logout', () => {
    it('should successfully log out a user', async () => {
      mockSupabaseClient.auth.signOut.mockResolvedValue({ error: null });

      await expect(service.logout('valid-token')).resolves.toBeUndefined();
      expect(
        mockSupabaseService.createAuthenticatedClient,
      ).toHaveBeenCalledWith('valid-token');
    });

    it('should throw BadRequestException on logout error', async () => {
      mockSupabaseClient.auth.signOut.mockResolvedValue({
        error: { message: 'Session not found' },
      });

      await expect(service.logout('invalid-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      mockSupabaseClient.auth.signOut.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.logout('token')).rejects.toThrow(HttpException);
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh a token', async () => {
      mockSupabaseClient.auth.refreshSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      });

      const result = await service.refreshToken('old-refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'bearer',
        expiresIn: 3600,
      });
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      mockSupabaseClient.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid refresh token' },
      });

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when no session returned', async () => {
      mockSupabaseClient.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(service.refreshToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      mockSupabaseClient.auth.refreshSession.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.refreshToken('token')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('validateUser', () => {
    it('should successfully validate a token and return user data', async () => {
      const mockPrincipal = {
        id: 'user-123',
        issuer: 'supabase',
        subject: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        appMetadata: {},
        userMetadata: { display_name: 'Test User' },
        emailConfirmedAt: new Date('2024-01-01T00:00:00Z'),
        confirmedAt: new Date('2024-01-01T00:00:00Z'),
        lastSignInAt: new Date('2024-01-15T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T00:00:00Z'),
        identities: [],
        rawClaims: {},
      };

      mockIdentityProvider.validateToken.mockResolvedValue(mockPrincipal);

      const result = await service.validateUser('valid-token');

      expect(result.id).toBe('user-123');
      expect(result.email).toBe('test@example.com');
      expect(result.aud).toBe('authenticated');
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockIdentityProvider.validateToken.mockRejectedValue(
        new UnauthorizedException('Invalid token'),
      );

      await expect(service.validateUser('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when no user returned', async () => {
      mockIdentityProvider.validateToken.mockResolvedValue(null);

      await expect(service.validateUser('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle any thrown errors as UnauthorizedException', async () => {
      mockIdentityProvider.validateToken.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.validateUser('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('initiatePasswordReset', () => {
    it('should successfully send password reset email', async () => {
      mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
        error: null,
      });

      const result = await service.initiatePasswordReset('test@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Password reset email sent');
    });

    it('should not leak information about non-existent emails', async () => {
      mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
        error: { message: 'User not found' },
      });

      const result = await service.initiatePasswordReset(
        'nonexistent@example.com',
      );

      // Should still return success to prevent email enumeration
      expect(result.success).toBe(true);
      expect(result.message).toContain('If the email exists');
    });

    it('should handle network errors gracefully', async () => {
      mockSupabaseClient.auth.resetPasswordForEmail.mockRejectedValue(
        new Error('Network error'),
      );

      const result = await service.initiatePasswordReset('test@example.com');

      // Should still return generic success message
      expect(result.success).toBe(true);
    });
  });

  describe('deleteUser', () => {
    it('should prevent self-deletion', async () => {
      await expect(
        service.deleteUser('admin-123', 'admin-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully delete a user', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'user-456', email: 'user@example.com' },
              error: null,
            }),
          }),
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
          or: jest.fn().mockResolvedValue({ error: null }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      mockSupabaseClient.from = mockFrom;
      mockSupabaseClient.auth.admin.deleteUser.mockResolvedValue({
        error: null,
      });

      const result = await service.deleteUser('user-456', 'admin-123');

      expect(result.success).toBe(true);
      expect(result.message).toContain('deleted successfully');
    });

    it('should throw BadRequestException when user not found', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'Not found' },
            }),
          }),
        }),
      });

      mockSupabaseClient.from = mockFrom;
      mockSupabaseClient.auth.admin.getUserById.mockResolvedValue({
        data: null,
        error: { message: 'User not found' },
      });

      await expect(
        service.deleteUser('nonexistent', 'admin-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('changeUserPassword', () => {
    it('should successfully change user password', async () => {
      mockSupabaseClient.auth.admin.updateUserById.mockResolvedValue({
        error: null,
      });

      const result = await service.changeUserPassword(
        'user-123',
        'NewPassword123!',
        'admin-123',
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Password updated successfully');
    });

    it('should throw HttpException on password change failure', async () => {
      mockSupabaseClient.auth.admin.updateUserById.mockResolvedValue({
        error: { message: 'Password too weak' },
      });

      await expect(
        service.changeUserPassword('user-123', 'weak', 'admin-123'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('resolveInternalUserId', () => {
    it('should upsert identity link and return principal id', async () => {
      const principal = {
        id: 'user-uuid-123',
        issuer: 'supabase',
        subject: 'user-uuid-123',
        email: 'test@example.com',
        rawClaims: {},
      };

      mockIdentityLinkService.upsertIdentityLink.mockResolvedValue(undefined);

      const result = await service.resolveInternalUserId(principal);

      expect(result).toBe('user-uuid-123');
      expect(mockIdentityLinkService.upsertIdentityLink).toHaveBeenCalledWith(
        'user-uuid-123',
        principal,
      );
    });
  });

  describe('getCurrentUser', () => {
    const mockAuthUser = {
      id: 'user-123',
      email: 'test@example.com',
    };

    it('should return user with organization access', async () => {
      mockQueryBuilder.then.mockImplementation((resolve) =>
        resolve({
          data: {
            id: 'user-123',
            email: 'test@example.com',
            display_name: 'Test User',
            organization_slug: 'test-org',
            created_at: '2024-01-01T00:00:00Z',
          },
          error: null,
        }),
      );

      mockDb.rpc.mockResolvedValue({
        data: [
          {
            organization_slug: 'test-org',
            organization_name: 'Test Org',
            role_name: 'member',
            is_global: false,
          },
        ],
        error: null,
      });

      const result = await service.getCurrentUser(mockAuthUser as any, 'token');

      expect(result.id).toBe('user-123');
      expect(result.email).toBe('test@example.com');
      expect(result.displayName).toBe('Test User');
      expect(result.organizationAccess).toContain('test-org');
      expect(result.roles).toContain('member');
    });

    it('should throw FORBIDDEN when user profile not found', async () => {
      mockQueryBuilder.then.mockImplementation((resolve) =>
        resolve({ data: null, error: null }),
      );

      await expect(
        service.getCurrentUser(mockAuthUser as any, 'token'),
      ).rejects.toThrow(HttpException);
    });

    it('should default to demo-org when no organizations assigned', async () => {
      mockQueryBuilder.then.mockImplementation((resolve) =>
        resolve({
          data: {
            id: 'user-123',
            email: 'test@example.com',
            display_name: 'Test User',
            organization_slug: null,
            created_at: '2024-01-01T00:00:00Z',
          },
          error: null,
        }),
      );

      mockDb.rpc.mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await service.getCurrentUser(mockAuthUser as any, 'token');

      expect(result.organizationAccess).toContain('demo-org');
    });
  });

  describe('getUserProfile', () => {
    it('should return null when user not found', async () => {
      mockQueryBuilder.then.mockImplementation((resolve) =>
        resolve({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      );

      const result = await service.getUserProfile('nonexistent-user');

      expect(result).toBeNull();
    });

    it('should return user profile with roles from RBAC', async () => {
      mockQueryBuilder.then.mockImplementation((resolve) =>
        resolve({
          data: {
            id: 'user-123',
            email: 'test@example.com',
            display_name: 'Test User',
            organization_slug: 'test-org',
            status: 'active',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-15T00:00:00Z',
          },
          error: null,
        }),
      );

      mockDb.rpc.mockResolvedValue({
        data: [
          { organization_slug: 'test-org', role_name: 'admin' },
          { organization_slug: 'other-org', role_name: 'member' },
        ],
        error: null,
      });

      const result = await service.getUserProfile('user-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('user-123');
      expect(result?.roles).toContain('admin');
      expect(result?.roles).toContain('member');
      expect(result?.organizationAccess).toContain('test-org');
      expect(result?.organizationAccess).toContain('other-org');
    });
  });

  describe('getOrganizationAccessForUser', () => {
    it('should return organization slugs for user', async () => {
      mockDb.rpc.mockResolvedValue({
        data: [
          { organization_slug: 'org-1' },
          { organization_slug: 'org-2' },
          { organization_slug: 'org-1' }, // Duplicate to test deduplication
        ],
        error: null,
      });

      const result = await service.getOrganizationAccessForUser('user-123');

      expect(result).toHaveLength(2);
      expect(result).toContain('org-1');
      expect(result).toContain('org-2');
    });

    it('should throw HttpException when RPC fails', async () => {
      mockDb.rpc.mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      });

      await expect(
        service.getOrganizationAccessForUser('user-123'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw FORBIDDEN when user has no organizations', async () => {
      mockDb.rpc.mockResolvedValue({
        data: [],
        error: null,
      });

      await expect(
        service.getOrganizationAccessForUser('user-123'),
      ).rejects.toThrow(HttpException);
      await expect(
        service.getOrganizationAccessForUser('user-123'),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });
  });
});
