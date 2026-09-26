import {
  isExecutionContext,
  isWorkflowRunStatus,
  type ExecutionContext,
  type HumanReviewRequest,
  type JsonValue,
  type WorkflowDocumentRef,
  type WorkflowRunStatus,
  type WorkflowRunView,
} from '@orchestrator-ai/transport-types';

export const WORKFLOW_RUNS_QUEUE = { schema: 'workflows', table: 'runs' } as const;

export type WorkflowRunAccessControl =
  | { mode: 'org' }
  | { mode: 'owner' }
  | { mode: 'allowlist'; userIds: string[] };

/** A row of workflows.runs, validated. */
export interface WorkflowRunRecord {
  id: string;
  organizationSlug: string;
  userId: string;
  workflowSlug: string;
  /** Exactly as the frontend sent it; frozen here and never rebuilt. */
  executionContext: Readonly<ExecutionContext>;
  status: WorkflowRunStatus;
  currentStep: string | null;
  progress: number | null;
  lastMessage: string | null;
  error: string | null;
  input: JsonValue;
  /** Verified uploads the run was started with. */
  documents: WorkflowDocumentRef[];
  result: JsonValue | null;
  pendingAction: JsonValue | null;
  accessControl: WorkflowRunAccessControl;
  attempt: number;
  maxAttempts: number;
  leaseExpiresAt: string | null;
  workerId: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`workflows.runs.${key} is missing or not text`);
  }
  return value;
}

function optionalText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`workflows.runs.${key} is not text`);
  return value;
}

function timestamp(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  throw new Error(`workflows.runs.${key} is not a timestamp`);
}

function integer(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`workflows.runs.${key} is not an integer`);
  }
  return value;
}

function accessControl(value: unknown): WorkflowRunAccessControl {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const mode = (value as { mode?: unknown }).mode;
    if (mode === 'org' || mode === 'owner') return { mode };
    const userIds = (value as { userIds?: unknown }).userIds;
    if (
      mode === 'allowlist' &&
      Array.isArray(userIds) &&
      userIds.every((id) => typeof id === 'string')
    ) {
      return { mode, userIds };
    }
  }
  throw new Error('workflows.runs.access_control is not a valid access rule');
}

function documents(value: unknown): WorkflowDocumentRef[] {
  if (
    Array.isArray(value) &&
    value.every(
      (doc) =>
        typeof doc === 'object' &&
        doc !== null &&
        typeof (doc as Record<string, unknown>).ref === 'string' &&
        typeof (doc as Record<string, unknown>).filename === 'string' &&
        typeof (doc as Record<string, unknown>).mimeType === 'string',
    )
  ) {
    return (value as WorkflowDocumentRef[]).map(({ ref, filename, mimeType }) => ({
      ref,
      filename,
      mimeType,
    }));
  }
  throw new Error('workflows.runs.documents is not a list of document refs');
}

/** Map and validate a workflows.runs row. Throws on anything malformed. */
export function toWorkflowRunRecord(row: Record<string, unknown>): WorkflowRunRecord {
  const context = row.execution_context;
  if (!isExecutionContext(context)) {
    throw new Error('workflows.runs.execution_context is not an ExecutionContext');
  }
  const status = row.status;
  if (!isWorkflowRunStatus(status)) {
    throw new Error(`workflows.runs.status "${String(status)}" is not a run status`);
  }
  const progress = row.progress;
  if (progress !== null && progress !== undefined && typeof progress !== 'number') {
    throw new Error('workflows.runs.progress is not a number');
  }
  const queuedAt = timestamp(row, 'queued_at');
  if (queuedAt === null) throw new Error('workflows.runs.queued_at is missing');

  return {
    id: text(row, 'id'),
    organizationSlug: text(row, 'organization_slug'),
    userId: text(row, 'user_id'),
    workflowSlug: text(row, 'workflow_slug'),
    executionContext: Object.freeze({ ...context }),
    status,
    currentStep: optionalText(row, 'current_step'),
    progress: progress ?? null,
    lastMessage: optionalText(row, 'last_message'),
    error: optionalText(row, 'error'),
    input: row.input as JsonValue,
    documents: documents(row.documents),
    result: (row.result ?? null) as JsonValue | null,
    pendingAction: (row.pending_action ?? null) as JsonValue | null,
    accessControl: accessControl(row.access_control),
    attempt: integer(row, 'attempt'),
    maxAttempts: integer(row, 'max_attempts'),
    leaseExpiresAt: timestamp(row, 'lease_expires_at'),
    workerId: optionalText(row, 'worker_id'),
    queuedAt,
    startedAt: timestamp(row, 'started_at'),
    completedAt: timestamp(row, 'completed_at'),
  };
}

/**
 * Who is reading runs: the caller, and the org RBAC bound to the request
 * ("*" for a super-admin with no organization selected).
 */
export interface WorkflowRunReader {
  userId: string;
  organizationSlug: string;
}

/** The owner always reads their run; others only as its access rule allows. */
export function canReadRun(run: WorkflowRunRecord, reader: WorkflowRunReader): boolean {
  if (reader.organizationSlug !== '*' && run.organizationSlug !== reader.organizationSlug) {
    return false;
  }
  if (run.userId === reader.userId) return true;
  switch (run.accessControl.mode) {
    case 'org':
      return true;
    case 'owner':
      return false;
    case 'allowlist':
      return run.accessControl.userIds.includes(reader.userId);
  }
}

/** The reader-facing view: no lease or worker internals. */
export function toWorkflowRunView(
  run: WorkflowRunRecord,
  review: HumanReviewRequest | null,
): WorkflowRunView {
  return {
    runId: run.id,
    workflowSlug: run.workflowSlug,
    context: run.executionContext,
    status: run.status,
    currentStep: run.currentStep,
    progress: run.progress,
    lastMessage: run.lastMessage,
    error: run.error,
    input: run.input,
    documents: run.documents,
    result: run.result,
    review,
    attempt: run.attempt,
    maxAttempts: run.maxAttempts,
    queuedAt: run.queuedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}
