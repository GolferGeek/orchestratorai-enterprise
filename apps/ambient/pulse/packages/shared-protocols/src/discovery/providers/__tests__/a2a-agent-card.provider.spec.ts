import { A2AAgentCardDiscoveryProvider } from '../a2a-agent-card.provider';
import { AgentCard } from '@agent-communication/shared-types';

describe('A2AAgentCardDiscoveryProvider', () => {
  const baseCard: AgentCard = {
    id: 'agent-1',
    name: 'A2A Demo Agent',
    description: 'demo',
    url: 'http://localhost:9999',
    version: '1.0.0',
    capabilities: [
      {
        id: 'skill-1',
        name: 'Skill One',
        description: 'test skill',
      },
    ],
    endpoints: [],
    protocols: {
      discovery: ['a2a-agent-card'],
      transport: ['a2a-jsonrpc'],
      negotiation: ['a2a-skill-negotiation'],
      identity: ['oauth-jwt'],
      payment: ['mock'],
      wallet: ['local-keypair'],
      trust: ['a2a-jws-trust'],
      encryption: ['tls-mutual'],
      resilience: ['circuit-breaker'],
      observability: ['opentelemetry'],
      orchestration: ['a2a-task-lifecycle'],
    },
  };

  it('enriches published cards with A2A metadata fields', async () => {
    const provider = new A2AAgentCardDiscoveryProvider();
    await provider.publishCard(baseCard);
    const resolved = await provider.resolveCapabilities(baseCard.id);

    expect(resolved).not.toBeNull();
    expect(resolved?.metadata).toBeDefined();
    const metadata = resolved?.metadata as Record<string, unknown>;
    expect(Array.isArray(metadata.skills)).toBe(true);
    expect(metadata.capabilities).toBeDefined();
    expect(metadata.securitySchemes).toBeDefined();
    expect(metadata.provider).toBeDefined();
  });

  it('creates signed card document when private key is provided', async () => {
    const provider = new A2AAgentCardDiscoveryProvider();
    const { generateKeyPairSync } = await import('crypto');
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const signed = provider.createSignedCardDocument(baseCard, privateKey);
    expect(signed.signature).toBeDefined();
    expect(typeof signed.signature).toBe('string');
    expect(signed.card.id).toBe(baseCard.id);
  });
});
