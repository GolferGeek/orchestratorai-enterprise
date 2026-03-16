import { Test, TestingModule } from '@nestjs/testing';
import { SigningService, SecurityEnvelope } from './signing.service';

describe('SigningService', () => {
  let service: SigningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SigningService],
    }).compile();

    service = module.get<SigningService>(SigningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateEnvelope()', () => {
    it('should return a SecurityEnvelope with all required fields', () => {
      const envelope = service.generateEnvelope('agent-test', { foo: 'bar' });

      expect(typeof envelope.nonce).toBe('string');
      expect(envelope.nonce.length).toBeGreaterThan(0);
      expect(typeof envelope.timestamp).toBe('string');
      expect(new Date(envelope.timestamp).getTime()).toBeGreaterThan(0);
      expect(envelope.senderId).toBe('agent-test');
      expect(typeof envelope.senderPublicKey).toBe('string');
      expect(envelope.senderPublicKey.startsWith('04')).toBe(true);
      expect(typeof envelope.signature).toBe('string');
      expect(envelope.signature.length).toBe(64); // hex-encoded SHA256
      expect(envelope.identityProvider).toBe('oauth-jwt');
    });

    it('should produce a unique nonce on each call', () => {
      const e1 = service.generateEnvelope('agent-a', {});
      const e2 = service.generateEnvelope('agent-a', {});
      expect(e1.nonce).not.toBe(e2.nonce);
    });

    it('should produce different signatures for different payloads', () => {
      const e1 = service.generateEnvelope('agent-a', { x: 1 });
      const e2 = service.generateEnvelope('agent-a', { x: 2 });
      expect(e1.signature).not.toBe(e2.signature);
    });
  });

  describe('validateEnvelope()', () => {
    it('should validate a correctly signed envelope', () => {
      const payload = { jsonrpc: '2.0', id: 1, method: 'test.action', params: {} };
      const envelope = service.generateEnvelope('sender-ok', payload);

      const result = service.validateEnvelope(envelope, payload);

      expect(result.valid).toBe(true);
      expect(result.checks.schemaValid).toBe(true);
      expect(result.checks.timestampValid).toBe(true);
      expect(result.checks.nonceUnique).toBe(true);
      expect(result.checks.signatureValid).toBe(true);
    });

    it('should reject a malformed envelope missing required fields', () => {
      const incomplete = { nonce: 'abc', timestamp: new Date().toISOString() } as SecurityEnvelope;
      const result = service.validateEnvelope(incomplete, {});

      expect(result.valid).toBe(false);
      expect(result.checks.schemaValid).toBe(false);
      expect(result.rejectionCode).toBe(-32700);
    });

    it('should reject an envelope with an invalid timestamp format', () => {
      const envelope = service.generateEnvelope('sender', {});
      const tampered: SecurityEnvelope = { ...envelope, timestamp: 'not-a-date' };

      const result = service.validateEnvelope(tampered, {});

      expect(result.valid).toBe(false);
      expect(result.checks.timestampValid).toBe(false);
      expect(result.rejectionCode).toBe(-32600);
    });

    it('should reject an envelope with a timestamp outside the 5-minute window', () => {
      const envelope = service.generateEnvelope('sender', {});
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const stale: SecurityEnvelope = { ...envelope, timestamp: sixMinutesAgo };

      const result = service.validateEnvelope(stale, {});

      expect(result.valid).toBe(false);
      expect(result.checks.timestampValid).toBe(false);
      expect(result.rejectionCode).toBe(-32600);
    });

    it('should reject a replayed envelope (duplicate nonce)', () => {
      const payload = { jsonrpc: '2.0', id: 1, method: 'test', params: {} };
      const envelope = service.generateEnvelope('sender-replay', payload);

      // First validation records the nonce
      service.validateEnvelope(envelope, payload);

      // Second validation with the same nonce should be rejected
      const result = service.validateEnvelope(envelope, payload);

      expect(result.valid).toBe(false);
      expect(result.checks.nonceUnique).toBe(false);
      expect(result.rejectionCode).toBe(-32001);
    });

    it('should reject an envelope whose signature was tampered', () => {
      const payload = { jsonrpc: '2.0', id: 2, method: 'test', params: {} };
      const envelope = service.generateEnvelope('sender-tamper', payload);
      const tampered: SecurityEnvelope = {
        ...envelope,
        signature: 'a'.repeat(64),
      };

      const result = service.validateEnvelope(tampered, payload);

      expect(result.valid).toBe(false);
      expect(result.checks.signatureValid).toBe(false);
      expect(result.rejectionCode).toBe(-32002);
    });

    it('should reject an envelope when the payload was modified after signing', () => {
      const originalPayload = { jsonrpc: '2.0', id: 3, method: 'test', params: { a: 1 } };
      const envelope = service.generateEnvelope('sender-payload', originalPayload);

      const modifiedPayload = { jsonrpc: '2.0', id: 3, method: 'test', params: { a: 999 } };
      const result = service.validateEnvelope(envelope, modifiedPayload);

      expect(result.valid).toBe(false);
      expect(result.checks.signatureValid).toBe(false);
    });
  });
});
