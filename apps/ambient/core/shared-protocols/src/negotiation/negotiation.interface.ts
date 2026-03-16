import { CapabilityOffer, NegotiationResult } from '@agent-communication/shared-types';

export interface INegotiationProvider {
  readonly providerId: string;

  proposeCapabilities(offer: CapabilityOffer): Promise<NegotiationResult>;
  negotiate(counterOffer: CapabilityOffer): Promise<NegotiationResult>;
  agree(terms: CapabilityOffer): Promise<void>;
  reject(reason: string): Promise<void>;
}
