/**
 * DatabaseService.transaction against real Postgres. Set
 * JOB_QUEUE_TEST_DATABASE_URL to run it (skipped otherwise). It creates and
 * drops its own table.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '../postgresql-database.service';

const url = process.env.JOB_QUEUE_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('DatabaseService.transaction (Postgres)', () => {
  const table = `tx_spec_${randomUUID().slice(0, 8)}`;
  let db: PostgresqlDatabaseService;

  async function names(): Promise<string[]> {
    const { data, error } = await db.from(null, table).select('name').order('name');
    if (error) throw new Error(error.message);
    return (data as Array<{ name: string }>).map((row) => row.name);
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    const created = await db.rawQuery(`CREATE TABLE public.${table} (name TEXT PRIMARY KEY)`);
    if (created.error) throw new Error(created.error.message);
  });

  afterAll(async () => {
    await db.rawQuery(`DROP TABLE IF EXISTS public.${table}`);
  });

  beforeEach(async () => {
    await db.rawQuery(`DELETE FROM public.${table}`);
  });

  it('commits every write made through tx', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.from(null, table).insert({ name: 'a' });
      await tx.rawQuery(`INSERT INTO public.${table} (name) VALUES ($1)`, ['b']);
      return 'done';
    });
    expect(result).toBe('done');
    expect(await names()).toEqual(['a', 'b']);
  });

  it('rolls everything back when work throws', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.from(null, table).insert({ name: 'a' });
        throw new Error('changed my mind');
      }),
    ).rejects.toThrow('changed my mind');
    expect(await names()).toEqual([]);
  });

  it('rolls back when a query fails and work throws on its error', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.from(null, table).insert({ name: 'a' });
        const duplicate = await tx.from(null, table).insert({ name: 'a' });
        if (duplicate.error) throw new Error(duplicate.error.message);
      }),
    ).rejects.toThrow(/duplicate key/);
    expect(await names()).toEqual([]);
  });

  it('keeps uncommitted writes invisible to the outer service', async () => {
    await db.transaction(async (tx) => {
      await tx.from(null, table).insert({ name: 'a' });
      expect(await names()).toEqual([]);
    });
    expect(await names()).toEqual(['a']);
  });

  it('refuses a nested transaction', async () => {
    await expect(
      db.transaction((tx) => tx.transaction(async () => undefined)),
    ).rejects.toThrow('Nested transactions are not supported');
  });
});
