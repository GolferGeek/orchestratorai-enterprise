import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

export interface AgentDefinition {
  slug: string;
  name: string;
  description: string;
  agentType: string;
  product: string;
  orgSlug: string;
  config: Record<string, unknown>;
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

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async listAgents(): Promise<AgentListResponse> {
    this.logger.log('[AgentRegistry] Fetching agents from database');

    const { data, error } = await this.db
      .from(null, 'agents')
      .select('*')
      .order('name');

    if (error) {
      throw new Error(`Failed to query agents: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    const agents = rows.map((row) => this.mapRowToAgentDefinition(row));

    return {
      agents,
      sources: ['database'],
    };
  }

  async getAgent(slug: string): Promise<AgentDetailResponse> {
    this.logger.log(`[AgentRegistry] Fetching agent "${slug}" from database`);

    const { data, error } = await this.db
      .from(null, 'agents')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      throw new NotFoundException(`Agent "${slug}" not found`);
    }

    if (!data) {
      throw new NotFoundException(`Agent "${slug}" not found`);
    }

    return {
      agent: this.mapRowToAgentDefinition(data as Record<string, unknown>),
      source: 'database',
    };
  }

  async updateAgentConfig(
    slug: string,
    dto: AgentConfigUpdateDto,
  ): Promise<AgentDefinition> {
    this.logger.log(`[AgentRegistry] Updating config for agent "${slug}"`);

    const { data, error } = await this.db
      .from(null, 'agents')
      .update({ metadata: dto.config })
      .eq('slug', slug)
      .select('*')
      .single();

    if (error) {
      throw new Error(
        `Failed to update config for agent "${slug}": ${error.message}`,
      );
    }

    if (!data) {
      throw new NotFoundException(`Agent "${slug}" not found`);
    }

    return this.mapRowToAgentDefinition(data as Record<string, unknown>);
  }

  async getStats(): Promise<AgentStatsResponse> {
    this.logger.log('[AgentRegistry] Fetching agent stats from database');

    const { data, error } = await this.db.rawQuery(
      'SELECT agent_type, COUNT(*) as count FROM agents GROUP BY agent_type ORDER BY count DESC',
    );

    if (error) {
      throw new Error(`Failed to aggregate agent stats: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];

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

  private mapRowToAgentDefinition(row: Record<string, unknown>): AgentDefinition {
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
      createdAt: (row['created_at'] as string) ?? '',
      updatedAt: (row['updated_at'] as string) ?? '',
    };
  }
}
