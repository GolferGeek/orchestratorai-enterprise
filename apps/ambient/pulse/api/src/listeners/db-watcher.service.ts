import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ListenerRegistryService } from './listener-registry.service';
import { StreamingService } from '../streaming/streaming.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';

/**
 * Database watcher — subscribes to Supabase Realtime postgres_changes events.
 *
 * On init:
 *   1. Loads active 'database' triggers for product='pulse' from ambient.triggers
 *   2. Creates a Supabase Realtime subscription per trigger
 *   3. Emits AmbientEvents to the event bus when changes arrive
 *
 * simulateEvent() remains available for development/demo use.
 */
@Injectable()
export class DbWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbWatcherService.name);
  private readonly LISTENER_ID = 'db-watcher-main';
  private readonly channels = new Map<string, RealtimeChannel>();
  private realtimeClient: SupabaseClient | null = null;

  constructor(
    private readonly registry: ListenerRegistryService,
    private readonly streaming: StreamingService,
    private readonly eventBus: AmbientEventBusService,
    private readonly database: AmbientDatabaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registry.register(this.LISTENER_ID, 'db-watcher', 'Supabase DB Watcher');
    this.registry.activate(this.LISTENER_ID);
    this.logger.log('DB Watcher initialized — loading triggers from database');

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — DB Watcher running in simulation-only mode',
      );
      return;
    }

    this.realtimeClient = createClient(url, key);

    let triggers: Trigger[] = [];
    try {
      triggers = await this.database.getTriggersByProductAndSource('pulse', 'database');
    } catch (err) {
      this.logger.error(`Failed to load database triggers: ${(err as Error).message}`);
      return;
    }

    if (triggers.length === 0) {
      this.logger.log('No active database triggers found for product=pulse');
      return;
    }

    for (const trigger of triggers) {
      this.subscribeToTrigger(trigger);
    }

    this.logger.log(`DB Watcher subscribed to ${triggers.length} database trigger(s)`);
  }

  onModuleDestroy(): void {
    for (const [triggerId, channel] of this.channels.entries()) {
      this.realtimeClient?.removeChannel(channel).catch((err: Error) => {
        this.logger.warn(`Failed to remove Realtime channel for trigger ${triggerId}: ${err.message}`);
      });
    }
    this.channels.clear();
    this.registry.deactivate(this.LISTENER_ID);
    this.logger.log('DB Watcher stopped — all Realtime channels removed');
  }

  private subscribeToTrigger(trigger: Trigger): void {
    const config = trigger.source_config as {
      table?: string;
      schema?: string;
      events?: Array<'INSERT' | 'UPDATE' | 'DELETE'>;
    };

    const table = config.table ?? '*';
    const schema = config.schema ?? 'public';
    const events = config.events ?? ['INSERT', 'UPDATE', 'DELETE'];

    const channelName = `pulse-db-trigger-${trigger.id}`;

    const channel = this.realtimeClient!
      .channel(channelName)
      .on(
        'postgres_changes' as 'system',
        {
          event: events.length === 1 ? events[0]! : '*',
          schema,
          table,
        } as Record<string, string>,
        (payload: Record<string, unknown>) => {
          this.logger.log(
            `Realtime change received for trigger "${trigger.name}": ${payload.eventType} on ${schema}.${table}`,
          );
          this.registry.recordFiring(this.LISTENER_ID);

          this.eventBus.emit({
            sourceType: 'database',
            triggerId: trigger.id,
            triggerName: trigger.name,
            payload: {
              table,
              schema,
              eventType: payload.eventType,
              new: payload.new,
              old: payload.old,
            },
            timestamp: new Date().toISOString(),
          });

          this.streaming.emitListenerFired('db-watcher', `supabase:${schema}.${table}`, {
            table,
            schema,
            eventType: payload.eventType,
          });
        },
      )
      .subscribe((status) => {
        this.logger.log(`Realtime channel "${channelName}" status: ${status}`);
      });

    this.channels.set(trigger.id, channel);
  }

  /**
   * Simulates a DB change event for testing/demo purposes.
   * Emits directly to the event bus so the full evaluator pipeline runs.
   */
  simulateEvent(
    table: string,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: Record<string, unknown>,
  ): void {
    this.registry.recordFiring(this.LISTENER_ID);
    this.logger.log(`DB event simulated: ${eventType} on ${table}`);

    this.eventBus.emit({
      sourceType: 'database',
      payload: { table, eventType, data: payload },
      timestamp: new Date().toISOString(),
    });

    this.streaming.emitListenerFired('db-watcher', `supabase:${table}`, {
      table,
      eventType,
      payload,
    });
  }
}
