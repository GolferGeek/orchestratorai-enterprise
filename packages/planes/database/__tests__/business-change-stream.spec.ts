import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { businessChangeStream } from '../database.module';
import { PostgresqlDatabaseChangeStreamService } from '../postgresql-database-change-stream.service';
import { SupabaseDatabaseChangeStreamService } from '../supabase-database-change-stream.service';

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: jest.fn(async () => ({
      query: jest.fn(async (sql: string) => ({ rows: sql.includes('available') ? [{ available: true }] : [] })),
      on: jest.fn(),
      release: jest.fn(),
    })),
    end: jest.fn(),
  })),
}));

const config = (values: Record<string, string>) =>
  ({
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`Configuration key "${key}" does not exist`);
      return values[key];
    },
  }) as unknown as ConfigService;

/** The company database's change stream is chosen by required config, never defaulted. */
describe('businessChangeStream', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses to start without BUSINESS_CHANGE_STREAM_PROVIDER', () => {
    expect(() => businessChangeStream(config({}))).toThrow(/BUSINESS_CHANGE_STREAM_PROVIDER must be/);
  });

  it('watches a Supabase company database through its own Realtime client', () => {
    const stream = businessChangeStream(
      config({
        BUSINESS_CHANGE_STREAM_PROVIDER: 'supabase_realtime',
        BUSINESS_SUPABASE_URL: 'http://acme.example:54321',
        BUSINESS_SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      }),
    );
    expect(stream).toBeInstanceOf(SupabaseDatabaseChangeStreamService);
    expect(() =>
      businessChangeStream(config({ BUSINESS_CHANGE_STREAM_PROVIDER: 'supabase_realtime', BUSINESS_SUPABASE_URL: 'http://x' })),
    ).toThrow(/BUSINESS_SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('watches a Postgres company database with the BUSINESS_ settings, not the platform\'s', async () => {
    const stream = businessChangeStream(
      config({
        BUSINESS_CHANGE_STREAM_PROVIDER: 'postgresql',
        BUSINESS_DB_PROVIDER: 'postgresql',
        BUSINESS_POSTGRESQL_URL: 'postgresql://company/db',
        POSTGRESQL_URL: 'postgresql://platform/db',
        DATABASE_URL: 'postgresql://platform/db',
      }),
    );
    expect(stream).toBeInstanceOf(PostgresqlDatabaseChangeStreamService);
    await stream.subscribe({ schema: 'public', table: 'orders', events: ['UPDATE'] }, jest.fn());
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ connectionString: 'postgresql://company/db' }));
    await stream.close();
  });

  it('refuses postgresql when the company database is not Postgres', () => {
    expect(() =>
      businessChangeStream(config({ BUSINESS_CHANGE_STREAM_PROVIDER: 'postgresql', BUSINESS_DB_PROVIDER: 'sqlserver' })),
    ).toThrow(/needs BUSINESS_DB_PROVIDER=postgresql/);
  });

  it('with none, says so when something tries to watch the company database', async () => {
    const stream = businessChangeStream(config({ BUSINESS_CHANGE_STREAM_PROVIDER: 'none' }));
    await expect(stream.subscribe({ schema: 'public', table: 'orders', events: ['INSERT'] }, jest.fn())).rejects.toThrow(
      /has no change stream/,
    );
  });
});

describe('PostgresqlDatabaseChangeStreamService connection', () => {
  it('no longer falls back to DATABASE_URL: it reads the same settings as the database service', async () => {
    const stream = new PostgresqlDatabaseChangeStreamService(config({ DATABASE_URL: 'postgresql://elsewhere/db' }), '');
    await expect(stream.subscribe({ schema: 'public', table: 'orders', events: ['INSERT'] }, jest.fn())).rejects.toThrow(
      /PG_HOST/,
    );
  });
});
