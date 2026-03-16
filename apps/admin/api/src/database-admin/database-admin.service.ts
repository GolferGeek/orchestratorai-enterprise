import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

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

  async getConfig(): Promise<DatabaseConfigResponse> {
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

    const { data, error } = await this.db.rawQuery(`
      SELECT
        schemaname as schema,
        relname as name,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      WHERE schemaname NOT IN ('auth', 'storage', 'vault', 'pgsodium', 'supabase_functions', 'supabase_migrations', 'extensions', 'graphql', 'graphql_public', 'realtime', 'pgsodium_masks', '_analytics', '_realtime')
      ORDER BY schemaname, relname
    `);

    if (error) {
      throw new Error(`Failed to query tables: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
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

  async getMigrations(): Promise<DatabaseMigrationsResponse> {
    this.logger.log('[DatabaseAdmin] Querying migration history');

    const { data, error } = await this.db.rawQuery(`
      SELECT
        version,
        COALESCE(name, version) as name
      FROM supabase_migrations.schema_migrations
      ORDER BY version DESC
      LIMIT 50
    `);

    if (error) {
      throw new Error(`Failed to query migrations: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    const migrations: MigrationInfo[] = rows.map((row) => ({
      name: (row['name'] as string) ?? (row['version'] as string) ?? '',
      executedAt: (row['version'] as string) ?? '',
      success: true,
    }));

    return { migrations };
  }
}
