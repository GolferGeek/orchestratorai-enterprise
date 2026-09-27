/**
 * Every application table must be writable by postgres, the role the API
 * connects as. Migrations run as supabase_admin, so a table created without
 * `OWNER TO postgres` passes review, applies cleanly, and then fails at
 * runtime with "permission denied" (it happened to ambient, the workflows
 * mitigations table and rag_data chunks). Set WORKFLOW_RUNS_TEST_DATABASE_URL
 * to run it.
 */
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

const PLATFORM_SCHEMAS = [
  'pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'supabase_functions', 'extensions',
  'graphql', 'graphql_public', 'net', 'pgsodium', 'pgsodium_masks', 'vault', 'supabase_migrations',
  '_realtime', 'cron', 'pgbouncer', '_analytics',
];

describeWithDb('table ownership', () => {
  it('leaves no application table the API cannot write', async () => {
    const db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    const { data, error } = await db.rawQuery(
      `SELECT schemaname || '.' || tablename AS name
         FROM pg_tables
        WHERE schemaname <> ALL($1::text[])
          AND NOT has_table_privilege(current_user, schemaname || '.' || tablename, 'INSERT')
        ORDER BY 1`,
      [PLATFORM_SCHEMAS],
    );
    if (error) throw new Error(error.message);
    expect(data).toEqual([]);
  });
});
