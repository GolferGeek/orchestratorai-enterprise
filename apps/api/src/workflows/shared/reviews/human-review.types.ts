import type {
  HumanReviewAnswer,
  HumanReviewDecision,
  HumanReviewDecisionType,
  HumanReviewKind,
  HumanReviewRequest,
  HumanReviewStatus,
  JsonValue,
} from '@orchestrator-ai/transport-types';

/**
 * A human gate, declared once by the workflow and passed to
 * awaitHumanReview. `onReject` is what the graph's routing does with a
 * rejection (read it with routeAfterDecision); it never silently continues.
 */
export type HumanGate =
  | {
      slug: string;
      kind: 'approval';
      allowedDecisions: HumanReviewDecisionType[];
      allowItemDecisions: boolean;
      onReject: 'rerun_items' | 'rerun_stage' | 'fail';
      taskTitle: string;
    }
  | { slug: string; kind: 'answer'; taskTitle: string };

/** What a person sent back; the value interrupt() returns on resume. */
export type HumanReviewResponse =
  | { kind: 'decision'; decision: HumanReviewDecision }
  | { kind: 'answer'; answer: HumanReviewAnswer }
  | { kind: 'finish' };

/** `workflows.runs.pending_action` of a run requeued by a review. */
export interface ReviewResumeAction {
  reviewId: string;
  response: HumanReviewResponse;
}

export interface HumanReviewRecord {
  id: string;
  runId: string;
  organizationSlug: string;
  workflowSlug: string;
  gateSlug: string;
  round: number;
  kind: HumanReviewKind;
  allowedDecisions: HumanReviewDecisionType[];
  allowItemDecisions: boolean;
  payload: JsonValue;
  status: HumanReviewStatus;
  response: HumanReviewResponse | null;
  respondedBy: string | null;
  respondedAt: string | null;
  workTask: { provider: string; taskId: string } | null;
  createdAt: string;
}

const KINDS: readonly string[] = ['approval', 'answer'];
const STATUSES: readonly string[] = ['waiting', 'responded', 'expired'];
const DECISIONS: readonly string[] = ['approve', 'reject', 'modify'];

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`workflows.human_reviews.${key} is missing or not text`);
  }
  return value;
}

function time(value: unknown, key: string): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  throw new Error(`workflows.human_reviews.${key} is not a timestamp`);
}

/** Map and validate a workflows.human_reviews row. Throws on anything malformed. */
export function toHumanReviewRecord(row: Record<string, unknown>): HumanReviewRecord {
  const kind = row.kind;
  const status = row.status;
  const allowed = row.allowed_decisions;
  if (typeof kind !== 'string' || !KINDS.includes(kind)) {
    throw new Error(`workflows.human_reviews.kind "${String(kind)}" is not a review kind`);
  }
  if (typeof status !== 'string' || !STATUSES.includes(status)) {
    throw new Error(`workflows.human_reviews.status "${String(status)}" is not a review status`);
  }
  if (!Array.isArray(allowed) || !allowed.every((d) => typeof d === 'string' && DECISIONS.includes(d))) {
    throw new Error('workflows.human_reviews.allowed_decisions is not a decision list');
  }
  if (typeof row.round !== 'number' || typeof row.allow_item_decisions !== 'boolean') {
    throw new Error('workflows.human_reviews row has a malformed round or item flag');
  }
  const provider = row.work_task_provider;
  const taskId = row.work_task_id;
  const createdAt = time(row.created_at, 'created_at');
  if (createdAt === null) throw new Error('workflows.human_reviews.created_at is missing');
  return {
    id: text(row, 'id'),
    runId: text(row, 'run_id'),
    organizationSlug: text(row, 'organization_slug'),
    workflowSlug: text(row, 'workflow_slug'),
    gateSlug: text(row, 'gate_slug'),
    round: row.round,
    kind: kind as HumanReviewKind,
    allowedDecisions: allowed as HumanReviewDecisionType[],
    allowItemDecisions: row.allow_item_decisions,
    payload: row.payload as JsonValue,
    status: status as HumanReviewStatus,
    response: (row.response ?? null) as HumanReviewResponse | null,
    respondedBy: typeof row.responded_by === 'string' ? row.responded_by : null,
    respondedAt: time(row.responded_at, 'responded_at'),
    workTask:
      typeof provider === 'string' && typeof taskId === 'string'
        ? { provider, taskId }
        : null,
    createdAt,
  };
}

/** What the UI renders and the reviewer acts on. */
export function toHumanReviewRequest(review: HumanReviewRecord): HumanReviewRequest {
  return {
    reviewId: review.id,
    runId: review.runId,
    workflowSlug: review.workflowSlug,
    gateSlug: review.gateSlug,
    kind: review.kind,
    status: review.status,
    allowedDecisions: review.allowedDecisions,
    allowItemDecisions: review.allowItemDecisions,
    payload: review.payload,
    createdAt: review.createdAt,
    ...(review.workTask ? { workTask: review.workTask } : {}),
  };
}
