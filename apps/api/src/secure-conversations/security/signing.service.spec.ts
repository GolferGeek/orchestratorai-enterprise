import { ConfigService } from '@nestjs/config';
import { SigningService } from './signing.service';

function config(signingKey: string): ConfigService {
  return {
    get: jest.fn((_name: string, fallback: string) => signingKey || fallback),
  } as unknown as ConfigService;
}

describe('SigningService', () => {
  const payload = {
    jsonrpc: '2.0',
    id: 'request-1',
    method: 'agents.invoke',
  };

  it('generates and validates a signed envelope', () => {
    const service = new SigningService(config('a'.repeat(32)));
    const envelope = service.generateEnvelope('agent-1', payload);

    expect(service.validateEnvelope(envelope, payload)).toMatchObject({
      valid: true,
      checks: {
        schemaValid: true,
        timestampValid: true,
        nonceUnique: true,
        signatureValid: true,
      },
    });
  });

  it('rejects payload tampering', () => {
    const service = new SigningService(config('a'.repeat(32)));
    const envelope = service.generateEnvelope('agent-1', payload);

    expect(
      service.validateEnvelope(envelope, { ...payload, method: 'admin.delete' }),
    ).toMatchObject({ valid: false, rejectionCode: -32002 });
  });

  it('rejects replay of a valid nonce', () => {
    const service = new SigningService(config('a'.repeat(32)));
    const envelope = service.generateEnvelope('agent-1', payload);

    expect(service.validateEnvelope(envelope, payload).valid).toBe(true);
    expect(service.validateEnvelope(envelope, payload)).toMatchObject({
      valid: false,
      rejectionCode: -32001,
    });
  });

  it('rejects expired and invalid timestamps', () => {
    const service = new SigningService(config('a'.repeat(32)));
    const envelope = service.generateEnvelope('agent-1', payload);

    expect(
      service.validateEnvelope(
        { ...envelope, timestamp: 'not-a-timestamp' },
        payload,
      ),
    ).toMatchObject({ valid: false, rejectionCode: -32600 });
    expect(
      service.validateEnvelope(
        {
          ...envelope,
          timestamp: new Date(Date.now() - 600_000).toISOString(),
        },
        payload,
      ),
    ).toMatchObject({ valid: false, rejectionCode: -32600 });
  });

  it('rejects malformed hexadecimal signatures', () => {
    const service = new SigningService(config('a'.repeat(32)));
    const envelope = service.generateEnvelope('agent-1', payload);
    expect(
      service.validateEnvelope({ ...envelope, signature: 'not-hex' }, payload),
    ).toMatchObject({ valid: false, rejectionCode: -32700 });
  });

  it('fails closed when no signing key is configured', () => {
    const service = new SigningService(config(''));
    expect(() => service.generateEnvelope('agent-1', payload)).toThrow(
      'SECURE_CONVERSATIONS_SIGNING_KEY',
    );
    expect(
      service.validateEnvelope(
        {
          nonce: 'nonce',
          timestamp: new Date().toISOString(),
          senderId: 'agent-1',
          senderPublicKey: 'key',
          signature: 'a'.repeat(64),
          identityProvider: 'oauth-jwt',
        },
        payload,
      ),
    ).toMatchObject({ valid: false, rejectionCode: -32050 });
  });

  it('rejects sender key fingerprint or identity-provider tampering', () => {
    const service = new SigningService(config('a'.repeat(32)));
    const generated = service.generateEnvelope('agent-1', payload);
    expect(
      service.validateEnvelope(
        { ...generated, senderPublicKey: '04forged' },
        payload,
      ),
    ).toMatchObject({ valid: false, rejectionCode: -32002 });
    expect(
      service.validateEnvelope(
        { ...generated, identityProvider: 'oauth-jwt' },
        payload,
      ),
    ).toMatchObject({ valid: false, rejectionCode: -32002 });
  });
});
