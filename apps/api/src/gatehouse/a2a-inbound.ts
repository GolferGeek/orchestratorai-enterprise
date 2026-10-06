/**
 * The inbound side of A2A v1.0 as pure functions: request parsing, errors, and
 * how our tasks, agent answers and workflow runs read as A2A Tasks.
 */
import type { InvokeData, InvokeOutput, JsonValue, WorkflowRunStatus } from '@orchestrator-ai/transport-types';
import type { A2APart } from './a2a-v1';
import type { EventOutcome } from '../ambient/events/ambient-events.service';

/** A2A error codes (spec §5.4), plus the JSON-RPC ones we use. */
export const A2A_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  taskNotFound: -32001,
  taskNotCancelable: -32002,
  pushNotificationNotSupported: -32003,
  unsupportedOperation: -32004,
  contentTypeNotSupported: -32005,
  versionNotSupported: -32009,
} as const;

export class A2ARpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

/** The google.rpc.ErrorInfo reason for each A2A error (spec §9.5). */
const A2A_REASONS: Record<number, string> = {
  [A2A_ERRORS.taskNotFound]: 'TASK_NOT_FOUND',
  [A2A_ERRORS.taskNotCancelable]: 'TASK_NOT_CANCELABLE',
  [A2A_ERRORS.pushNotificationNotSupported]: 'PUSH_NOTIFICATION_NOT_SUPPORTED',
  [A2A_ERRORS.unsupportedOperation]: 'UNSUPPORTED_OPERATION',
  [A2A_ERRORS.contentTypeNotSupported]: 'CONTENT_TYPE_NOT_SUPPORTED',
  [A2A_ERRORS.versionNotSupported]: 'VERSION_NOT_SUPPORTED',
};

/** A JSON-RPC error; an A2A error carries its ErrorInfo in data. */
export function rpcError(id: string | number | null, code: number, message: string) {
  const reason = A2A_REASONS[code];
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(reason ? { data: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, domain: 'a2a-protocol.org' }] } : {}),
    },
  };
}

export type TaskState = 'submitted' | 'working' | 'completed' | 'failed' | 'canceled' | 'rejected';
export type TaskTarget = 'ambient' | 'agent' | 'workflow' | 'a2a';

export interface TaskRow {
  id: string;
  agentSlug: string;
  orgSlug: string;
  /** The registered caller that owns the task, or null when an agent key does. */
  callerId: string | null;
  /** The agent key's grant that owns the task, or null when a registered caller does. */
  grantRef: string | null;
  contextId: string;
  state: TaskState;
  target: TaskTarget;
  runId: string | null;
  eventId: string | null;
  artifact: A2APart[] | null;
  statusMessage: string | null;
  updatedAt: string;
}

const WIRE_STATES: Record<TaskState, string> = {
  submitted: 'TASK_STATE_SUBMITTED',
  working: 'TASK_STATE_WORKING',
  completed: 'TASK_STATE_COMPLETED',
  failed: 'TASK_STATE_FAILED',
  canceled: 'TASK_STATE_CANCELED',
  rejected: 'TASK_STATE_REJECTED',
};
const TERMINAL: TaskState[] = ['completed', 'failed', 'canceled', 'rejected'];
export const isTerminal = (state: TaskState): boolean => TERMINAL.includes(state);

/** A task as the caller sees it (the A2A Task object). */
export function wireTask(task: TaskRow): Record<string, unknown> {
  return {
    id: task.id,
    contextId: task.contextId,
    status: {
      state: WIRE_STATES[task.state],
      ...(task.statusMessage
        ? { message: { messageId: `${task.id}-status`, role: 'ROLE_AGENT', taskId: task.id, contextId: task.contextId, parts: [{ text: task.statusMessage }] } }
        : {}),
      timestamp: task.updatedAt,
    },
    ...(task.artifact ? { artifacts: [{ artifactId: `${task.id}-result`, name: 'result', parts: task.artifact }] } : {}),
  };
}

export interface IncomingMessage {
  parts: A2APart[];
  contextId?: string;
  /** A task the caller names; continuing one is not supported yet. */
  taskId?: string;
  /** configuration.returnImmediately: answer with the working task and let the caller poll GetTask. */
  returnImmediately: boolean;
}

/**
 * SendMessage params: a user message of text and data parts. Continuing an
 * existing task and file parts are not supported yet, and say so.
 */
export function parseSendMessage(params: unknown): IncomingMessage {
  const message = (params as { message?: unknown } | null)?.message;
  const configuration = (params as { configuration?: unknown } | null)?.configuration;
  if (configuration !== undefined && (typeof configuration !== 'object' || configuration === null || Array.isArray(configuration))) {
    throw new A2ARpcError(A2A_ERRORS.invalidParams, 'params.configuration must be an object');
  }
  const returnImmediately = (configuration as { returnImmediately?: unknown } | undefined)?.returnImmediately;
  if (returnImmediately !== undefined && typeof returnImmediately !== 'boolean') {
    throw new A2ARpcError(A2A_ERRORS.invalidParams, 'configuration.returnImmediately must be true or false');
  }
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    throw new A2ARpcError(A2A_ERRORS.invalidParams, 'params.message is required');
  }
  const { messageId, role, parts, contextId, taskId } = message as Record<string, unknown>;
  if (typeof messageId !== 'string' || !messageId) throw new A2ARpcError(A2A_ERRORS.invalidParams, 'message.messageId is required');
  if (role !== 'ROLE_USER') throw new A2ARpcError(A2A_ERRORS.invalidParams, 'message.role must be ROLE_USER');
  if (taskId !== undefined && (typeof taskId !== 'string' || !taskId)) {
    throw new A2ARpcError(A2A_ERRORS.invalidParams, 'message.taskId must be a string');
  }
  if (contextId !== undefined && (typeof contextId !== 'string' || !contextId || contextId.length > 200)) {
    throw new A2ARpcError(A2A_ERRORS.invalidParams, 'message.contextId must be a string of 1 to 200 characters');
  }
  if (!Array.isArray(parts) || parts.length === 0) throw new A2ARpcError(A2A_ERRORS.invalidParams, 'message.parts must be a non-empty list');
  return {
    parts: parts.map((raw, index): A2APart => {
      const part = raw as Record<string, unknown>;
      if (typeof part !== 'object' || part === null) throw new A2ARpcError(A2A_ERRORS.invalidParams, `message.parts[${index}] must be an object`);
      if (typeof part.text === 'string') return { text: part.text };
      if ('data' in part) return typeof part.mediaType === 'string' ? { data: part.data, mediaType: part.mediaType } : { data: part.data };
      if ('url' in part || 'raw' in part) {
        throw new A2ARpcError(A2A_ERRORS.contentTypeNotSupported, 'File parts are not accepted yet; send text or data');
      }
      throw new A2ARpcError(A2A_ERRORS.invalidParams, `message.parts[${index}] has no text or data`);
    }),
    ...(typeof contextId === 'string' ? { contextId } : {}),
    ...(typeof taskId === 'string' ? { taskId } : {}),
    returnImmediately: returnImmediately === true,
  };
}

/** The message as an agent's input: the text as `message`, one data object's fields beside it. */
export function invokeData(parts: A2APart[]): InvokeData {
  const texts = parts.filter((part): part is { text: string } => 'text' in part).map((part) => part.text);
  const data = parts.filter((part): part is { data: unknown } => 'data' in part).map((part) => part.data);
  if (data.length > 1) throw new A2ARpcError(A2A_ERRORS.invalidParams, 'Send at most one data part');
  const object = data[0];
  if (object !== undefined && (typeof object !== 'object' || object === null || Array.isArray(object))) {
    throw new A2ARpcError(A2A_ERRORS.invalidParams, 'A data part must be a JSON object');
  }
  if ('message' in ((object ?? {}) as object) && texts.length > 0) {
    throw new A2ARpcError(A2A_ERRORS.invalidParams, 'A data part may not carry "message" alongside a text part');
  }
  return {
    content: { ...(texts.length > 0 ? { message: texts.join('\n\n') } : {}), ...((object ?? {}) as Record<string, unknown>) },
    contentType: 'json',
  };
}

/**
 * An agent's answer as A2A parts: an image or video as a file part (its
 * stored URL, type and file name), text as text, anything else as data.
 */
export function outputParts(output: InvokeOutput): A2APart[] {
  return [...answerOnly(output), ...guardPart(output)];
}

function answerOnly(output: InvokeOutput): A2APart[] {
  if (output.outputType === 'image' || output.outputType === 'video') return [mediaPart(output)];
  if (typeof output.content === 'string') return [{ text: output.content }];
  return [{ data: output.content as JsonValue, mediaType: 'application/json' }];
}

/** An agent's Jev guard verdicts (output.metadata.guards), when it has guards. */
interface GuardVerdict {
  rubric: string;
  decision: 'pass' | 'review' | 'block';
  reason: string | null;
}

function guardVerdicts(output: InvokeOutput): GuardVerdict[] {
  const guards = output.metadata?.guards;
  if (guards === undefined) return [];
  if (!Array.isArray(guards)) throw new Error('output.metadata.guards must be a list of verdicts');
  return guards.map((raw, index) => {
    const verdict = raw as Partial<GuardVerdict>;
    if (typeof verdict.rubric !== 'string' || !['pass', 'review', 'block'].includes(String(verdict.decision))) {
      throw new Error(`output.metadata.guards[${index}] is not a verdict`);
    }
    return { rubric: verdict.rubric, decision: verdict.decision!, reason: verdict.reason ?? null };
  });
}

/**
 * In the app a person sees the answer with Jev's verdicts beside it. An
 * outside caller has no one to weigh it, so the verdicts travel with the
 * answer as a data part.
 */
function guardPart(output: InvokeOutput): A2APart[] {
  const verdicts = guardVerdicts(output);
  return verdicts.length === 0 ? [] : [{ data: { guards: verdicts } as unknown as JsonValue, mediaType: 'application/json' }];
}

/**
 * Why an answer is held back from an outside caller: a Jev guard blocked it.
 * Null when it may go out (passed, or review: it goes with its verdicts).
 */
export function heldBack(output: InvokeOutput): string | null {
  const blocked = guardVerdicts(output).find((verdict) => verdict.decision === 'block');
  return blocked ? `A Jev check (${blocked.rubric}) blocked this answer: ${blocked.reason ?? 'no reason given'}` : null;
}

/** A caller outside the platform can only fetch an absolute https URL, so anything else is a setup error (PUBLIC_API_URL). */
function mediaPart(output: InvokeOutput): A2APart {
  const what = `The ${output.outputType} answer`;
  if (typeof output.content !== 'string') throw new Error(`${what} must be its stored URL`);
  let url: URL;
  try {
    url = new URL(output.content);
  } catch {
    throw new Error(`${what} has a relative URL (${output.content}); set PUBLIC_API_URL so callers outside the platform can fetch it`);
  }
  if (url.protocol !== 'https:') throw new Error(`${what} URL must be https, not ${url.protocol}`);
  const mediaType = output.metadata?.mimeType;
  if (typeof mediaType !== 'string' || !mediaType) throw new Error(`${what} does not say its type (metadata.mimeType)`);
  const filename = decodeURIComponent(url.pathname.split('/').pop() ?? '');
  return { url: url.toString(), mediaType, ...(filename ? { filename } : {}) };
}

/** What an ambient-route task does next, from its event's outcome. */
export type EventStep =
  | { kind: 'waiting'; statusMessage: string }
  | { kind: 'run'; runId: string }
  | { kind: 'done'; state: 'completed' | 'failed' | 'rejected'; statusMessage: string | null; artifact: A2APart[] | null };

/**
 * An A2A task on the ambient route follows the event it pushed: working while
 * ambient evaluates it and its triggers run; then the one workflow run it
 * started (the task follows the run from there), or the agents' answers (with
 * Jev's rules), or "received" when nothing in the organization runs for it.
 */
export function eventTaskState(outcome: EventOutcome): EventStep {
  if (outcome.matched === null) return { kind: 'waiting', statusMessage: 'Received' };
  if (outcome.matched === 0) {
    return { kind: 'done', state: 'completed', statusMessage: null, artifact: [{ text: `Received. Nothing in this organization runs for ${outcome.name}.` }] };
  }
  if (outcome.executions.length < outcome.matched || outcome.executions.some((e) => e.status !== 'completed' && e.status !== 'failed' && e.status !== 'skipped')) {
    return { kind: 'waiting', statusMessage: 'Received; the work it starts is running' };
  }
  const acting = outcome.executions.filter((e) => e.status !== 'skipped');
  if (acting.length === 0) {
    const why = [...new Set(outcome.executions.map((e) => e.skipReason).filter(Boolean))].join(', ');
    return { kind: 'done', state: 'completed', statusMessage: null, artifact: [{ text: `Received. It started no work${why ? ` (${why})` : ''}.` }] };
  }
  const runs = acting.flatMap((e) => (e.status === 'completed' && typeof e.response?.runId === 'string' ? [e.response.runId] : []));
  if (acting.length === 1 && runs.length === 1) return { kind: 'run', runId: runs[0]! };

  const parts: A2APart[] = [];
  const held: string[] = [];
  for (const execution of acting) {
    const output = execution.response?.output as InvokeOutput | undefined;
    if (execution.status !== 'completed' || !output) continue;
    const reason = heldBack(output);
    if (reason) held.push(reason);
    else parts.push(...outputParts(output));
  }
  if (runs.length > 0) parts.push({ data: { runs }, mediaType: 'application/json' });
  if (parts.length > 0) return { kind: 'done', state: 'completed', statusMessage: null, artifact: parts };
  if (held.length > 0) return { kind: 'done', state: 'rejected', statusMessage: held.join('; '), artifact: null };
  return { kind: 'done', state: 'failed', statusMessage: 'The work it started failed', artifact: null };
}

/** Where a task that started a workflow run stands, from the run. */
export function runTaskState(
  run: { status: WorkflowRunStatus; lastMessage: string | null; result: JsonValue | null },
  orgName: string,
): Pick<TaskRow, 'state' | 'statusMessage' | 'artifact'> {
  switch (run.status) {
    case 'queued':
      return { state: 'submitted', statusMessage: 'Queued', artifact: null };
    case 'running':
    case 'cancel_requested':
      return { state: 'working', statusMessage: run.lastMessage, artifact: null };
    case 'awaiting_review':
    case 'awaiting_answer':
      return { state: 'working', statusMessage: `Waiting for review in ${orgName}`, artifact: null };
    case 'completed':
      return { state: 'completed', statusMessage: null, artifact: run.result === null ? null : [{ data: run.result, mediaType: 'application/json' }] };
    case 'failed':
      return { state: 'failed', statusMessage: 'The workflow run failed', artifact: null };
    case 'canceled':
      return { state: 'canceled', statusMessage: null, artifact: null };
  }
}

/** The run events a stream follows; anything else (model calls, payloads) never leaves the platform. */
const WORKING_EVENTS = new Set([
  'langgraph.started',
  'langgraph.processing',
  'langgraph.work_unit.started',
  'langgraph.work_unit.completed',
  'langgraph.hitl_resumed',
  'langgraph.retrying',
]);
const ENDING_EVENTS = new Set(['langgraph.completed', 'langgraph.failed', 'langgraph.canceled']);

export type RunEventStep =
  | { kind: 'status'; message: string | null; metadata?: { step?: string; progress?: number } }
  | { kind: 'ended' }
  | { kind: 'skip' };

/**
 * One of a run's observability events as a step of its A2A stream. Only an
 * allowlist of run events is sent, and only their message, step and
 * progress: never the event's context or payload. Our human gate waits for
 * someone in our org, so it reads as working, not input-required.
 */
export function runEventStep(
  event: { eventType: string; message: string | null; step: string | null; progress: number | null },
  orgName: string,
): RunEventStep {
  if (ENDING_EVENTS.has(event.eventType)) return { kind: 'ended' };
  if (event.eventType === 'langgraph.hitl_waiting') return { kind: 'status', message: `Waiting for review in ${orgName}` };
  if (!WORKING_EVENTS.has(event.eventType)) return { kind: 'skip' };
  const metadata = {
    ...(event.step ? { step: event.step } : {}),
    ...(typeof event.progress === 'number' ? { progress: event.progress } : {}),
  };
  return { kind: 'status', message: event.message, ...(Object.keys(metadata).length > 0 ? { metadata } : {}) };
}

/** A StreamResponse carrying the whole task (always a stream's first event). */
export function taskEvent(task: TaskRow): Record<string, unknown> {
  return { task: wireTask(task) };
}

/** A StreamResponse carrying a status change. */
export function statusUpdateEvent(task: TaskRow, metadata?: Record<string, unknown>): Record<string, unknown> {
  const { status } = wireTask(task) as { status: Record<string, unknown> };
  return {
    statusUpdate: {
      taskId: task.id,
      contextId: task.contextId,
      status,
      ...(metadata ? { metadata } : {}),
    },
  };
}

/** A StreamResponse carrying the task's result. */
export function artifactUpdateEvent(task: TaskRow): Record<string, unknown> {
  return {
    artifactUpdate: {
      taskId: task.id,
      contextId: task.contextId,
      artifact: { artifactId: `${task.id}-result`, name: 'result', parts: task.artifact ?? [] },
      append: false,
      lastChunk: true,
    },
  };
}
