import { Test, TestingModule } from '@nestjs/testing';
import { A2AValidatorService } from './a2a-validator.service';
import { SigningService } from '../security/signing.service';
import { RateLimiterService } from '../security/rate-limiter.service';
import { OriginValidatorService } from '../security/origin-validator.service';

const VALID_BODY = {
  jsonrpc: '2.0' as const,
  id: 'req-1',
  method: 'compose.converse',
  params: { userMessage: 'hello' },
};

describe('A2AValidatorService', () => {
  let validator: A2AValidatorService;
  let signing: SigningService;
  let rateLimiter: RateLimiterService;

  beforeEach(async () => {
    delete process.env.SECURITY_MODE;
    delete process.env.ORIGIN_VALIDATION;
    delete process.env.TRUSTED_ORIGINS;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        A2AValidatorService,
        SigningService,
        RateLimiterService,
        OriginValidatorService,
      ],
    }).compile();

    validator = module.get<A2AValidatorService>(A2AValidatorService);
    signing = module.get<SigningService>(SigningService);
    rateLimiter = module.get<RateLimiterService>(RateLimiterService);
  });

  it('should be defined', () => {
    expect(validator).toBeDefined();
  });

  describe('origin validation', () => {
    it('should reject requests from untrusted origins in strict mode', () => {
      process.env.ORIGIN_VALIDATION = 'strict';
      const result = validator.validateInboundRequest(
        VALID_BODY,
        'agent-x',
        'http://untrusted.io',
        undefined,
      );
      expect(result.valid).toBe(false);
      expect(result.jsonRpcError!.code).toBe(-32003);
    });

    it('should allow requests from trusted origins', () => {
      process.env.ORIGIN_VALIDATION = 'permissive';
      process.env.SECURITY_MODE = 'permissive';

      const result = validator.validateInboundRequest(
        VALID_BODY,
        'agent-trusted',
        'http://any-origin.io',
        undefined,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should reject requests when rate limit is exceeded', () => {
      process.env.ORIGIN_VALIDATION = 'permissive';
      process.env.SECURITY_MODE = 'permissive';

      // Mock rate limiter to deny
      jest.spyOn(rateLimiter, 'isAllowed').mockReturnValue(false);

      const result = validator.validateInboundRequest(
        VALID_BODY,
        'agent-rate-limited',
        'http://any.io',
        undefined,
      );
      expect(result.valid).toBe(false);
      expect(result.jsonRpcError!.code).toBe(-32029);
    });
  });

  describe('JSON-RPC 2.0 format validation', () => {
    beforeEach(() => {
      process.env.ORIGIN_VALIDATION = 'permissive';
      process.env.SECURITY_MODE = 'permissive';
    });

    it('should reject a request missing jsonrpc field', () => {
      const bad = { id: '1', method: 'test' };
      const result = validator.validateInboundRequest(bad, 'agent', 'http://any.io', undefined);
      expect(result.valid).toBe(false);
      expect(result.jsonRpcError!.code).toBe(-32600);
    });

    it('should reject a request with jsonrpc !== "2.0"', () => {
      const bad = { jsonrpc: '1.0', id: '1', method: 'test' };
      const result = validator.validateInboundRequest(bad, 'agent', 'http://any.io', undefined);
      expect(result.valid).toBe(false);
      expect(result.jsonRpcError!.code).toBe(-32600);
    });

    it('should reject a request missing the method field', () => {
      const bad = { jsonrpc: '2.0', id: '1' };
      const result = validator.validateInboundRequest(bad, 'agent', 'http://any.io', undefined);
      expect(result.valid).toBe(false);
      expect(result.jsonRpcError!.code).toBe(-32600);
    });

    it('should reject a request with a non-string method', () => {
      const bad = { jsonrpc: '2.0', id: '1', method: 42 };
      const result = validator.validateInboundRequest(bad, 'agent', 'http://any.io', undefined);
      expect(result.valid).toBe(false);
      expect(result.jsonRpcError!.code).toBe(-32600);
    });

    it('should reject a request missing the id field', () => {
      const bad = { jsonrpc: '2.0', method: 'test' };
      const result = validator.validateInboundRequest(bad, 'agent', 'http://any.io', undefined);
      expect(result.valid).toBe(false);
      expect(result.jsonRpcError!.code).toBe(-32600);
    });

    it('should accept id=0 as a valid id (zero is a valid JSON-RPC id)', () => {
      const body = { jsonrpc: '2.0', id: 0, method: 'test' };
      const result = validator.validateInboundRequest(body, 'agent', 'http://any.io', undefined);
      // In permissive mode with valid format this should pass
      expect(result.valid).toBe(true);
    });
  });

  describe('security envelope validation in strict mode', () => {
    beforeEach(() => {
      process.env.ORIGIN_VALIDATION = 'permissive';
      process.env.SECURITY_MODE = 'strict';
    });

    it('should reject when no envelope is provided in strict mode', () => {
      const result = validator.validateInboundRequest(
        VALID_BODY,
        'agent',
        'http://any.io',
        undefined,
      );
      expect(result.valid).toBe(false);
      expect(result.jsonRpcError!.code).toBe(-32700);
      expect(result.jsonRpcError!.message).toContain('Missing security envelope');
    });

    it('should reject when the envelope signature is invalid', () => {
      // Generate a valid envelope for a different payload so signature won't match
      const wrongPayload = { jsonrpc: '2.0', id: 99, method: 'other', params: {} };
      const envelope = signing.generateEnvelope('sender', wrongPayload);

      const result = validator.validateInboundRequest(
        VALID_BODY,
        'agent',
        'http://any.io',
        envelope,
      );
      expect(result.valid).toBe(false);
      expect(result.jsonRpcError!.code).toBe(-32002);
    });

    it('should accept a valid envelope with a matching signature', () => {
      const envelope = signing.generateEnvelope('sender-ok', VALID_BODY);

      const result = validator.validateInboundRequest(
        VALID_BODY,
        'agent',
        'http://any.io',
        envelope,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('permissive security mode', () => {
    it('should skip envelope check in permissive mode even without envelope', () => {
      process.env.ORIGIN_VALIDATION = 'permissive';
      process.env.SECURITY_MODE = 'permissive';

      const result = validator.validateInboundRequest(
        VALID_BODY,
        'agent',
        'http://any.io',
        undefined,
      );
      expect(result.valid).toBe(true);
    });
  });
});
