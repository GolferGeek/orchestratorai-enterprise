import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { SupabaseService } from './supabase-client.service';
import {
  DatabaseService,
  QueryBuilder,
  QueryResult,
} from './database.interface';
import { PostgresQueryBuilder } from './postgresql-database.service';

/**
 * Supabase implementation of DatabaseService.
 *
 * Uses direct Postgres (pg.Pool) for all query operations via PostgresQueryBuilder.
 * This bypasses the PostgREST/Kong REST gateway, enabling schema-qualified queries
 * (e.g. authz.users) and maintaining parity with the PostgreSQL and SQL Server
 * providers which also use direct database connections.
 *
 * SupabaseService is retained only for auth-specific operations (getUser, signIn)
 * and configuration — all data queries go direct to Postgres.
 */
@Injectable()
export class SupabaseDatabaseService implements DatabaseService {
  private readonly logger = new Logger(SupabaseDatabaseService.name);
  private pool: Pool | null = null;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  from(schema: string | null, table: string): QueryBuilder {
    return new PostgresQueryBuilder(
      () => Promise.resolve(this.getPool()),
      schema,
      table,
    );
  }

  async rpc(
    functionName: string,
    args?: Record<string, unknown>,
    schema?: string | null,
  ): Promise<QueryResult> {
    const pool = this.getPool();
    const qualifiedName = schema
      ? `"${schema}"."${functionName}"`
      : `"${functionName}"`;

    const params: unknown[] = [];
    let argList = '';
    if (args) {
      const entries = Object.entries(args);
      argList = entries.map((_, i) => `$${i + 1}`).join(', ');
      params.push(...entries.map(([, v]) => v));
    }

    try {
      const sql = `SELECT * FROM ${qualifiedName}(${argList})`;
      const result = await pool.query(sql, params);
      return {
        data: result.rows,
        error: null,
        count: result.rowCount ?? null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message } };
    }
  }

  async checkConnection(): Promise<{ status: string; message: string }> {
    return this.supabaseService.checkConnection();
  }

  async rawQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    try {
      const pool = this.getPool();
      const result = await pool.query(sql, params ?? []);
      return { data: result.rows, error: null, count: result.rowCount ?? null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message } };
    }
  }

  getConfig() {
    const config = this.supabaseService.getConfig();
    return {
      provider: 'supabase',
      url: config.url,
      schemas: [...new Set([config.coreSchema, config.companySchema])],
      clientsAvailable: config.clientsAvailable,
    };
  }

  private getConnectionString(): string {
    const url = this.configService.get<string>('DATABASE_URL');
    if (!url) {
      throw new Error(
        'DATABASE_URL is required for raw query and checkpoint support',
      );
    }
    return url;
  }

  private getPool(): Pool {
    if (this.pool) {
      return this.pool;
    }
    const connectionString = this.getConnectionString();
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    return this.pool;
  }
}
