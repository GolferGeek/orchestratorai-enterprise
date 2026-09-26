/**
 * Job-queue capability of the database plane.
 *
 * Claiming work atomically ("give me the oldest queued row that no other
 * worker is taking") is database-specific: Postgres does it with
 * `FOR UPDATE SKIP LOCKED`, SQL Server with `UPDLOCK, READPAST`. Callers use
 * this capability instead of writing that SQL themselves, so a new database
 * only has to implement it here.
 *
 * A queue is a table with this column contract:
 *   id uuid, status text, queued_at timestamptz, started_at timestamptz,
 *   completed_at timestamptz, updated_at timestamptz, attempt int,
 *   max_attempts int, lease_expires_at timestamptz, worker_id text, error text
 * and the statuses `queued`, `running`, `cancel_requested`, `canceled`,
 * `failed` (it may have others; this capability only moves between these).
 */
export const DATABASE_JOB_QUEUE_SERVICE = Symbol('DATABASE_JOB_QUEUE_SERVICE');

export interface JobQueueTable {
  schema: string;
  table: string;
}

export interface JobQueueClaimOptions {
  queue: JobQueueTable;
  /** Identifies the claiming process; recorded on the row. */
  workerId: string;
  /** How long the claim holds before another worker may reclaim it. */
  leaseSeconds: number;
}

export interface JobQueueReclaimResult {
  /** Expired running rows with attempts left, back in the queue. */
  requeued: string[];
  /** Expired running rows out of attempts, now failed. */
  failed: string[];
  /** Expired rows whose cancel was requested, now canceled. */
  canceled: string[];
}

export interface DatabaseJobQueueService {
  /**
   * Atomically move the oldest queued row to `running`, leased to the
   * worker, incrementing `attempt`. Returns the claimed row, or null when
   * nothing is queued.
   */
  claimNext(options: JobQueueClaimOptions): Promise<Record<string, unknown> | null>;

  /**
   * Extend the lease on a row this worker holds. Returns false when the
   * worker no longer holds it (reclaimed, or finished elsewhere).
   */
  heartbeat(
    queue: JobQueueTable,
    id: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<boolean>;

  /**
   * Resolve rows whose lease expired: requeue those with attempts left, fail
   * the rest, and cancel those whose cancel was requested.
   */
  reclaimExpired(queue: JobQueueTable): Promise<JobQueueReclaimResult>;
}
