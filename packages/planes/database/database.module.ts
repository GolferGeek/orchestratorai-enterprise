import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase-client.service';
import supabaseConfig from './supabase-client.config';
import { BUSINESS_DATABASE_SERVICE, DATABASE_SERVICE, DatabaseService } from './database.interface';
import { SupabaseDatabaseService } from './supabase-database.service';
import { SqlServerDatabaseService } from './sqlserver-database.service';
import { PostgresqlDatabaseService } from './postgresql-database.service';
import { createClient } from '@supabase/supabase-js';
import {
  BUSINESS_DATABASE_CHANGE_STREAM_SERVICE,
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
// Every Postgres-backed provider shares one job queue. SQL Server implements
// it when its migration lands; until then the factory refuses to start.
const postgresBacked = needsSupabase || dbProvider === 'postgresql';

/** The company database's change stream (BUSINESS_CHANGE_STREAM_PROVIDER). */
export function businessChangeStream(configService: ConfigService): DatabaseChangeStreamService {
  const provider = configService.get<string>('BUSINESS_CHANGE_STREAM_PROVIDER');
  switch (provider) {
    case 'supabase_realtime':
      return new SupabaseDatabaseChangeStreamService(
        createClient(
          configService.getOrThrow<string>('BUSINESS_SUPABASE_URL'),
          configService.getOrThrow<string>('BUSINESS_SUPABASE_SERVICE_ROLE_KEY'),
          { auth: { persistSession: false, autoRefreshToken: false } },
        ),
      );
    case 'postgresql':
      if (configService.get<string>('BUSINESS_DB_PROVIDER') !== 'postgresql') {
        throw new Error('BUSINESS_CHANGE_STREAM_PROVIDER=postgresql needs BUSINESS_DB_PROVIDER=postgresql');
      }
      return new PostgresqlDatabaseChangeStreamService(configService, 'BUSINESS_');
    case 'none':
      return {
        subscribe: () =>
          Promise.reject(
            new Error('The company database has no change stream (BUSINESS_CHANGE_STREAM_PROVIDER=none)'),
          ),
        close: () => Promise.resolve(),
      };
    default:
      throw new Error(
        `BUSINESS_CHANGE_STREAM_PROVIDER must be supabase_realtime, postgresql or none (got '${provider ?? ''}'). ` +
          'It is how ambient watches tables in the company database.',
      );
  }
}

@Global()
@Module({
  imports: needsSupabase ? [ConfigModule.forFeature(supabaseConfig)] : [],
  providers: [
    ...(needsSupabase ? [SupabaseService, SupabaseDatabaseService] : []),
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
      // Changes in the platform database, through its own provider.
      provide: DATABASE_CHANGE_STREAM_SERVICE,
      useFactory: (
        configService: ConfigService,
        supabase?: SupabaseService,
      ): DatabaseChangeStreamService => {
        if (needsSupabase) {
          if (!supabase) {
            throw new Error('SupabaseService is not available for the platform change stream');
          }
          return new SupabaseDatabaseChangeStreamService(supabase.getServiceClient());
        }
        if (dbProvider === 'postgresql') {
          return new PostgresqlDatabaseChangeStreamService(configService, '');
        }
        throw new Error(
          `DB_PROVIDER '${dbProvider}' does not implement DATABASE_CHANGE_STREAM_SERVICE`,
        );
      },
      inject: [ConfigService, ...(needsSupabase ? [SupabaseService] : [])],
    },
    {
      // Changes in the company database. Required, with no default, like
      // BUSINESS_DB_PROVIDER: supabase_realtime (a Supabase company database;
      // its tables in the supabase_realtime publication, nothing installed),
      // postgresql (triggers through ambient.capture_database_change(), which
      // that database must have; read with the BUSINESS_ settings), or none
      // (no watches on the company database; subscribing says so).
      provide: BUSINESS_DATABASE_CHANGE_STREAM_SERVICE,
      useFactory: (configService: ConfigService): DatabaseChangeStreamService =>
        businessChangeStream(configService),
      inject: [ConfigService],
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
    BUSINESS_DATABASE_CHANGE_STREAM_SERVICE,
    DATABASE_JOB_QUEUE_SERVICE,
    ...(needsSupabase ? [SupabaseService] : []),
  ],
})
export class DatabaseModule {}
