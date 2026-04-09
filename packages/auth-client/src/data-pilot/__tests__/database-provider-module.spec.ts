import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '@orchestratorai/planes/database';
import { DATABASE_SERVICE, DatabaseService } from '@orchestratorai/planes/database';
import { DATABASE_PROVIDER, DatabaseProvider } from '../database-provider.interface';
import { DatabaseProviderModule } from '../database-provider.module';
import { SupabaseDatabaseProviderService } from '../supabase-database-provider.service';
import { SqlServerDatabaseProviderService } from '../sqlserver-database-provider.service';
import { PostgresqlDatabaseProviderService } from '../postgresql-database-provider.service';

/** Minimal SupabaseService mock — avoids real connection */
const mockSupabaseService: Partial<SupabaseService> = {
  getServiceClient: jest.fn().mockReturnValue({}),
};

/** Minimal DatabaseService mock for sql-server / postgresql providers */
const mockDatabaseService: Partial<DatabaseService> = {
  rawQuery: jest.fn().mockResolvedValue({ data: [], error: null }),
  from: jest.fn(),
  rpc: jest.fn(),
  checkConnection: jest.fn(),
  getConfig: jest.fn(),
  getCheckpointSaver: jest.fn(),
};

async function buildModule(dbProvider: string) {
  // Store original so we can restore after each test
  const origDbProvider = process.env.DB_PROVIDER;
  process.env.DB_PROVIDER = dbProvider;

  // DatabaseProviderModule reads process.env at import/module-load time via a
  // top-level const.  Because Jest re-uses the module between tests in the same
  // file, we must override at the provider level rather than rely on process.env
  // mutating the top-level const.  We do it by overriding ConfigService to
  // return the desired value AND by overriding SupabaseService so the Supabase
  // provider (when present) compiles without error.
  const module = await Test.createTestingModule({
    imports: [DatabaseProviderModule],
  })
    .overrideProvider(SupabaseService)
    .useValue(mockSupabaseService)
    .overrideProvider(DATABASE_SERVICE)
    .useValue(mockDatabaseService)
    .overrideProvider(ConfigService)
    .useValue({
      get: (key: string) => (key === 'DB_PROVIDER' ? dbProvider : undefined),
    })
    .compile();

  process.env.DB_PROVIDER = origDbProvider;
  return module;
}

describe('DatabaseProviderModule wiring', () => {
  describe('with DB_PROVIDER=supabase', () => {
    it('resolves DATABASE_PROVIDER to SupabaseDatabaseProviderService', async () => {
      const module = await buildModule('supabase');
      const provider = module.get<DatabaseProvider>(DATABASE_PROVIDER);
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(SupabaseDatabaseProviderService);
    });
  });

  describe('with DB_PROVIDER=supabase_pg', () => {
    it('resolves DATABASE_PROVIDER to SupabaseDatabaseProviderService', async () => {
      const module = await buildModule('supabase_pg');
      const provider = module.get<DatabaseProvider>(DATABASE_PROVIDER);
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(SupabaseDatabaseProviderService);
    });
  });

  describe('with DB_PROVIDER=sqlserver', () => {
    it('resolves DATABASE_PROVIDER to SqlServerDatabaseProviderService', async () => {
      const module = await buildModule('sqlserver');
      const provider = module.get<DatabaseProvider>(DATABASE_PROVIDER);
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(SqlServerDatabaseProviderService);
    });
  });

  describe('with DB_PROVIDER=postgresql', () => {
    it('resolves DATABASE_PROVIDER to PostgresqlDatabaseProviderService', async () => {
      const module = await buildModule('postgresql');
      const provider = module.get<DatabaseProvider>(DATABASE_PROVIDER);
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(PostgresqlDatabaseProviderService);
    });
  });

  describe('with unknown DB_PROVIDER', () => {
    it('throws at compile time for unrecognised provider', async () => {
      await expect(buildModule('unknown_provider')).rejects.toThrow(
        "Unsupported DB_PROVIDER 'unknown_provider'",
      );
    });
  });

  describe('DATABASE_PROVIDER is exported from the module', () => {
    it('is accessible via module.get after import', async () => {
      const module = await buildModule('sqlserver');
      // get() throws if the token is not provided/exported
      expect(() => module.get(DATABASE_PROVIDER)).not.toThrow();
    });
  });
});
