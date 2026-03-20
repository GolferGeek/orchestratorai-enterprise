import { AgentCard } from '@agent-communication/shared-types';
import { IDiscoveryProvider } from '../discovery.interface';

export class WellKnownDiscoveryProvider implements IDiscoveryProvider {
  readonly providerId = 'well-known';

  private knownAgents: Map<string, AgentCard> = new Map();

  async publishCard(card: AgentCard): Promise<void> {
    this.knownAgents.set(card.id, card);
  }

  async discoverAgent(query: string): Promise<AgentCard | null> {
    // Try to fetch .well-known/agent.json from the query URL
    try {
      const url = query.startsWith('http') ? query : `http://${query}`;
      const wellKnownUrl = `${url.replace(/\/$/, '')}/.well-known/agent.json`;
      const response = await fetch(wellKnownUrl);
      if (!response.ok) return null;
      const card = (await response.json()) as AgentCard;
      this.knownAgents.set(card.id, card);
      return card;
    } catch {
      // Check local known agents by name
      for (const card of this.knownAgents.values()) {
        if (card.name.toLowerCase().includes(query.toLowerCase()) ||
            card.id.toLowerCase().includes(query.toLowerCase())) {
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
}
