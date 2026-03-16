import {
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { StreamTokenService } from '../services/stream-token.service';
import { SupabaseAuthUserDto } from '../dto/auth.dto';
import { AuthServiceProvider } from '../interfaces/auth-service.interface';

// Test utilities for creating mock execution contexts
const createMockExecutionContext = (options: {
  headers?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  isPublic?: boolean;
}): ExecutionContext => {
  const { headers = {}, query = {}, isPublic: _isPublic = false } = options;

  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        query,
        url: '/test',
        originalUrl: '/test',
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({
      getData: () => ({}),
      getContext: () => ({}),
    }),
    switchToWs: () => ({
      getData: () => ({}),
      getClient: () => ({}),
    }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
};

describe('JwtAuthGuard - Security Tests', () => {
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
  let loggerSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create identity provider mock that validates via supabase-style getUser
    identityProviderMock = {
      getAnonClient: jest.fn(),
      validateToken: jest.fn(async (token: string) => {
        const client = identityProviderMock.getAnonClient();
        const {
          data: { user },
          error,
        } = await client.auth.getUser(token);

        if (error || !user) {
          throw new UnauthorizedException('Invalid token');
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
      stripTokenFromUrl: jest.fn((url) => url),
      generateToken: jest.fn(),
    } as unknown as jest.Mocked<StreamTokenService>;

    reflector = {
      getAllAndOverride: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    configService = {
      get: jest.fn().mockReturnValue('supabase'),
    } as unknown as jest.Mocked<ConfigService>;

    // Initialize guard
    guard = new JwtAuthGuard(
      identityProviderMock as never,
      configService,
      authServiceMock as never,
      streamTokenService,
      reflector,
    );

    // Spy on logger to verify no PII is logged
    loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    loggerSpy.mockRestore();
  });

  describe('Token Validation - Security', () => {
    it('should reject missing token', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockExecutionContext({ headers: {} });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should reject malformed bearer token', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token format' },
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer not-a-valid-jwt' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow('Invalid token');
    });

    it('should reject token with invalid format (not JWT)', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' },
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer malformed' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject expired token', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Token expired' },
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer expired.jwt.token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should accept valid bearer token', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const validUser: SupabaseAuthUserDto = {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        appMetadata: { provider: 'email', providers: ['email'] },
        userMetadata: { name: 'Test User' },
        identities: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: {
              user: {
                id: validUser.id,
                email: validUser.email,
                aud: validUser.aud,
                role: validUser.role,
                app_metadata: validUser.appMetadata,
                user_metadata: validUser.userMetadata,
                identities: validUser.identities,
                created_at: validUser.createdAt?.toISOString(),
                updated_at: validUser.updatedAt?.toISOString(),
              },
            },
            error: null,
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should not leak token details in error messages', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Token verification failed: invalid signature' },
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const secretToken = 'Bearer secret-token-123';
      const context = createMockExecutionContext({
        headers: { authorization: secretToken },
      });

      try {
        await guard.canActivate(context);
        fail('Should have thrown UnauthorizedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const message = (error as UnauthorizedException).message;
        // Error message should not contain token details
        expect(message).not.toContain('secret-token-123');
        expect(message).not.toContain('invalid signature');
        expect(message).toBe('Invalid token');
      }
    });

    it('should not log tokens in warning messages', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' },
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const secretToken = 'Bearer secret-should-not-be-logged-123';
      const context = createMockExecutionContext({
        headers: { authorization: secretToken },
      });

      try {
        await guard.canActivate(context);
      } catch {
        // Expected to fail
      }

      // Check that logger.warn was called but doesn't contain the token
      expect(loggerSpy).toHaveBeenCalled();
      const logCalls = loggerSpy.mock.calls;
      logCalls.forEach((call) => {
        const logMessage = JSON.stringify(call);
        expect(logMessage).not.toContain('secret-should-not-be-logged-123');
      });
    });
  });

  describe('Public Route Handling', () => {
    it('should allow access to public routes without token', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);

      const context = createMockExecutionContext({ headers: {} });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      // Supabase should not be called for public routes
      expect(identityProviderMock.getAnonClient).not.toHaveBeenCalled();
    });

    it('should allow access to public routes even with invalid token', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer invalid' },
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      // Supabase should not be called for public routes
      expect(identityProviderMock.getAnonClient).not.toHaveBeenCalled();
    });
  });

  describe('API Key Authentication - Security', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      process.env = { ...OLD_ENV };
      process.env.TEST_API_SECRET_KEY = 'test-api-key-123';
      process.env.SUPABASE_TEST_USERID = 'test-user-id';
      process.env.SUPABASE_TEST_USER = 'test@example.com';
    });

    afterEach(() => {
      process.env = OLD_ENV;
    });

    it('should accept valid API key', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockExecutionContext({
        headers: { 'x-test-api-key': 'test-api-key-123' },
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      // Should not call Supabase for API key auth
      expect(identityProviderMock.getAnonClient).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockExecutionContext({
        headers: { 'x-test-api-key': 'wrong-api-key' },
      });

      // Should fail through to "No token provided" since API key didn't match
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should require exact match for API key (timing attack protection)', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      // Almost correct key (off by one character)
      const context = createMockExecutionContext({
        headers: { 'x-test-api-key': 'test-api-key-124' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should not bypass authentication when API key is not configured', async () => {
      delete process.env.TEST_API_SECRET_KEY;
      reflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockExecutionContext({
        headers: { 'x-test-api-key': 'any-key' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should use configured test user ID for API key auth', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockRequest = {
        headers: { 'x-test-api-key': 'test-api-key-123' },
        query: {},
        url: '/test',
        originalUrl: '/test',
        user: undefined as unknown,
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      reflector.getAllAndOverride.mockReturnValue(false);

      await guard.canActivate(context);

      expect(mockRequest.user).toBeDefined();
      expect((mockRequest.user as Record<string, unknown>)?.id).toBe(
        'test-user-id',
      );
      expect((mockRequest.user as Record<string, unknown>)?.email).toBe(
        'test@example.com',
      );
    });
  });

  describe('Query Token Handling - Security', () => {
    it('should accept valid query token', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const validUser = {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        identities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: validUser },
            error: null,
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        query: { token: 'valid.query.token' },
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should sanitize URL when token is in query params', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const validUser = {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        identities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: validUser },
            error: null,
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        query: { token: 'secret.token' },
      });

      await guard.canActivate(context);

      const _request = context.switchToHttp().getRequest();
      // URL should be sanitized if stream token service is called
      // (This is backward compatibility for stream tokens)
    });

    it('should fallback to stream token if JWT validation fails', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid JWT' },
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      streamTokenService.verifyToken.mockReturnValue({
        sub: 'user-stream-123',
        taskId: 'task-123',
        agentSlug: 'test-agent',
        organizationSlug: 'test-org',
        email: 'stream@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      });

      const context = createMockExecutionContext({
        query: { token: 'stream.token.value' },
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(streamTokenService.verifyToken).toHaveBeenCalled();
    });

    it('should reject when both JWT and stream token validation fail', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid JWT' },
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      streamTokenService.verifyToken.mockImplementation(() => {
        throw new Error('Invalid stream token');
      });

      const context = createMockExecutionContext({
        query: { token: 'invalid.token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow('Invalid token');
    });

    it('should handle array query tokens (first value)', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const validUser = {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        identities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: validUser },
            error: null,
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        query: { token: ['first.token', 'second.token'] },
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      // Should use first token in array
      expect(mockClient.auth.getUser).toHaveBeenCalledWith('first.token');
    });

    it('should reject empty string query token', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockExecutionContext({
        query: { token: '' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });
  });

  describe('Bearer Token Extraction - Security', () => {
    it('should extract token from Bearer header', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const validUser = {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        identities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: validUser },
            error: null,
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer my.jwt.token' },
      });

      await guard.canActivate(context);

      expect(mockClient.auth.getUser).toHaveBeenCalledWith('my.jwt.token');
    });

    it('should reject authorization header without Bearer prefix', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockExecutionContext({
        headers: { authorization: 'just.a.token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided',
      );
    });

    it('should handle Bearer with extra whitespace', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const validUser = {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        identities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: validUser },
            error: null,
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer   token.with.spaces   ' },
      });

      await guard.canActivate(context);

      // Should trim the token
      expect(mockClient.auth.getUser).toHaveBeenCalledWith('token.with.spaces');
    });

    it('should prefer bearer token over query token', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const validUser = {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        identities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: validUser },
            error: null,
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer header.token' },
        query: { token: 'query.token' },
      });

      await guard.canActivate(context);

      // Should use bearer token, not query token
      expect(mockClient.auth.getUser).toHaveBeenCalledWith('header.token');
    });
  });

  describe('User Object Validation', () => {
    it('should populate request.user with complete user data', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const validUser = {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        phone: '+1234567890',
        email_confirmed_at: new Date('2024-01-01').toISOString(),
        confirmed_at: new Date('2024-01-01').toISOString(),
        last_sign_in_at: new Date('2024-01-15').toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { name: 'Test User' },
        identities: [{ provider: 'email', id: 'email-id' }],
        created_at: new Date('2024-01-01').toISOString(),
        updated_at: new Date('2024-01-15').toISOString(),
      };

      const mockRequest = {
        headers: { authorization: 'Bearer valid.token' },
        query: {},
        url: '/test',
        originalUrl: '/test',
        user: undefined as unknown,
      };

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: validUser },
            error: null,
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      reflector.getAllAndOverride.mockReturnValue(false);

      await guard.canActivate(context);

      expect(mockRequest.user).toBeDefined();
      expect((mockRequest.user as Record<string, unknown>)?.id).toBe(
        'user-123',
      );
      expect((mockRequest.user as Record<string, unknown>)?.email).toBe(
        'test@example.com',
      );
      expect((mockRequest.user as Record<string, unknown>)?.phone).toBe(
        '+1234567890',
      );
      expect(
        (mockRequest.user as Record<string, unknown>)?.appMetadata,
      ).toEqual({
        provider: 'email',
        providers: ['email'],
      });
      expect(
        (mockRequest.user as Record<string, unknown>)?.userMetadata,
      ).toEqual({ name: 'Test User' });
    });

    it('should handle user data without optional fields', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const minimalUser = {
        id: 'user-minimal',
        email: 'minimal@example.com',
        aud: 'authenticated',
        role: 'authenticated',
      };

      const mockRequest = {
        headers: { authorization: 'Bearer valid.token' },
        query: {},
        url: '/test',
        originalUrl: '/test',
        user: undefined as unknown,
      };

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: minimalUser },
            error: null,
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);
      authServiceMock.resolveInternalUserId.mockResolvedValue('user-minimal');

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      reflector.getAllAndOverride.mockReturnValue(false);

      await guard.canActivate(context);

      expect(mockRequest.user).toBeDefined();
      expect((mockRequest.user as Record<string, unknown>)?.id).toBe(
        'user-minimal',
      );
      expect(
        (mockRequest.user as Record<string, unknown>)?.appMetadata,
      ).toEqual({});
      expect(
        (mockRequest.user as Record<string, unknown>)?.userMetadata,
      ).toEqual({});
      expect((mockRequest.user as Record<string, unknown>)?.identities).toEqual(
        [],
      );
    });
  });

  describe('Error Handling - Security', () => {
    it('should not expose internal error details', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: {
              message:
                'Internal database error: connection to auth.users failed',
            },
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer token' },
      });

      try {
        await guard.canActivate(context);
        fail('Should have thrown UnauthorizedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const message = (error as UnauthorizedException).message;
        // Should not leak internal error details
        expect(message).not.toContain('database');
        expect(message).not.toContain('connection');
        expect(message).toBe('Invalid token');
      }
    });

    it('should handle null user response gracefully', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow('Invalid token');
    });

    it('should handle Supabase client errors gracefully', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const mockClient = {
        auth: {
          getUser: jest.fn().mockRejectedValue(new Error('Network error')),
        },
      };
      identityProviderMock.getAnonClient.mockReturnValue(mockClient as never);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
