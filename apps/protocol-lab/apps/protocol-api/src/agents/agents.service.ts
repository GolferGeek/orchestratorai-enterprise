import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AgentCard, AgentInfo, AgentStatus } from '@agent-communication/shared-types';
import { getAuthHeaders , getAuthHeadersAsync } from '@agent-communication/shared-protocols';
import { WsService } from '../ws/ws.service';

@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);
  private agents: Map<string, AgentInfo> = new Map();

  constructor(private readonly wsService: WsService) {}

  async onModuleInit(): Promise<void> {
    // Attempt discovery of known agent services on startup
    const knownAgents = [
      { name: 'ResearchHub', url: 'http://localhost:6403' },
      { name: 'MarketPulse', url: 'http://localhost:6404' },
      { name: 'Prairie Ridge Credit', url: 'http://localhost:6407' },
      { name: 'BuildWell Manufacturing', url: 'http://localhost:6408' },
    ];

    for (const agent of knownAgents) {
      this.logger.log(`Attempting to discover ${agent.name} at ${agent.url}...`);
      try {
        const card = await this.fetchAgentCard(agent.url);
        if (card) {
          this.registerAgent(card);
          this.logger.log(`Discovered ${agent.name}: ${card.id}`);
        }
      } catch (error) {
        this.logger.warn(
          `Could not discover ${agent.name} at ${agent.url} — not running yet`,
        );
      }
    }
  }

  private async fetchAgentCard(baseUrl: string): Promise<AgentCard | null> {
    const wellKnownUrl = `${baseUrl.replace(/\/$/, '')}/.well-known/agent.json`;
    const response = await fetch(wellKnownUrl, { headers: (await getAuthHeadersAsync()) });
    if (!response.ok) {
      throw new Error(`Failed to fetch agent card: ${response.status}`);
    }
    return (await response.json()) as AgentCard;
  }

  private registerAgent(card: AgentCard): void {
    const info: AgentInfo = {
      card,
      status: 'online',
      lastHeartbeat: new Date().toISOString(),
      messagesReceived: 0,
      messagesSent: 0,
    };
    this.agents.set(card.id, info);

    this.wsService.broadcastAgentStatus({
      agentId: card.id,
      name: card.name,
      status: 'online',
    });
  }

  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): AgentInfo | undefined {
    return this.agents.get(id);
  }

  async discoverAgent(url: string): Promise<AgentInfo> {
    this.logger.log(`Discovering agent at ${url}...`);
    const card = await this.fetchAgentCard(url);
    if (!card) {
      throw new Error(`No agent card found at ${url}`);
    }

    this.registerAgent(card);
    return this.agents.get(card.id)!;
  }

  updateHeartbeat(agentId: string): AgentInfo | undefined {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return undefined;
    }

    agent.lastHeartbeat = new Date().toISOString();
    agent.status = 'online';

    this.wsService.broadcastAgentStatus({
      agentId,
      name: agent.card.name,
      status: 'online',
      lastHeartbeat: agent.lastHeartbeat,
    });

    return agent;
  }

  getAgentStatus(agentId: string): AgentStatus | undefined {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    return agent.status;
  }

  incrementMessagesSent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.messagesSent++;
    }
  }

  incrementMessagesReceived(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.messagesReceived++;
    }
  }
}
