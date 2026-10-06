/**
 * Nobody reaches platform data with the public anon key or a Supabase user
 * token (migration 20261006150000): in the app's own schemas, anon and
 * authenticated hold no privilege on any table, view or sequence; every table
 * in public and authz has RLS on; and no SECURITY DEFINER function there is
 * theirs to execute. A migration that adds a table without RLS, or grants
 * anon anything, fails here.
 *
 * Set SECURITY_TEST_DATABASE_URL to run it (skipped otherwise).
 */
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';

const url = process.env.SECURITY_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

/** Supabase's own schemas; it manages their grants. */
const SUPABASE_SCHEMAS = [
  'pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage', 'realtime', '_realtime',
  'extensions', 'graphql', 'graphql_public', 'net', 'pgsodium', 'pgsodium_masks', 'vault',
  'supabase_functions', 'supabase_migrations', 'pgbouncer', 'cron',
];

describeWithDb('the database is closed to anon and authenticated', () => {
  let db: PostgresqlDatabaseService;

  async function sql(text: string, params: unknown[] = []): Promise<string[]> {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return (data as Array<{ name: string }>).map((r) => r.name);
  }

  beforeAll(() => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('grants them nothing on any table, view or sequence of the app', async () => {
    const open = await sql(
      `SELECT n.nspname || '.' || c.relname || ' (' || r.role || ')' AS name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S')
          AND n.nspname <> ALL($1::text[])
          AND (has_table_privilege(r.role, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
               OR (c.relkind = 'S' AND has_sequence_privilege(r.role, c.oid, 'USAGE,SELECT,UPDATE')))
        ORDER BY 1`,
      [SUPABASE_SCHEMAS],
    );
    expect(open).toEqual([]);
  });

  it('has RLS on every table in public and authz', async () => {
    const withoutRls = await sql(
      `SELECT n.nspname || '.' || c.relname AS name
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('public', 'authz') AND NOT c.relrowsecurity
        ORDER BY 1`,
    );
    expect(withoutRls).toEqual([]);
  });

  it('lets them execute no SECURITY DEFINER function of the app', async () => {
    const callable = await sql(
      `SELECT p.oid::regprocedure::text || ' (' || r.role || ')' AS name
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
        WHERE p.prosecdef AND n.nspname <> ALL($1::text[])
          AND has_function_privilege(r.role, p.oid, 'EXECUTE')
        ORDER BY 1`,
      [SUPABASE_SCHEMAS],
    );
    expect(callable).toEqual([]);
  });

  it('gives a table created later no grant for them', async () => {
    const defaults = await sql(
      `SELECT pg_get_userbyid(d.defaclrole) || ' ' || d.defaclnamespace::regnamespace || ' ' || d.defaclobjtype::text AS name
         FROM pg_default_acl d
        WHERE d.defaclnamespace::regnamespace::text IN ('public', 'authz')
          AND (d.defaclacl::text LIKE '%anon=%' OR d.defaclacl::text LIKE '%authenticated=%')
        ORDER BY 1`,
    );
    expect(defaults).toEqual([]);
  });
});
