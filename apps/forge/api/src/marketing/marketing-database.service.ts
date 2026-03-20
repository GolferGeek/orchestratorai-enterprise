import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  DatabaseService,
} from '@orchestratorai/planes/database';

/**
 * Marketing Database Service
 *
 * Provides database access to the marketing schema via the DATABASE_SERVICE plane.
 * This replaces the previous direct pg.Pool approach and works across all database
 * providers (Supabase/PostgreSQL, Azure SQL Server, GCP PostgreSQL).
 *
 * All SQL queries must use fully-qualified table names with the `marketing.` schema
 * prefix (e.g. `SELECT * FROM marketing.content_types`) because rawQuery does not
 * set a search_path and the database plane is provider-agnostic.
 */
@Injectable()
export class MarketingDatabaseService {
  private readonly logger = new Logger(MarketingDatabaseService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Check if Marketing database is available.
   * The database plane is always available if the application started successfully.
   */
  isAvailable(): boolean {
    return true;
  }

  /**
   * Execute a raw SQL query and return the QueryResult.
   * Callers must use fully-qualified `marketing.<table>` names in the SQL text.
   */
  async query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }> {
    const start = Date.now();

    const result = await this.db.rawQuery(text, params);

    if (result.error) {
      this.logger.error(
        `Marketing query failed: ${text.substring(0, 100)}...`,
        result.error.message,
      );
      throw new Error(result.error.message);
    }

    const duration = Date.now() - start;
    if (duration > 1000) {
      this.logger.warn(
        `Slow Marketing query (${duration}ms): ${text.substring(0, 100)}...`,
      );
    }

    const rows = (result.data as T[]) ?? [];
    return { rows };
  }

  /**
   * Execute a query and return the first row, or null if no rows matched.
   * Callers must use fully-qualified `marketing.<table>` names in the SQL text.
   */
  async queryOne<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows[0] ?? null;
  }

  /**
   * Execute a query and return all rows.
   * Callers must use fully-qualified `marketing.<table>` names in the SQL text.
   */
  async queryAll<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]> {
    const result = await this.query<T>(text, params);
    return result.rows;
  }

  /**
   * Execute a sequence of operations that should be treated as a unit.
   *
   * TODO: DATABASE_SERVICE does not yet expose transaction primitives
   * (BEGIN / COMMIT / ROLLBACK). Until it does, operations are executed
   * sequentially without an explicit transaction. Any failure after the
   * first successful write will leave partial state. Implement proper
   * transaction support once the database plane exposes it.
   */
  async withTransaction<T>(
    callback: (execute: typeof this.queryAll) => Promise<T>,
  ): Promise<T> {
    this.logger.warn(
      'withTransaction called but DATABASE_SERVICE does not yet support explicit transactions — running sequentially without atomicity',
    );
    return callback(this.queryAll.bind(this));
  }

  /**
   * Health check for the Marketing database connection.
   */
  async checkHealth(): Promise<{ status: string; message: string }> {
    try {
      const result = await this.db.rawQuery('SELECT NOW() as time');

      if (result.error) {
        return {
          status: 'error',
          message: result.error.message,
        };
      }

      const rows = result.data as Array<{ time: string }> | null;
      const time = rows?.[0]?.time ?? 'unknown';
      return {
        status: 'ok',
        message: `Connected at ${time}`,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
