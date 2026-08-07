import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE } from '@orchestratorai/planes/database';
import type { DatabaseService } from '@orchestratorai/planes/database';
import { ExternalAgentRow, A2AMessageRow } from './secure-conversations-database.types';

/**
 * SecureConversationsDatabaseService — persistence layer for Secure Conversations.
 *
 * Provides CRUD for ambient.external_agents and message logging for
 * ambient.a2a_messages. Uses DATABASE_SERVICE injection so the underlying
 * provider (Supabase, PostgreSQL, SQL Server) is selected at deploy time.
 *
 * All queries use the service role client (via DATABASE_SERVICE) so that
 * RLS policies are satisfied for the ambient schema.
 */
@Injectable()
export class SecureConversationsDatabaseService {
  private readonly logger = new Logger(SecureConversationsDatabaseService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
  ) {}

  /**
   * Atomically claims a signed-request nonce across every API instance.
   * The database primary key is the distributed replay-protection boundary.
   */
  async claimInboundNonce(
    nonce: string,
    senderId: string,
    expiresAt: string,
  ): Promise<boolean> {
    const { error } = await this.db
      .from('ambient', 'a2a_inbound_nonces')
      .insert({
        nonce,
        sender_id: senderId,
        expires_at: expiresAt,
      });

    if (!error) {
      this.pruneExpiredNonces().catch((pruneError: unknown) => {
        this.logger.warn(
          `Failed to prune expired A2A nonces: ${
            pruneError instanceof Error
              ? pruneError.message
              : String(pruneError)
          }`,
        );
      });
      return true;
    }

    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return false;
    }

    throw new Error(`Failed to claim inbound nonce: ${error.message}`);
  }

  private async pruneExpiredNonces(): Promise<void> {
    const { error } = await this.db
      .from('ambient', 'a2a_inbound_nonces')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      throw new Error(error.message);
    }
  }

  // ---------------------------------------------------------------------------
  // External agents
  // ---------------------------------------------------------------------------

  async getAllAgents(orgSlug: string): Promise<ExternalAgentRow[]> {
    const query = this.db
      .from('ambient', 'external_agents')
      .select('*')
      .eq('org_slug', orgSlug)
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch external agents: ${error.message}`);
    }

    if (!Array.isArray(data)) {
      throw new Error('External agent query returned malformed data');
    }
    return data as ExternalAgentRow[];
  }

  async getAgent(
    agentId: string,
    orgSlug: string,
  ): Promise<ExternalAgentRow | null> {
    const query = this.db
      .from('ambient', 'external_agents')
      .select('*')
      .eq('agent_id', agentId)
      .eq('org_slug', orgSlug);

    const { data, error } = await query
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch external agent ${agentId}: ${error.message}`);
    }

    return (data as ExternalAgentRow | null) ?? null;
  }

  async getAgentsByIdentity(agentId: string): Promise<ExternalAgentRow[]> {
    const { data, error } = await this.db
      .from('ambient', 'external_agents')
      .select('*')
      .eq('agent_id', agentId)
      .eq('allowed_origin', true);

    if (error) {
      throw new Error(
        `Failed to resolve external agent identity ${agentId}: ${error.message}`,
      );
    }
    if (!Array.isArray(data)) {
      throw new Error('External agent identity query returned malformed data');
    }
    return data as ExternalAgentRow[];
  }

  /**
   * Insert or update an external agent record.
   * The unique constraint is (org_slug, agent_id).
   */
  async upsertAgent(agent: Partial<ExternalAgentRow>): Promise<ExternalAgentRow> {
    const { data, error } = await this.db
      .from('ambient', 'external_agents')
      .upsert(
        { ...agent, updated_at: new Date().toISOString() },
        { onConflict: 'org_slug,agent_id' },
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert external agent: ${error.message}`);
    }

    return data as ExternalAgentRow;
  }

  async updateTrustScore(
    agentId: string,
    score: number,
    level: string,
    orgSlug: string,
  ): Promise<void> {
    const query = this.db
      .from('ambient', 'external_agents')
      .update({
        trust_score: score,
        trust_level: level,
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId)
      .eq('org_slug', orgSlug);

    const { error } = await query;

    if (error) {
      throw new Error(`Failed to update trust score for ${agentId}: ${error.message}`);
    }
  }

  async updateHeartbeat(agentId: string, orgSlug: string): Promise<void> {
    const query = this.db
      .from('ambient', 'external_agents')
      .update({
        last_heartbeat: new Date().toISOString(),
        status: 'online',
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId)
      .eq('org_slug', orgSlug);

    const { error } = await query;

    if (error) {
      throw new Error(`Failed to update heartbeat for ${agentId}: ${error.message}`);
    }
  }

  async updateInteractions(
    agentId: string,
    count: number,
    score: number,
    level: string,
    orgSlug: string,
  ): Promise<void> {
    const query = this.db
      .from('ambient', 'external_agents')
      .update({
        interactions_count: count,
        trust_score: score,
        trust_level: level,
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId)
      .eq('org_slug', orgSlug);

    const { error } = await query;

    if (error) {
      throw new Error(`Failed to update interactions for ${agentId}: ${error.message}`);
    }
  }

  /**
   * Update the dedicated A2A endpoint and/or API key for a registered agent.
   * Called after discovery when the bootstrap service enriches the record with
   * connection details that are not present in the agent card itself.
   */
  async updateAgentEndpointAndKey(
    agentId: string,
    a2aEndpoint: string,
    apiKey: string,
    orgSlug: string,
  ): Promise<void> {
    const query = this.db
      .from('ambient', 'external_agents')
      .update({
        a2a_endpoint: a2aEndpoint,
        api_key: apiKey,
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId)
      .eq('org_slug', orgSlug);

    const { error } = await query;

    if (error) {
      throw new Error(`Failed to update endpoint/key for agent ${agentId}: ${error.message}`);
    }
  }

  async deleteAgent(agentId: string, orgSlug: string): Promise<void> {
    const query = this.db
      .from('ambient', 'external_agents')
      .delete()
      .eq('agent_id', agentId)
      .eq('org_slug', orgSlug);

    const { error } = await query;

    if (error) {
      throw new Error(`Failed to delete external agent ${agentId}: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // A2A message logging
  // ---------------------------------------------------------------------------

  /**
   * Insert a new A2A message record and return the generated UUID.
   */
  async logMessage(message: A2AMessageRow): Promise<string> {
    const { data, error } = await this.db
      .from('ambient', 'a2a_messages')
      .insert(message)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to log A2A message: ${error.message}`);
    }

    return (data as { id: string }).id;
  }

  async updateMessageStatus(
    id: string,
    status: string,
    response?: unknown,
    durationMs?: number,
  ): Promise<void> {
    const update: Record<string, unknown> = { status };

    if (response !== undefined) {
      update['response_payload'] = response;
    }

    if (durationMs !== undefined) {
      update['duration_ms'] = durationMs;
    }

    const { error } = await this.db
      .from('ambient', 'a2a_messages')
      .update(update)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update message status for ${id}: ${error.message}`);
    }
  }

  async getMessages(filters: {
    orgSlug: string;
    direction?: string;
    agentId?: string;
    status?: string;
    limit?: number;
  }): Promise<A2AMessageRow[]> {
    let query = this.db
      .from('ambient', 'a2a_messages')
      .select('*')
      .order('created_at', { ascending: false });

    query = query.eq('org_slug', filters.orgSlug);

    if (filters?.direction) {
      query = query.eq('direction', filters.direction);
    }

    if (filters?.agentId) {
      query = query.eq('external_agent_id', filters.agentId);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch A2A messages: ${error.message}`);
    }

    return (data ?? []) as A2AMessageRow[];
  }

  async getMessage(
    id: string,
    orgSlug: string,
  ): Promise<A2AMessageRow | null> {
    let query = this.db
      .from('ambient', 'a2a_messages')
      .select('*')
      .eq('id', id);

    query = query.eq('org_slug', orgSlug);

    const { data, error } = await query
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch A2A message ${id}: ${error.message}`);
    }

    return (data as A2AMessageRow | null) ?? null;
  }
}
