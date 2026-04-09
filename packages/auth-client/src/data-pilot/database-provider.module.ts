import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DATABASE_PROVIDER,
  DatabaseProvider,
} from './database-provider.interface';
import { SupabaseDatabaseProviderService } from './supabase-database-provider.service';
import { SqlServerDatabaseProviderService } from './sqlserver-database-provider.service';
import { PostgresqlDatabaseProviderService } from './postgresql-database-provider.service';

// Evaluated at module load time before NestJS DI wires anything.
// SupabaseModule and SupabaseDatabaseProviderService are only registered when
// DB_PROVIDER is supabase or supabase_pg. On Azure (sqlserver) and GCP
// (postgresql) deployments they are excluded entirely to prevent
// SupabaseService from initialising without its required env vars.
const dbProvider = process.env.DB_PROVIDER || 'supabase';
const needsSupabase = dbProvider === 'supabase' || dbProvider === 'supabase_pg';

@Global()
@Module({
  // SupabaseService is provided by @Global DatabaseModule
  providers: [
    ...(needsSupabase ? [SupabaseDatabaseProviderService] : []),
    SqlServerDatabaseProviderService,
    PostgresqlDatabaseProviderService,
    {
      provide: DATABASE_PROVIDER,
      useFactory: (
        configService: ConfigService,
        sqlServerProvider: SqlServerDatabaseProviderService,
        postgresqlProvider: PostgresqlDatabaseProviderService,
        supabaseProvider?: SupabaseDatabaseProviderService,
      ): DatabaseProvider => {
        const provider = configService.get<string>('DB_PROVIDER') || 'supabase';
        switch (provider) {
          case 'supabase':
          case 'supabase_pg':
            if (!supabaseProvider) {
              throw new Error(
                'SupabaseDatabaseProviderService not available — DB_PROVIDER is not supabase/supabase_pg',
              );
            }
            return supabaseProvider;
          case 'sqlserver':
            return sqlServerProvider;
          case 'postgresql':
            return postgresqlProvider;
          default:
            throw new Error(
              `Unsupported DB_PROVIDER '${provider}'. Expected: supabase, supabase_pg, sqlserver, postgresql`,
            );
        }
      },
      // Non-supabase providers come first (always present).
      // SupabaseDatabaseProviderService is appended only when needsSupabase,
      // making it the last positional argument (supabaseProvider? in the
      // factory).
      inject: [
        ConfigService,
        SqlServerDatabaseProviderService,
        PostgresqlDatabaseProviderService,
        ...(needsSupabase ? [SupabaseDatabaseProviderService] : []),
      ],
    },
  ],
  exports: [DATABASE_PROVIDER],
})
export class DatabaseProviderModule {}
