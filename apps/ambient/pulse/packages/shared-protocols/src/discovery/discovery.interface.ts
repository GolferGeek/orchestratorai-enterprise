import { AgentCard } from '@agent-communication/shared-types';

export interface IDiscoveryProvider {
  readonly providerId: string;

  publishCard(card: AgentCard): Promise<void>;
  discoverAgent(query: string): Promise<AgentCard | null>;
  resolveCapabilities(agentId: string): Promise<AgentCard | null>;
  listKnownAgents(): Promise<AgentCard[]>;
}
