import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  AgentRecord,
  AgentUpsertInput,
  AgentUpsertRow,
} from '../interfaces/agent.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

const AGENTS_TABLE = 'agents';

@Injectable()
export class AgentsRepository {
  private readonly logger = new Logger(AgentsRepository.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Normalize organization_slug: database stores as TEXT[] array
   * Ensures it's always an array for consistency
   */
  private normalizeAgentRecord(record: AgentRecord): AgentRecord {
    return {
      ...record,
      organization_slug: Array.isArray(record.organization_slug)
        ? record.organization_slug
        : record.organization_slug
          ? [record.organization_slug as unknown as string]
          : [],
      capabilities: Array.isArray(record.capabilities)
        ? record.capabilities
        : record.capabilities
          ? [record.capabilities as unknown as string]
          : [],
    };
  }

  async upsert(payload: AgentUpsertInput): Promise<AgentRecord> {
    const client = this.db;
    // Normalize organization_slug to array (database stores as TEXT[])
    const orgSlugArray =
      Array.isArray(payload.organization_slug) &&
      payload.organization_slug.length > 0
        ? payload.organization_slug
        : payload.organization_slug
          ? typeof payload.organization_slug === 'string'
            ? [payload.organization_slug]
            : ['demo-org']
          : ['demo-org'];

    // Create row - database stores organization_slug as TEXT[] array
    const row: AgentUpsertRow = {
      slug: payload.slug,
      organization_slug: orgSlugArray,
      name: payload.name,
      description: payload.description,
      version: payload.version ?? '1.0.0',
      agent_type: payload.agent_type,
      department: payload.department,
      tags: payload.tags ?? [],
      io_schema: payload.io_schema,
      capabilities: payload.capabilities,
      context: payload.context,
      endpoint: payload.endpoint ?? null,
      llm_config: payload.llm_config ?? null,
      metadata: payload.metadata ?? {},
      updated_at: new Date().toISOString(),
    } as AgentUpsertRow;

    const rows = [row];

    const { data, error } = (await client
      .from(null, AGENTS_TABLE)
      .upsert(rows as unknown as Record<string, unknown>[], {
        onConflict: 'slug',
      })
      .select()
      .maybeSingle()) as SupabaseSelectResponse<AgentRecord>;

    if (error) {
      this.logger.error(
        `Failed to upsert agent ${payload.slug}: ${error.message}`,
      );
      throw new Error(`Failed to upsert agent: ${error.message}`);
    }

    if (!data) {
      throw new Error('Upsert succeeded but no agent returned');
    }

    return this.normalizeAgentRecord(data);
  }

  async findBySlug(
    organizationSlug: string | null,
    agentSlug: string,
  ): Promise<AgentRecord | null> {
    const client = this.db;
    let query = client
      .from(null, AGENTS_TABLE)
      .select('*')
      .eq('slug', agentSlug)
      .limit(1);

    // Filter by organization (organization_slug is TEXT[], an array column)
    if (organizationSlug) {
      // Use contains operator to check if the array contains the organization slug
      // Also include global agents (organization_slug contains 'global')
      query = query.or(
        `organization_slug.cs.{${organizationSlug}},organization_slug.cs.{global}`,
      );
    }

    const { data, error } =
      (await query.maybeSingle()) as SupabaseSelectResponse<AgentRecord>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to load agent ${agentSlug}: ${error.message}`);
      throw new Error(`Failed to load agent: ${error.message}`);
    }

    return data ? this.normalizeAgentRecord(data) : null;
  }

  async listByOrganization(
    organizationSlug: string | null,
  ): Promise<AgentRecord[]> {
    const client = this.db;
    let query = client.from(null, AGENTS_TABLE).select('*');

    // Handle special cases for organization filter
    // '*' means "All Organizations" - return ALL agents
    if (organizationSlug === '*') {
      // No filter - return all agents
      this.logger.debug('Listing all agents (organization_slug = "*")');
    } else if (organizationSlug) {
      // Query for agents that belong to this specific organization OR global agents
      // Use contains operator to check if the array contains the organization slug
      // Also include agents with 'global' in their organization_slug array
      query = query.or(
        `organization_slug.cs.{${organizationSlug}},organization_slug.cs.{global}`,
      );
    } else {
      // Query for global agents:
      // - organization_slug is null
      // - organization_slug is empty array {}
      // - organization_slug contains 'global'
      query = query.or(
        'organization_slug.is.null,organization_slug.eq.{},organization_slug.cs.{global}',
      );
    }

    const { data, error } = (await query.order('slug', {
      ascending: true,
    })) as SupabaseSelectListResponse<AgentRecord>;

    if (error) {
      this.logger.error(
        `Failed to list agents for ${organizationSlug ?? 'all'}: ${error.message}`,
      );
      throw new Error(`Failed to list agents: ${error.message}`);
    }

    return (data ?? []).map((record) => this.normalizeAgentRecord(record));
  }

  async listAll(): Promise<AgentRecord[]> {
    const client = this.db;
    const { data, error } = (await client
      .from(null, AGENTS_TABLE)
      .select('*')
      .order('slug', {
        ascending: true,
      })) as SupabaseSelectListResponse<AgentRecord>;

    if (error) {
      this.logger.error(`Failed to list all agents: ${error.message}`);
      throw new Error(`Failed to list agents: ${error.message}`);
    }

    return (data ?? []).map((record) => this.normalizeAgentRecord(record));
  }

  /**
   * Returns the most recent updated_at timestamp across all agents.
   * Useful for cache invalidation polling.
   */
  async getLatestUpdatedAt(): Promise<string | null> {
    const client = this.db;
    const { data, error } = (await client
      .from(null, AGENTS_TABLE)
      .select('updated_at')
      .order('updated_at', { ascending: false } as Record<string, unknown>)
      .limit(1)
      .maybeSingle()) as SupabaseSelectResponse<{ updated_at: string }>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to query latest agent updated_at: ${error.message}`,
      );
      throw new Error(
        `Failed to query latest agent updated_at: ${error.message}`,
      );
    }

    return data?.updated_at ?? null;
  }

  async deleteBySlug(slug: string): Promise<void> {
    const client = this.db;
    const { error } = await client
      .from(null, AGENTS_TABLE)
      .delete()
      .eq('slug', slug);
    if (error) {
      this.logger.error(`Failed to delete agent ${slug}: ${error.message}`);
      throw new Error(`Failed to delete agent: ${error.message}`);
    }
  }

  async updateMetadata(
    slug: string,
    metadata: Record<string, unknown>,
  ): Promise<AgentRecord> {
    const client = this.db;
    const { data, error } = (await client
      .from(null, AGENTS_TABLE)
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('slug', slug)
      .select()
      .single()) as SupabaseSelectResponse<AgentRecord>;

    if (error) {
      this.logger.error(
        `Failed to update agent ${slug} metadata: ${error.message}`,
      );
      throw new Error(`Failed to update agent metadata: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no agent returned');
    }

    return this.normalizeAgentRecord(data);
  }
}
