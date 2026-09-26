/**
 * Runs the job queue's real SQL against Postgres. Set
 * JOB_QUEUE_TEST_DATABASE_URL to run it; without it the suite is reported as
 * skipped (never as passing). It creates and drops its own schema.
 */
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { DatabaseService, QueryResult } from '../database.interface';
import { PostgresDatabaseJobQueueService } from '../postgres-database-job-queue.service';

const url = process.env.JOB_QUEUE_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('PostgresDatabaseJobQueueService against Postgres', () => {
  const schema = `jobqueue_it_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const queue = { schema, table: 'runs' };
  let pool: Pool;
  let service: PostgresDatabaseJobQueueService;

  const sql = (text: string, params: unknown[] = []) => pool.query(text, params);

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 10 });
    const db = {
      rawQuery: async (text: string, params?: unknown[]): Promise<QueryResult> => {
        try {
          const result = await pool.query(text, params ?? []);
          return { data: result.rows, error: null, count: result.rowCount };
        } catch (err) {
          return { data: null, error: { message: (err as Error).message } };
        }
      },
    } as unknown as DatabaseService;
    service = new PostgresDatabaseJobQueueService(db);
    await sql(`CREATE SCHEMA "${schema}"`);
    await sql(`CREATE TABLE "${schema}".runs (
      id uuid PRIMARY KEY,
      status text NOT NULL,
      queued_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      completed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      attempt int NOT NULL DEFAULT 0,
      max_attempts int NOT NULL,
      lease_expires_at timestamptz,
      worker_id text,
      error text
    )`);
  });

  afterAll(async () => {
    await sql(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  });

  beforeEach(async () => {
    await sql(`DELETE FROM "${schema}".runs`);
  });

  it('never hands the same row to two concurrent claimers', async () => {
    const ids = Array.from({ length: 25 }, () => randomUUID());
    for (const [i, id] of ids.entries()) {
      await sql(
        `INSERT INTO "${schema}".runs (id, status, max_attempts, queued_at)
         VALUES ($1, 'queued', 3, now() + make_interval(secs => $2))`,
        [id, i],
      );
    }

    const claims = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        service.claimNext({ queue, workerId: `w${i % 5}`, leaseSeconds: 60 }),
      ),
    );

    const claimed = claims.filter((row) => row !== null).map((row) => row!.id);
    expect(claimed).toHaveLength(25);
    expect(new Set(claimed).size).toBe(25);
    const { rows } = await sql(
      `SELECT count(*)::int AS n FROM "${schema}".runs
        WHERE status = 'running' AND attempt = 1 AND worker_id IS NOT NULL
          AND lease_expires_at > now()`,
    );
    expect(rows[0].n).toBe(25);
  });

  it('claims the oldest queued row first', async () => {
    const older = randomUUID();
    const newer = randomUUID();
    await sql(
      `INSERT INTO "${schema}".runs (id, status, max_attempts, queued_at) VALUES
        ($1, 'queued', 3, now() - interval '1 minute'),
        ($2, 'queued', 3, now())`,
      [older, newer],
    );
    const first = await service.claimNext({ queue, workerId: 'w', leaseSeconds: 60 });
    expect(first?.id).toBe(older);
  });

  it('extends the lease only for the worker that holds it', async () => {
    const id = randomUUID();
    await sql(
      `INSERT INTO "${schema}".runs (id, status, max_attempts) VALUES ($1, 'queued', 3)`,
      [id],
    );
    await service.claimNext({ queue, workerId: 'holder', leaseSeconds: 5 });

    await expect(service.heartbeat(queue, id, 'holder', 120)).resolves.toBe(true);
    await expect(service.heartbeat(queue, id, 'intruder', 120)).resolves.toBe(false);
    const { rows } = await sql(
      `SELECT lease_expires_at > now() + interval '100 seconds' AS extended
         FROM "${schema}".runs WHERE id = $1`,
      [id],
    );
    expect(rows[0].extended).toBe(true);
  });

  it('requeues, fails, or cancels expired rows and leaves live ones alone', async () => {
    const retry = randomUUID();
    const exhausted = randomUUID();
    const canceling = randomUUID();
    const live = randomUUID();
    await sql(
      `INSERT INTO "${schema}".runs
         (id, status, attempt, max_attempts, worker_id, lease_expires_at) VALUES
        ($1, 'running', 1, 3, 'w', now() - interval '1 second'),
        ($2, 'running', 3, 3, 'w', now() - interval '1 second'),
        ($3, 'cancel_requested', 1, 3, 'w', now() - interval '1 second'),
        ($4, 'running', 1, 3, 'w', now() + interval '1 minute')`,
      [retry, exhausted, canceling, live],
    );

    const result = await service.reclaimExpired(queue);

    expect(result).toEqual({ requeued: [retry], failed: [exhausted], canceled: [canceling] });
    const { rows } = await sql(
      `SELECT id, status, worker_id, error, completed_at IS NOT NULL AS done
         FROM "${schema}".runs`,
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(retry)).toMatchObject({ status: 'queued', worker_id: null, done: false });
    expect(byId.get(exhausted)).toMatchObject({ status: 'failed', done: true });
    expect(byId.get(exhausted).error).toContain('lease expired after 3 attempt(s)');
    expect(byId.get(canceling)).toMatchObject({ status: 'canceled', done: true });
    expect(byId.get(live)).toMatchObject({ status: 'running', worker_id: 'w' });
  });
});
