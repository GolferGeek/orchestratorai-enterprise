/**
 * Re-export shim — Database plane now lives in planes/database/.
 * This file preserves existing import paths throughout the codebase.
 */
export { DATABASE_SERVICE } from '@orchestratorai/planes/database';
export type {
  DatabaseService,
  QueryResult,
  QueryBuilder,
} from '@orchestratorai/planes/database';
export { SupabaseDatabaseService } from '@orchestratorai/planes/database';
export { SqlServerDatabaseService } from '@orchestratorai/planes/database';
export { DatabaseModule } from '@orchestratorai/planes/database';
