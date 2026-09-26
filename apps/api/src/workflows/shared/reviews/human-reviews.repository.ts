import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type HumanReviewDecisionType,
  type JsonValue,
} from '@orchestrator-ai/transport-types';
import {
  toHumanReviewRecord,
  type HumanReviewRecord,
  type HumanReviewResponse,
  type ReviewResumeAction,
} from './human-review.types';

export interface NewHumanReview {
  runId: string;
  organizationSlug: string;
  workflowSlug: string;
  gateSlug: string;
  round: number;
  kind: 'approval' | 'answer';
  allowedDecisions: HumanReviewDecisionType[];
  allowItemDecisions: boolean;
  payload: JsonValue;
}

/** Why a response was not recorded. */
export type ReviewResponseRefusal = 'not_found' | 'already_answered' | 'run_not_waiting';

@Injectable()
export class HumanReviewsRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Insert the review for this gate round, or do nothing if it exists (the
   * node re-running on resume). Returns the row only when it was created.
   */
  async createIfAbsent(review: NewHumanReview): Promise<HumanReviewRecord | null> {
    const { data, error } = await this.db
      .from('workflows', 'human_reviews')
      .upsert(
        {
          run_id: review.runId,
          organization_slug: review.organizationSlug,
          workflow_slug: review.workflowSlug,
          gate_slug: review.gateSlug,
          round: review.round,
          kind: review.kind,
          allowed_decisions: review.allowedDecisions,
          allow_item_decisions: review.allowItemDecisions,
          payload: review.payload,
        },
        { onConflict: 'run_id,gate_slug,round', ignoreDuplicates: true },
      )
      .select();
    if (error) {
      throw new Error(`Failed to open review ${review.gateSlug} for run ${review.runId}: ${error.message}`);
    }
    const row = this.rows(data)[0];
    return row ? toHumanReviewRecord(row) : null;
  }

  async attachWorkTask(id: string, provider: string, taskId: string): Promise<void> {
    const { error } = await this.db
      .from('workflows', 'human_reviews')
      .update({
        work_task_provider: provider,
        work_task_id: taskId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(`Failed to attach work task to review ${id}: ${error.message}`);
  }

  async getForOrg(organizationSlug: string, id: string): Promise<HumanReviewRecord | null> {
    let query = this.db.from('workflows', 'human_reviews').select('*').eq('id', id);
    if (organizationSlug !== '*') query = query.eq('organization_slug', organizationSlug);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to read review ${id}: ${error.message}`);
    const row = this.rows(data)[0];
    return row ? toHumanReviewRecord(row) : null;
  }

  async getWaitingForRun(runId: string): Promise<HumanReviewRecord | null> {
    const { data, error } = await this.db
      .from('workflows', 'human_reviews')
      .select('*')
      .eq('run_id', runId)
      .eq('status', 'waiting');
    if (error) throw new Error(`Failed to read the open review of run ${runId}: ${error.message}`);
    const row = this.rows(data)[0];
    return row ? toHumanReviewRecord(row) : null;
  }

  /** Close the run's open review because the run ended without it. */
  async expireWaiting(runId: string): Promise<HumanReviewRecord | null> {
    const { data, error } = await this.db
      .from('workflows', 'human_reviews')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('run_id', runId)
      .eq('status', 'waiting')
      .select();
    if (error) throw new Error(`Failed to expire the open review of run ${runId}: ${error.message}`);
    const row = this.rows(data)[0];
    return row ? toHumanReviewRecord(row) : null;
  }

  /**
   * Record a response and requeue its run, in one statement: the run is
   * locked, and both rows change or neither does. The run resumes with the
   * response as its pending action; its attempt count restarts, since a
   * review round is not a retry.
   */
  async respond(
    review: HumanReviewRecord,
    response: HumanReviewResponse,
    respondedBy: string,
  ): Promise<ReviewResponseRefusal | null> {
    const action: ReviewResumeAction = { reviewId: review.id, response };
    const { data, error } = await this.db.rawQuery(
      `WITH run AS (
         SELECT id FROM workflows.runs
          WHERE id = $2 AND organization_slug = $3 AND status = 'awaiting_review'
          FOR UPDATE
       ), answered AS (
         UPDATE workflows.human_reviews
            SET status = 'responded', response = $4::jsonb, responded_by = $5,
                responded_at = now(), updated_at = now()
          WHERE id = $1 AND organization_slug = $3 AND status = 'waiting'
            AND run_id IN (SELECT id FROM run)
          RETURNING run_id
       ), requeued AS (
         UPDATE workflows.runs
            SET status = 'queued', pending_action = $6::jsonb, attempt = 0,
                current_step = NULL, updated_at = now()
          WHERE id IN (SELECT run_id FROM answered)
          RETURNING id
       )
       SELECT (SELECT count(*) FROM requeued)::int AS requeued`,
      [
        review.id,
        review.runId,
        review.organizationSlug,
        JSON.stringify(response),
        respondedBy,
        JSON.stringify(action),
      ],
    );
    if (error) throw new Error(`Failed to record the response to review ${review.id}: ${error.message}`);
    const requeued = (this.rows(data)[0] ?? {}).requeued;
    if (requeued === 1) return null;

    const current = await this.getForOrg(review.organizationSlug, review.id);
    if (!current) return 'not_found';
    return current.status === 'waiting' ? 'run_not_waiting' : 'already_answered';
  }

  private rows(data: unknown): Record<string, unknown>[] {
    if (!Array.isArray(data)) throw new Error('workflows.human_reviews query returned no row set');
    return data as Record<string, unknown>[];
  }
}
