import { A2AValidatorService } from './a2a-validator.service';
import { SigningService } from '../security/signing.service';
import { RateLimiterService } from '../security/rate-limiter.service';
import { OriginValidatorService } from '../security/origin-validator.service';
import { SecureConversationsDatabaseService } from '../database/secure-conversations-database.service';
import { ExternalRegistryService } from '../registry/external-registry.service';

const request = {
  jsonrpc: '2.0',
  id: 'request-1',
  method: 'invoke',
  params: {
    context: {
      orgSlug: 'trusted-org',
      userId: 'external:agent-1',
      conversationId: '10000000-0000-4000-8000-000000000001',
      agentSlug: 'contract-assistant',
      agentType: 'context',
      provider: 'external-a2a',
      model: 'registered-agent',
    },
    data: { content: 'hello', contentType: 'text' },
  },
};
const envelope = {
  nonce: 'nonce',
  timestamp: new Date().toISOString(),
  senderId: 'agent-1',
  senderPublicKey: 'key',
  signature: 'a'.repeat(64),
  identityProvider: 'oauth-jwt',
};

describe('A2AValidatorService', () => {
  const previousSecurityMode = process.env.SECURITY_MODE;

  afterEach(() => {
    if (previousSecurityMode === undefined) {
      delete process.env.SECURITY_MODE;
    } else {
      process.env.SECURITY_MODE = previousSecurityMode;
    }
  });

  function createService(options?: {
    trusted?: boolean;
    allowed?: boolean;
    signatureValid?: boolean;
  }) {
    const signing = {
      validateEnvelope: jest.fn(() =>
        options?.signatureValid === false
          ? {
              valid: false,
              rejectionCode: -32002,
              rejectionReason: 'Signature verification failed',
            }
          : { valid: true },
      ),
    } as unknown as SigningService;
    const rateLimiter = {
      isAllowed: jest.fn(() => options?.allowed !== false),
    } as unknown as RateLimiterService;
    const originValidator = {
      isOriginTrusted: jest.fn(() => options?.trusted !== false),
    } as unknown as OriginValidatorService;
    const db = {
      claimInboundNonce: jest.fn(async () => true),
    } as unknown as SecureConversationsDatabaseService;
    const registry = {
      resolveAuthenticatedAgent: jest.fn(async () => ({
        organizationSlug: 'trusted-org',
      })),
    } as unknown as ExternalRegistryService;
    return {
      service: new A2AValidatorService(
        signing,
        rateLimiter,
        originValidator,
        db,
        registry,
      ),
      signing,
      rateLimiter,
      db,
    };
  }

  it('accepts a well-formed, trusted, signed request', async () => {
    process.env.SECURITY_MODE = 'strict';
    const { service } = createService();
    await expect(
      service.validateInboundRequest(
        request,
        'agent-1',
        'https://agent.example',
        envelope,
        '203.0.113.10',
      ),
    ).resolves.toEqual({
      valid: true,
      organizationSlug: 'trusted-org',
      request,
    });
  });

  it('rejects malformed JSON-RPC before security work', async () => {
    const { service, signing, rateLimiter } = createService();
    await expect(
      service.validateInboundRequest({}, 'agent-1', 'https://agent.example'),
    ).resolves.toMatchObject({
      valid: false,
      jsonRpcError: { code: -32600 },
    });
    expect(signing.validateEnvelope).not.toHaveBeenCalled();
    expect(rateLimiter.isAllowed).not.toHaveBeenCalled();
  });

  it('rejects callers with no stable network identity', async () => {
    const { service } = createService();
    await expect(
      service.validateInboundRequest(request, 'agent-1', '', envelope, ''),
    ).resolves.toMatchObject({
      valid: false,
      jsonRpcError: { code: -32029 },
    });
  });

  it('rejects an untrusted origin without reflecting it', async () => {
    const { service } = createService({ trusted: false });
    const result = await service.validateInboundRequest(
      request,
      'agent-1',
      'https://secret.internal',
      envelope,
      '203.0.113.10',
    );
    expect(result).toMatchObject({
      valid: false,
      jsonRpcError: { code: -32003, message: 'Origin is not trusted' },
    });
  });

  it('requires a signed envelope in strict mode', async () => {
    process.env.SECURITY_MODE = 'strict';
    const { service } = createService();
    await expect(
      service.validateInboundRequest(
        request,
        'agent-1',
        'https://agent.example',
        undefined,
        '203.0.113.10',
      ),
    ).resolves.toMatchObject({
      valid: false,
      jsonRpcError: { code: -32700 },
    });
  });

  it('binds the header identity to the signed sender', async () => {
    process.env.SECURITY_MODE = 'strict';
    const { service, signing } = createService();
    await expect(
      service.validateInboundRequest(
        request,
        'spoofed-agent',
        'https://agent.example',
        envelope,
        '203.0.113.10',
      ),
    ).resolves.toMatchObject({
      valid: false,
      jsonRpcError: { code: -32002 },
    });
    expect(signing.validateEnvelope).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures and rate-limit exhaustion', async () => {
    process.env.SECURITY_MODE = 'strict';
    const invalid = createService({ signatureValid: false }).service;
    await expect(
      invalid.validateInboundRequest(
        request,
        'agent-1',
        'https://agent.example',
        envelope,
        '203.0.113.10',
      ),
    ).resolves.toMatchObject({
      valid: false,
      jsonRpcError: { code: -32002 },
    });

    const limited = createService({ allowed: false }).service;
    await expect(
      limited.validateInboundRequest(
        request,
        'agent-1',
        'https://agent.example',
        envelope,
        '203.0.113.10',
      ),
    ).resolves.toMatchObject({
      valid: false,
      jsonRpcError: { code: -32029 },
    });
  });

  it('rejects a nonce already claimed by another API instance', async () => {
    process.env.SECURITY_MODE = 'strict';
    const { service, db } = createService();
    jest
      .spyOn(db, 'claimInboundNonce')
      .mockResolvedValueOnce(false);

    await expect(
      service.validateInboundRequest(
        request,
        'agent-1',
        'https://agent.example',
        envelope,
        '203.0.113.10',
      ),
    ).resolves.toMatchObject({
      valid: false,
      jsonRpcError: { code: -32001 },
    });
  });

  it('fails closed when distributed replay protection is unavailable', async () => {
    process.env.SECURITY_MODE = 'strict';
    const { service, db } = createService();
    jest
      .spyOn(db, 'claimInboundNonce')
      .mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      service.validateInboundRequest(
        request,
        'agent-1',
        'https://agent.example',
        envelope,
        '203.0.113.10',
      ),
    ).resolves.toMatchObject({
      valid: false,
      jsonRpcError: { code: -32050 },
    });
  });
});
