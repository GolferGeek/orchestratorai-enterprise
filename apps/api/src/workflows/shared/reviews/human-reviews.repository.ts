import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type HumanReviewDecisionType,
  type HumanReviewKind,
  type JsonValue,
} from '@orchestrator-ai/transport-types';
import {
  checklistItems,
  orderedTicks,
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
  kind: HumanReviewKind;
  allowedDecisions: HumanReviewDecisionType[];
  allowItemDecisions: boolean;
  payload: JsonValue;
}

/** Rolls the response back: its run is not parked at the gate (yet). */
class RunNotWaitingError extends Error {}

/** Why a response was not recorded. */
export type ReviewResponseRefusal = 'not_found' | 'already_answered' | 'run_not_waiting';

/** What a tick did: recorded it, or recorded the last one and resumed the run. */
export type ChecklistTickOutcome = 'ticked' | 'completed';

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
   * Record a response and requeue its run, in one transaction: the review
   * moves waiting → responded and the run awaiting_review → queued, or
   * neither does. Two responders serialize on the review row; the second
   * finds it no longer waiting. The run resumes with the response as its
   * pending action and its attempt count restarts, since a review round is
   * not a retry.
   */
  async respond(
    review: HumanReviewRecord,
    response: HumanReviewResponse,
    respondedBy: string,
  ): Promise<ReviewResponseRefusal | null> {
    try {
      if (await this.db.transaction((tx) => this.recordResponse(tx, review, response, respondedBy))) return null;
    } catch (error) {
      if (error instanceof RunNotWaitingError) return 'run_not_waiting';
      throw error;
    }

    const current = await this.getForOrg(review.organizationSlug, review.id);
    return current ? 'already_answered' : 'not_found';
  }

  /**
   * Tick (or untick) one line of a checklist gate, and when every line is
   * ticked, record the response and requeue the run — all in one
   * transaction. Two people ticking at once serialize on the review row, so
   * exactly one tick completes it; a tick before the run is parked at the
   * gate is rolled back with the rest ('run_not_waiting').
   */
  async tick(
    review: HumanReviewRecord,
    itemId: string,
    done: boolean,
    by: string,
  ): Promise<ChecklistTickOutcome | ReviewResponseRefusal> {
    try {
      const outcome = await this.db.transaction(async (tx) => {
        const mark = done ? JSON.stringify({ by, at: new Date().toISOString() }) : null;
        const updated = await tx.rawQuery(
          `UPDATE workflows.human_reviews
              SET ticks = CASE WHEN $3::jsonb IS NULL THEN ticks - $2::text ELSE jsonb_set(ticks, ARRAY[$2::text], $3::jsonb) END,
                  updated_at = now()
            WHERE id = $1 AND organization_slug = $4 AND status = 'waiting'
        RETURNING *`,
          [review.id, itemId, mark, review.organizationSlug],
        );
        if (updated.error) throw new Error(`Failed to tick "${itemId}" on review ${review.id}: ${updated.error.message}`);
        const row = this.rows(updated.data)[0];
        if (!row) return null;
        const current = toHumanReviewRecord(row);
        const complete = checklistItems(current.payload).every((item) => current.ticks[item.itemId]);
        if (!complete) return 'ticked' as const;
        await this.recordResponse(tx, current, { kind: 'checklist', ticks: orderedTicks(current) }, by);
        return 'completed' as const;
      });
      if (outcome) return outcome;
    } catch (error) {
      if (error instanceof RunNotWaitingError) return 'run_not_waiting';
      throw error;
    }
    const current = await this.getForOrg(review.organizationSlug, review.id);
    return current ? 'already_answered' : 'not_found';
  }

  /**
   * Inside a transaction: the review waiting → responded and its run
   * awaiting_review → queued. False when the review was no longer waiting;
   * throws RunNotWaitingError (rolling back) when the run is not parked.
   */
  private async recordResponse(
    tx: DatabaseService,
    review: HumanReviewRecord,
    response: HumanReviewResponse,
    respondedBy: string,
  ): Promise<boolean> {
    const action: ReviewResumeAction = { reviewId: review.id, response };
    const now = new Date().toISOString();
    const reviewed = await tx
      .from('workflows', 'human_reviews')
      .update({
        status: 'responded',
        response,
        responded_by: respondedBy,
        responded_at: now,
        updated_at: now,
      })
      .eq('id', review.id)
      .eq('organization_slug', review.organizationSlug)
      .eq('status', 'waiting')
      .select('id');
    if (reviewed.error) {
      throw new Error(`Failed to record the response to review ${review.id}: ${reviewed.error.message}`);
    }
    if (this.rows(reviewed.data).length === 0) return false;

    const requeued = await tx
      .from('workflows', 'runs')
      .update({
        status: 'queued',
        pending_action: action,
        attempt: 0,
        current_step: null,
        updated_at: now,
      })
      .eq('id', review.runId)
      .eq('organization_slug', review.organizationSlug)
      .eq('status', 'awaiting_review')
      .select('id');
    if (requeued.error) {
      throw new Error(`Failed to requeue run ${review.runId}: ${requeued.error.message}`);
    }
    if (this.rows(requeued.data).length === 0) throw new RunNotWaitingError();
    return true;
  }

  private rows(data: unknown): Record<string, unknown>[] {
    if (!Array.isArray(data)) throw new Error('workflows.human_reviews query returned no row set');
    return data as Record<string, unknown>[];
  }
}
