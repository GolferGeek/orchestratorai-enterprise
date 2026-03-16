import { Test, TestingModule } from '@nestjs/testing';
import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { StreamTokenService, StreamTokenClaims } from './stream-token.service';
import * as jwt from 'jsonwebtoken';

// Mock environment variables
const originalEnv = process.env;

describe('StreamTokenService', () => {
  let service: StreamTokenService;

  beforeEach(async () => {
    // Reset environment
    jest.resetModules();
    process.env = {
      ...originalEnv,
      STREAM_TOKEN_SECRET: 'test-secret-key-for-testing',
      STREAM_TOKEN_TTL_SECONDS: '300',
      STREAM_TOKEN_RATE_WINDOW_MS: '30000',
      STREAM_TOKEN_RATE_MAX: '5',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StreamTokenService],
    }).compile();

    service = module.get<StreamTokenService>(StreamTokenService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('issueToken', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'authenticated',
      aud: 'authenticated',
    };

    const validParams = {
      user: mockUser as any,
      taskId: 'task-456',
      agentSlug: 'test-agent',
      organizationSlug: 'test-org',
    };

    it('should issue a valid JWT token', () => {
      const result = service.issueToken(validParams);

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should include all required claims in the token', () => {
      const result = service.issueToken(validParams);

      // Decode without verification to check claims
      const decoded = jwt.decode(result.token) as StreamTokenClaims;

      expect(decoded.sub).toBe('user-123');
      expect(decoded.taskId).toBe('task-456');
      expect(decoded.agentSlug).toBe('test-agent');
      expect(decoded.organizationSlug).toBe('test-org');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('authenticated');
      expect(decoded.aud).toBe('sse');
      expect(decoded.iss).toBe('orchestrator-ai');
    });

    it('should include optional streamId when provided', () => {
      const paramsWithStreamId = {
        ...validParams,
        streamId: 'stream-789',
      };

      const result = service.issueToken(paramsWithStreamId);
      const decoded = jwt.decode(result.token) as StreamTokenClaims;

      expect(decoded.streamId).toBe('stream-789');
    });

    it('should include optional conversationId when provided', () => {
      const paramsWithConversationId = {
        ...validParams,
        conversationId: 'conv-101',
      };

      const result = service.issueToken(paramsWithConversationId);
      const decoded = jwt.decode(result.token) as StreamTokenClaims;

      expect(decoded.conversationId).toBe('conv-101');
    });

    it('should handle null organizationSlug', () => {
      const paramsWithNullOrg = {
        ...validParams,
        organizationSlug: null,
      };

      const result = service.issueToken(paramsWithNullOrg);
      const decoded = jwt.decode(result.token) as StreamTokenClaims;

      expect(decoded.organizationSlug).toBeNull();
    });

    it('should default role to authenticated when not provided', () => {
      const paramsWithNoRole = {
        ...validParams,
        user: { id: 'user-123', email: 'test@example.com' } as any,
      };

      const result = service.issueToken(paramsWithNoRole);
      const decoded = jwt.decode(result.token) as StreamTokenClaims;

      expect(decoded.role).toBe('authenticated');
    });

    it('should set expiration based on TTL', () => {
      const before = Date.now();
      const result = service.issueToken(validParams);
      const after = Date.now();

      // TTL is 300 seconds (5 minutes)
      const expectedMinExpiry = before + 300 * 1000;
      const expectedMaxExpiry = after + 300 * 1000;

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        expectedMinExpiry,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxExpiry);
    });
  });

  describe('verifyToken', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'authenticated',
    };

    const validParams = {
      user: mockUser as any,
      taskId: 'task-456',
      agentSlug: 'test-agent',
      organizationSlug: 'test-org',
    };

    it('should verify a valid token and return claims', () => {
      const { token } = service.issueToken(validParams);
      const claims = service.verifyToken(token);

      expect(claims.sub).toBe('user-123');
      expect(claims.taskId).toBe('task-456');
      expect(claims.agentSlug).toBe('test-agent');
    });

    it('should throw UnauthorizedException for invalid token', () => {
      expect(() => service.verifyToken('invalid-token')).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for expired token', () => {
      // Create an expired token manually
      const expiredToken = jwt.sign(
        {
          sub: 'user-123',
          taskId: 'task-456',
          agentSlug: 'test-agent',
          organizationSlug: 'test-org',
        },
        'test-secret-key-for-testing',
        {
          expiresIn: -1, // Already expired
          audience: 'sse',
          issuer: 'orchestrator-ai',
        },
      );

      expect(() => service.verifyToken(expiredToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for wrong audience', () => {
      const wrongAudienceToken = jwt.sign(
        {
          sub: 'user-123',
          taskId: 'task-456',
          agentSlug: 'test-agent',
        },
        'test-secret-key-for-testing',
        {
          expiresIn: 300,
          audience: 'wrong-audience',
          issuer: 'orchestrator-ai',
        },
      );

      expect(() => service.verifyToken(wrongAudienceToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for wrong issuer', () => {
      const wrongIssuerToken = jwt.sign(
        {
          sub: 'user-123',
          taskId: 'task-456',
          agentSlug: 'test-agent',
        },
        'test-secret-key-for-testing',
        {
          expiresIn: 300,
          audience: 'sse',
          issuer: 'wrong-issuer',
        },
      );

      expect(() => service.verifyToken(wrongIssuerToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for token with missing required claims', () => {
      const incompleteToken = jwt.sign(
        {
          sub: 'user-123',
          // Missing taskId and agentSlug
        },
        'test-secret-key-for-testing',
        {
          expiresIn: 300,
          audience: 'sse',
          issuer: 'orchestrator-ai',
        },
      );

      expect(() => service.verifyToken(incompleteToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for tampered token', () => {
      const { token } = service.issueToken(validParams);
      const tamperedToken = token.slice(0, -5) + 'xxxxx'; // Corrupt the signature

      expect(() => service.verifyToken(tamperedToken)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('stripTokenFromUrl', () => {
    it('should redact token from URL query string', () => {
      const url = '/api/stream?token=secret-token-123&other=value';
      const result = service.stripTokenFromUrl(url);

      expect(result).toBe('/api/stream?token=%5Bredacted%5D&other=value');
      expect(result).not.toContain('secret-token-123');
    });

    it('should handle URL without token parameter', () => {
      const url = '/api/stream?other=value';
      const result = service.stripTokenFromUrl(url);

      expect(result).toBe('/api/stream?other=value');
    });

    it('should handle URL without query string', () => {
      const url = '/api/stream';
      const result = service.stripTokenFromUrl(url);

      expect(result).toBe('/api/stream');
    });

    it('should handle empty string', () => {
      const result = service.stripTokenFromUrl('');
      expect(result).toBe('');
    });

    it('should handle null/undefined gracefully', () => {
      expect(service.stripTokenFromUrl(null as any)).toBeNull();
      expect(service.stripTokenFromUrl(undefined as any)).toBeUndefined();
    });

    it('should handle malformed URL gracefully', () => {
      const malformedUrl = '/api/stream?token=secret&bad=';
      const result = service.stripTokenFromUrl(malformedUrl);

      expect(result).not.toContain('secret');
    });

    it('should preserve other query parameters', () => {
      const url = '/api/stream?foo=bar&token=secret&baz=qux';
      const result = service.stripTokenFromUrl(url);

      expect(result).toContain('foo=bar');
      expect(result).toContain('baz=qux');
      expect(result).not.toContain('secret');
    });
  });

  describe('rate limiting', () => {
    const mockUser = {
      id: 'rate-limit-user',
      email: 'test@example.com',
      role: 'authenticated',
    };

    const validParams = {
      user: mockUser as any,
      taskId: 'task-rate-limit',
      agentSlug: 'test-agent',
      organizationSlug: 'test-org',
    };

    it('should allow tokens up to the rate limit', () => {
      // Default rate limit is 5 per window
      for (let i = 0; i < 5; i++) {
        expect(() => service.issueToken(validParams)).not.toThrow();
      }
    });

    it('should throw TOO_MANY_REQUESTS when rate limit exceeded', () => {
      // Issue 5 tokens (the limit)
      for (let i = 0; i < 5; i++) {
        service.issueToken(validParams);
      }

      // 6th request should fail
      expect(() => service.issueToken(validParams)).toThrow(HttpException);

      try {
        service.issueToken(validParams);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    });

    it('should track rate limits per user-task combination', () => {
      // Issue tokens for first user-task pair
      for (let i = 0; i < 5; i++) {
        service.issueToken(validParams);
      }

      // Different task should have its own limit
      const differentTaskParams = {
        ...validParams,
        taskId: 'different-task',
      };

      expect(() => service.issueToken(differentTaskParams)).not.toThrow();
    });

    it('should track rate limits per user', () => {
      // Issue tokens for first user
      for (let i = 0; i < 5; i++) {
        service.issueToken(validParams);
      }

      // Different user should have its own limit
      const differentUserParams = {
        ...validParams,
        user: { id: 'different-user', email: 'other@example.com' } as any,
      };

      expect(() => service.issueToken(differentUserParams)).not.toThrow();
    });
  });
});
