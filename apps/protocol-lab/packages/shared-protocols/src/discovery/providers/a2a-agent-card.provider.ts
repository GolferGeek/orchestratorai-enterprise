import { createSign } from 'crypto';
import { AgentCard } from '@agent-communication/shared-types';
import { IDiscoveryProvider } from '../discovery.interface';

interface A2ASecurityScheme {
  type: string;
  description: string;
  scheme?: string;
  bearerFormat?: string;
}

interface A2ASkill {
  id: string;
  name: string;
  description: string;
  inputModes: string[];
  outputModes: string[];
  examples: string[];
}

interface A2AAgentCardDocument {
  card: AgentCard;
  skills: A2ASkill[];
  capabilities: Record<string, unknown>;
  securitySchemes: Record<string, A2ASecurityScheme>;
  provider: Record<string, unknown>;
  signature?: string;
}

export class A2AAgentCardDiscoveryProvider implements IDiscoveryProvider {
  readonly providerId = 'a2a-agent-card';

  private knownAgents: Map<string, AgentCard> = new Map();

  async publishCard(card: AgentCard): Promise<void> {
    const enrichedCard = this.ensureA2AMetadata(card);
    this.knownAgents.set(enrichedCard.id, enrichedCard);
  }

  async discoverAgent(query: string): Promise<AgentCard | null> {
    try {
      const url = query.startsWith('http') ? query : `http://${query}`;
      const a2aCardUrl = `${url.replace(/\/$/, '')}/.well-known/agent-card.json`;
      const response = await fetch(a2aCardUrl);
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as A2AAgentCardDocument | AgentCard;
      const discovered = this.extractCard(payload);
      const enriched = this.ensureA2AMetadata(discovered);
      this.knownAgents.set(enriched.id, enriched);
      return enriched;
    } catch {
      const normalizedQuery = query.toLowerCase();
      for (const card of this.knownAgents.values()) {
        const byName = card.name.toLowerCase().includes(normalizedQuery);
        const byId = card.id.toLowerCase().includes(normalizedQuery);
        if (byName || byId) {
          return card;
        }
      }
      return null;
    }
  }

  async resolveCapabilities(agentId: string): Promise<AgentCard | null> {
    return this.knownAgents.get(agentId) ?? null;
  }

  async listKnownAgents(): Promise<AgentCard[]> {
    return Array.from(this.knownAgents.values());
  }

  createSignedCardDocument(card: AgentCard, privateKeyPem?: string): A2AAgentCardDocument {
    const enrichedCard = this.ensureA2AMetadata(card);
    const metadata = (enrichedCard.metadata ?? {}) as Record<string, unknown>;

    const skills = Array.isArray(metadata.skills) ? (metadata.skills as A2ASkill[]) : [];
    const capabilities =
      metadata.capabilities && typeof metadata.capabilities === 'object'
        ? (metadata.capabilities as Record<string, unknown>)
        : {};
    const securitySchemes =
      metadata.securitySchemes && typeof metadata.securitySchemes === 'object'
        ? (metadata.securitySchemes as Record<string, A2ASecurityScheme>)
        : {};
    const provider =
      metadata.provider && typeof metadata.provider === 'object'
        ? (metadata.provider as Record<string, unknown>)
        : {};

    const document: A2AAgentCardDocument = {
      card: enrichedCard,
      skills,
      capabilities,
      securitySchemes,
      provider,
    };

    if (!privateKeyPem) {
      return document;
    }

    const signer = createSign('RSA-SHA256');
    signer.update(JSON.stringify(document));
    signer.end();
    const signature = signer.sign(privateKeyPem, 'base64url');
    return { ...document, signature };
  }

  private extractCard(payload: A2AAgentCardDocument | AgentCard): AgentCard {
    const payloadRecord = payload as unknown as Record<string, unknown>;
    const nestedCard = payloadRecord.card;
    if (nestedCard && typeof nestedCard === 'object') {
      return nestedCard as AgentCard;
    }
    return payload as AgentCard;
  }

  private ensureA2AMetadata(card: AgentCard): AgentCard {
    const existingMetadata =
      card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
    const existingSkills = this.extractSkills(existingMetadata);
    const existingCapabilities = this.extractCapabilities(existingMetadata);
    const existingSecuritySchemes = this.extractSecuritySchemes(existingMetadata);
    const existingProvider = this.extractProvider(existingMetadata);

    return {
      ...card,
      metadata: {
        ...existingMetadata,
        skills: existingSkills,
        capabilities: existingCapabilities,
        securitySchemes: existingSecuritySchemes,
        provider: existingProvider,
      },
    };
  }

  private extractSkills(metadata: Record<string, unknown>): A2ASkill[] {
    const value = metadata.skills;
    if (Array.isArray(value)) {
      return value as A2ASkill[];
    }

    return cardCapabilitiesToSkills(metadata.capabilities);
  }

  private extractCapabilities(metadata: Record<string, unknown>): Record<string, unknown> {
    const value = metadata.capabilities;
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return {
      supportsStreaming: true,
      supportsAsyncPush: true,
      supportsUiNegotiation: true,
    };
  }

  private extractSecuritySchemes(
    metadata: Record<string, unknown>,
  ): Record<string, A2ASecurityScheme> {
    const value = metadata.securitySchemes;
    if (value && typeof value === 'object') {
      return value as Record<string, A2ASecurityScheme>;
    }
    return {
      oauth_jwt: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'OAuth 2.0 bearer token for A2A requests',
      },
    };
  }

  private extractProvider(metadata: Record<string, unknown>): Record<string, unknown> {
    const value = metadata.provider;
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return {
      protocol: 'A2A',
      version: '0.3',
    };
  }
}

function cardCapabilitiesToSkills(rawCapabilities: unknown): A2ASkill[] {
  if (!Array.isArray(rawCapabilities)) {
    return [];
  }

  return rawCapabilities
    .filter((item) => typeof item === 'object' && item !== null)
    .map((capability) => {
      const value = capability as Record<string, unknown>;
      return {
        id: String(value.id ?? 'unknown-skill'),
        name: String(value.name ?? 'Unknown Skill'),
        description: String(value.description ?? ''),
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        examples: [],
      };
    });
}
