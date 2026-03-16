import * as crypto from 'crypto';
import { CapabilityOffer, NegotiationResult } from '@agent-communication/shared-types';
import { INegotiationProvider } from '../negotiation.interface';

interface CommerceCartSession {
  sessionId: string;
  status: 'proposed' | 'negotiating' | 'agreed' | 'rejected';
  originalOffer: CapabilityOffer;
  cartCapabilities: string[];
  protocol: string;
  discountPct: number;
  updatedAt: number;
}

export class CommerceCartNegotiationProvider implements INegotiationProvider {
  readonly providerId = 'commerce-cart-negotiation';

  private localCapabilities: string[] = [];
  private localProtocols: string[] = [];
  private sessions = new Map<string, CommerceCartSession>();

  setCatalogCapabilities(capabilities: string[]): void {
    this.localCapabilities = [...capabilities];
  }

  setSupportedProtocols(protocols: string[]): void {
    this.localProtocols = [...protocols];
  }

  async proposeCapabilities(offer: CapabilityOffer): Promise<NegotiationResult> {
    const sessionId = crypto.randomUUID();
    const matchedCapabilities = offer.capabilities.filter((capability) =>
      this.localCapabilities.includes(capability),
    );

    if (matchedCapabilities.length === 0) {
      this.sessions.set(sessionId, {
        sessionId,
        status: 'rejected',
        originalOffer: offer,
        cartCapabilities: [],
        protocol: 'commerce-acp',
        discountPct: 0,
        updatedAt: Date.now(),
      });
      return { status: 'rejected', reason: 'No matching products available for requested cart' };
    }

    const protocol = this.resolveProtocol(offer.protocols);
    const allMatched = matchedCapabilities.length === offer.capabilities.length;
    const discountPct = allMatched ? 10 : 5;

    this.sessions.set(sessionId, {
      sessionId,
      status: allMatched ? 'agreed' : 'negotiating',
      originalOffer: offer,
      cartCapabilities: matchedCapabilities,
      protocol,
      discountPct,
      updatedAt: Date.now(),
    });

    if (allMatched) {
      return {
        status: 'agreed',
        agreedCapabilities: matchedCapabilities,
        agreedProtocol: protocol,
      };
    }

    return {
      status: 'counter-offer',
      agreedCapabilities: matchedCapabilities,
      agreedProtocol: protocol,
      counterOffer: {
        agentId: 'commerce-provider',
        capabilities: matchedCapabilities,
        protocols: [protocol],
        pricing: this.discountPricing(offer.pricing, matchedCapabilities, discountPct),
      },
    };
  }

  async negotiate(counterOffer: CapabilityOffer): Promise<NegotiationResult> {
    const session = Array.from(this.sessions.values()).find(
      (candidate) => candidate.originalOffer.agentId === counterOffer.agentId && candidate.status === 'negotiating',
    );
    if (!session) {
      return { status: 'rejected', reason: 'No active commerce cart negotiation found' };
    }

    const cartCapabilities = counterOffer.capabilities.filter((capability) =>
      session.cartCapabilities.includes(capability),
    );
    if (cartCapabilities.length === 0) {
      session.status = 'rejected';
      session.updatedAt = Date.now();
      return { status: 'rejected', reason: 'Counter-offer removed all negotiated cart items' };
    }

    session.status = 'agreed';
    session.cartCapabilities = cartCapabilities;
    session.updatedAt = Date.now();
    return {
      status: 'agreed',
      agreedCapabilities: cartCapabilities,
      agreedProtocol: session.protocol,
    };
  }

  async agree(terms: CapabilityOffer): Promise<void> {
    const session = Array.from(this.sessions.values()).find(
      (candidate) => candidate.originalOffer.agentId === terms.agentId && candidate.status !== 'rejected',
    );
    if (!session) {
      this.sessions.set(crypto.randomUUID(), {
        sessionId: crypto.randomUUID(),
        status: 'agreed',
        originalOffer: terms,
        cartCapabilities: [...terms.capabilities],
        protocol: this.resolveProtocol(terms.protocols),
        discountPct: 0,
        updatedAt: Date.now(),
      });
      return;
    }

    session.status = 'agreed';
    session.cartCapabilities = [...terms.capabilities];
    session.protocol = this.resolveProtocol(terms.protocols);
    session.updatedAt = Date.now();
  }

  async reject(reason: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.status === 'proposed' || session.status === 'negotiating') {
        session.status = 'rejected';
        session.updatedAt = Date.now();
      }
    }
    void reason;
  }

  private resolveProtocol(protocols: string[]): string {
    if (protocols.includes('commerce-acp')) {
      return 'commerce-acp';
    }
    const sharedProtocol = protocols.find((protocol) => this.localProtocols.includes(protocol));
    if (sharedProtocol) {
      return sharedProtocol;
    }
    return protocols[0] ?? 'commerce-acp';
  }

  private discountPricing(
    pricing: CapabilityOffer['pricing'],
    capabilities: string[],
    discountPct: number,
  ): CapabilityOffer['pricing'] {
    const discounted: CapabilityOffer['pricing'] = {};
    for (const capability of capabilities) {
      const entry = pricing[capability];
      if (!entry) {
        discounted[capability] = { model: 'paid', amount: 0, currency: 'USD' };
        continue;
      }
      if (entry.model === 'free') {
        discounted[capability] = entry;
        continue;
      }
      const amount = entry.amount ?? 0;
      discounted[capability] = {
        model: 'paid',
        amount: Number((amount * (1 - discountPct / 100)).toFixed(2)),
        currency: entry.currency ?? 'USD',
      };
    }
    return discounted;
  }
}
