/**
 * Agent Definition Service
 *
 * Resolves agent definitions from the database.
 * Bridges the current agent table to the definition model.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import type { DatabaseService } from '@orchestrator-ai/transport-types';
import type { AgentDefinition, AgentFamily } from './agent-definition.types';
import type { OutputType } from '@orchestrator-ai/transport-types';

const AGENT_STATUSES = new Set(['draft', 'active', 'disabled', 'archived']);

export interface WorkflowDefinition {
  slug: string;
  name: string;
  description?: string;
  status: string;
  orgSlug?: string;
}

@Injectable()
export class AgentDefinitionService {
  private readonly logger = new Logger(AgentDefinitionService.name);
  private readonly hiddenAgentSlugs = new Set([
    'extended-post-writer',
    'hr-assistant-langgraph',
    'investment-risk-agent',
    'us-tech-stocks',
    'cad-agent',
    'legal-department',
  ]);
  private readonly workflowAgentSlugs = new Set(['marketing-swarm']);
  private readonly composeCatalogAgentTypes = new Set([
    'context',
    'rag',
    'api',
    'external',
    'media',
  ]);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Resolve an agent definition by slug and org.
   * organization_slug is a text[] array in the database.
   */
  async resolve(
    agentSlug: string,
    orgSlug: string,
  ): Promise<AgentDefinition | null> {
    if (this.isExcludedFromAgentsCatalog(agentSlug)) {
      this.logger.warn(`Slug is not owned by the Agents module: ${agentSlug}`);
      return null;
    }

    // Try org-specific match (array contains orgSlug)
    const queryResult: {
      data: Record<string, unknown> | null;
      error: { message?: string; code?: string } | null;
    } = await this.db
      .from(null, 'agents')
      .select('*')
      .eq('slug', agentSlug)
      .contains('organization_slug', [orgSlug])
      .single();
    const { data, error } = queryResult;

    if (error && error.code !== 'PGRST116') {
      throw new Error(
        `Failed to resolve agent ${agentSlug}: ${error.message ?? 'unknown database error'}`,
      );
    }

    if (!data) {
      // Global is a deliberate scope, not an error fallback.
      const globalResult = await this.db
        .from(null, 'agents')
        .select('*')
        .eq('slug', agentSlug)
        .contains('organization_slug', ['global'])
        .single();

      if (
        globalResult.error &&
        (globalResult.error as { code?: string }).code !== 'PGRST116'
      ) {
        throw new Error(
          `Failed to resolve global agent ${agentSlug}: ${globalResult.error.message ?? 'unknown database error'}`,
        );
      }

      if (!globalResult.data) {
        this.logger.warn(`Agent not found: ${agentSlug} (org: ${orgSlug})`);
        return null;
      }

      const globalRow = globalResult.data as Record<string, unknown>;
      if (this.isExcludedFromAgentsCatalogRow(globalRow)) {
        this.logger.warn(`Agent is hidden or disabled: ${agentSlug}`);
        return null;
      }

      return this.mapToV2(globalRow);
    }

    if (this.isExcludedFromAgentsCatalogRow(data)) {
      this.logger.warn(`Agent is hidden or disabled: ${agentSlug}`);
      return null;
    }

    return this.mapToV2(data);
  }

  /**
   * List agents. When orgSlug is '*' or absent, returns all agents.
   * Otherwise returns agents for that org + global agents.
   * organization_slug is a text[] array in the database.
   */
  async listAgents(orgSlug?: string): Promise<AgentDefinition[]> {
    const seen = new Set<string>();
    const agents: AgentDefinition[] = [];

    const addRows = (result: {
      data: unknown;
      error: { message?: string } | null;
    }) => {
      if (result.error) {
        throw new Error(
          `Failed to query agents: ${result.error.message ?? 'unknown database error'}`,
        );
      }
      if (!Array.isArray(result.data)) {
        throw new Error('Failed to query agents: invalid database response');
      }
      const rows = result.data;
      for (const r of rows) {
        const row = this.requireRecord(r, 'agent');
        const slug = this.requireString(row.slug, 'agent.slug');
        if (!this.isExcludedFromAgentsCatalogRow(row) && !seen.has(slug)) {
          seen.add(slug);
          agents.push(this.mapToV2(row));
        }
      }
    };

    // Super-admin or no org filter → return all agents
    if (!orgSlug || orgSlug === '*') {
      addRows(await this.db.from(null, 'agents').select('*'));
      return agents;
    }

    // Org-specific agents
    addRows(
      await this.db
        .from(null, 'agents')
        .select('*')
        .contains('organization_slug', [orgSlug]),
    );

    // Global agents
    addRows(
      await this.db
        .from(null, 'agents')
        .select('*')
        .contains('organization_slug', ['global']),
    );

    return agents;
  }

  /**
   * List workflow agents for the Workflows product sidebar.
   * Inverse of the Agents catalog: only slugs in workflowAgentSlugs.
   */
  async listWorkflows(orgSlug?: string): Promise<WorkflowDefinition[]> {
    const seen = new Set<string>();
    const workflows: WorkflowDefinition[] = [];

    const addRows = (result: {
      data: unknown;
      error: { message?: string } | null;
    }) => {
      if (result.error) {
        throw new Error(
          `Failed to query workflows: ${result.error.message ?? 'unknown database error'}`,
        );
      }
      if (!Array.isArray(result.data)) {
        throw new Error('Failed to query workflows: invalid database response');
      }
      const rows = result.data;
      for (const r of rows) {
        const row = this.requireRecord(r, 'workflow');
        const slug = this.requireString(row.slug, 'workflow.slug');
        if (!this.workflowAgentSlugs.has(slug) || seen.has(slug)) continue;
        seen.add(slug);
        workflows.push(this.mapWorkflowRow(row));
      }
    };

    const slugList = Array.from(this.workflowAgentSlugs);

    if (!orgSlug || orgSlug === '*') {
      addRows(
        await this.db.from(null, 'agents').select('*').in('slug', slugList),
      );
      return workflows;
    }

    addRows(
      await this.db
        .from(null, 'agents')
        .select('*')
        .in('slug', slugList)
        .contains('organization_slug', [orgSlug]),
    );

    addRows(
      await this.db
        .from(null, 'agents')
        .select('*')
        .in('slug', slugList)
        .contains('organization_slug', ['global']),
    );

    return workflows;
  }

  private mapWorkflowRow(row: Record<string, unknown>): WorkflowDefinition {
    const metadata = this.requireRecord(row.metadata, 'workflow.metadata');
    return {
      slug: this.requireString(row.slug, 'workflow.slug'),
      name: this.requireString(row.name, 'workflow.name'),
      description:
        row.description === undefined || row.description === null
          ? undefined
          : this.requireString(row.description, 'workflow.description'),
      status: this.requireAgentStatus(
        metadata.status,
        'workflow.metadata.status',
      ),
      orgSlug: this.requireOrganizationSlug(row.organization_slug),
    };
  }

  /**
   * Map a database row to AgentDefinition.
   */
  private mapToV2(row: Record<string, unknown>): AgentDefinition {
    const slug = this.requireString(row.slug, 'agent.slug');
    const agentType = this.normalizeFamily(
      this.requireString(row.agent_type, 'agent.agent_type'),
    );
    const metadata = this.requireRecord(row.metadata, 'agent.metadata');
    const status = this.requireAgentStatus(
      metadata.status,
      'agent.metadata.status',
    );
    const llmConfig = this.parseLlmConfig(row.llm_config);
    const familyConfig = this.parseFamilyConfig(agentType, row, metadata);

    return {
      id: slug,
      slug,
      name: this.requireString(row.name, 'agent.name'),
      description: this.requireOptionalString(
        row.description,
        'agent.description',
      ),
      agentType,
      status,
      context: this.requireString(row.context, 'agent.context'),
      llmConfig,
      outputType: this.resolveOutputType(agentType, metadata),
      orgSlug: this.requireOrganizationSlug(row.organization_slug),
      ...familyConfig,
    };
  }

  private parseLlmConfig(
    value: unknown,
  ): AgentDefinition['llmConfig'] | undefined {
    if (value === undefined || value === null) return undefined;
    const config = this.requireRecord(value, 'agent.llm_config');
    const parameters =
      config.parameters === undefined || config.parameters === null
        ? undefined
        : this.requireRecord(config.parameters, 'agent.llm_config.parameters');
    const provider = this.requireOptionalString(
      config.provider,
      'agent.llm_config.provider',
    );
    const model = this.requireOptionalString(
      config.model,
      'agent.llm_config.model',
    );
    const temperature = this.requireOptionalFiniteNumber(
      config.temperature ?? parameters?.temperature,
      'agent.llm_config.temperature',
    );
    const maxTokens = this.requireOptionalPositiveInteger(
      config.maxTokens ?? parameters?.maxTokens,
      'agent.llm_config.maxTokens',
    );
    if (
      provider === undefined &&
      model === undefined &&
      temperature === undefined &&
      maxTokens === undefined
    ) {
      return undefined;
    }
    return { provider, model, temperature, maxTokens };
  }

  private parseFamilyConfig(
    agentType: AgentFamily,
    row: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ): Pick<
    AgentDefinition,
    | 'collectionSlug'
    | 'endpoint'
    | 'authConfig'
    | 'externalCard'
    | 'mediaConfig'
  > {
    if (agentType === 'rag') {
      const ragConfig = this.requireRecord(
        metadata.rag_config,
        'agent.metadata.rag_config',
      );
      return {
        collectionSlug: this.requireString(
          ragConfig.collection_slug,
          'agent.metadata.rag_config.collection_slug',
        ),
      };
    }
    if (agentType === 'api') {
      const endpoint = this.requireRecord(row.endpoint, 'agent.endpoint');
      return {
        endpoint: this.requireString(endpoint.url, 'agent.endpoint.url'),
      };
    }
    if (agentType === 'external') {
      return {
        externalCard: this.requireRecord(
          metadata.externalCard,
          'agent.metadata.externalCard',
        ),
      };
    }
    if (agentType === 'media') {
      const mediaType = this.requireMediaType(metadata.mediaType);
      return {
        mediaConfig: {
          type: mediaType,
          ...(metadata.duration === undefined
            ? {}
            : { duration: metadata.duration }),
          ...(metadata.aspectRatio === undefined
            ? {}
            : { aspectRatio: metadata.aspectRatio }),
          ...(metadata.resolution === undefined
            ? {}
            : { resolution: metadata.resolution }),
          ...(metadata.generateAudio === undefined
            ? {}
            : { generateAudio: metadata.generateAudio }),
        },
      };
    }
    return {};
  }

  private resolveOutputType(
    agentType: AgentFamily,
    metadata: Record<string, unknown>,
  ): OutputType {
    if (agentType === 'media') {
      return this.requireMediaType(metadata.mediaType);
    }
    return agentType === 'api' ? 'json' : 'text';
  }

  private isExcludedFromAgentsCatalog(slug: string): boolean {
    return this.hiddenAgentSlugs.has(slug) || this.workflowAgentSlugs.has(slug);
  }

  private isExcludedFromAgentsCatalogRow(
    row: Record<string, unknown>,
  ): boolean {
    const slug = this.requireString(row.slug, 'agent.slug');
    const metadata = this.requireRecord(row.metadata, 'agent.metadata');
    const agentType = this.requireString(
      row.agent_type,
      'agent.agent_type',
    ).toLowerCase();
    const catalogAgentType = agentType
      .replace('-runner', '')
      .replace('_runner', '');
    const status = this.requireAgentStatus(
      metadata.status,
      'agent.metadata.status',
    );
    if (
      metadata.hidden !== undefined &&
      metadata.hidden !== null &&
      typeof metadata.hidden !== 'boolean'
    ) {
      throw new Error('agent.metadata.hidden must be a boolean');
    }

    return (
      this.isExcludedFromAgentsCatalog(slug) ||
      !this.composeCatalogAgentTypes.has(catalogAgentType) ||
      status !== 'active' ||
      metadata.hidden === true
    );
  }

  /**
   * Normalize agent type strings to v2 family names.
   */
  private normalizeFamily(agentType: string): AgentFamily {
    const normalized = agentType
      ?.toLowerCase()
      .replace('-runner', '')
      .replace('_runner', '');
    switch (normalized) {
      case 'context':
        return 'context';
      case 'rag':
        return 'rag';
      case 'api':
        return 'api';
      case 'external':
        return 'external';
      case 'media':
      case 'image':
        return 'media';
      default:
        throw new Error(`Unsupported agent type '${agentType}'`);
    }
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${field} must be a non-empty string`);
    }
    return value;
  }

  private requireOptionalString(
    value: unknown,
    field: string,
  ): string | undefined {
    if (value === undefined || value === null) return undefined;
    return this.requireString(value, field);
  }

  private requireRecord(
    value: unknown,
    field: string,
  ): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`${field} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private requireAgentStatus(
    value: unknown,
    field: string,
  ): AgentDefinition['status'] {
    const status = this.requireString(value, field);
    if (!AGENT_STATUSES.has(status)) {
      throw new Error(`${field} is invalid`);
    }
    return status as AgentDefinition['status'];
  }

  private requireOrganizationSlug(value: unknown): string {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        throw new Error('agent.organization_slug must not be empty');
      }
      for (const item of value) {
        this.requireString(item, 'agent.organization_slug');
      }
      return value[0] as string;
    }
    return this.requireString(value, 'agent.organization_slug');
  }

  private requireMediaType(value: unknown): 'image' | 'video' {
    if (value !== 'image' && value !== 'video') {
      throw new Error("agent.metadata.mediaType must be 'image' or 'video'");
    }
    return value;
  }

  private requireOptionalFiniteNumber(
    value: unknown,
    field: string,
  ): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number`);
    }
    return value;
  }

  private requireOptionalPositiveInteger(
    value: unknown,
    field: string,
  ): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (!Number.isInteger(value) || (value as number) <= 0) {
      throw new Error(`${field} must be a positive integer`);
    }
    return value as number;
  }
}
