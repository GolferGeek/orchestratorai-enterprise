/**
 * Human-in-the-loop review contract for workflows.
 *
 * A gate pauses a run and asks a person to decide. Approval gates take a
 * decision; answer gates (interactive workflows) take an answer. Item
 * decisions let a reviewer accept, reject, or rewrite individual items
 * (clauses, documents, sections) instead of the whole output.
 */
import type { JsonValue } from '../shared/json.types';

export type HumanReviewKind = 'approval' | 'answer';

export type HumanReviewStatus = 'waiting' | 'responded' | 'expired';

export type HumanReviewDecisionType = 'approve' | 'reject' | 'modify';

export type ItemDecision =
  | { itemId: string; decision: 'accept' | 'reject' }
  | { itemId: string; decision: 'modify'; replacement: JsonValue };

export type HumanReviewDecision =
  | { type: 'approve'; feedback?: string }
  | { type: 'reject'; feedback: string }
  | { type: 'modify'; items: ItemDecision[]; feedback?: string };

export interface HumanReviewAnswer {
  text: string;
  turn: number;
}

/** Where the review task was sent (work-routing plane). */
export interface WorkTaskRef {
  provider: string;
  taskId: string;
}

/** What the UI renders and the reviewer acts on. */
export interface HumanReviewRequest {
  reviewId: string;
  runId: string;
  workflowSlug: string;
  gateSlug: string;
  kind: HumanReviewKind;
  status: HumanReviewStatus;
  allowedDecisions: HumanReviewDecisionType[];
  allowItemDecisions: boolean;
  payload: JsonValue;
  createdAt: string;
  workTask?: WorkTaskRef;
}
