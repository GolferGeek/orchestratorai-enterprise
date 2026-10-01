import { BadRequestException, Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { AgentDefinitionService } from '../../agents/invoke/agent-definition.service';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestratorai/planes/database';

type DbError = { message: string } | null;

export interface AgentDefinition {
  slug: string;
  name: string;
  description: string;
  agentType: string;
  product: string;
  orgSlug: string;
  config: Record<string, unknown>;
  /** The model the agent runs on (agents.llm_config), when it has one. */
  llmConfig: { provider: string; model: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentListResponse {
  agents: AgentDefinition[];
  sources: string[];
}

export interface AgentDetailResponse {
  agent: AgentDefinition;
  source: string;
}

export interface AgentConfigUpdateDto {
  config: Record<string, unknown>;
}

export interface AgentModelUpdateDto {
  provider: string;
  model: string;
}

export interface AgentStats {
  slug: string;
  product: string;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  averageDurationMs: number;
  lastRunAt: string | null;
}

export interface AgentStatsResponse {
  stats: AgentStats[];
  sources: string[];
}

/**
 * AgentRegistryService — reads agent registry data directly from the database.
 *
 * No fallbacks: errors from database queries are propagated.
 */
@Injectable()
export class AgentRegistryService {
  private readonly logger = new Logger(AgentRegistryService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly definitions: AgentDefinitionService,
  ) {}

  async listAgents(): Promise<AgentListResponse> {
    this.logger.log('[AgentRegistry] Fetching agents from database');

    const result = (await this.db
      .from(null, 'agents')
      .select('*')
      .order('name')) as {
      data: Record<string, unknown>[] | null;
      error: DbError;
    };

    if (result.error) {
      throw new Error(`Failed to query agents: ${result.error.message}`);
    }

    const rows = result.data ?? [];
    const agents = rows.map((row) => this.mapRowToAgentDefinition(row));

    return {
      agents,
      sources: ['database'],
    };
  }

  async getAgent(slug: string): Promise<AgentDetailResponse> {
    this.logger.log(`[AgentRegistry] Fetching agent "${slug}" from database`);

    const result = (await this.db
      .from(null, 'agents')
      .select('*')
      .eq('slug', slug)
      .single()) as { data: Record<string, unknown> | null; error: DbError };

    if (result.error) {
      throw new NotFoundException(`Agent "${slug}" not found`);
    }

    if (!result.data) {
      throw new NotFoundException(`Agent "${slug}" not found`);
    }

    return {
      agent: this.mapRowToAgentDefinition(result.data),
      source: 'database',
    };
  }

  /**
   * Replace an agent's metadata. The edited row is checked by the agent loader
   * first, so a save can never leave an agent that no longer loads.
   */
  async updateAgentConfig(
    slug: string,
    dto: AgentConfigUpdateDto,
  ): Promise<AgentDefinition> {
    this.logger.log(`[AgentRegistry] Updating config for agent "${slug}"`);
    const row = await this.agentRow(slug);
    this.checkLoads({ ...row, metadata: dto.config });
    return this.saveAgent(slug, { metadata: dto.config });
  }

  /**
   * The model an agent runs on, from the model catalog: it must be active, and
   * make what the agent makes (a media agent's images or video, otherwise text).
   */
  async updateAgentModel(
    slug: string,
    dto: AgentModelUpdateDto,
  ): Promise<AgentDefinition> {
    const { provider, model } = dto ?? ({} as AgentModelUpdateDto);
    if (typeof provider !== 'string' || !provider || typeof model !== 'string' || !model) {
      throw new BadRequestException('Body must be {provider, model}');
    }
    const row = await this.agentRow(slug);
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const makes = row.agent_type === 'media'
      ? [metadata.mediaType === 'video' ? 'video-generation' : 'image-generation']
      : ['text-generation', 'reasoning', 'code-generation'];

    const found = (await this.db
      .from(null, 'llm_models')
      .select('model_type, is_active')
      .eq('provider_name', provider)
      .eq('model_name', model)
      .maybeSingle()) as { data: { model_type: string; is_active: boolean } | null; error: DbError };
    if (found.error) throw new Error(`Failed to read the model catalog: ${found.error.message}`);
    if (!found.data) throw new BadRequestException(`${provider} ${model} is not in the model catalog`);
    if (!found.data.is_active) throw new BadRequestException(`${provider} ${model} is no longer offered`);
    if (!makes.includes(found.data.model_type)) {
      throw new BadRequestException(`${model} makes ${found.data.model_type}; agent ${slug} needs ${makes.join(' or ')}`);
    }

    const llmConfig = { ...((row.llm_config ?? {}) as Record<string, unknown>), provider, model };
    this.checkLoads({ ...row, llm_config: llmConfig });
    this.logger.log(`[AgentRegistry] Agent "${slug}" now runs on ${provider} ${model}`);
    return this.saveAgent(slug, { llm_config: llmConfig });
  }

  private async agentRow(slug: string): Promise<Record<string, unknown>> {
    const result = (await this.db.from(null, 'agents').select('*').eq('slug', slug).maybeSingle()) as {
      data: Record<string, unknown> | null;
      error: DbError;
    };
    if (result.error) throw new Error(`Failed to load agent "${slug}": ${result.error.message}`);
    if (!result.data) throw new NotFoundException(`Agent "${slug}" not found`);
    return result.data;
  }

  private checkLoads(row: Record<string, unknown>): void {
    try {
      this.definitions.validateRow(row);
    } catch (error) {
      throw new BadRequestException(`The agent would not load: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async saveAgent(slug: string, changes: Record<string, unknown>): Promise<AgentDefinition> {
    const result = (await this.db
      .from(null, 'agents')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('slug', slug)
      .select('*')
      .single()) as { data: Record<string, unknown> | null; error: DbError };
    if (result.error) throw new Error(`Failed to update agent "${slug}": ${result.error.message}`);
    if (!result.data) throw new NotFoundException(`Agent "${slug}" not found`);
    return this.mapRowToAgentDefinition(result.data);
  }

  async getStats(): Promise<AgentStatsResponse> {
    this.logger.log('[AgentRegistry] Fetching agent stats from database');

    const result = (await this.db.rawQuery(
      'SELECT agent_type, COUNT(*) as count FROM agents GROUP BY agent_type ORDER BY count DESC',
    )) as { data: Record<string, unknown>[] | null; error: DbError };

    if (result.error) {
      throw new Error(
        `Failed to aggregate agent stats: ${result.error.message}`,
      );
    }

    const rows = result.data ?? [];

    const stats: AgentStats[] = rows.map((row) => ({
      slug: (row['agent_type'] as string) ?? 'unknown',
      product: 'database',
      totalTasks: Number(row['count'] ?? 0),
      successfulTasks: 0,
      failedTasks: 0,
      averageDurationMs: 0,
      lastRunAt: null,
    }));

    return {
      stats,
      sources: ['database'],
    };
  }

  private mapRowToAgentDefinition(
    row: Record<string, unknown>,
  ): AgentDefinition {
    const orgSlugs = row['organization_slug'] as string[] | string | null;
    const orgSlug = Array.isArray(orgSlugs)
      ? (orgSlugs[0] ?? 'unknown')
      : (orgSlugs ?? 'unknown');

    return {
      slug: (row['slug'] as string) ?? '',
      name: (row['name'] as string) ?? '',
      description: (row['description'] as string) ?? '',
      agentType: (row['agent_type'] as string) ?? '',
      product: 'database',
      orgSlug,
      config: (row['metadata'] as Record<string, unknown>) ?? {},
      llmConfig: llmConfigOf(row['llm_config']),
      createdAt: (row['created_at'] as string) ?? '',
      updatedAt: (row['updated_at'] as string) ?? '',
    };
  }
}

function llmConfigOf(value: unknown): { provider: string; model: string } | null {
  if (value === null || value === undefined) return null;
  const config = value as { provider?: unknown; model?: unknown };
  if (typeof config.provider !== 'string' || typeof config.model !== 'string') {
    throw new Error('agents.llm_config must be {provider, model}');
  }
  return { provider: config.provider, model: config.model };
}
