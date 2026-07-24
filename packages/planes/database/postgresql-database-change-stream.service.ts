import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import {
  DatabaseChangeEvent,
  DatabaseChangeEventType,
  DatabaseChangeHandler,
  DatabaseChangeStreamService,
  DatabaseChangeSubscription,
} from './database-change-stream.interface';

interface RegisteredSubscription extends DatabaseChangeSubscription {
  handler: DatabaseChangeHandler;
}

interface DatabaseChangeRow {
  schema_name: string;
  table_name: string;
  event_type: DatabaseChangeEventType;
  new_record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

@Injectable()
export class PostgresqlDatabaseChangeStreamService
  implements DatabaseChangeStreamService, OnModuleDestroy
{
  private static readonly channel = 'orchestratorai_database_changes';
  private readonly logger = new Logger(
    PostgresqlDatabaseChangeStreamService.name,
  );
  private readonly subscriptions = new Map<string, RegisteredSubscription>();
  private pool: Pool | null = null;
  private client: PoolClient | null = null;
  private connectionError: Error | null = null;

  constructor(private readonly configService: ConfigService) {}

  async subscribe(
    subscription: DatabaseChangeSubscription,
    handler: DatabaseChangeHandler,
  ): Promise<() => Promise<void>> {
    this.validateSubscription(subscription);
    const client = await this.getClient();
    await this.ensureCaptureTrigger(client, subscription);

    const subscriptionId = randomUUID();
    this.subscriptions.set(subscriptionId, { ...subscription, handler });

    return async () => {
      this.subscriptions.delete(subscriptionId);
    };
  }

  async close(): Promise<void> {
    this.subscriptions.clear();
    if (this.client) {
      await this.client.query(
        `UNLISTEN ${PostgresqlDatabaseChangeStreamService.channel}`,
      );
      this.client.release();
      this.client = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.connectionError = null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private async getClient(): Promise<PoolClient> {
    if (this.connectionError) {
      throw this.connectionError;
    }
    if (this.client) {
      return this.client;
    }

    this.pool = new Pool({
      connectionString: this.resolveConnectionString(),
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    this.client = await this.pool.connect();
    this.client.on('error', (error: Error) => {
      this.connectionError = error;
      this.logger.error('PostgreSQL change-stream connection failed', error);
    });
    this.client.on('notification', (notification) => {
      if (
        notification.channel !== PostgresqlDatabaseChangeStreamService.channel
      ) {
        return;
      }
      void this.handleNotification(notification.payload);
    });
    await this.client.query(
      `LISTEN ${PostgresqlDatabaseChangeStreamService.channel}`,
    );
    return this.client;
  }

  private async handleNotification(payload: string | undefined): Promise<void> {
    try {
      if (!payload || !/^[1-9][0-9]*$/.test(payload)) {
        throw new Error(
          `Invalid PostgreSQL database-change notification payload '${payload}'`,
        );
      }
      const pool = this.requirePool();
      const result = await pool.query<DatabaseChangeRow>(
        `SELECT schema_name, table_name, event_type, new_record, old_record
         FROM ambient.database_change_events
         WHERE id = $1`,
        [payload],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error(`Database change event '${payload}' was not found`);
      }
      const event: DatabaseChangeEvent = {
        schema: row.schema_name,
        table: row.table_name,
        eventType: row.event_type,
        new: row.new_record,
        old: row.old_record,
      };
      for (const subscription of this.subscriptions.values()) {
        if (
          subscription.schema === event.schema &&
          subscription.table === event.table &&
          subscription.events.includes(event.eventType)
        ) {
          subscription.handler(event);
        }
      }
    } catch (error) {
      this.connectionError =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Failed to process PostgreSQL database-change notification',
        this.connectionError,
      );
    }
  }

  private async ensureCaptureTrigger(
    client: PoolClient,
    subscription: DatabaseChangeSubscription,
  ): Promise<void> {
    const triggerName = `orchestratorai_change_${createHash('sha256')
      .update(`${subscription.schema}.${subscription.table}`)
      .digest('hex')
      .slice(0, 20)}`;
    const qualifiedTable = `${this.quoteIdentifier(
      subscription.schema,
    )}.${this.quoteIdentifier(subscription.table)}`;
    const quotedTrigger = this.quoteIdentifier(triggerName);
    const lockKey = `${subscription.schema}.${subscription.table}`;

    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        lockKey,
      ]);
      const functionResult = await client.query<{ available: boolean }>(
        `SELECT to_regprocedure('ambient.capture_database_change()') IS NOT NULL AS available`,
      );
      if (!functionResult.rows[0]?.available) {
        throw new Error(
          'Missing ambient.capture_database_change(). Apply the GCP/PostgreSQL migrations before starting the API.',
        );
      }
      const triggerResult = await client.query<{ available: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM pg_trigger
           WHERE tgname = $1
             AND tgrelid = $2::regclass
             AND NOT tgisinternal
         ) AS available`,
        [triggerName, `${subscription.schema}.${subscription.table}`],
      );
      if (!triggerResult.rows[0]?.available) {
        await client.query(
          `CREATE TRIGGER ${quotedTrigger}
           AFTER INSERT OR UPDATE OR DELETE ON ${qualifiedTable}
           FOR EACH ROW EXECUTE FUNCTION ambient.capture_database_change()`,
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  private validateSubscription(subscription: DatabaseChangeSubscription): void {
    this.validateIdentifier('schema', subscription.schema);
    this.validateIdentifier('table', subscription.table);
    if (subscription.events.length === 0) {
      throw new Error(
        'Database change subscriptions require at least one event',
      );
    }
    const allowedEvents = new Set<DatabaseChangeEventType>([
      'INSERT',
      'UPDATE',
      'DELETE',
    ]);
    for (const event of subscription.events) {
      if (!allowedEvents.has(event)) {
        throw new Error(`Invalid PostgreSQL database change event '${event}'`);
      }
    }
  }

  private validateIdentifier(label: string, value: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      throw new Error(`Invalid PostgreSQL ${label} identifier '${value}'`);
    }
  }

  private quoteIdentifier(value: string): string {
    return `"${value}"`;
  }

  private resolveConnectionString(): string {
    const connectionString =
      this.configService.get<string>('POSTGRESQL_URL') ??
      this.configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error(
        'PostgreSQL database change stream requires POSTGRESQL_URL or DATABASE_URL',
      );
    }
    return connectionString;
  }

  private requirePool(): Pool {
    if (!this.pool) {
      throw new Error(
        'PostgreSQL database change-stream pool is not initialized',
      );
    }
    return this.pool;
  }
}
