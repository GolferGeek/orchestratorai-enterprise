import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { AgentRegistryService } from './agent-platform/services/agent-registry.service';
import { AgentRecord } from './agent-platform/interfaces/agent.interface';
import {
  DEFAULT_EXECUTION_CAPABILITIES,
  DEFAULT_EXECUTION_PROFILE,
  AgentExecutionProfile,
} from './agent-platform/types/agent-execution.types';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);
  private discoveredAgents: Array<{
    name: string;
    organizationSlug: string;
    type?: string;
    path?: string;
    organizationScopedPath?: string;
    metadata?: unknown;
  }> = [];
  private agentInstances: unknown[] = [];
  private agentRecords: Array<{
    agent: {
      name: string;
      organizationSlug?: string;
      type?: string;
      path?: string;
      organizationScopedPath?: string;
      serviceClass?: { name: string };
      metadata?: unknown;
    };
    instance: unknown;
  }> = [];

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  onModuleInit() {
    // Legacy file-based agent discovery removed
    // Now using agent-platform for all agent execution
    this.discoveredAgents = [];
    this.agentRecords = [];
    this.agentInstances = [];
  }

  getHello(): string {
    return 'NestJS A2A Agent Framework - Ready!';
  }

  async getAgentStatus(organizations?: string[]): Promise<unknown> {
    const filteredRecords = organizations?.length
      ? this.agentRecords.filter((record) =>
          record.agent?.organizationSlug
            ? organizations.includes(record.agent.organizationSlug)
            : true,
        )
      : this.agentRecords;

    const agentsWithDetails = await Promise.all(
      filteredRecords.map(async ({ agent, instance }) => {
        let agentCard = null;
        let executionModes = ['immediate'];
        let executionProfile = DEFAULT_EXECUTION_PROFILE;
        let executionCapabilities = { ...DEFAULT_EXECUTION_CAPABILITIES };

        try {
          if (
            instance &&
            typeof (instance as Record<string, unknown>).getAgentCard ===
              'function'
          ) {
            const cardRaw: unknown = await (
              instance as { getAgentCard: () => Promise<unknown> }
            ).getAgentCard();
            agentCard = cardRaw as Record<string, unknown>;

            const config = agentCard?.configuration as
              | Record<string, unknown>
              | undefined;
            if (config?.execution_modes) {
              const modes: unknown = config.execution_modes;
              if (Array.isArray(modes)) {
                executionModes = modes as string[];
              }
            }

            const execution = agentCard?.execution as
              | Record<string, unknown>
              | undefined;
            if (execution?.profile) {
              const profile: unknown = execution.profile;
              if (typeof profile === 'string') {
                executionProfile = profile as AgentExecutionProfile;
              }
            }

            if (execution?.capabilities) {
              const capabilities: unknown = execution.capabilities;
              if (
                capabilities &&
                typeof capabilities === 'object' &&
                !Array.isArray(capabilities)
              ) {
                executionCapabilities = {
                  ...executionCapabilities,
                  ...(capabilities as Record<string, unknown>),
                };
              }
            }
          }
        } catch {
          // Swallow agent-card errors; continue building status
        }

        const displayNameRaw: unknown = agentCard?.name;
        const descriptionRaw: unknown = agentCard?.description;

        return {
          id: this.generateAgentId(
            agent.name,
            agent.organizationScopedPath || agent.path || '',
          ),
          name: agent.name,
          displayName: displayNameRaw || agent.name,
          type: agent.type,
          organizationSlug: agent.organizationSlug ?? undefined,
          description:
            descriptionRaw ||
            `${agent.name} - A specialized agent for handling specific tasks`,
          serviceClass: agent.serviceClass?.name,
          hasInstance: !!instance,
          execution_modes: executionModes,
          execution_profile: executionProfile,
          execution_capabilities: executionCapabilities,
          metadata: agent.metadata,
        };
      }),
    );

    const databaseAgents = await this.loadDatabaseAgents(organizations);
    const databaseAgentStatuses = databaseAgents.map((record) =>
      this.mapDatabaseAgent(record),
    );

    const existingKeys = new Set(
      agentsWithDetails.map((agent) =>
        this.normalizeAgentIdentifier(
          agent.organizationSlug ?? null,
          agent.name,
        ),
      ),
    );

    const mergedAgents = [...agentsWithDetails];
    for (const agent of databaseAgentStatuses) {
      const key = this.normalizeAgentIdentifier(
        agent.organizationSlug ?? null,
        agent.name,
      );
      if (existingKeys.has(key)) {
        const index = mergedAgents.findIndex(
          (existing) =>
            this.normalizeAgentIdentifier(
              existing.organizationSlug ?? null,
              existing.name,
            ) === key,
        );
        if (index >= 0) {
          mergedAgents[index] = agent;
        }
        continue;
      }

      mergedAgents.push(agent);
      existingKeys.add(key);
    }

    const totalDiscovered = mergedAgents.length;
    const runningInstances = mergedAgents.filter(
      (agent) => agent.hasInstance,
    ).length;

    return {
      status: 'running',
      discoveredAgents: totalDiscovered,
      runningInstances,
      agents: mergedAgents,
    };
  }

  /**
   * Get discovered agents (for other services to access)
   */
  getDiscoveredAgents(): Array<{
    name: string;
    organizationSlug: string;
    type?: string;
    path?: string;
    organizationScopedPath?: string;
    metadata?: unknown;
  }> {
    return this.discoveredAgents;
  }

  getDiscoveredAgentsByOrganizations(organizations?: string[]): Array<{
    name: string;
    organizationSlug: string;
    type?: string;
    path?: string;
    organizationScopedPath?: string;
    metadata?: unknown;
  }> {
    if (!organizations || organizations.length === 0) {
      return this.discoveredAgents;
    }

    const allowed = new Set(organizations);
    return this.discoveredAgents.filter((agent) =>
      allowed.has(agent.organizationSlug),
    );
  }

  /**
   * Get agent instances (for other services to access)
   */
  getAgentInstances(): unknown[] {
    return this.agentInstances;
  }

  getAgentInstancesByOrganizations(organizations?: string[]): unknown[] {
    if (!organizations || organizations.length === 0) {
      return this.agentInstances;
    }

    const allowed = new Set(organizations);
    const filtered: unknown[] = [];

    this.discoveredAgents.forEach((agent, index) => {
      if (allowed.has(agent.organizationSlug)) {
        filtered.push(this.agentInstances[index] || null);
      }
    });

    return filtered;
  }

  private async loadDatabaseAgents(
    organizations?: string[],
  ): Promise<AgentRecord[]> {
    if (organizations && organizations.length > 0) {
      const normalized = organizations
        .map((org) => (org && org.trim().length ? org.trim() : null))
        .map((org) => (org === 'global' ? null : org));
      return this.agentRegistry.listAgentsForOrganizations(normalized);
    }

    return this.agentRegistry.listAllAgents();
  }

  private mapDatabaseAgent(record: AgentRecord) {
    const metadataObj = (record.metadata as Record<string, unknown>) || {};
    const agentCategory = metadataObj.agent_category as string | undefined;
    const isTool = agentCategory === 'tool';

    const supportedModesRaw = Array.isArray(metadataObj.supported_modes)
      ? (metadataObj.supported_modes as string[])
      : [];

    // Normalize organization_slug: database returns TEXT but code expects string[]
    const orgSlug = Array.isArray(record.organization_slug)
      ? record.organization_slug
      : record.organization_slug
        ? [record.organization_slug as unknown as string]
        : [];

    const supportedModes = supportedModesRaw.length
      ? supportedModesRaw
      : record.capabilities &&
          Array.isArray(record.capabilities) &&
          record.capabilities.includes('orchestrate')
        ? ['converse', 'plan', 'build']
        : ['converse', 'build'];

    // Use explicit execution_capabilities from metadata when present, otherwise derive from modes
    const dbCapabilities = metadataObj.execution_capabilities as
      | Record<string, boolean>
      | undefined;
    const executionCapabilities =
      dbCapabilities && typeof dbCapabilities === 'object'
        ? {
            can_converse:
              dbCapabilities.can_converse ??
              supportedModes.includes('converse'),
            can_plan:
              dbCapabilities.can_plan ?? supportedModes.includes('plan'),
            can_build:
              dbCapabilities.can_build ?? supportedModes.includes('build'),
            requires_human_gate:
              dbCapabilities.requires_human_gate ??
              (metadataObj.requires_human_gate === true ||
                metadataObj.human_gate === true),
          }
        : {
            can_converse: supportedModes.includes('converse'),
            can_plan: supportedModes.includes('plan'),
            can_build: supportedModes.includes('build'),
            requires_human_gate:
              metadataObj.requires_human_gate === true ||
              metadataObj.human_gate === true,
          };

    const executionModes = this.extractExecutionModes(record);

    const metadata = {
      organization_slug: record.organization_slug,
      source: 'database',
      agent_type: record.agent_type,
      mode_profile: metadataObj.mode_profile,
      version: record.version,
      status: metadataObj.status,
      config: metadataObj,
      context: record.context,
      agent_category: agentCategory,
      execution_modes: executionModes,
      // Custom UI fields for agents with specialized UIs (e.g., Marketing Swarm)
      hasCustomUI: metadataObj.hasCustomUI ?? false,
      customUIComponent: metadataObj.customUIComponent ?? null,
    };

    return {
      id: record.slug,
      name: record.slug,
      displayName: record.name,
      type: isTool ? 'tool' : record.agent_type,
      organizationSlug: orgSlug[0] || undefined,
      description: record.description,
      serviceClass: undefined,
      hasInstance: true,
      execution_modes: executionModes,
      execution_profile: this.deriveExecutionProfile(
        metadataObj.mode_profile as string,
      ),
      execution_capabilities: executionCapabilities,
      metadata,
      status: (metadataObj.status as string) ?? 'active',
      registeredAt: new Date(record.created_at),
      lastHeartbeat: new Date(record.updated_at),
      // Sovereign mode - when true, agent requires local LLM providers only
      require_local_model: record.require_local_model ?? false,
      // LLM config - used by frontend to set ExecutionContext provider/model
      llm_config: record.llm_config ?? null,
    };
  }

  private extractExecutionModes(record: AgentRecord): string[] {
    const modes = new Set<string>();

    const metadataObj = record.metadata as
      | (Record<string, unknown> & {
          execution_modes?: unknown;
          executionModes?: unknown;
        })
      | null
      | undefined;

    const configModes =
      metadataObj?.execution_modes ?? metadataObj?.executionModes;
    if (Array.isArray(configModes)) {
      for (const mode of configModes) {
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

  private normalizeAgentIdentifier(
    organizationSlug: string | null,
    name: string,
  ): string {
    const normalizedOrg = organizationSlug?.trim().length
      ? organizationSlug.trim().toLowerCase()
      : 'global';
    const normalizedName = (name ?? '').toLowerCase().replace(/[\s_-]+/g, '_');
    return `${normalizedOrg}::${normalizedName}`;
  }

  private deriveExecutionProfile(
    modeProfile: string | null,
  ):
    | 'conversation_only'
    | 'autonomous_build'
    | 'human_gate'
    | 'conversation_with_gate' {
    if (!modeProfile) {
      return 'conversation_only';
    }

    if (modeProfile.includes('orchestrator')) {
      return 'autonomous_build';
    }

    if (modeProfile.includes('human')) {
      return 'human_gate';
    }

    return 'conversation_only';
  }

  private generateAgentId(name: string, path: string): string {
    const normalizedName = (name ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');
    const normalizedPath = (path ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');
    return `${normalizedPath}_${normalizedName}`;
  }
}
