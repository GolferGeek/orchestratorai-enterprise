import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import type { DatabaseService as PlaneDatabaseService } from '@orchestratorai/planes/database';
import type { ExecutionContext, JsonValue, QueryResult } from '@orchestrator-ai/transport-types';
import type { EventOrigin } from '../event-bus/ambient-event.types';

/**
 * Row shape for ambient.triggers table.
 */
export interface Trigger {
  id: string;
  org_slug: string;
  name: string;
  description: string | null;
  source_type: string;
  enabled: boolean;
  source_config: Record<string, unknown>;
  condition: Record<string, unknown> | null;
  /**
   * What a fire does: invoke an agent (`agentSlug`), or start a runtime
   * workflow run (`workflowSlug` with its start `input`).
   */
  action_config: {
    agentSlug?: string;
    workflowSlug?: string;
    input?: JsonValue;
    /** Workflow input fields taken from the event that fired it: { field: 'new.id' } (a path into the event payload). */
    inputFromEvent?: Record<string, string>;
    /**
     * Send the result back to the caller of the A2A agent that pushed the
     * event (through that agent): an agent's answer at once, a workflow run's
     * result when the run ends. An event with no caller gets no reply.
     */
    replyToCaller?: boolean;
    /**
     * A workflow trigger on a storage event: take the event's file (bucket,
     * path, filename) in as the run's one document before it starts.
     */
    documentFromEvent?: boolean;
    agentType?: string;
    provider?: string;
    model?: string;
    mode?: string;
    action?: string;
    payload?: Record<string, unknown>;
    messageTemplate?: string;
  };
  cooldown_seconds: number;
  max_fires_per_hour: number | null;
  last_fired_at: string | null;
  created_by: string | null;
  trigger_kind: string;
  trigger_config: Record<string, unknown>;
  response_kind: string;
  response_config: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Row shape for ambient.trigger_executions table.
 */
export interface TriggerExecution {
  id: string;
  trigger_id: string;
  trigger_name: string;
  source_type: string;
  source_event: Record<string, unknown> | null;
  condition_met: boolean | null;
  action_taken: boolean;
  skip_reason?: string | null;
  execution_context: ExecutionContext | null;
  a2a_response: Record<string, unknown> | null;
  duration_ms: number | null;
  status: string;
  dedupe_key?: string | null;
  /** The pushed event this execution answered (ambient.events), if any. */
  event_id?: string | null;
  /** A reply to the event's caller: waiting on a run, sent, refused or failed. */
  reply_state?: 'waiting' | 'sending' | 'sent' | 'refused' | 'failed' | null;
  reply_run_id?: string | null;
  reply?: Record<string, unknown> | null;
}

/**
 * Row shape for ambient.events: an event pushed to ambient.
 */
export interface AmbientEventRow {
  id: string;
  org_slug: string;
  name: string;
  source: string;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  origin: EventOrigin | null;
  received_at: string;
}

export type NewAmbientEvent = Omit<AmbientEventRow, 'id' | 'received_at'>;

/** A watched storage folder: a new file under it raises the named event. */
export interface StorageWatch {
  id: string;
  org_slug: string;
  bucket: string;
  prefix: string;
  event: string;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
}

/**
 * Row shape for ambient.adapter_state table.
 */
export interface AdapterState {
  id: string;
  trigger_id: string;
  adapter_type: string;
  state: Record<string, unknown>;
  updated_at: string;
}

type CreateTriggerRecord = Omit<
  Trigger,
  'id' | 'created_at' | 'updated_at' | 'last_fired_at' | 'last_error'
>;

const SCHEMA = 'ambient';

/**
 * Data access service for the ambient schema.
 * Uses DATABASE_SERVICE (the platform database plane) instead of a custom Supabase client.
 */
@Injectable()
export class AmbientDatabaseService {
  private readonly logger = new Logger(AmbientDatabaseService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: PlaneDatabaseService,
  ) {
    this.logger.log('AmbientDatabaseService initialized via DATABASE_SERVICE plane');
  }

  private normalizeTrigger(row: Record<string, unknown>): Trigger {
    const responseConfig = (row.response_config ?? {}) as Record<string, unknown>;
    const actionConfig = (row.action_config ?? responseConfig) as Record<string, unknown>;
    const capabilitySlug = responseConfig.capabilitySlug;

    return {
      ...row,
      source_type: (row.source_type ?? row.trigger_kind) as string,
      source_config: (row.source_config ?? row.trigger_config ?? {}) as Record<string, unknown>,
      action_config: {
        ...(actionConfig as Trigger['action_config']),
        ...(typeof capabilitySlug === 'string' ? { agentSlug: capabilitySlug } : {}),
      },
      condition: (row.condition ?? null) as Record<string, unknown> | null,
    } as Trigger;
  }

  private normalizeTriggers(rows: unknown[] | null): Trigger[] {
    return (rows ?? []).map((row) => this.normalizeTrigger(row as Record<string, unknown>));
  }

  async getTriggers(orgSlug: string, sourceType?: string): Promise<Trigger[]> {
    let query = this.db
      .from(SCHEMA, 'triggers')
      .select('*')
      .eq('org_slug', orgSlug)
      .eq('enabled', true);

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    const { data, error } = (await query) as QueryResult<unknown[]>;

    if (error) {
      throw new Error(`Failed to fetch triggers: ${error.message}`);
    }

    return this.normalizeTriggers(data);
  }

  async getEnabledTriggers(orgSlug?: string): Promise<Trigger[]> {
    let query = this.db
      .from(SCHEMA, 'triggers')
      .select('*')
      .eq('enabled', true);

    if (orgSlug && orgSlug !== '*') {
      query = query.eq('org_slug', orgSlug);
    }

    const { data, error } = (await query) as QueryResult<unknown[]>;

    if (error) {
      throw new Error(`Failed to fetch ambient triggers: ${error.message}`);
    }

    return this.normalizeTriggers(data);
  }

  /** One trigger in an org, enabled or not. */
  async getTrigger(id: string, orgSlug: string): Promise<Trigger | null> {
    let query = this.db.from(SCHEMA, 'triggers').select('*').eq('id', id);
    if (orgSlug !== '*') query = query.eq('org_slug', orgSlug);
    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch trigger ${id}: ${error.message}`);
    }
    return data ? this.normalizeTrigger(data as Record<string, unknown>) : null;
  }

  async getEnabledTriggersBySource(sourceType: string): Promise<Trigger[]> {
    const { data, error } = (await this.db
      .from(SCHEMA, 'triggers')
      .select('*')
      .eq('source_type', sourceType)
      .eq('enabled', true)) as QueryResult<unknown[]>;

    if (error) {
      throw new Error(
        `Failed to fetch ambient triggers for source_type=${sourceType}: ${error.message}`,
      );
    }

    return this.normalizeTriggers(data);
  }

  async updateTriggerLastFired(triggerId: string): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, 'triggers')
      .update({ last_fired_at: new Date().toISOString() })
      .eq('id', triggerId);

    if (error) {
      throw new Error(`Failed to update last_fired_at for trigger ${triggerId}: ${error.message}`);
    }
  }

  async insertExecution(execution: TriggerExecution): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, 'trigger_executions')
      .insert(execution);

    if (error) {
      throw new Error(`Failed to insert execution ${execution.id}: ${error.message}`);
    }
  }

  async updateExecution(id: string, update: Partial<TriggerExecution>): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, 'trigger_executions')
      .update(update)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update execution ${id}: ${error.message}`);
    }
  }

  async getRecentExecutions(
    triggerId?: string,
    limit = 50,
    orgSlug?: string,
  ): Promise<TriggerExecution[]> {
    let permittedTriggerIds: string[] | undefined;
    if (orgSlug && orgSlug !== '*') {
      const { data: triggerRows, error: triggerError } = await this.db
        .from(SCHEMA, 'triggers')
        .select('id')
        .eq('org_slug', orgSlug);

      if (triggerError) {
        throw new Error(
          `Failed to resolve ambient triggers for organization: ${triggerError.message}`,
        );
      }

      const triggerIds = ((triggerRows ?? []) as Array<{ id: string }>).map(
        (row) => row.id,
      );
      if (triggerIds.length === 0) {
        return [];
      }
      permittedTriggerIds = triggerIds;
    }

    let query = this.db
      .from(SCHEMA, 'trigger_executions')
      .select('*')
      .order('fired_at', { ascending: false })
      .limit(limit);

    if (triggerId) {
      query = query.eq('trigger_id', triggerId);
    }
    if (permittedTriggerIds) {
      query = query.in('trigger_id', permittedTriggerIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch recent executions: ${error.message}`);
    }

    return (data ?? []) as TriggerExecution[];
  }

  /**
   * Store a pushed event. A dedupe key already used for this org and event
   * name returns the stored event with `duplicate: true`.
   */
  async insertEvent(event: NewAmbientEvent): Promise<{ event: AmbientEventRow; duplicate: boolean }> {
    const { data, error } = await this.db
      .from(SCHEMA, 'events')
      .insert(event)
      .select()
      .single();

    if (!error) {
      return { event: data as AmbientEventRow, duplicate: false };
    }
    if ((error as { code?: string }).code !== '23505' || event.dedupe_key === null) {
      throw new Error(`Failed to store ambient event ${event.name}: ${error.message}`);
    }

    const { data: existing, error: lookupError } = await this.db
      .from(SCHEMA, 'events')
      .select('*')
      .eq('org_slug', event.org_slug)
      .eq('name', event.name)
      .eq('dedupe_key', event.dedupe_key)
      .single();
    if (lookupError) {
      throw new Error(`Failed to load duplicate ambient event ${event.name}: ${lookupError.message}`);
    }
    return { event: existing as AmbientEventRow, duplicate: true };
  }

  async getEvent(id: string, orgSlug: string): Promise<AmbientEventRow | null> {
    const { data, error } = await this.db
      .from(SCHEMA, 'events')
      .select('*')
      .eq('id', id)
      .eq('org_slug', orgSlug)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch ambient event ${id}: ${error.message}`);
    }
    return data as AmbientEventRow | null;
  }

  async listEvents(orgSlug: string, limit: number): Promise<AmbientEventRow[]> {
    const { data, error } = await this.db
      .from(SCHEMA, 'events')
      .select('*')
      .eq('org_slug', orgSlug)
      .order('received_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list ambient events: ${error.message}`);
    }
    return (data ?? []) as AmbientEventRow[];
  }

  /** Enabled watches on one bucket, in every organization. */
  async getEnabledStorageWatches(bucket: string): Promise<StorageWatch[]> {
    const { data, error } = await this.db.from(SCHEMA, 'storage_watches').select('*').eq('bucket', bucket).eq('enabled', true);
    if (error) throw new Error(`Failed to fetch storage watches for ${bucket}: ${error.message}`);
    return (data ?? []) as StorageWatch[];
  }

  async listStorageWatches(orgSlug: string): Promise<StorageWatch[]> {
    const { data, error } = await this.db.from(SCHEMA, 'storage_watches').select('*').eq('org_slug', orgSlug).order('created_at');
    if (error) throw new Error(`Failed to list storage watches: ${error.message}`);
    return (data ?? []) as StorageWatch[];
  }

  async createStorageWatch(watch: Pick<StorageWatch, 'org_slug' | 'bucket' | 'prefix' | 'event' | 'created_by'>): Promise<StorageWatch> {
    const { data, error } = await this.db.from(SCHEMA, 'storage_watches').insert(watch).select().single();
    if (error) throw new Error(`Failed to create storage watch: ${error.message}`);
    return data as StorageWatch;
  }

  async deleteStorageWatch(id: string, orgSlug: string): Promise<boolean> {
    const { data, error } = await this.db.from(SCHEMA, 'storage_watches').delete().eq('id', id).eq('org_slug', orgSlug).select('id');
    if (error) throw new Error(`Failed to delete storage watch ${id}: ${error.message}`);
    return Array.isArray(data) && data.length === 1;
  }

  async bucketExists(bucket: string): Promise<boolean> {
    const { data, error } = await this.db.from('storage', 'buckets').select('id').eq('id', bucket).maybeSingle();
    if (error) throw new Error(`Failed to look up bucket ${bucket}: ${error.message}`);
    return data !== null;
  }

  async getEventById(id: string): Promise<AmbientEventRow | null> {
    const { data, error } = await this.db.from(SCHEMA, 'events').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Failed to fetch ambient event ${id}: ${error.message}`);
    return data as AmbientEventRow | null;
  }

  /** Executions whose reply waits on a workflow run: one run, or all of them. */
  async getWaitingReplies(runId?: string): Promise<Array<TriggerExecution & { id: string }>> {
    let query = this.db.from(SCHEMA, 'trigger_executions').select('*').eq('reply_state', 'waiting');
    if (runId !== undefined) query = query.eq('reply_run_id', runId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch waiting replies: ${error.message}`);
    return (data ?? []) as Array<TriggerExecution & { id: string }>;
  }

  /** Take a waiting reply for sending; false when another instance took it. */
  async claimReply(executionId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from(SCHEMA, 'trigger_executions')
      .update({ reply_state: 'sending' })
      .eq('id', executionId)
      .eq('reply_state', 'waiting')
      .select('id');
    if (error) throw new Error(`Failed to claim reply for execution ${executionId}: ${error.message}`);
    return Array.isArray(data) && data.length === 1;
  }

  async getExecutionsForEvent(eventId: string): Promise<TriggerExecution[]> {
    const { data, error } = await this.db
      .from(SCHEMA, 'trigger_executions')
      .select('*')
      .eq('event_id', eventId)
      .order('fired_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch executions for ambient event ${eventId}: ${error.message}`);
    }
    return (data ?? []) as TriggerExecution[];
  }

  async getAdapterState(triggerId: string): Promise<AdapterState | null> {
    const { data, error } = await this.db
      .from(SCHEMA, 'adapter_state')
      .select('*')
      .eq('trigger_id', triggerId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch adapter state for trigger ${triggerId}: ${error.message}`);
    }

    return data as AdapterState | null;
  }

  async upsertAdapterState(
    triggerId: string,
    adapterType: string,
    state: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, 'adapter_state')
      .upsert(
        {
          trigger_id: triggerId,
          adapter_type: adapterType,
          state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'trigger_id' },
      );

    if (error) {
      throw new Error(
        `Failed to upsert adapter state for trigger ${triggerId}: ${error.message}`,
      );
    }
  }

  async createTrigger(record: CreateTriggerRecord): Promise<Trigger> {
    const { data, error } = await this.db
      .from(SCHEMA, 'triggers')
      .insert(record)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create trigger: ${error.message}`);
    }

    return this.normalizeTrigger(data as Record<string, unknown>);
  }

  async updateTrigger(
    id: string,
    update: Partial<Omit<Trigger, 'id' | 'created_at'>>,
    orgSlug?: string,
  ): Promise<Trigger | null> {
    let query = this.db
      .from(SCHEMA, 'triggers')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (orgSlug && orgSlug !== '*') {
      query = query.eq('org_slug', orgSlug);
    }

    const { data, error } = await query
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update trigger ${id}: ${error.message}`);
    }

    return data ? this.normalizeTrigger(data as Record<string, unknown>) : null;
  }

  async deleteTrigger(id: string, orgSlug?: string): Promise<void> {
    let query = this.db
      .from(SCHEMA, 'triggers')
      .delete()
      .eq('id', id);

    if (orgSlug && orgSlug !== '*') {
      query = query.eq('org_slug', orgSlug);
    }

    const { error } = await query;

    if (error) {
      throw new Error(`Failed to delete trigger ${id}: ${error.message}`);
    }
  }
}
