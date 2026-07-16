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

@Injectable()
export class AgentDefinitionService {
  private readonly logger = new Logger(AgentDefinitionService.name);
  private readonly hiddenAgentSlugs = new Set([
    'extended-post-writer',
    'hr-assistant-langgraph',
    'investment-risk-agent',
    'us-tech-stocks',
    'video-generator',
    'cad-agent',
  ]);
  private readonly workflowAgentSlugs = new Set([
    'marketing-swarm',
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
      error: { message?: string } | null;
    } = await this.db
      .from(null, 'agents')
      .select('*')
      .eq('slug', agentSlug)
      .contains('organization_slug', [orgSlug])
      .single();
    const { data, error } = queryResult;

    if (error || !data) {
      // Try global agent (organization_slug contains 'global')
      const globalResult = await this.db
        .from(null, 'agents')
        .select('*')
        .eq('slug', agentSlug)
        .contains('organization_slug', ['global'])
        .single();

      if (globalResult.error || !globalResult.data) {
        this.logger.warn(`Agent not found: ${agentSlug} (org: ${orgSlug})`);
        return null;
      }

      return this.mapToV2(globalResult.data as Record<string, unknown>);
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
      if (!result.data) return;
      const rows = Array.isArray(result.data) ? result.data : [result.data];
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        const slug = row.slug as string;
        if (!this.isExcludedFromAgentsCatalog(slug) && !seen.has(slug)) {
          seen.add(slug);
          agents.push(this.mapToV2(row));
        }
      }
    };

    // Super-admin or no org filter → return all agents
    if (!orgSlug || orgSlug === '*') {
      addRows(
        await this.db.from(null, 'agents').select('*'),
      );
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
   * Map a database row to AgentDefinition.
   */
  private mapToV2(row: Record<string, unknown>): AgentDefinition {
    const agentType = this.normalizeFamily(row.agent_type as string);
    const llmConfig = row.llm_config as Record<string, unknown> | undefined;
    const llmParameters = llmConfig?.parameters as
      | Record<string, unknown>
      | undefined;
    const metadata = row.metadata as Record<string, unknown> | undefined;
    const ragConfig = metadata?.rag_config as
      | Record<string, unknown>
      | undefined;
    const mediaType = metadata?.mediaType as string | undefined;
    const outputType =
      (row.output_type as OutputType | undefined) ??
      (mediaType === 'image' || mediaType === 'video'
        ? (mediaType as OutputType)
        : 'text');
    const mediaConfig =
      (row.media_config as Record<string, unknown> | undefined) ??
      (mediaType
        ? {
            type: mediaType,
            defaultProvider: metadata?.defaultProvider,
            defaultModel: metadata?.defaultModel,
          }
        : undefined);

    return {
      id: row.slug as string,
      slug: row.slug as string,
      name: row.name as string,
      description: row.description as string | undefined,
      agentType,
      status: 'active',
      context: row.context as string | undefined,
      llmConfig: llmConfig
        ? {
            provider: llmConfig.provider as string | undefined,
            model: llmConfig.model as string | undefined,
            temperature: (llmConfig.temperature ??
              llmParameters?.temperature) as number | undefined,
            maxTokens: (llmConfig.maxTokens ?? llmParameters?.maxTokens) as
              | number
              | undefined,
          }
        : undefined,
      outputType,
      orgSlug: Array.isArray(row.organization_slug)
        ? (row.organization_slug as string[])[0]
        : (row.organization_slug as string | undefined),
      // Family-specific
      collectionSlug: ragConfig?.collection_slug as string | undefined,
      endpoint: row.endpoint as string | undefined,
      authConfig: row.auth_config as Record<string, unknown> | undefined,
      externalCard: row.external_card as Record<string, unknown> | undefined,
      mediaConfig,
    };
  }

  private isExcludedFromAgentsCatalog(slug: string): boolean {
    return this.hiddenAgentSlugs.has(slug) || this.workflowAgentSlugs.has(slug);
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
        this.logger.warn(
          `Unknown agent type '${agentType}', defaulting to 'context'`,
        );
        return 'context';
    }
  }
}
