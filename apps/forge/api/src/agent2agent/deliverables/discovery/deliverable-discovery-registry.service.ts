import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { IDeliverableDiscovery } from '../deliverable-discovery.interface';
import { MarketingSwarmDiscoveryService } from './marketing-swarm-discovery.service';
import { CadAgentDiscoveryService } from './cad-agent-discovery.service';
import { LegalDepartmentDiscoveryService } from './legal-department-discovery.service';

/**
 * Registry for deliverable discovery services
 *
 * Allows registration of discovery methods for agents that store deliverables
 * outside the standard deliverables table. Discovery methods are automatically
 * invoked when querying deliverables for conversations.
 */
@Injectable()
export class DeliverableDiscoveryRegistry implements OnModuleInit {
  private readonly logger = new Logger(DeliverableDiscoveryRegistry.name);
  private readonly discoveries = new Map<string, IDeliverableDiscovery>();
  private readonly discoveriesByAgentType = new Map<
    string,
    IDeliverableDiscovery[]
  >();

  constructor(
    // Inject discovery services - they'll be auto-registered
    @Optional()
    private readonly marketingSwarmDiscovery?: MarketingSwarmDiscoveryService,
    @Optional() private readonly cadAgentDiscovery?: CadAgentDiscoveryService,
    @Optional()
    private readonly legalDepartmentDiscovery?: LegalDepartmentDiscoveryService,
  ) {}

  onModuleInit() {
    // Auto-register discovery services if they're injected
    if (this.marketingSwarmDiscovery) {
      this.register(this.marketingSwarmDiscovery);
    }
    if (this.cadAgentDiscovery) {
      this.register(this.cadAgentDiscovery);
    }

    if (this.legalDepartmentDiscovery) {
      this.register(this.legalDepartmentDiscovery);
    }

    this.logger.log(
      `Deliverable discovery registry initialized with ${this.discoveries.size} discovery service(s)`,
    );
  }

  /**
   * Register a discovery service
   */
  register(discovery: IDeliverableDiscovery): void {
    this.discoveries.set(discovery.agentSlug, discovery);

    // Also index by agent type for efficient lookup
    for (const agentType of discovery.agentTypes) {
      if (!this.discoveriesByAgentType.has(agentType)) {
        this.discoveriesByAgentType.set(agentType, []);
      }
      this.discoveriesByAgentType.get(agentType)?.push(discovery);
    }

    this.logger.log(
      `Registered deliverable discovery for agent: ${discovery.agentSlug} (types: ${discovery.agentTypes.join(', ')})`,
    );
  }

  /**
   * Get discovery service by agent slug
   */
  getByAgentSlug(agentSlug: string): IDeliverableDiscovery | undefined {
    return this.discoveries.get(agentSlug);
  }

  /**
   * Get all discovery services for a specific agent type
   */
  getByAgentType(agentType: string): IDeliverableDiscovery[] {
    return this.discoveriesByAgentType.get(agentType) || [];
  }

  /**
   * Get all registered discovery services
   */
  getAll(): IDeliverableDiscovery[] {
    return Array.from(this.discoveries.values());
  }

  /**
   * Discover deliverables for a conversation using all applicable discovery methods
   * @param conversationId - The conversation ID
   * @param userId - The user ID
   * @param agentName - Optional agent name to filter discovery methods
   * @param agentType - Optional agent type to filter discovery methods
   */
  async discoverAll(
    conversationId: string,
    userId: string,
    agentName?: string,
    agentType?: string,
  ): Promise<
    Array<{
      discovery: IDeliverableDiscovery;
      deliverables: Awaited<
        ReturnType<IDeliverableDiscovery['discoverDeliverables']>
      >;
    }>
  > {
    const discoveriesToUse: IDeliverableDiscovery[] = [];

    if (agentName) {
      // If agent name specified, use that specific discovery
      const discovery = this.getByAgentSlug(agentName);
      if (discovery) {
        discoveriesToUse.push(discovery);
      }
    } else if (agentType) {
      // If agent type specified, use all discoveries for that type
      discoveriesToUse.push(...this.getByAgentType(agentType));
    } else {
      // Otherwise, try all discovery methods
      discoveriesToUse.push(...this.getAll());
    }

    // Execute all discovery methods in parallel
    const results = await Promise.all(
      discoveriesToUse.map(async (discovery) => {
        try {
          const deliverables = await discovery.discoverDeliverables(
            conversationId,
            userId,
          );
          return { discovery, deliverables };
        } catch (error) {
          this.logger.error(
            `Discovery failed for ${discovery.agentSlug}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return { discovery, deliverables: [] };
        }
      }),
    );

    return results;
  }
}
