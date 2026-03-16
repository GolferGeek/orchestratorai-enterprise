import * as crypto from 'crypto';
import { CapabilityOffer, NegotiationResult } from '@agent-communication/shared-types';
import { INegotiationProvider } from '../negotiation.interface';

type SessionStatus = 'proposed' | 'countered' | 'agreed' | 'rejected';

interface SkillNegotiationSession {
  sessionId: string;
  agentId: string;
  requestedCapabilities: string[];
  agreedCapabilities: string[];
  agreedProtocol?: string;
  status: SessionStatus;
  uiModes: string[];
  contentTypes: string[];
  reason?: string;
  createdAt: number;
  updatedAt: number;
}

export class A2ASkillNegotiationProvider implements INegotiationProvider {
  readonly providerId = 'a2a-skill-negotiation';

  private localCapabilities: string[] = [];
  private localProtocols: string[] = [];
  private localUiModes: string[] = ['iframe', 'video', 'web-form'];
  private localContentTypes: string[] = ['application/json', 'text/plain', 'text/markdown'];
  private sessions: Map<string, SkillNegotiationSession> = new Map();

  setLocalCapabilities(capabilities: string[]): void {
    this.localCapabilities = capabilities;
  }

  setLocalProtocols(protocols: string[]): void {
    this.localProtocols = protocols;
  }

  setLocalUiModes(uiModes: string[]): void {
    this.localUiModes = uiModes;
  }

  setLocalContentTypes(contentTypes: string[]): void {
    this.localContentTypes = contentTypes;
  }

  async proposeCapabilities(offer: CapabilityOffer): Promise<NegotiationResult> {
    const sessionId = crypto.randomUUID();
    const matchedCapabilities = offer.capabilities.filter((cap) =>
      this.localCapabilities.includes(cap),
    );

    const protocolCandidates = offer.protocols.filter((protocol) =>
      this.localProtocols.includes(protocol),
    );
    const agreedProtocol = protocolCandidates[0];

    const requestedUiModes = ['iframe', 'video', 'web-form'];
    const requestedContentTypes = ['application/json', 'text/plain', 'text/markdown'];
    const compatibleUiModes = requestedUiModes.filter((mode) =>
      this.localUiModes.includes(mode),
    );
    const compatibleContentTypes = requestedContentTypes.filter((type) =>
      this.localContentTypes.includes(type),
    );

    const createdAt = Date.now();

    if (matchedCapabilities.length === 0) {
      this.sessions.set(sessionId, {
        sessionId,
        agentId: offer.agentId,
        requestedCapabilities: offer.capabilities,
        agreedCapabilities: [],
        status: 'rejected',
        uiModes: compatibleUiModes,
        contentTypes: compatibleContentTypes,
        reason: 'No overlapping A2A skills',
        createdAt,
        updatedAt: createdAt,
      });

      return {
        status: 'rejected',
        reason: 'No overlapping A2A skills',
      };
    }

    if (agreedProtocol && compatibleUiModes.length > 0 && compatibleContentTypes.length > 0) {
      this.sessions.set(sessionId, {
        sessionId,
        agentId: offer.agentId,
        requestedCapabilities: offer.capabilities,
        agreedCapabilities: matchedCapabilities,
        agreedProtocol,
        status: 'agreed',
        uiModes: compatibleUiModes,
        contentTypes: compatibleContentTypes,
        createdAt,
        updatedAt: createdAt,
      });
      return {
        status: 'agreed',
        agreedCapabilities: matchedCapabilities,
        agreedProtocol,
      };
    }

    this.sessions.set(sessionId, {
      sessionId,
      agentId: offer.agentId,
      requestedCapabilities: offer.capabilities,
      agreedCapabilities: matchedCapabilities,
      status: 'countered',
      uiModes: compatibleUiModes.length > 0 ? compatibleUiModes : this.localUiModes,
      contentTypes:
        compatibleContentTypes.length > 0 ? compatibleContentTypes : this.localContentTypes,
      reason: 'Counter-offer required for protocol/UI/content-type alignment',
      createdAt,
      updatedAt: createdAt,
    });

    return {
      status: 'counter-offer',
      agreedCapabilities: matchedCapabilities,
      counterOffer: {
        agentId: 'local',
        capabilities: matchedCapabilities,
        protocols: this.localProtocols.length > 0 ? this.localProtocols : offer.protocols,
        pricing: {
          ...offer.pricing,
          __a2a: {
            model: 'free',
            amount: 0,
            currency: 'USD',
          },
        },
      },
    };
  }

  async negotiate(counterOffer: CapabilityOffer): Promise<NegotiationResult> {
    const openSession = this.findOpenSession(counterOffer.agentId);
    if (!openSession) {
      return {
        status: 'rejected',
        reason: 'No active A2A skill negotiation session found',
      };
    }

    const matchedCapabilities = counterOffer.capabilities.filter((capability) =>
      openSession.requestedCapabilities.includes(capability) &&
      this.localCapabilities.includes(capability),
    );
    if (matchedCapabilities.length === 0) {
      openSession.status = 'rejected';
      openSession.reason = 'Counter-offer removed all compatible A2A skills';
      openSession.updatedAt = Date.now();
      return {
        status: 'rejected',
        reason: openSession.reason,
      };
    }

    const agreedProtocol = counterOffer.protocols.find((protocol) =>
      this.localProtocols.includes(protocol),
    );
    if (!agreedProtocol) {
      openSession.status = 'rejected';
      openSession.reason = 'No compatible protocol in counter-offer';
      openSession.updatedAt = Date.now();
      return {
        status: 'rejected',
        reason: openSession.reason,
      };
    }

    openSession.status = 'agreed';
    openSession.agreedCapabilities = matchedCapabilities;
    openSession.agreedProtocol = agreedProtocol;
    openSession.updatedAt = Date.now();

    return {
      status: 'agreed',
      agreedCapabilities: matchedCapabilities,
      agreedProtocol,
    };
  }

  async agree(terms: CapabilityOffer): Promise<void> {
    const openSession = this.findOpenSession(terms.agentId);
    if (!openSession) {
      return;
    }

    openSession.status = 'agreed';
    openSession.agreedCapabilities = terms.capabilities.filter((capability) =>
      this.localCapabilities.includes(capability),
    );
    openSession.agreedProtocol = terms.protocols.find((protocol) =>
      this.localProtocols.includes(protocol),
    );
    openSession.updatedAt = Date.now();
  }

  async reject(reason: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.status === 'proposed' || session.status === 'countered') {
        session.status = 'rejected';
        session.reason = reason;
        session.updatedAt = Date.now();
      }
    }
  }

  getSessions(): SkillNegotiationSession[] {
    return Array.from(this.sessions.values());
  }

  private findOpenSession(agentId: string): SkillNegotiationSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.agentId === agentId && (session.status === 'proposed' || session.status === 'countered')) {
        return session;
      }
    }
    return undefined;
  }
}
