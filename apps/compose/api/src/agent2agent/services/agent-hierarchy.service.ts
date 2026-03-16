import { Injectable, Logger } from '@nestjs/common';
import { AgentRegistryService } from '../../agent-platform/services/agent-registry.service';
import { AgentRecord } from '../../agent-platform/interfaces/agent.interface';

@Injectable()
export class AgentHierarchyService {
  private readonly logger = new Logger(AgentHierarchyService.name);

  constructor(private readonly agentRegistry: AgentRegistryService) {}

  /**
   * Fetch database agents filtered by organization slugs
   */
  async fetchDatabaseAgents(organizations?: string[]): Promise<AgentRecord[]> {
    if (organizations && organizations.length > 0) {
      const normalized = organizations
        .map((org) => (org && org.trim().length ? org.trim() : null))
        .map((org) => (org === 'global' ? null : org));
      return this.agentRegistry.listAgentsForOrganizations(normalized);
    }

    return this.agentRegistry.listAllAgents();
  }

  /**
   * Build hierarchy structure from database agent records
   */
  buildDatabaseHierarchy(records: AgentRecord[]): unknown[] {
    if (!records.length) {
      return [];
    }

    // Group agents by organization (now an array)
    const grouped = new Map<string, AgentRecord[]>();
    for (const record of records) {
      const keys =
        record.organization_slug.length > 0
          ? record.organization_slug
          : ['global'];
      for (const key of keys) {
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(record);
      }
    }

    const createNode = (
      record: AgentRecord,
      children: unknown[] = [],
    ): unknown => {
      const metadataObj = (record.metadata as Record<string, unknown>) || {};
      const isTool = metadataObj.agent_category === 'tool';
      const isOrchestrator =
        record.capabilities.includes('orchestrate') || metadataObj.orchestrator;
      const category = isTool
        ? 'tool'
        : isOrchestrator
          ? 'orchestrator'
          : record.agent_type;
      const executionModes = this.extractExecutionModes(record);
      const orgSlug = record.organization_slug.join(',') || 'global';

      return {
        id: record.slug,
        name: record.slug,
        displayName: record.name,
        type: isTool ? 'tool' : record.agent_type,
        path: `db://${orgSlug}/${record.slug}`,
        relativePath: record.slug,
        organization: orgSlug,
        organizationPath: `db://${orgSlug}/${record.slug}`,
        execution_modes: executionModes.length > 0 ? executionModes : undefined,
        metadata: {
          description: record.description,
          version: record.version,
          category,
          agentType: record.agent_type,
          source: 'database',
          organization: orgSlug,
          isTool: isTool || undefined,
          isOrchestrator: isOrchestrator || undefined,
          // Expose execution fields from metadata for frontend
          execution_profile: metadataObj.execution_profile ?? undefined,
          execution_capabilities:
            metadataObj.execution_capabilities ?? undefined,
          execution_modes:
            executionModes.length > 0 ? executionModes : undefined,
        },
        children,
      };
    };

    const roots: unknown[] = [];

    grouped.forEach((agents, _orgKey) => {
      // Group agents by logical hierarchy based on naming patterns
      const orchestrators = agents.filter(
        (a) =>
          a.capabilities?.includes('orchestrate') ||
          ((a.metadata as Record<string, unknown>)?.orchestrator as boolean),
      );
      const nonOrchestrators = agents.filter(
        (a) =>
          !a.capabilities?.includes('orchestrate') &&
          !((a.metadata as Record<string, unknown>)?.orchestrator as boolean),
      );

      // Create orchestrator nodes with their related children
      orchestrators.forEach((orc) => {
        // Find children that belong to this orchestrator based on naming pattern
        const orcPrefix = orc.slug
          .replace('-orchestrator', '')
          .replace('_orchestrator', '');
        const children = nonOrchestrators
          .filter((agent) => {
            // Match agents with same prefix (e.g., "hiverarchy-*" for "hiverarchy-orchestrator")
            return (
              agent.slug.startsWith(orcPrefix + '-') ||
              agent.slug.startsWith(orcPrefix + '_')
            );
          })
          .map((child) => createNode(child));

        roots.push(createNode(orc, children));
      });

      // Add standalone agents (not belonging to any orchestrator)
      const standaloneAgents = nonOrchestrators.filter((agent) => {
        // Check if this agent belongs to any orchestrator
        return !orchestrators.some((orc) => {
          const orcPrefix = orc.slug
            .replace('-orchestrator', '')
            .replace('_orchestrator', '');
          return (
            agent.slug.startsWith(orcPrefix + '-') ||
            agent.slug.startsWith(orcPrefix + '_')
          );
        });
      });

      standaloneAgents.forEach((agent) => {
        roots.push(createNode(agent, []));
      });
    });

    return roots;
  }

  /**
   * Extract execution modes from agent record metadata
   */
  extractExecutionModes(record: AgentRecord): string[] {
    const modes = new Set<string>();

    const metadataObj = record.metadata as {
      execution_modes?: unknown;
      executionModes?: unknown;
    } | null;
    const configExecutionModes =
      metadataObj?.execution_modes ?? metadataObj?.executionModes;

    if (Array.isArray(configExecutionModes)) {
      for (const mode of configExecutionModes) {
        if (typeof mode === 'string' && mode.trim().length > 0) {
          modes.add(mode);
        }
      }
    }

    if (modes.size === 0) {
      modes.add('immediate');
    }

    return Array.from(modes);
  }
}
