/**
 * Re-export shim — Database plane now lives in planes/database/.
 * This file preserves existing import paths throughout the codebase.
 */
export { DATABASE_SERVICE } from '../planes/database/database.interface';
export type {
  DatabaseService,
  QueryResult,
  QueryBuilder,
} from '../planes/database/database.interface';
export { SupabaseDatabaseService } from '../planes/database/supabase-database.service';
export { SqlServerDatabaseService } from '../planes/database/sqlserver-database.service';
export { DatabaseModule } from '../planes/database/database.module';
