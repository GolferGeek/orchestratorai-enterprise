export { DATABASE_SERVICE } from './database.interface';
export type {
  DatabaseService,
  QueryResult,
  QueryBuilder,
} from './database.interface';
export { DATABASE_CHANGE_STREAM_SERVICE } from './database-change-stream.interface';
export type {
  DatabaseChangeEvent,
  DatabaseChangeEventType,
  DatabaseChangeHandler,
  DatabaseChangeStreamService,
  DatabaseChangeSubscription,
} from './database-change-stream.interface';
export { DatabaseModule } from './database.module';
export { SupabaseService } from './supabase-client.service';
export { getTableName, getSchemaForTable } from './supabase-client.config';
