/**
 * The inbound side of A2A v1.0 as pure functions: request parsing, errors, and
 * how our tasks, agent answers and workflow runs read as A2A Tasks.
 */
import type { InvokeData, InvokeOutput, JsonValue, WorkflowRunStatus } from '@orchestrator-ai/transport-types';
import type { A2APart } from './a2a-v1';

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

export type TaskState = 'submitted' | 'working' | 'completed' | 'failed' | 'canceled' | 'rejected';
export type TaskTarget = 'ambient' | 'agent' | 'workflow' | 'a2a';

export interface TaskRow {
  id: string;
  agentSlug: string;
  orgSlug: string;
  callerId: string;
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
}

/**
 * SendMessage params: a user message of text and data parts. Continuing an
 * existing task and file parts are not supported yet, and say so.
 */
export function parseSendMessage(params: unknown): IncomingMessage {
  const message = (params as { message?: unknown } | null)?.message;
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    throw new A2ARpcError(A2A_ERRORS.invalidParams, 'params.message is required');
  }
  const { messageId, role, parts, contextId, taskId } = message as Record<string, unknown>;
  if (typeof messageId !== 'string' || !messageId) throw new A2ARpcError(A2A_ERRORS.invalidParams, 'message.messageId is required');
  if (role !== 'ROLE_USER') throw new A2ARpcError(A2A_ERRORS.invalidParams, 'message.role must be ROLE_USER');
  if (taskId !== undefined) {
    throw new A2ARpcError(A2A_ERRORS.unsupportedOperation, 'Continuing an existing task is not supported; send a new message');
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

/** An agent's answer as A2A parts: text reads as text, anything else as data. */
export function outputParts(output: InvokeOutput): A2APart[] {
  if (typeof output.content === 'string') return [{ text: output.content }];
  return [{ data: output.content as JsonValue, mediaType: 'application/json' }];
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
