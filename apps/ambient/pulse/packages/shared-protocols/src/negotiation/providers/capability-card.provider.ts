import { CapabilityOffer, NegotiationResult } from '@agent-communication/shared-types';
import { INegotiationProvider } from '../negotiation.interface';

export class CapabilityCardNegotiationProvider implements INegotiationProvider {
  readonly providerId = 'capability-card';

  private localCapabilities: string[] = [];

  setLocalCapabilities(capabilities: string[]): void {
    this.localCapabilities = capabilities;
  }

  async proposeCapabilities(offer: CapabilityOffer): Promise<NegotiationResult> {
    const matched = offer.capabilities.filter(c => this.localCapabilities.includes(c));
    if (matched.length === 0) {
      return {
        status: 'rejected',
        reason: 'No matching capabilities found',
      };
    }
    return {
      status: 'agreed',
      agreedCapabilities: matched,
      agreedProtocol: offer.protocols[0],
    };
  }

  async negotiate(counterOffer: CapabilityOffer): Promise<NegotiationResult> {
    return this.proposeCapabilities(counterOffer);
  }

  async agree(): Promise<void> {
    // Static matching — nothing to finalize
  }

  async reject(): Promise<void> {
    // Static matching — nothing to clean up
  }
}
