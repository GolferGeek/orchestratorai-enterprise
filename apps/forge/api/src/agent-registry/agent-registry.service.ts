/**
 * Agent Registry Service
 *
 * Reads agent definitions from the database and manages conversation records.
 * Replaces the removed agent-platform endpoints that the Forge frontend depends on.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@/database';

export interface AgentRecord {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: string;
  organizationSlug: string | null;
  requireLocalModel: boolean;
  llm_config: { provider: string; model: string } | null;
  hasCustomUI: boolean;
  customUIComponent: string | null;
  metadata: Record<string, unknown> | null;
  execution_modes: string[] | null;
  execution_profile: string | null;
  io_schema: Record<string, unknown> | null;
}

export interface ConversationRecord {
  id: string;
  agentName: string;
  agentType: string;
  organizationSlug: string;
  conversationId: string;
  title?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AgentRegistryService {
  private readonly logger = new Logger(AgentRegistryService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
  ) {}

  /**
   * Get all available agents from the database.
   */
  async getAvailableAgents(
    organizationSlug?: string,
  ): Promise<{ agents: AgentRecord[] }> {
    this.logger.log(
      `Fetching agents${organizationSlug ? ` for org: ${organizationSlug}` : ''}`,
    );

    let query = this.db.from(null, 'agents').select('*').order('name');

    if (organizationSlug) {
      // organization_slug is a TEXT[] column; filter with contains
      query = query.contains('organization_slug', [organizationSlug]);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to query agents: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    const agents = rows.map((row) => this.mapRowToAgent(row));

    return { agents };
  }

  /**
   * Create a conversation record for an agent interaction.
   */
  async createConversation(params: {
    agentName: string;
    agentType: string;
    organizationSlug: string;
    conversationId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ConversationRecord> {
    const conversationId = params.conversationId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const { data, error } = await this.db
      .from(null, 'conversations')
      .insert({
        id: conversationId,
        agent_name: params.agentName,
        agent_type: params.agentType,
        organization_slug: params.organizationSlug,
        metadata: params.metadata ?? {},
        started_at: now,
        last_active_at: now,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }

    const row = data as Record<string, unknown>;
    return {
      id: (row['id'] as string) ?? conversationId,
      agentName: (row['agent_name'] as string) ?? params.agentName,
      agentType: (row['agent_type'] as string) ?? params.agentType,
      organizationSlug:
        (row['organization_slug'] as string) ?? params.organizationSlug,
      conversationId: (row['id'] as string) ?? conversationId,
      createdAt: (row['created_at'] as string) ?? now,
      updatedAt: (row['updated_at'] as string) ?? now,
      metadata: (row['metadata'] as Record<string, unknown>) ?? {},
    };
  }

  /**
   * Get a conversation record by ID.
   */
  async getConversation(
    conversationId: string,
  ): Promise<ConversationRecord | null> {
    const { data, error } = await this.db
      .from(null, 'conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error || !data) {
      return null;
    }

    const row = data as Record<string, unknown>;
    return {
      id: (row['id'] as string) ?? '',
      agentName: (row['agent_name'] as string) ?? '',
      agentType: (row['agent_type'] as string) ?? '',
      organizationSlug: (row['organization_slug'] as string) ?? '',
      conversationId: (row['id'] as string) ?? '',
      createdAt: (row['created_at'] as string) ?? '',
      updatedAt: (row['updated_at'] as string) ?? '',
      metadata: (row['metadata'] as Record<string, unknown>) ?? {},
    };
  }

  /**
   * List conversations for an agent/org combination.
   */
  async listConversations(
    agentName: string,
    organizationSlug: string,
  ): Promise<ConversationRecord[]> {
    const { data, error } = await this.db
      .from(null, 'conversations')
      .select('*')
      .eq('agent_name', agentName)
      .eq('organization_slug', organizationSlug)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list conversations: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    return rows.map((row) => ({
      id: (row['id'] as string) ?? '',
      agentName: (row['agent_name'] as string) ?? '',
      agentType: (row['agent_type'] as string) ?? '',
      organizationSlug: (row['organization_slug'] as string) ?? '',
      conversationId: (row['id'] as string) ?? '',
      createdAt: (row['created_at'] as string) ?? '',
      updatedAt: (row['updated_at'] as string) ?? '',
      metadata: (row['metadata'] as Record<string, unknown>) ?? {},
    }));
  }

  private mapRowToAgent(row: Record<string, unknown>): AgentRecord {
    const orgSlugs = row['organization_slug'] as string[] | string | null;
    const orgSlug = Array.isArray(orgSlugs)
      ? orgSlugs[0] ?? null
      : orgSlugs ?? null;

    const metadata = (row['metadata'] as Record<string, unknown>) ?? {};

    return {
      id: (row['slug'] as string) ?? '',
      name: (row['name'] as string) ?? '',
      slug: (row['slug'] as string) ?? '',
      description: (row['description'] as string) ?? '',
      type: (row['agent_type'] as string) ?? '',
      organizationSlug: orgSlug,
      requireLocalModel: (metadata['requireLocalModel'] as boolean) ?? false,
      llm_config: (metadata['llm_config'] as { provider: string; model: string }) ?? null,
      hasCustomUI: (metadata['hasCustomUI'] as boolean) ?? false,
      customUIComponent: (metadata['customUIComponent'] as string) ?? null,
      metadata,
      execution_modes: (row['execution_modes'] as string[]) ?? null,
      execution_profile: (row['execution_profile'] as string) ?? null,
      io_schema: (row['io_schema'] as Record<string, unknown>) ?? null,
    };
  }
}
