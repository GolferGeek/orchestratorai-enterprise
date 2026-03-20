import { AgentCard } from '@agent-communication/shared-types';
import { IDiscoveryProvider } from '../discovery.interface';

interface OasfDescriptor {
  schema: 'agntcy-oasf-v1';
  ociArtifactRef: string;
  federationDomains: string[];
}

export class AgntcyOasfDiscoveryProvider implements IDiscoveryProvider {
  readonly providerId = 'agntcy-oasf';

  private cards = new Map<string, AgentCard>();

  async publishCard(card: AgentCard): Promise<void> {
    const descriptor: OasfDescriptor = {
      schema: 'agntcy-oasf-v1',
      ociArtifactRef: `oci://agntcy/${card.id}:${card.version}`,
      federationDomains: ['prairie-ridge.local', 'buildwell.local'],
    };
    const enriched: AgentCard = {
      ...card,
      metadata: {
        ...(card.metadata ?? {}),
        oasf: descriptor,
        interoperableDiscovery: ['a2a-agent-card', 'mcp'],
      },
    };
    this.cards.set(card.id, enriched);
  }

  async discoverAgent(query: string): Promise<AgentCard | null> {
    const normalized = query.toLowerCase();
    for (const card of this.cards.values()) {
      if (card.id.toLowerCase().includes(normalized) || card.name.toLowerCase().includes(normalized)) {
        return card;
      }
    }
    return null;
  }

  async resolveCapabilities(agentId: string): Promise<AgentCard | null> {
    return this.cards.get(agentId) ?? null;
  }

  async listKnownAgents(): Promise<AgentCard[]> {
    return Array.from(this.cards.values());
  }
}
