import { CommerceCartNegotiationProvider } from '../commerce-cart-negotiation.provider';
import { CapabilityOffer } from '@agent-communication/shared-types';

describe('CommerceCartNegotiationProvider', () => {
  let provider: CommerceCartNegotiationProvider;

  beforeEach(() => {
    provider = new CommerceCartNegotiationProvider();
    provider.setCatalogCapabilities(['product:report', 'product:score', 'product:monitor']);
    provider.setSupportedProtocols(['commerce-acp']);
  });

  it('agrees when all requested cart capabilities are available', async () => {
    const offer: CapabilityOffer = {
      agentId: 'buyer',
      capabilities: ['product:report', 'product:score'],
      protocols: ['commerce-acp'],
      pricing: {
        'product:report': { model: 'paid', amount: 1200, currency: 'USD' },
        'product:score': { model: 'paid', amount: 150, currency: 'USD' },
      },
    };

    const result = await provider.proposeCapabilities(offer);
    expect(result.status).toBe('agreed');
    expect(result.agreedProtocol).toBe('commerce-acp');
    expect(result.agreedCapabilities).toEqual(['product:report', 'product:score']);
  });

  it('returns counter-offer when partial cart is available', async () => {
    const offer: CapabilityOffer = {
      agentId: 'buyer',
      capabilities: ['product:report', 'product:missing'],
      protocols: ['commerce-acp'],
      pricing: {
        'product:report': { model: 'paid', amount: 1200, currency: 'USD' },
        'product:missing': { model: 'paid', amount: 50, currency: 'USD' },
      },
    };

    const result = await provider.proposeCapabilities(offer);
    expect(result.status).toBe('counter-offer');
    expect(result.counterOffer?.capabilities).toEqual(['product:report']);
    expect(result.counterOffer?.pricing['product:report'].amount).toBe(1140);
  });
});
