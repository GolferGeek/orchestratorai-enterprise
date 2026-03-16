import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ExternalAgentRow, A2AMessageRow } from './bridge-database.types';

/**
 * BridgeDatabaseService — Supabase persistence layer for Bridge.
 *
 * Provides CRUD for ambient.external_agents and message logging for
 * ambient.a2a_messages. All queries use the service role key so that
 * RLS policies are satisfied (service_role_all_* policies are in place).
 */
@Injectable()
export class BridgeDatabaseService implements OnModuleInit {
  private readonly logger = new Logger(BridgeDatabaseService.name);
  private supabase: SupabaseClient;

  onModuleInit(): void {
    this.supabase = createClient(
      process.env.SUPABASE_URL ?? 'http://127.0.0.1:6012',
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
    );
    this.logger.log('Bridge database service initialized');
  }

  // ---------------------------------------------------------------------------
  // External agents
  // ---------------------------------------------------------------------------

  async getAllAgents(orgSlug?: string): Promise<ExternalAgentRow[]> {
    let query = this.supabase
      .schema('ambient')
      .from('external_agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (orgSlug) {
      query = query.eq('org_slug', orgSlug);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch external agents: ${error.message}`);
    }

    return (data ?? []) as ExternalAgentRow[];
  }

  async getAgent(agentId: string): Promise<ExternalAgentRow | null> {
    const { data, error } = await this.supabase
      .schema('ambient')
      .from('external_agents')
      .select('*')
      .eq('agent_id', agentId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch external agent ${agentId}: ${error.message}`);
    }

    return (data as ExternalAgentRow | null) ?? null;
  }

  /**
   * Insert or update an external agent record.
   * The unique constraint is (org_slug, agent_id) — matching those fields
   * performs an upsert.
   */
  async upsertAgent(agent: Partial<ExternalAgentRow>): Promise<ExternalAgentRow> {
    const { data, error } = await this.supabase
      .schema('ambient')
      .from('external_agents')
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

  async updateTrustScore(agentId: string, score: number, level: string): Promise<void> {
    const { error } = await this.supabase
      .schema('ambient')
      .from('external_agents')
      .update({
        trust_score: score,
        trust_level: level,
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId);

    if (error) {
      throw new Error(`Failed to update trust score for ${agentId}: ${error.message}`);
    }
  }

  async updateHeartbeat(agentId: string): Promise<void> {
    const { error } = await this.supabase
      .schema('ambient')
      .from('external_agents')
      .update({
        last_heartbeat: new Date().toISOString(),
        status: 'online',
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId);

    if (error) {
      throw new Error(`Failed to update heartbeat for ${agentId}: ${error.message}`);
    }
  }

  async updateInteractions(
    agentId: string,
    count: number,
    score: number,
    level: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .schema('ambient')
      .from('external_agents')
      .update({
        interactions_count: count,
        trust_score: score,
        trust_level: level,
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId);

    if (error) {
      throw new Error(`Failed to update interactions for ${agentId}: ${error.message}`);
    }
  }

  async deleteAgent(agentId: string): Promise<void> {
    const { error } = await this.supabase
      .schema('ambient')
      .from('external_agents')
      .delete()
      .eq('agent_id', agentId);

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
    const { data, error } = await this.supabase
      .schema('ambient')
      .from('a2a_messages')
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

    const { error } = await this.supabase
      .schema('ambient')
      .from('a2a_messages')
      .update(update)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update message status for ${id}: ${error.message}`);
    }
  }

  async getMessages(filters?: {
    orgSlug?: string;
    direction?: string;
    agentId?: string;
    status?: string;
    limit?: number;
  }): Promise<A2AMessageRow[]> {
    let query = this.supabase
      .schema('ambient')
      .from('a2a_messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.orgSlug) {
      query = query.eq('org_slug', filters.orgSlug);
    }

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
}
