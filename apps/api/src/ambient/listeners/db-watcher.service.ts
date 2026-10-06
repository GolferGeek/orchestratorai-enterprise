import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  BUSINESS_DATABASE_CHANGE_STREAM_SERVICE,
  DATABASE_CHANGE_STREAM_SERVICE,
  DATABASE_CONNECTION_NAMES,
  DatabaseChangeEvent,
  DatabaseChangeEventType,
  DatabaseChangeStreamService,
  DatabaseConnectionName,
} from '@orchestratorai/planes/database';
import { ListenerRegistryService } from './listener-registry.service';
import { StreamingService } from '../streaming/streaming.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import {
  AmbientDatabaseService,
  Trigger,
} from '../ambient-database/database.service';

/**
 * Database watcher — subscribes through the database change-stream plane.
 *
 * On init:
 *   1. Loads active 'database' triggers from ambient.triggers
 *   2. Subscribes each on the database it names (source_config.connection:
 *      'platform' or 'business', required, no default)
 *   3. Emits AmbientEvents to the event bus when changes arrive
 *
 * simulateEvent() remains available for development/demo use.
 */
@Injectable()
export class DbWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbWatcherService.name);
  private readonly LISTENER_ID = 'db-watcher-main';
  private readonly unsubscribeCallbacks: Array<() => Promise<void>> = [];

  constructor(
    private readonly registry: ListenerRegistryService,
    private readonly streaming: StreamingService,
    private readonly eventBus: AmbientEventBusService,
    private readonly database: AmbientDatabaseService,
    @Inject(DATABASE_CHANGE_STREAM_SERVICE)
    private readonly platformChanges: DatabaseChangeStreamService,
    @Inject(BUSINESS_DATABASE_CHANGE_STREAM_SERVICE)
    private readonly businessChanges: DatabaseChangeStreamService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.registry.listenersEnabled) {
      this.logger.log('DB Watcher off (AMBIENT_LISTENERS_ENABLED=false)');
      return;
    }
    this.registry.register(this.LISTENER_ID, 'db-watcher', 'Database Watcher');
    this.registry.activate(this.LISTENER_ID);
    this.logger.log('DB Watcher initialized — loading triggers from database');

    const triggers = await this.database.getEnabledTriggersBySource('database');

    if (triggers.length === 0) {
      this.logger.log('No active database triggers found');
      return;
    }

    for (const trigger of triggers) {
      await this.subscribeToTrigger(trigger);
    }

    this.logger.log(
      `DB Watcher subscribed to ${triggers.length} database trigger(s)`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      this.unsubscribeCallbacks.map((unsubscribe) => unsubscribe()),
    );
    this.unsubscribeCallbacks.length = 0;
    this.registry.deactivate(this.LISTENER_ID);
    this.logger.log('DB Watcher stopped — all subscriptions removed');
  }

  private async subscribeToTrigger(trigger: Trigger): Promise<void> {
    const config = trigger.source_config as {
      connection?: string;
      table?: string;
      schema?: string;
      events?: DatabaseChangeEventType[];
    };

    if (!config.table) {
      throw new Error(
        `Database trigger '${trigger.id}' is missing source_config.table`,
      );
    }
    const connection = config.connection as DatabaseConnectionName;
    if (!DATABASE_CONNECTION_NAMES.includes(connection)) {
      throw new Error(
        `Database trigger '${trigger.id}' must name its database in source_config.connection (platform or business), not '${config.connection ?? ''}'`,
      );
    }
    const table = config.table;
    const schema = config.schema ?? 'public';
    const events = config.events ?? ['INSERT', 'UPDATE', 'DELETE'];
    const stream = connection === 'business' ? this.businessChanges : this.platformChanges;

    const unsubscribe = await stream.subscribe(
      { table, schema, events },
      (event) => this.handleDatabaseChange(trigger, connection, event),
    );
    this.unsubscribeCallbacks.push(unsubscribe);
  }

  private handleDatabaseChange(
    trigger: Trigger,
    connection: DatabaseConnectionName,
    event: DatabaseChangeEvent,
  ): void {
    this.logger.log(
      `Database change received for trigger "${trigger.name}": ${event.eventType} on ${connection}:${event.schema}.${event.table}`,
    );
    this.registry.recordFiring(this.LISTENER_ID);

    this.eventBus.emit({
      orgSlug: trigger.org_slug,
      sourceType: 'database',
      triggerId: trigger.id,
      triggerName: trigger.name,
      payload: {
        connection,
        table: event.table,
        schema: event.schema,
        eventType: event.eventType,
        new: event.new,
        old: event.old,
      },
      timestamp: new Date().toISOString(),
    });

    this.streaming.emitListenerFired(
      trigger.org_slug,
      'db-watcher',
      `database:${connection}:${event.schema}.${event.table}`,
      {
        connection,
        table: event.table,
        schema: event.schema,
        eventType: event.eventType,
      },
    );
  }

  /**
   * Simulates a DB change event for testing/demo purposes.
   * Emits directly to the event bus so the full evaluator pipeline runs.
   */
  simulateEvent(
    orgSlug: string,
    table: string,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: Record<string, unknown>,
  ): void {
    this.registry.recordFiring(this.LISTENER_ID);
    this.logger.log(`DB event simulated: ${eventType} on ${table}`);

    this.eventBus.emit({
      orgSlug,
      sourceType: 'database',
      payload: { table, eventType, data: payload },
      timestamp: new Date().toISOString(),
    });

    this.streaming.emitListenerFired(orgSlug, 'db-watcher', `database:${table}`, {
      table,
      eventType,
      payload,
    });
  }
}
