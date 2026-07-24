import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase-client.service';
import supabaseConfig from './supabase-client.config';
import { DATABASE_SERVICE, DatabaseService } from './database.interface';
import { SupabaseDatabaseService } from './supabase-database.service';
import { SqlServerDatabaseService } from './sqlserver-database.service';
import { PostgresqlDatabaseService } from './postgresql-database.service';
import {
  DATABASE_CHANGE_STREAM_SERVICE,
  DatabaseChangeStreamService,
} from './database-change-stream.interface';
import { SupabaseDatabaseChangeStreamService } from './supabase-database-change-stream.service';
import { PostgresqlDatabaseChangeStreamService } from './postgresql-database-change-stream.service';

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

@Global()
@Module({
  imports: needsSupabase ? [ConfigModule.forFeature(supabaseConfig)] : [],
  providers: [
    ...(needsSupabase ? [SupabaseService, SupabaseDatabaseService] : []),
    ...(databaseChangeStreamProvider ? [databaseChangeStreamProvider] : []),
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
  ],
  exports: [
    DATABASE_SERVICE,
    DATABASE_CHANGE_STREAM_SERVICE,
    ...(needsSupabase ? [SupabaseService] : []),
  ],
})
export class DatabaseModule {}
