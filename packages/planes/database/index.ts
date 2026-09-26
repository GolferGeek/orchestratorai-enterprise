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
export { DATABASE_JOB_QUEUE_SERVICE } from './database-job-queue.interface';
export type {
  DatabaseJobQueueService,
  JobQueueClaimOptions,
  JobQueueReclaimResult,
  JobQueueTable,
} from './database-job-queue.interface';
export { DatabaseModule } from './database.module';
export { SupabaseService } from './supabase-client.service';
export { getTableName, getSchemaForTable } from './supabase-client.config';
