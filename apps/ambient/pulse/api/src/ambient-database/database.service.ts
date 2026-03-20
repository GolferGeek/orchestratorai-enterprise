import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import type { DatabaseService as PlaneDatabaseService } from '@orchestratorai/planes/database';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

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
  action_config: {
    agentSlug: string;
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
  product: string;
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
  product: string;
  source_event: Record<string, unknown> | null;
  condition_met: boolean | null;
  action_taken: boolean;
  skip_reason?: string | null;
  execution_context: ExecutionContext | null;
  a2a_response: Record<string, unknown> | null;
  duration_ms: number | null;
  status: string;
  dedupe_key?: string | null;
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

  async getTriggers(orgSlug: string, sourceType?: string): Promise<Trigger[]> {
    let query = this.db
      .from(SCHEMA, 'triggers')
      .select('*')
      .eq('org_slug', orgSlug)
      .eq('enabled', true);

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch triggers: ${error.message}`);
    }

    return (data ?? []) as Trigger[];
  }

  async getTriggersByProduct(product: 'pulse' | 'bridge'): Promise<Trigger[]> {
    const { data, error } = await this.db
      .from(SCHEMA, 'triggers')
      .select('*')
      .eq('product', product)
      .eq('enabled', true);

    if (error) {
      throw new Error(`Failed to fetch triggers for product ${product}: ${error.message}`);
    }

    return (data ?? []) as Trigger[];
  }

  async getTriggersByProductAndSource(
    product: 'pulse' | 'bridge',
    sourceType: string,
  ): Promise<Trigger[]> {
    const { data, error } = await this.db
      .from(SCHEMA, 'triggers')
      .select('*')
      .eq('product', product)
      .eq('source_type', sourceType)
      .eq('enabled', true);

    if (error) {
      throw new Error(
        `Failed to fetch triggers for product=${product} source_type=${sourceType}: ${error.message}`,
      );
    }

    return (data ?? []) as Trigger[];
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

  async getRecentExecutions(triggerId?: string, limit = 50): Promise<TriggerExecution[]> {
    let query = this.db
      .from(SCHEMA, 'trigger_executions')
      .select('*')
      .order('fired_at', { ascending: false })
      .limit(limit);

    if (triggerId) {
      query = query.eq('trigger_id', triggerId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch recent executions: ${error.message}`);
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

  async createTrigger(record: Omit<Trigger, 'id' | 'created_at' | 'updated_at' | 'last_fired_at'>): Promise<Trigger> {
    const { data, error } = await this.db
      .from(SCHEMA, 'triggers')
      .insert(record)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create trigger: ${error.message}`);
    }

    return data as Trigger;
  }

  async updateTrigger(id: string, update: Partial<Omit<Trigger, 'id' | 'created_at' | 'product'>>): Promise<Trigger | null> {
    const { data, error } = await this.db
      .from(SCHEMA, 'triggers')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('product', 'pulse')
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update trigger ${id}: ${error.message}`);
    }

    return data as Trigger | null;
  }

  async deleteTrigger(id: string): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, 'triggers')
      .delete()
      .eq('id', id)
      .eq('product', 'pulse');

    if (error) {
      throw new Error(`Failed to delete trigger ${id}: ${error.message}`);
    }
  }
}
