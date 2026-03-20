import { A2ASkillNegotiationProvider } from '../a2a-skill-negotiation.provider';
import { CapabilityOffer } from '@agent-communication/shared-types';

describe('A2ASkillNegotiationProvider', () => {
  function createOffer(overrides?: Partial<CapabilityOffer>): CapabilityOffer {
    return {
      agentId: 'agent-a',
      capabilities: ['spec-validation', 'catalog-query'],
      protocols: ['a2a-jsonrpc'],
      pricing: {
        __a2a: {
          model: 'free',
        },
      },
      ...overrides,
    };
  }

  it('agrees when skills and modes are compatible', async () => {
    const provider = new A2ASkillNegotiationProvider();
    provider.setLocalCapabilities(['spec-validation', 'inventory-check']);
    provider.setLocalProtocols(['a2a-jsonrpc']);
    provider.setLocalUiModes(['iframe', 'video']);
    provider.setLocalContentTypes(['application/json']);

    const result = await provider.proposeCapabilities(createOffer());
    expect(result.status).toBe('agreed');
    expect(result.agreedProtocol).toBe('a2a-jsonrpc');
    expect(result.agreedCapabilities).toEqual(['spec-validation']);
  });

  it('counter-offers when protocol is missing', async () => {
    const provider = new A2ASkillNegotiationProvider();
    provider.setLocalCapabilities(['spec-validation']);
    provider.setLocalProtocols(['http-rest']);

    const result = await provider.proposeCapabilities(createOffer());
    expect(result.status).toBe('counter-offer');
    expect(result.counterOffer).toBeDefined();
  });
});
