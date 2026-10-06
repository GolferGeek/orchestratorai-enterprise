import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase-client.service';
import supabaseConfig from './supabase-client.config';
import { BUSINESS_DATABASE_SERVICE, DATABASE_SERVICE, DatabaseService } from './database.interface';
import { SupabaseDatabaseService } from './supabase-database.service';
import { SqlServerDatabaseService } from './sqlserver-database.service';
import { PostgresqlDatabaseService } from './postgresql-database.service';
import {
  DATABASE_CHANGE_STREAM_SERVICE,
  DatabaseChangeStreamService,
} from './database-change-stream.interface';
import { SupabaseDatabaseChangeStreamService } from './supabase-database-change-stream.service';
import { PostgresqlDatabaseChangeStreamService } from './postgresql-database-change-stream.service';
import {
  DATABASE_JOB_QUEUE_SERVICE,
  DatabaseJobQueueService,
} from './database-job-queue.interface';
import { PostgresDatabaseJobQueueService } from './postgres-database-job-queue.service';

// Evaluated at module load time before NestJS DI wires anything.
// SupabaseService and SupabaseDatabaseService are only registered when
// DB_PROVIDER is supabase or supabase_pg. On Azure (sqlserver) and GCP
// (postgresql) deployments, they are excluded entirely to prevent
// SupabaseService from initialising without its required env vars.
const dbProvider = process.env.DB_PROVIDER || 'supabase';
const needsSupabase = dbProvider === 'supabase' || dbProvider === 'supabase_pg';
const databaseChangeStreamProvider = needsSupabase
  ? SupabaseDatabaseChangeStreamService
  : dbProvider === 'postgresql'
    ? PostgresqlDatabaseChangeStreamService
    : null;
// Every Postgres-backed provider shares one job queue. SQL Server implements
// it when its migration lands; until then the factory refuses to start.
const postgresBacked = needsSupabase || dbProvider === 'postgresql';

@Global()
@Module({
  imports: needsSupabase ? [ConfigModule.forFeature(supabaseConfig)] : [],
  providers: [
    ...(needsSupabase ? [SupabaseService, SupabaseDatabaseService] : []),
    ...(databaseChangeStreamProvider ? [databaseChangeStreamProvider] : []),
    ...(postgresBacked ? [PostgresDatabaseJobQueueService] : []),
    SqlServerDatabaseService,
    PostgresqlDatabaseService,
    {
      provide: DATABASE_SERVICE,
      useFactory: (
        configService: ConfigService,
        sqlServerDb: SqlServerDatabaseService,
        postgresqlDb: PostgresqlDatabaseService,
        supabaseDb?: SupabaseDatabaseService,
      ): DatabaseService => {
        const provider = configService.get<string>('DB_PROVIDER') || 'supabase';
        switch (provider) {
          case 'supabase':
          case 'supabase_pg':
            if (!supabaseDb) {
              throw new Error(
                'SupabaseDatabaseService not available — DB_PROVIDER is not supabase/supabase_pg',
              );
            }
            return supabaseDb;
          case 'sqlserver':
            return sqlServerDb;
          case 'postgresql':
            return postgresqlDb;
          default:
            throw new Error(
              `Unsupported DB_PROVIDER '${provider}'. Expected: supabase, supabase_pg, sqlserver, postgresql`,
            );
        }
      },
      // Non-supabase providers come first (always present).
      // SupabaseDatabaseService is appended only when needsSupabase, making it
      // the last positional argument (supabaseDb? in the factory).
      inject: [
        ConfigService,
        SqlServerDatabaseService,
        PostgresqlDatabaseService,
        ...(needsSupabase ? [SupabaseDatabaseService] : []),
      ],
    },
    {
      // The company's own database. Required, with no default: a deployment
      // with one database sets BUSINESS_DB_PROVIDER and points
      // BUSINESS_POSTGRESQL_URL at that same database. A Supabase company
      // database is reached as postgresql. Settings are the platform's names
      // with a BUSINESS_ prefix.
      provide: BUSINESS_DATABASE_SERVICE,
      useFactory: (configService: ConfigService): DatabaseService => {
        const provider = configService.get<string>('BUSINESS_DB_PROVIDER');
        switch (provider) {
          case 'postgresql':
            return new PostgresqlDatabaseService(configService, 'BUSINESS_');
          case 'sqlserver':
            return new SqlServerDatabaseService(configService, 'BUSINESS_');
          default:
            throw new Error(
              `BUSINESS_DB_PROVIDER must be postgresql or sqlserver (got '${provider ?? ''}'). ` +
                'It is the company database; with one database, point BUSINESS_POSTGRESQL_URL at the platform database.',
            );
        }
      },
      inject: [ConfigService],
    },
    {
      provide: DATABASE_CHANGE_STREAM_SERVICE,
      useFactory: (
        changeStream?: DatabaseChangeStreamService,
      ): DatabaseChangeStreamService => {
        if (!changeStream) {
          throw new Error(
            `DB_PROVIDER '${dbProvider}' does not implement DATABASE_CHANGE_STREAM_SERVICE`,
          );
        }
        return changeStream;
      },
      inject: databaseChangeStreamProvider
        ? [databaseChangeStreamProvider]
        : [],
    },
    {
      provide: DATABASE_JOB_QUEUE_SERVICE,
      useFactory: (jobQueue?: DatabaseJobQueueService): DatabaseJobQueueService => {
        if (!jobQueue) {
          throw new Error(
            `DB_PROVIDER '${dbProvider}' does not implement DATABASE_JOB_QUEUE_SERVICE`,
          );
        }
        return jobQueue;
      },
      inject: postgresBacked ? [PostgresDatabaseJobQueueService] : [],
    },
  ],
  exports: [
    DATABASE_SERVICE,
    BUSINESS_DATABASE_SERVICE,
    DATABASE_CHANGE_STREAM_SERVICE,
    DATABASE_JOB_QUEUE_SERVICE,
    ...(needsSupabase ? [SupabaseService] : []),
  ],
})
export class DatabaseModule {}
