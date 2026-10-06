import { Inject, Injectable } from '@nestjs/common';
import { NIL_UUID, type ExecutionContext, type HumanReviewEvent, type JsonValue } from '@orchestrator-ai/transport-types';
import {
  CONFIG_PROVIDER_SERVICE,
  type ConfigProvider,
} from '@orchestratorai/planes/config';
import { WORK_TASK_SINK, type WorkTaskSink } from '@orchestratorai/planes/work-routing';
import { ObservabilityService } from '../services/observability.service';
import { HumanReviewsRepository } from './human-reviews.repository';
import {
  checklistItems,
  type EventGatePayload,
  type HumanGate,
  type HumanReviewRecord,
  type HumanReviewResponse,
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

/** What delivering an event to a run did: resumed it, or why not (in plain words). */
export type EventDelivery = { resumed: true } | { resumed: false; reason: string };

/**
 * Opens human gates and records the responses that resume runs.
 *
 * requestReview is idempotent per (run, gate, round): the node re-runs on
 * resume, and the second call finds the first review and does nothing. Only
 * the first call creates the work task and emits the waiting event.
 *
 * An event gate has no work task (nobody answers it); deliverEvent resolves
 * it, as the system user, when its event arrives.
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
    if (gate.kind === 'checklist') checklistItems(payload);
    const stored: JsonValue =
      gate.kind === 'event'
        ? ({ event: gate.event, waitingFor: gate.waitingFor, detail: payload } satisfies EventGatePayload as unknown as JsonValue)
        : payload;
    const review = await this.reviews.createIfAbsent({
      runId: context.conversationId,
      organizationSlug: context.orgSlug,
      workflowSlug: context.agentSlug,
      gateSlug: gate.slug,
      round,
      kind: gate.kind,
      allowedDecisions: gate.kind === 'approval' ? gate.allowedDecisions : [],
      allowItemDecisions: gate.kind === 'approval' ? gate.allowItemDecisions : false,
      payload: stored,
    });
    if (!review) return;
    if (gate.kind === 'event') {
      await this.observability.emitHitlWaiting(
        context,
        context.conversationId,
        { reviewId: review.id, gate: gate.slug, kind: gate.kind },
        `Waiting for ${gate.waitingFor}`,
      );
      return;
    }

    const link = `${this.webUrl}/app/workflows/${encodeURIComponent(context.agentSlug)}?conversationId=${encodeURIComponent(context.conversationId)}`;
    const task = await this.tasks.createTask({
      title: gate.taskTitle,
      description: `${context.agentSlug} is waiting for ${WAITING_FOR[gate.kind]} at "${gate.slug}".\n\nOpen: ${link}`,
    });
    await this.reviews.attachWorkTask(review.id, task.provider, task.id);
    await this.observability.emitHitlWaiting(
      context,
      context.conversationId,
      { reviewId: review.id, gate: gate.slug, kind: gate.kind },
      `Waiting for ${WAITING_FOR[gate.kind]}: ${gate.taskTitle}`,
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
   * An outside event for a run: if the run waits at an event gate for this
   * event, resolve the gate (as the system user) and requeue the run.
   * Anything else is not an error; the reason says why nothing happened.
   */
  async deliverEvent(context: ExecutionContext, event: HumanReviewEvent): Promise<EventDelivery> {
    const waiting = await this.reviews.getWaitingForRun(context.conversationId);
    if (!waiting) return { resumed: false, reason: 'the run is not waiting' };
    if (waiting.kind !== 'event') return { resumed: false, reason: `the run waits for a person at "${waiting.gateSlug}"` };
    const expected = (waiting.payload as unknown as EventGatePayload).event;
    if (expected !== event.name) return { resumed: false, reason: `the run waits for ${expected}, not ${event.name}` };
    const refused = await this.reviews.respond(waiting, { kind: 'event', event }, NIL_UUID);
    // Another delivery of the same event got there first: the run resumes once.
    if (refused === 'already_answered') return { resumed: false, reason: `${event.name} already resolved the gate` };
    if (refused) return { resumed: false, reason: `the gate could not be resolved (${refused.replace(/_/g, ' ')})` };
    await this.observability.emitHitlResumed(context, context.conversationId, 'event');
    return { resumed: true };
  }

  /**
   * Tick (done) or untick one line of a checklist gate of the run `context`
   * names, as its user. The last tick resumes the run. Throws
   * HumanReviewError for anything the caller can correct.
   */
  async tick(context: ExecutionContext, reviewId: string, itemId: string, done: boolean): Promise<{ resumed: boolean }> {
    const review = await this.reviews.getForOrg(context.orgSlug, reviewId);
    if (!review || review.runId !== context.conversationId) {
      throw new HumanReviewError('not_found', 'No such review for this run');
    }
    if (review.kind !== 'checklist') throw new HumanReviewError('invalid', 'This step is not a checklist');
    if (!checklistItems(review.payload).some((item) => item.itemId === itemId)) {
      throw new HumanReviewError('invalid', `The checklist has no line "${itemId}"`);
    }
    const outcome = await this.reviews.tick(review, itemId, done, context.userId);
    if (outcome === 'not_found') throw new HumanReviewError('not_found', 'No such review for this run');
    if (outcome === 'already_answered') throw new HumanReviewError('conflict', 'This checklist is already finished');
    if (outcome === 'run_not_waiting') throw new HumanReviewError('conflict', 'The run is not waiting for this checklist yet');
    if (outcome === 'ticked') return { resumed: false };
    if (review.workTask) {
      await this.tasks.updateTaskStatus({ taskId: review.workTask.taskId, status: 'done' });
    }
    await this.observability.emitHitlResumed(context, context.conversationId, 'checklist', `Checklist finished: ${review.gateSlug}`);
    return { resumed: true };
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
  if (response.kind === 'event') return 'Only an outside event resolves a gate that waits for one';
  if (response.kind === 'checklist' || review.kind === 'checklist') {
    return 'A checklist finishes when every line is ticked';
  }
  if (review.kind === 'event') {
    return `This step waits for ${(review.payload as unknown as EventGatePayload).waitingFor}; nobody answers it`;
  }
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

const WAITING_FOR: Record<Exclude<HumanGate['kind'], 'event'>, string> = {
  approval: 'a review',
  answer: 'an answer',
  checklist: 'a checklist',
};

function outcomeOf(response: HumanReviewResponse): 'approve' | 'reject' | 'modify' | 'answer' | 'event' | 'checklist' | 'finish' {
  return response.kind === 'decision' ? response.decision.type : response.kind;
}
