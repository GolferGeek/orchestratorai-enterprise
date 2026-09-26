import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from './database.interface';
import type {
  DatabaseJobQueueService,
  JobQueueClaimOptions,
  JobQueueReclaimResult,
  JobQueueTable,
} from './database-job-queue.interface';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function qualified(queue: JobQueueTable): string {
  if (!IDENTIFIER.test(queue.schema) || !IDENTIFIER.test(queue.table)) {
    throw new Error(
      `Invalid job queue identifier "${queue.schema}.${queue.table}"`,
    );
  }
  return `"${queue.schema}"."${queue.table}"`;
}

function positive(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${value}`);
  }
  return value;
}

/**
 * Job queue for every Postgres-backed provider (supabase, supabase_pg,
 * postgresql). Each operation is a single statement, so it is atomic without
 * an explicit transaction.
 */
@Injectable()
export class PostgresDatabaseJobQueueService implements DatabaseJobQueueService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async claimNext(
    options: JobQueueClaimOptions,
  ): Promise<Record<string, unknown> | null> {
    const q = qualified(options.queue);
    if (!options.workerId) throw new Error('workerId is required');
    const leaseSeconds = positive(options.leaseSeconds, 'leaseSeconds');

    const rows = await this.run<Record<string, unknown>>(
      `UPDATE ${q}
          SET status = 'running',
              worker_id = $1,
              lease_expires_at = now() + make_interval(secs => $2),
              attempt = attempt + 1,
              started_at = COALESCE(started_at, now()),
              updated_at = now()
        WHERE id = (
          SELECT id FROM ${q}
           WHERE status = 'queued'
           ORDER BY queued_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
      RETURNING *`,
      [options.workerId, leaseSeconds],
    );
    return rows[0] ?? null;
  }

  async heartbeat(
    queue: JobQueueTable,
    id: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<boolean> {
    const q = qualified(queue);
    const rows = await this.run(
      `UPDATE ${q}
          SET lease_expires_at = now() + make_interval(secs => $3),
              updated_at = now()
        WHERE id = $1
          AND worker_id = $2
          AND status IN ('running', 'cancel_requested')
      RETURNING id`,
      [id, workerId, positive(leaseSeconds, 'leaseSeconds')],
    );
    return rows.length === 1;
  }

  async reclaimExpired(queue: JobQueueTable): Promise<JobQueueReclaimResult> {
    const q = qualified(queue);
    const rows = await this.run<{ id: string; status: string }>(
      `WITH expired AS (
         SELECT id, status AS was, attempt, max_attempts
           FROM ${q}
          WHERE status IN ('running', 'cancel_requested')
            AND lease_expires_at < now()
          FOR UPDATE SKIP LOCKED
       )
       UPDATE ${q} AS t
          SET status = CASE
                WHEN e.was = 'cancel_requested' THEN 'canceled'
                WHEN e.attempt < e.max_attempts THEN 'queued'
                ELSE 'failed'
              END,
              error = CASE
                WHEN e.was = 'running' AND e.attempt >= e.max_attempts
                  THEN 'Worker lease expired after ' || e.attempt || ' attempt(s)'
                ELSE t.error
              END,
              completed_at = CASE
                WHEN e.was = 'cancel_requested' OR e.attempt >= e.max_attempts
                  THEN now()
                ELSE t.completed_at
              END,
              worker_id = NULL,
              lease_expires_at = NULL,
              updated_at = now()
         FROM expired e
        WHERE t.id = e.id
      RETURNING t.id, t.status`,
      [],
    );
    const result: JobQueueReclaimResult = { requeued: [], failed: [], canceled: [] };
    for (const row of rows) {
      if (row.status === 'queued') result.requeued.push(row.id);
      else if (row.status === 'failed') result.failed.push(row.id);
      else if (row.status === 'canceled') result.canceled.push(row.id);
      else throw new Error(`Unexpected reclaimed status "${row.status}" for ${row.id}`);
    }
    return result;
  }

  private async run<T = Record<string, unknown>>(
    sql: string,
    params: unknown[],
  ): Promise<T[]> {
    const { data, error } = await this.db.rawQuery(sql, params);
    if (error) throw new Error(`Job queue query failed: ${error.message}`);
    if (!Array.isArray(data)) {
      throw new Error('Job queue query returned no row set');
    }
    return data as T[];
  }
}
