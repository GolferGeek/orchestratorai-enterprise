import { Inject, Injectable } from '@nestjs/common';
import type { ExecutionContext, JsonValue } from '@orchestrator-ai/transport-types';
import {
  CONFIG_PROVIDER_SERVICE,
  type ConfigProvider,
} from '@orchestratorai/planes/config';
import { WORK_TASK_SINK, type WorkTaskSink } from '@orchestratorai/planes/work-routing';
import { ObservabilityService } from '../services/observability.service';
import { HumanReviewsRepository } from './human-reviews.repository';
import type {
  HumanGate,
  HumanReviewRecord,
  HumanReviewResponse,
} from './human-review.types';

/** A response the caller may not give. `reason` is safe to show them. */
export class HumanReviewError extends Error {
  constructor(
    readonly code: 'not_found' | 'conflict' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'HumanReviewError';
  }
}

/**
 * Opens human gates and records the responses that resume runs.
 *
 * requestReview is idempotent per (run, gate, round): the node re-runs on
 * resume, and the second call finds the first review and does nothing. Only
 * the first call creates the work task and emits the waiting event.
 */
@Injectable()
export class HumanReviewService {
  private readonly webUrl: string;

  constructor(
    private readonly reviews: HumanReviewsRepository,
    @Inject(WORK_TASK_SINK) private readonly tasks: WorkTaskSink,
    private readonly observability: ObservabilityService,
    @Inject(CONFIG_PROVIDER_SERVICE) config: ConfigProvider,
  ) {
    this.webUrl = config.getRequired('PUBLIC_WEB_URL').replace(/\/$/, '');
  }

  async requestReview(
    context: ExecutionContext,
    gate: HumanGate,
    round: number,
    payload: JsonValue,
  ): Promise<void> {
    const review = await this.reviews.createIfAbsent({
      runId: context.conversationId,
      organizationSlug: context.orgSlug,
      workflowSlug: context.agentSlug,
      gateSlug: gate.slug,
      round,
      kind: gate.kind,
      allowedDecisions: gate.kind === 'approval' ? gate.allowedDecisions : [],
      allowItemDecisions: gate.kind === 'approval' ? gate.allowItemDecisions : false,
      payload,
    });
    if (!review) return;

    const link = `${this.webUrl}/app/workflows/${encodeURIComponent(context.agentSlug)}?conversationId=${encodeURIComponent(context.conversationId)}`;
    const task = await this.tasks.createTask({
      title: gate.taskTitle,
      description: `${context.agentSlug} is waiting for ${gate.kind === 'approval' ? 'a review' : 'an answer'} at "${gate.slug}".\n\nOpen: ${link}`,
    });
    await this.reviews.attachWorkTask(review.id, task.provider, task.id);
    await this.observability.emitHitlWaiting(
      context,
      context.conversationId,
      { reviewId: review.id, gate: gate.slug, kind: gate.kind },
      `Waiting for ${gate.kind === 'approval' ? 'review' : 'an answer'}: ${gate.taskTitle}`,
    );
  }

  /** A canceled run's open review expires and its task closes. */
  async closeForEndedRun(runId: string): Promise<void> {
    const expired = await this.reviews.expireWaiting(runId);
    if (expired?.workTask) {
      await this.tasks.updateTaskStatus({ taskId: expired.workTask.taskId, status: 'done' });
    }
  }

  /** The run's open review, if it is waiting on a person. */
  getWaiting(runId: string): Promise<HumanReviewRecord | null> {
    return this.reviews.getWaitingForRun(runId);
  }

  /**
   * Record a response to a review of the run `context` names and requeue the
   * run. Throws HumanReviewError for anything the caller can correct.
   */
  async respond(
    context: ExecutionContext,
    reviewId: string,
    response: HumanReviewResponse,
  ): Promise<void> {
    const review = await this.reviews.getForOrg(context.orgSlug, reviewId);
    if (!review || review.runId !== context.conversationId) {
      throw new HumanReviewError('not_found', 'No such review for this run');
    }
    const invalid = checkResponse(review, response);
    if (invalid) throw new HumanReviewError('invalid', invalid);

    const refused = await this.reviews.respond(review, response, context.userId);
    if (refused === 'not_found') {
      throw new HumanReviewError('not_found', 'No such review for this run');
    }
    if (refused === 'already_answered') {
      throw new HumanReviewError('conflict', 'This review has already been answered');
    }
    if (refused === 'run_not_waiting') {
      throw new HumanReviewError('conflict', 'The run is not waiting for this review yet');
    }

    if (review.workTask) {
      await this.tasks.updateTaskStatus({ taskId: review.workTask.taskId, status: 'done' });
    }
    await this.observability.emitHitlResumed(context, context.conversationId, outcomeOf(response));
  }
}

function checkResponse(review: HumanReviewRecord, response: HumanReviewResponse): string | null {
  if (review.kind === 'approval') {
    if (response.kind !== 'decision') return 'This review takes a decision, not an answer';
    if (!review.allowedDecisions.includes(response.decision.type)) {
      return `"${response.decision.type}" is not allowed here; allowed: ${review.allowedDecisions.join(', ')}`;
    }
    if (response.decision.type === 'modify' && !review.allowItemDecisions) {
      return 'This review does not take item decisions';
    }
    return null;
  }
  return response.kind === 'decision' ? 'This step takes an answer, not a decision' : null;
}

function outcomeOf(response: HumanReviewResponse): 'approve' | 'reject' | 'modify' | 'answer' | 'finish' {
  return response.kind === 'decision' ? response.decision.type : response.kind;
}
