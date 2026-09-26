import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type ExecutionContext,
  type JsonValue,
} from '@orchestrator-ai/transport-types';
import {
  toWorkflowRunRecord,
  WORKFLOW_RUNS_QUEUE,
  type WorkflowRunAccessControl,
  type WorkflowRunRecord,
} from './workflow-run.types';

/**
 * A guarded transition matched no row: the run is no longer in the state the
 * caller expected (another worker reclaimed it, it was canceled, or it
 * finished elsewhere). The caller must not assume its write happened.
 */
export class WorkflowRunTransitionError extends Error {
  constructor(runId: string, transition: string) {
    super(`Run ${runId} was not in a state that allows "${transition}"`);
    this.name = 'WorkflowRunTransitionError';
  }
}

export interface NewWorkflowRun {
  context: ExecutionContext;
  input: JsonValue;
  accessControl: WorkflowRunAccessControl;
  maxAttempts: number;
}

export interface WorkflowRunProgress {
  step: string;
  progress: number;
  message: string;
}

const { schema, table } = WORKFLOW_RUNS_QUEUE;

/**
 * All access to workflows.runs. Every read is scoped by organization; every
 * write that changes status is guarded on id + organization + expected
 * status (+ worker for the worker's own writes) and fails loudly if it
 * matched nothing.
 */
@Injectable()
export class WorkflowRunsRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async insertQueued(run: NewWorkflowRun): Promise<WorkflowRunRecord> {
    const { context } = run;
    const { data, error } = await this.db
      .from(schema, table)
      .insert({
        id: context.conversationId,
        organization_slug: context.orgSlug,
        user_id: context.userId,
        workflow_slug: context.agentSlug,
        execution_context: context,
        status: 'queued',
        input: run.input,
        access_control: run.accessControl,
        max_attempts: run.maxAttempts,
      })
      .select();
    if (error) throw new Error(`Failed to queue run ${context.conversationId}: ${error.message}`);
    return this.single(data, context.conversationId, 'insert');
  }

  async getForOrg(organizationSlug: string, id: string): Promise<WorkflowRunRecord | null> {
    const { data, error } = await this.db
      .from(schema, table)
      .select('*')
      .eq('id', id)
      .eq('organization_slug', organizationSlug);
    if (error) throw new Error(`Failed to read run ${id}: ${error.message}`);
    const rows = this.rows(data);
    return rows[0] ? toWorkflowRunRecord(rows[0]) : null;
  }

  async updateProgress(
    run: WorkflowRunRecord,
    workerId: string,
    progress: WorkflowRunProgress,
  ): Promise<void> {
    await this.guarded(run, 'progress', ['running'], workerId, {
      current_step: progress.step,
      progress: progress.progress,
      last_message: progress.message,
    });
  }

  async markCompleted(
    run: WorkflowRunRecord,
    workerId: string,
    result: JsonValue,
  ): Promise<WorkflowRunRecord> {
    return this.guarded(run, 'complete', ['running'], workerId, {
      status: 'completed',
      result,
      progress: 100,
      error: null,
      worker_id: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
    });
  }

  async markFailed(
    run: WorkflowRunRecord,
    workerId: string,
    error: string,
  ): Promise<WorkflowRunRecord> {
    return this.guarded(run, 'fail', ['running', 'cancel_requested'], workerId, {
      status: 'failed',
      error,
      worker_id: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
    });
  }

  /** Put a run back in the queue after a transient failure. */
  async requeueForRetry(
    run: WorkflowRunRecord,
    workerId: string,
    error: string,
  ): Promise<WorkflowRunRecord> {
    return this.guarded(run, 'retry', ['running'], workerId, {
      status: 'queued',
      error,
      worker_id: null,
      lease_expires_at: null,
    });
  }

  /** The worker observed a cancel request and stopped. */
  async markCanceled(run: WorkflowRunRecord, workerId: string): Promise<WorkflowRunRecord> {
    return this.guarded(run, 'cancel', ['cancel_requested'], workerId, {
      status: 'canceled',
      worker_id: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
    });
  }

  /**
   * Cancel on behalf of a user: a queued run is canceled at once; a running
   * run is asked to stop and the worker finishes the cancel.
   */
  async requestCancel(organizationSlug: string, id: string): Promise<WorkflowRunRecord> {
    const now = new Date().toISOString();
    const queued = await this.db
      .from(schema, table)
      .update({ status: 'canceled', completed_at: now, updated_at: now })
      .eq('id', id)
      .eq('organization_slug', organizationSlug)
      .eq('status', 'queued')
      .select();
    if (queued.error) throw new Error(`Failed to cancel run ${id}: ${queued.error.message}`);
    const canceled = this.rows(queued.data);
    if (canceled[0]) return toWorkflowRunRecord(canceled[0]);

    const running = await this.db
      .from(schema, table)
      .update({ status: 'cancel_requested', updated_at: now })
      .eq('id', id)
      .eq('organization_slug', organizationSlug)
      .eq('status', 'running')
      .select();
    if (running.error) throw new Error(`Failed to cancel run ${id}: ${running.error.message}`);
    return this.single(running.data, id, 'cancel');
  }

  private async guarded(
    run: WorkflowRunRecord,
    transition: string,
    fromStatuses: string[],
    workerId: string,
    changes: Record<string, unknown>,
  ): Promise<WorkflowRunRecord> {
    const { data, error } = await this.db
      .from(schema, table)
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', run.id)
      .eq('organization_slug', run.organizationSlug)
      .eq('worker_id', workerId)
      .in('status', fromStatuses)
      .select();
    if (error) throw new Error(`Failed to ${transition} run ${run.id}: ${error.message}`);
    return this.single(data, run.id, transition);
  }

  private single(data: unknown, id: string, transition: string): WorkflowRunRecord {
    const rows = this.rows(data);
    if (!rows[0]) throw new WorkflowRunTransitionError(id, transition);
    return toWorkflowRunRecord(rows[0]);
  }

  private rows(data: unknown): Record<string, unknown>[] {
    if (!Array.isArray(data)) throw new Error('workflows.runs query returned no row set');
    return data as Record<string, unknown>[];
  }
}
