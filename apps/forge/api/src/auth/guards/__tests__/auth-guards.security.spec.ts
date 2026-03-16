/**
 * Auth Guards Security Tests — Comprehensive Edge Cases
 *
 * SECURITY CRITICAL: These tests cover gaps not addressed in the co-located
 * spec files. They focus on:
 * - All UserRole enum values (evaluation-monitor, beta-tester, support)
 * - Guard composition invariants
 * - JwtAuthGuard: streamToken query param, whitespace-only tokens
 * - RolesGuard: null userId defense, all role decorators
 * - StreamTokenService integration with JwtAuthGuard
 * - RolesGuard userHasAnyRole edge cases (null/undefined roles)
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { RolesGuard } from '../roles.guard';
import { DatabaseService } from '../../../database';
import {
  StreamTokenService,
  StreamTokenClaims,
} from '../../services/stream-token.service';
import { UserRole } from '../../decorators/roles.decorator';
import { SupabaseAuthUserDto } from '../../dto/auth.dto';
import { AuthServiceProvider } from '../../interfaces/auth-service.interface';

// ─── Test Utilities ───────────────────────────────────────────────────────────

const buildJwtContext = (options: {
  headers?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  isPublic?: boolean;
}): ExecutionContext => {
  const { headers = {}, query = {} } = options;
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        query,
        url: '/test',
        originalUrl: '/test?token=test',
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({ getData: () => ({}), getContext: () => ({}) }),
    switchToWs: () => ({ getData: () => ({}), getClient: () => ({}) }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
};

const buildRolesContext = (options: {
  user?: { id: string };
  request?: Record<string, unknown>;
}): ExecutionContext => {
  const request = {
    user: options.user,
    ...(options.request ?? {}),
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({ getData: () => ({}), getContext: () => ({}) }),
    switchToWs: () => ({ getData: () => ({}), getClient: () => ({}) }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
};

const buildSupabaseMock = (
  userOverrides?: Partial<{
    id: string;
    email: string;
    aud: string;
    role: string;
    app_metadata: Record<string, unknown>;
    user_metadata: Record<string, unknown>;
    identities: unknown[];
    created_at: string;
    updated_at: string;
  }>,
) => {
  const user = {
    id: 'user-123',
    email: 'test@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...userOverrides,
  };
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
  };
};

const buildUserProfileMock = (
  roles: string[],
  overrides?: Partial<{
    id: string;
    email: string;
    display_name: string;
  }>,
) => ({
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'user-1',
            email: 'user@example.com',
            display_name: 'Test User',
            roles,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...overrides,
          },
          error: null,
        }),
      }),
    }),
  }),
});

// ─── JwtAuthGuard — Additional Security Tests ─────────────────────────────────

describe('JwtAuthGuard — Extended Security Tests', () => {
  let guard: JwtAuthGuard;
  let identityProviderMock: {
    validateToken: jest.Mock;
    getAnonClient: jest.Mock;
  };
  let authServiceMock: jest.Mocked<
    Pick<AuthServiceProvider, 'resolveInternalUserId'>
  >;
  let streamTokenService: jest.Mocked<StreamTokenService>;
  let reflector: jest.Mocked<Reflector>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    identityProviderMock = {
      getAnonClient: jest.fn(),
      validateToken: jest.fn(async (token: string) => {
        const client = identityProviderMock.getAnonClient();
        const {
          data: { user },
          error,
        } = await client.auth.getUser(token);
        if (error || !user) {
          throw new Error('Invalid token');
        }
        return {
          id: user.id,
          issuer:
            typeof user.app_metadata?.['iss'] === 'string'
              ? user.app_metadata['iss']
              : 'supabase',
          subject: user.id,
          email: user.email ?? undefined,
          aud: user.aud,
          role: user.role ?? 'authenticated',
          appMetadata: (user.app_metadata as Record<string, unknown>) || {},
          userMetadata: (user.user_metadata as Record<string, unknown>) || {},
          phone: user.phone ?? undefined,
          emailConfirmedAt: user.email_confirmed_at
            ? new Date(user.email_confirmed_at)
            : undefined,
          confirmedAt: user.confirmed_at
            ? new Date(user.confirmed_at)
            : undefined,
          lastSignInAt: user.last_sign_in_at
            ? new Date(user.last_sign_in_at)
            : undefined,
          createdAt: user.created_at ? new Date(user.created_at) : undefined,
          updatedAt: user.updated_at ? new Date(user.updated_at) : undefined,
          identities:
            (user.identities as unknown as Array<Record<string, unknown>>) ||
            [],
          rawClaims: {},
        };
      }),
    };

    authServiceMock = {
      resolveInternalUserId: jest.fn().mockResolvedValue('user-123'),
    } as jest.Mocked<Pick<AuthServiceProvider, 'resolveInternalUserId'>>;

    streamTokenService = {
      verifyToken: jest.fn(),
      stripTokenFromUrl: jest.fn((url: string) =>
        url.replace(/token=[^&]+/, 'token=[redacted]'),
      ),
      generateToken: jest.fn(),
    } as unknown as jest.Mocked<StreamTokenService>;

    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
      get: jest.fn(),
      getAll: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    configService = {
      get: jest.fn().mockReturnValue('supabase'),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new JwtAuthGuard(
      identityProviderMock as never,
      configService,
      authServiceMock as never,
      streamTokenService,
      reflector,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Query Param Token Variants', () => {
    it('should accept streamToken query param as alternative to token', async () => {
      const mockClient = buildSupabaseMock();
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = buildJwtContext({
        query: { streamToken: 'valid.stream.token' },
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(mockClient.auth.getUser).toHaveBeenCalledWith(
        'valid.stream.token',
      );
    });

    it('should prefer token over streamToken when both present', async () => {
      const mockClient = buildSupabaseMock();
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = buildJwtContext({
        query: {
          token: 'token-param-value',
          streamToken: 'stream-token-value',
        },
      });

      await guard.canActivate(context);

      // token takes precedence over streamToken
      expect(mockClient.auth.getUser).toHaveBeenCalledWith('token-param-value');
    });

    it('should reject whitespace-only query token', async () => {
      const context = buildJwtContext({
        query: { token: '   ' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should reject empty array query token', async () => {
      const context = buildJwtContext({
        query: { token: [] },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should handle numeric query token type gracefully', async () => {
      const context = buildJwtContext({
        query: { token: 12345 }, // Number, not string or array
      });

      // Non-string, non-array token should be treated as null (no token)
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });
  });

  describe('Bearer Token Edge Cases', () => {
    it('should reject Bearer with empty token', async () => {
      const context = buildJwtContext({
        headers: { authorization: 'Bearer ' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should reject Bearer with only whitespace token', async () => {
      const context = buildJwtContext({
        headers: { authorization: 'Bearer    ' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should reject lowercase "bearer" prefix (case-sensitive)', async () => {
      const context = buildJwtContext({
        headers: { authorization: 'bearer valid.token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should reject "Token" prefix (not Bearer)', async () => {
      const context = buildJwtContext({
        headers: { authorization: 'Token valid.token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should reject "Basic" auth prefix', async () => {
      const context = buildJwtContext({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });
  });

  describe('Stream Token Fallback — Integration', () => {
    it('should parse stream token claims and populate streamTokenClaims on request', async () => {
      // JWT fails → try stream token
      const failingClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'expired' },
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(
        failingClient as never,
      );

      const claims: StreamTokenClaims = {
        sub: 'stream-user-id',
        conversationId: 'conv-001',
        agentSlug: 'my-agent',
        organizationSlug: 'my-org',
        email: 'stream@example.com',
        role: 'authenticated',
        aud: 'sse',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      streamTokenService.verifyToken.mockReturnValue(claims);

      const mockRequest = {
        headers: {},
        query: { token: 'stream.token.here' },
        url: '/sse?token=stream.token.here',
        originalUrl: '/sse?token=stream.token.here',
        user: undefined as unknown,
        streamTokenClaims: undefined as unknown,
        sanitizedUrl: undefined as unknown,
      };

      const context = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      const user = mockRequest.user as SupabaseAuthUserDto;
      expect(user.id).toBe('stream-user-id');
      expect(user.email).toBe('stream@example.com');
      expect(mockRequest.streamTokenClaims).toEqual(claims);
    });

    it('should strip token from URL when query token is used', async () => {
      const mockClient = buildSupabaseMock();
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      // Set up stream token try after successful JWT validation
      streamTokenService.verifyToken.mockReturnValue({
        sub: 'user-123',
        conversationId: 'conv-1',
        agentSlug: 'agent-1',
        organizationSlug: 'org-1',
        aud: 'sse',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      });
      streamTokenService.stripTokenFromUrl.mockReturnValue(
        '/sse?other=value&token=[redacted]',
      );

      const mockRequest = {
        headers: {},
        query: { token: 'jwt.token' },
        url: '/sse?token=jwt.token',
        originalUrl: '/sse?token=jwt.token&other=value',
        user: undefined as unknown,
        sanitizedUrl: undefined as unknown,
        streamTokenClaims: undefined as unknown,
      };

      const context = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      // sanitizedUrl should be set (token stripped)
      expect(streamTokenService.stripTokenFromUrl).toHaveBeenCalled();
      expect(mockRequest.sanitizedUrl).toBeDefined();
    });
  });

  describe('Test API Key Security', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      process.env = { ...OLD_ENV };
    });

    afterEach(() => {
      process.env = OLD_ENV;
    });

    it('should use default devUserId when SUPABASE_TEST_USERID not set', async () => {
      process.env.TEST_API_SECRET_KEY = 'secure-key';
      delete process.env.SUPABASE_TEST_USERID;

      const mockRequest = {
        headers: { 'x-test-api-key': 'secure-key' },
        query: {},
        url: '/test',
        originalUrl: '/test',
        user: undefined as unknown,
      };

      const context = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      const user = mockRequest.user as SupabaseAuthUserDto;
      // Default dev user ID
      expect(user.id).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('should not accept API key when TEST_API_SECRET_KEY is an empty string', async () => {
      // An empty key should not grant access
      process.env.TEST_API_SECRET_KEY = '';

      const context = buildJwtContext({
        headers: { 'x-test-api-key': '' },
      });

      // Empty configured key → condition `configuredTestKey && testApiKey` is falsy
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should require provider field in user object built from test API key', async () => {
      process.env.TEST_API_SECRET_KEY = 'my-test-key';

      const mockRequest = {
        headers: { 'x-test-api-key': 'my-test-key' },
        query: {},
        url: '/test',
        originalUrl: '/test',
        user: undefined as unknown,
      };

      const context = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      const user = mockRequest.user as SupabaseAuthUserDto;
      expect(user.appMetadata?.['provider']).toBe('api_key');
      expect(user.aud).toBe('authenticated');
      expect(user.role).toBe('authenticated');
    });
  });
});

// ─── RolesGuard — All Role Values and Edge Cases ──────────────────────────────

describe('RolesGuard — All UserRole Values and Edge Cases', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;
  let dbMock: DatabaseService;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    dbMock = {
      from: jest.fn(),
      rpc: jest.fn(),
      checkConnection: jest.fn(),
      getConfig: jest.fn(),
    } as unknown as DatabaseService;

    guard = new RolesGuard(reflector, dbMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('All UserRole Enum Values', () => {
    const allRoles = [
      UserRole.USER,
      UserRole.ADMIN,
      UserRole.DEVELOPER,
      UserRole.EVALUATION_MONITOR,
      UserRole.BETA_TESTER,
      UserRole.SUPPORT,
    ];

    allRoles.forEach((role) => {
      it(`should allow user with "${role}" role when that role is required`, async () => {
        reflector.getAllAndOverride.mockReturnValue([role]);
        (dbMock.from as jest.Mock).mockReturnValue(
          buildUserProfileMock([role]).from() as never,
        );

        const context = buildRolesContext({ user: { id: 'user-1' } });

        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      });

      it(`should deny user with "user" role when "${role}" (non-user) is required`, async () => {
        if (role === UserRole.USER) return; // Skip — user role grants user access

        reflector.getAllAndOverride.mockReturnValue([role]);
        (dbMock.from as jest.Mock).mockReturnValue(
          buildUserProfileMock(['user']).from() as never,
        );

        const context = buildRolesContext({ user: { id: 'user-1' } });

        await expect(guard.canActivate(context)).rejects.toThrow(
          ForbiddenException,
        );
      });
    });
  });

  describe('evaluation-monitor Role', () => {
    it('should allow evaluation-monitor to access evaluation-monitor-required endpoint', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        UserRole.ADMIN,
        UserRole.EVALUATION_MONITOR,
      ]);
      (dbMock.from as jest.Mock).mockReturnValue(
        buildUserProfileMock(['evaluation-monitor']).from() as never,
      );

      const context = buildRolesContext({ user: { id: 'user-1' } });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny evaluation-monitor from admin-only endpoint', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
      (dbMock.from as jest.Mock).mockReturnValue(
        buildUserProfileMock(['evaluation-monitor']).from() as never,
      );

      const context = buildRolesContext({ user: { id: 'user-1' } });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('beta-tester Role', () => {
    it('should allow beta-tester when beta-tester role is required', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.BETA_TESTER]);
      (dbMock.from as jest.Mock).mockReturnValue(
        buildUserProfileMock(['beta-tester']).from() as never,
      );

      const context = buildRolesContext({ user: { id: 'user-1' } });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny user-role from beta-tester-required endpoint', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.BETA_TESTER]);
      (dbMock.from as jest.Mock).mockReturnValue(
        buildUserProfileMock(['user']).from() as never,
      );

      const context = buildRolesContext({ user: { id: 'user-1' } });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('support Role', () => {
    it('should allow support role with SupportAccess (admin OR support)', async () => {
      // SupportAccess = [ADMIN, SUPPORT]
      reflector.getAllAndOverride.mockReturnValue([
        UserRole.ADMIN,
        UserRole.SUPPORT,
      ]);
      (dbMock.from as jest.Mock).mockReturnValue(
        buildUserProfileMock(['support']).from() as never,
      );

      const context = buildRolesContext({ user: { id: 'user-1' } });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny support from developer-only endpoint', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        UserRole.ADMIN,
        UserRole.DEVELOPER,
      ]);
      (dbMock.from as jest.Mock).mockReturnValue(
        buildUserProfileMock(['support']).from() as never,
      );

      const context = buildRolesContext({ user: { id: 'user-1' } });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Null/Undefined UserId Defense', () => {
    it('should throw ForbiddenException when user.id is null', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      const context = buildRolesContext({
        user: { id: null as unknown as string },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Authentication required',
      );

      // Must not call database when id is invalid
      expect(dbMock.from).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user.id is undefined', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      const context = buildRolesContext({
        user: { id: undefined as unknown as string },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Authentication required',
      );
    });

    it('should throw ForbiddenException when user.id is empty string', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      const context = buildRolesContext({
        user: { id: '' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Authentication required',
      );
    });
  });

  describe('Implicit USER Role Default', () => {
    it('should grant user role when DB roles is null (treated as [user])', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.USER]);

      (dbMock.from as jest.Mock).mockReturnValue(
        buildUserProfileMock(null as unknown as string[]).from() as never,
      );

      const context = buildRolesContext({ user: { id: 'user-1' } });

      // Guard defaults null roles to [UserRole.USER], so user role access should succeed
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny non-user role when DB roles is null', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      (dbMock.from as jest.Mock).mockReturnValue(
        buildUserProfileMock(null as unknown as string[]).from() as never,
      );

      const context = buildRolesContext({ user: { id: 'user-1' } });

      // Null roles → defaults to [user] → denied for admin requirement
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Role Injection Prevention — All Attack Vectors', () => {
    it('should reject SQL injection via user ID passed to profile lookup', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      // The guard fetches profile using user.id; the repository uses parameterised queries.
      // Test that a malicious ID doesn't bypass lookup (returns no profile).
      const profileChain = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'Not found' },
            }),
          }),
        }),
      };
      (dbMock.from as jest.Mock).mockReturnValue(profileChain);

      const context = buildRolesContext({
        user: { id: "admin' OR '1'='1" },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'User profile not found',
      );
    });

    it('should ignore roles array injected via request userMetadata', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      (dbMock.from as jest.Mock).mockReturnValue(
        buildUserProfileMock(['user']).from() as never, // DB has only 'user' role
      );

      const mockRequest: Record<string, unknown> = {
        user: {
          id: 'user-evil',
          userMetadata: { roles: ['admin'] }, // Attempt via userMetadata
          appMetadata: { roles: ['admin'] }, // Attempt via appMetadata
        },
      };

      const context = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      // DB says 'user' only — injection via metadata must fail
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject prototype pollution attempt in roles array', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      // If roles array contained __proto__ or constructor keys, they should
      // be filtered by isValidUserRole() before comparison
      const mockClient = buildUserProfileMock([
        '__proto__',
        'constructor',
        'admin',
      ]);
      (dbMock.from as jest.Mock).mockReturnValue(mockClient.from());

      const context = buildRolesContext({ user: { id: 'user-1' } });

      // 'admin' is valid, so access is granted; prototype keys are filtered
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('Guard Composition — JwtAuthGuard + RolesGuard', () => {
    it('should enforce that RolesGuard reads DB roles, not JWT claims', async () => {
      // Simulate JWT-set user having role claim 'admin' but DB says 'user'
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      (dbMock.from as jest.Mock).mockReturnValue(
        buildUserProfileMock(['user']).from() as never,
      );

      // User object as if set by JwtAuthGuard (includes role in appMetadata)
      const context = buildRolesContext({
        user: {
          id: 'user-1',
          // These role-like fields on the JWT user object must be ignored
        },
        request: {
          user: {
            id: 'user-1',
            role: 'admin', // JWT claim — must not bypass RolesGuard
            appMetadata: { role: 'admin' },
          },
        },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Request Enhancement — userProfile Availability', () => {
    it('should attach userProfile even for non-admin users', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.USER]);

      const userProfile = {
        id: 'user-basic',
        email: 'basic@example.com',
        display_name: 'Basic User',
        roles: ['user'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (dbMock.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: userProfile,
              error: null,
            }),
          }),
        }),
      });

      const mockRequest: Record<string, unknown> = {
        user: { id: 'user-basic' },
      };

      const context = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      expect(mockRequest['userProfile']).toEqual(userProfile);
    });

    it('should not attach userProfile when no roles required (early exit)', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const mockRequest: Record<string, unknown> = {
        user: { id: 'user-any' },
      };

      const context = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      // No role check → no DB call → no userProfile
      expect(mockRequest['userProfile']).toBeUndefined();
      expect(dbMock.from).not.toHaveBeenCalled();
    });
  });

  describe('Error Propagation — ForbiddenException Passthrough', () => {
    it('should rethrow ForbiddenException thrown inside getUserProfile logic', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      (dbMock.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }, // Not found
            }),
          }),
        }),
      });

      const context = buildRolesContext({ user: { id: 'gone-user' } });

      // ForbiddenException must be rethrown directly, not wrapped
      try {
        await guard.canActivate(context);
        fail('Expected ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).message).toBe(
          'User profile not found',
        );
      }
    });

    it('should wrap non-ForbiddenException as ForbiddenException with generic message', async () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      (dbMock.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest
              .fn()
              .mockRejectedValue(
                new TypeError('Cannot read properties of undefined'),
              ),
          }),
        }),
      });

      const context = buildRolesContext({ user: { id: 'user-1' } });

      try {
        await guard.canActivate(context);
        fail('Expected ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        // Must NOT reveal the TypeError message
        expect((err as ForbiddenException).message).toBe(
          'Error verifying user permissions',
        );
        expect((err as ForbiddenException).message).not.toContain(
          'Cannot read',
        );
      }
    });
  });
});

// ─── Guard Composition — Sequential Activation ───────────────────────────────

describe('JwtAuthGuard + RolesGuard Composition', () => {
  let jwtGuard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;
  let compositionIdentityProviderMock: {
    validateToken: jest.Mock;
    getAnonClient: jest.Mock;
  };
  let compositionAuthServiceMock: jest.Mocked<
    Pick<AuthServiceProvider, 'resolveInternalUserId'>
  >;
  let compositionDbMock: DatabaseService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    compositionIdentityProviderMock = {
      getAnonClient: jest.fn(),
      validateToken: jest.fn(async (token: string) => {
        const client = compositionIdentityProviderMock.getAnonClient();
        const {
          data: { user },
          error,
        } = await client.auth.getUser(token);
        if (error || !user) {
          throw new Error('Invalid token');
        }
        return {
          id: user.id,
          issuer:
            typeof user.app_metadata?.['iss'] === 'string'
              ? user.app_metadata['iss']
              : 'supabase',
          subject: user.id,
          email: user.email ?? undefined,
          aud: user.aud,
          role: user.role ?? 'authenticated',
          appMetadata: (user.app_metadata as Record<string, unknown>) || {},
          userMetadata: (user.user_metadata as Record<string, unknown>) || {},
          phone: user.phone ?? undefined,
          emailConfirmedAt: user.email_confirmed_at
            ? new Date(user.email_confirmed_at)
            : undefined,
          confirmedAt: user.confirmed_at
            ? new Date(user.confirmed_at)
            : undefined,
          lastSignInAt: user.last_sign_in_at
            ? new Date(user.last_sign_in_at)
            : undefined,
          createdAt: user.created_at ? new Date(user.created_at) : undefined,
          updatedAt: user.updated_at ? new Date(user.updated_at) : undefined,
          identities:
            (user.identities as unknown as Array<Record<string, unknown>>) ||
            [],
          rawClaims: {},
        };
      }),
    };

    compositionAuthServiceMock = {
      resolveInternalUserId: jest.fn().mockResolvedValue('user-123'),
    } as jest.Mocked<Pick<AuthServiceProvider, 'resolveInternalUserId'>>;

    const streamTokenService = {
      verifyToken: jest.fn(),
      stripTokenFromUrl: jest.fn((url: string) => url),
    } as unknown as jest.Mocked<StreamTokenService>;

    configService = {
      get: jest.fn().mockReturnValue('supabase'),
    } as unknown as jest.Mocked<ConfigService>;

    jwtGuard = new JwtAuthGuard(
      compositionIdentityProviderMock as never,
      configService,
      compositionAuthServiceMock as never,
      streamTokenService,
      reflector,
    );
    compositionDbMock = {
      from: jest.fn(),
      rpc: jest.fn(),
      checkConnection: jest.fn(),
      getConfig: jest.fn(),
    } as unknown as DatabaseService;

    rolesGuard = new RolesGuard(reflector, compositionDbMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should deny access when JWT is valid but user lacks required role', async () => {
    // Step 1: JwtAuthGuard — valid JWT
    const mockRequest: Record<string, unknown> = {
      headers: { authorization: 'Bearer valid.jwt.token' },
      query: {},
      url: '/admin/test',
      originalUrl: '/admin/test',
      user: undefined,
    };

    const anonClient = buildSupabaseMock({ id: 'user-limited' });
    compositionIdentityProviderMock.getAnonClient.mockReturnValue(
      anonClient as never,
    );

    reflector.getAllAndOverride.mockReturnValue(false); // Not public

    const jwtContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    const jwtResult = await jwtGuard.canActivate(jwtContext);
    expect(jwtResult).toBe(true);
    expect(mockRequest['user']).toBeDefined();

    // Step 2: RolesGuard — user lacks admin role
    (compositionDbMock.from as jest.Mock).mockReturnValue(
      buildUserProfileMock(['user']).from() as never,
    );

    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    const rolesContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    await expect(rolesGuard.canActivate(rolesContext)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should grant access when JWT is valid AND user has required role', async () => {
    const mockRequest: Record<string, unknown> = {
      headers: { authorization: 'Bearer valid.jwt.token' },
      query: {},
      url: '/admin/test',
      originalUrl: '/admin/test',
      user: undefined,
    };

    const anonClient = buildSupabaseMock({ id: 'admin-user' });
    compositionIdentityProviderMock.getAnonClient.mockReturnValue(
      anonClient as never,
    );

    reflector.getAllAndOverride.mockReturnValue(false);

    const jwtContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    await jwtGuard.canActivate(jwtContext);

    (compositionDbMock.from as jest.Mock).mockReturnValue(
      buildUserProfileMock(['admin']).from() as never,
    );

    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    const rolesContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    const result = await rolesGuard.canActivate(rolesContext);
    expect(result).toBe(true);
  });
});
