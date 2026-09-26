/**
 * Workflow run lifecycle and the business actions a workflow accepts.
 *
 * Workflows are invoked through the single A2A `invoke` method. The action is
 * business input, not a transport mode: it travels in `data.content` with
 * `contentType: 'json'`. Each workflow validates its own `input` shape.
 */
import type { JsonValue } from '../shared/json.types';
import type {
  HumanReviewAnswer,
  HumanReviewDecision,
  HumanReviewRequest,
} from './human-review.types';

export const WORKFLOW_RUN_STATUSES = [
  'queued',
  'running',
  'awaiting_review',
  'awaiting_answer',
  'cancel_requested',
  'canceled',
  'completed',
  'failed',
] as const;

export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

/** Statuses a run never leaves. */
export const TERMINAL_WORKFLOW_RUN_STATUSES: readonly WorkflowRunStatus[] = [
  'canceled',
  'completed',
  'failed',
];

export function isWorkflowRunStatus(value: unknown): value is WorkflowRunStatus {
  return (
    typeof value === 'string' &&
    (WORKFLOW_RUN_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * A document uploaded ahead of the invoke. `ref` is the storage handle the
 * upload endpoint returned; the workflow verifies it belongs to the caller.
 */
export interface WorkflowDocumentRef {
  ref: string;
  filename: string;
  mimeType: string;
}

/**
 * Overrides for a restart. They travel in workflow state, never on the
 * ExecutionContext.
 */
export interface WorkflowRestartOverrides {
  instruction?: string;
}

export type WorkflowInvokeAction<TInput extends JsonValue = JsonValue> =
  | { action: 'start'; input: TInput; documents?: WorkflowDocumentRef[] }
  | { action: 'review.submit'; reviewId: string; decision: HumanReviewDecision }
  | { action: 'answer.submit'; reviewId: string; answer: HumanReviewAnswer }
  | { action: 'finish'; reviewId: string }
  | { action: 'cancel'; runId: string }
  | {
      action: 'restart';
      source: { runId: string; workUnitRunId: string };
      overrides?: WorkflowRestartOverrides;
    };

export type WorkflowInvokeActionName = WorkflowInvokeAction['action'];

const ACTION_NAMES: readonly WorkflowInvokeActionName[] = [
  'start',
  'review.submit',
  'answer.submit',
  'finish',
  'cancel',
  'restart',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Structural check of the action envelope. It does not validate a
 * workflow's `input` or a decision's contents; the workflow does that.
 */
export function isWorkflowInvokeAction(value: unknown): value is WorkflowInvokeAction {
  if (!isRecord(value) || typeof value.action !== 'string') return false;
  if (!(ACTION_NAMES as readonly string[]).includes(value.action)) return false;
  switch (value.action) {
    case 'start':
      return 'input' in value;
    case 'review.submit':
      return isNonEmptyString(value.reviewId) && isRecord(value.decision);
    case 'answer.submit':
      return isNonEmptyString(value.reviewId) && isRecord(value.answer);
    case 'finish':
      return isNonEmptyString(value.reviewId);
    case 'cancel':
      return isNonEmptyString(value.runId);
    case 'restart':
      return (
        isRecord(value.source) &&
        isNonEmptyString(value.source.runId) &&
        isNonEmptyString(value.source.workUnitRunId)
      );
    default:
      return false;
  }
}

/** `output.content` of a workflow invoke (outputType `json`). */
export interface WorkflowInvokeResult {
  runId: string;
  status: WorkflowRunStatus;
  review?: HumanReviewRequest;
}
