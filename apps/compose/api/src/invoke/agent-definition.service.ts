/**
 * Agent Definition Service V2
 *
 * Resolves agent definitions from the database.
 * Bridges the current agent table to the v2 definition model.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import type { DatabaseService } from '@orchestrator-ai/transport-types';
import type { AgentDefinitionV2, AgentFamily } from './agent-definition.types';
import type { OutputType } from '@orchestrator-ai/transport-types';

@Injectable()
export class AgentDefinitionService {
  private readonly logger = new Logger(AgentDefinitionService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Resolve an agent definition by slug and org.
   */
  async resolve(
    agentSlug: string,
    orgSlug: string,
  ): Promise<AgentDefinitionV2 | null> {
    const queryResult: {
      data: Record<string, unknown> | null;
      error: unknown;
    } = await this.db
      .from(null, 'agents')
      .select('*')
      .eq('slug', agentSlug)
      .eq('organization_slug', orgSlug)
      .eq('status', 'active')
      .single();
    const { data, error } = queryResult;

    if (error || !data) {
      // Try global (no org) agent
      const globalResult = await this.db
        .from(null, 'agents')
        .select('*')
        .eq('slug', agentSlug)
        .is('organization_slug', null)
        .eq('status', 'active')
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
   * Map a database row to AgentDefinitionV2.
   */
  private mapToV2(row: Record<string, unknown>): AgentDefinitionV2 {
    const agentType = this.normalizeFamily(row.agent_type as string);
    const llmConfig = row.llm_config as Record<string, unknown> | undefined;

    return {
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      description: row.description as string | undefined,
      agentType,
      status: (row.status as AgentDefinitionV2['status']) || 'active',
      context: row.context as string | undefined,
      llmConfig: llmConfig
        ? {
            provider: llmConfig.provider as string | undefined,
            model: llmConfig.model as string | undefined,
            temperature: llmConfig.temperature as number | undefined,
            maxTokens: llmConfig.maxTokens as number | undefined,
          }
        : undefined,
      outputType: (row.output_type as OutputType) || 'text',
      orgSlug: row.organization_slug as string | undefined,
      // Family-specific
      collectionSlug: row.collection_slug as string | undefined,
      endpoint: row.endpoint as string | undefined,
      authConfig: row.auth_config as Record<string, unknown> | undefined,
      externalCard: row.external_card as Record<string, unknown> | undefined,
      mediaConfig: row.media_config as Record<string, unknown> | undefined,
    };
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
