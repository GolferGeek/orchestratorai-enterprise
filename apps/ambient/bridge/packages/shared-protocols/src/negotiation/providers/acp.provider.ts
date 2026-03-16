import * as crypto from 'crypto';
import { CapabilityOffer, NegotiationResult } from '@agent-communication/shared-types';
import { INegotiationProvider } from '../negotiation.interface';

interface NegotiationSession {
  sessionId: string;
  originalOffer: CapabilityOffer;
  status: 'proposed' | 'negotiating' | 'agreed' | 'rejected';
  agreedCapabilities?: string[];
  agreedProtocol?: string;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Agent Communication Protocol (ACP) negotiation provider.
 *
 * Implements semantic capability negotiation where agents propose, counter-offer,
 * and agree on shared capabilities. Uses overlap-based evaluation: if more than
 * 50% of offered capabilities match the local set, agreement is reached directly;
 * otherwise a counter-offer is returned with the intersection.
 */
export class AcpNegotiationProvider implements INegotiationProvider {
  readonly providerId = 'acp';

  private localCapabilities: string[] = [];
  private localProtocols: string[] = [];
  private sessions = new Map<string, NegotiationSession>();

  setLocalCapabilities(capabilities: string[]): void {
    this.localCapabilities = capabilities;
  }

  setLocalProtocols(protocols: string[]): void {
    this.localProtocols = protocols;
  }

  async proposeCapabilities(offer: CapabilityOffer): Promise<NegotiationResult> {
    const sessionId = crypto.randomUUID();

    const matchedCapabilities = offer.capabilities.filter((c) =>
      this.localCapabilities.includes(c),
    );
    const matchedProtocols = offer.protocols.filter((p) =>
      this.localProtocols.includes(p),
    );

    const overlapRatio =
      offer.capabilities.length > 0
        ? matchedCapabilities.length / offer.capabilities.length
        : 0;

    if (matchedCapabilities.length === 0) {
      const session: NegotiationSession = {
        sessionId,
        originalOffer: offer,
        status: 'rejected',
        rejectionReason: 'No overlapping capabilities between agents',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.sessions.set(sessionId, session);

      return {
        status: 'rejected',
        reason: 'No overlapping capabilities between agents',
      };
    }

    if (overlapRatio > 0.5) {
      const agreedProtocol = matchedProtocols.length > 0
        ? matchedProtocols[0]
        : offer.protocols[0];

      const session: NegotiationSession = {
        sessionId,
        originalOffer: offer,
        status: 'agreed',
        agreedCapabilities: matchedCapabilities,
        agreedProtocol,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.sessions.set(sessionId, session);

      return {
        status: 'agreed',
        agreedCapabilities: matchedCapabilities,
        agreedProtocol,
      };
    }

    // Overlap exists but is <= 50% — counter-offer with the intersection
    const session: NegotiationSession = {
      sessionId,
      originalOffer: offer,
      status: 'negotiating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sessions.set(sessionId, session);

    const counterPricing: CapabilityOffer['pricing'] = {};
    for (const cap of matchedCapabilities) {
      counterPricing[cap] = offer.pricing[cap] || { model: 'free' };
    }

    return {
      status: 'counter-offer',
      agreedCapabilities: matchedCapabilities,
      counterOffer: {
        agentId: 'local',
        capabilities: matchedCapabilities,
        protocols: matchedProtocols.length > 0 ? matchedProtocols : [offer.protocols[0]],
        pricing: counterPricing,
      },
    };
  }

  async negotiate(counterOffer: CapabilityOffer): Promise<NegotiationResult> {
    // Find the active negotiation session for this agent
    let activeSession: NegotiationSession | undefined;
    for (const session of this.sessions.values()) {
      if (
        session.originalOffer.agentId === counterOffer.agentId &&
        session.status === 'negotiating'
      ) {
        activeSession = session;
        break;
      }
    }

    const originalCapabilities = activeSession?.originalOffer.capabilities || [];
    const hasOriginalCapability = counterOffer.capabilities.some((c) =>
      originalCapabilities.includes(c),
    );

    if (!hasOriginalCapability && activeSession) {
      activeSession.status = 'rejected';
      activeSession.rejectionReason = 'Counter-offer does not include any originally proposed capabilities';
      activeSession.updatedAt = Date.now();

      return {
        status: 'rejected',
        reason: 'Counter-offer does not include any originally proposed capabilities',
      };
    }

    const matchedCapabilities = counterOffer.capabilities.filter((c) =>
      this.localCapabilities.includes(c),
    );

    if (matchedCapabilities.length === 0) {
      return {
        status: 'rejected',
        reason: 'No matching capabilities in counter-offer',
      };
    }

    const matchedProtocols = counterOffer.protocols.filter((p) =>
      this.localProtocols.includes(p),
    );
    const agreedProtocol = matchedProtocols.length > 0
      ? matchedProtocols[0]
      : counterOffer.protocols[0];

    if (activeSession) {
      activeSession.status = 'agreed';
      activeSession.agreedCapabilities = matchedCapabilities;
      activeSession.agreedProtocol = agreedProtocol;
      activeSession.updatedAt = Date.now();
    }

    return {
      status: 'agreed',
      agreedCapabilities: matchedCapabilities,
      agreedProtocol,
    };
  }

  async agree(terms: CapabilityOffer): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.originalOffer.agentId === terms.agentId && session.status === 'negotiating') {
        session.status = 'agreed';
        session.agreedCapabilities = terms.capabilities;
        session.agreedProtocol = terms.protocols[0];
        session.updatedAt = Date.now();
        return;
      }
    }

    // Record agreement even without a prior session
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, {
      sessionId,
      originalOffer: terms,
      status: 'agreed',
      agreedCapabilities: terms.capabilities,
      agreedProtocol: terms.protocols[0],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  async reject(reason: string): Promise<void> {
    // Reject all active negotiation sessions
    for (const session of this.sessions.values()) {
      if (session.status === 'negotiating' || session.status === 'proposed') {
        session.status = 'rejected';
        session.rejectionReason = reason;
        session.updatedAt = Date.now();
      }
    }
  }

  getSessions(): Map<string, NegotiationSession> {
    return new Map(this.sessions);
  }
}
