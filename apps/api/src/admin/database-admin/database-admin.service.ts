import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestratorai/planes/database';

type DbError = { message: string } | null;

export interface DatabaseHealthResponse {
  status: string;
  message: string;
  checkedAt: string;
}

export interface DatabaseConfigResponse {
  provider: string;
  url: string;
  schemas: string[];
  clientsAvailable: { service: boolean; anon: boolean };
  checkedAt: string;
}

export interface TableInfo {
  schema: string;
  name: string;
  rowCount: number;
}

export interface DatabaseTablesResponse {
  tables: TableInfo[];
  totalCount: number;
}

export interface MigrationInfo {
  name: string;
  executedAt: string;
  success: true;
}

export interface DatabaseMigrationsResponse {
  migrations: MigrationInfo[];
}

/**
 * DatabaseAdminService — exposes database health, configuration, table listing,
 * and migration history for the Admin UI.
 *
 * No fallbacks: errors from database calls propagate to the caller.
 */
@Injectable()
export class DatabaseAdminService {
  private readonly logger = new Logger(DatabaseAdminService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async getHealth(): Promise<DatabaseHealthResponse> {
    this.logger.log('[DatabaseAdmin] Checking database connection');

    const result = await this.db.checkConnection();

    return {
      status: result.status,
      message: result.message,
      checkedAt: new Date().toISOString(),
    };
  }

  getConfig(): DatabaseConfigResponse {
    this.logger.log('[DatabaseAdmin] Fetching database configuration');

    const config = this.db.getConfig();

    return {
      provider: config.provider,
      url: config.url,
      schemas: config.schemas,
      clientsAvailable: config.clientsAvailable,
      checkedAt: new Date().toISOString(),
    };
  }

  async getTables(): Promise<DatabaseTablesResponse> {
    this.logger.log('[DatabaseAdmin] Querying user tables');

    const result = (await this.db.rawQuery(`
      SELECT
        schemaname as schema,
        relname as name,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      WHERE schemaname NOT IN ('auth', 'storage', 'vault', 'pgsodium', 'supabase_functions', 'supabase_migrations', 'extensions', 'graphql', 'graphql_public', 'realtime', 'pgsodium_masks', '_analytics', '_realtime')
      ORDER BY schemaname, relname
    `)) as { data: Record<string, unknown>[] | null; error: DbError };

    if (result.error) {
      throw new Error(`Failed to query tables: ${result.error.message}`);
    }

    const rows = result.data ?? [];
    const tables: TableInfo[] = rows.map((row) => ({
      schema: (row['schema'] as string) ?? '',
      name: (row['name'] as string) ?? '',
      rowCount: Number(row['row_count'] ?? 0),
    }));

    return {
      tables,
      totalCount: tables.length,
    };
  }

  /**
   * The newest 50 migrations applied, from public.deployment_migrations: the
   * ledger scripts/migrate-deployed.sh and scripts/baseline/bootstrap.sh
   * keep. (supabase_migrations.schema_migrations belongs to the Supabase CLI
   * and does not exist on a database built from the baseline.)
   */
  async getMigrations(): Promise<DatabaseMigrationsResponse> {
    this.logger.log('[DatabaseAdmin] Querying migration history');

    const result = (await this.db.rawQuery(`
      SELECT filename, applied_at
      FROM public.deployment_migrations
      ORDER BY version DESC
      LIMIT 50
    `)) as { data: Record<string, unknown>[] | null; error: DbError };

    if (result.error) {
      throw new Error(`Failed to query migrations: ${result.error.message}`);
    }

    const migrations: MigrationInfo[] = (result.data ?? []).map((row) => ({
      name: row['filename'] as string,
      executedAt: new Date(row['applied_at'] as string | Date).toISOString(),
      success: true,
    }));

    return { migrations };
  }
}
