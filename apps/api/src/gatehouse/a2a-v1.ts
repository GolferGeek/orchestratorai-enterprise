/**
 * The A2A v1.0 shapes the Gatehouse reads (https://a2a-protocol.org/latest/specification/).
 * v1.0 only: an agent card without a JSONRPC 1.x interface is refused, and
 * requests use the v1.0 method names (SendMessage) and the A2A-Version header.
 * These parsers accept only what the spec says and fail on anything else.
 */

export const A2A_VERSION = '1.0';

export interface A2AAgentCard {
  name: string;
  description: string;
  /** The JSONRPC 1.x interface to send to. */
  url: string;
  skills: Array<{ id: string; name: string }>;
}

export type A2APart =
  | { text: string }
  | { data: unknown; mediaType?: string }
  /** A file by reference: what our image and video agents answer with. */
  | { url: string; mediaType?: string; filename?: string };

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'input-required'
  | 'rejected'
  | 'auth-required';

/** What a SendMessage answered: a direct message (completed) or a task. */
export interface A2AReply {
  state: A2ATaskState;
  parts: A2APart[];
  taskId?: string;
  contextId?: string;
}

const TASK_STATES: Record<string, A2ATaskState> = {
  TASK_STATE_SUBMITTED: 'submitted',
  TASK_STATE_WORKING: 'working',
  TASK_STATE_COMPLETED: 'completed',
  TASK_STATE_FAILED: 'failed',
  TASK_STATE_CANCELED: 'canceled',
  TASK_STATE_INPUT_REQUIRED: 'input-required',
  TASK_STATE_REJECTED: 'rejected',
  TASK_STATE_AUTH_REQUIRED: 'auth-required',
};

const record = (value: unknown, what: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
};
const text = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${what} must be a non-empty string`);
  return value;
};
const optionalText = (value: unknown, what: string): string | undefined =>
  value === undefined ? undefined : text(value, what);

export function parseAgentCard(raw: unknown, cardUrl: string): A2AAgentCard {
  const what = `The agent card at ${cardUrl}`;
  const card = record(raw, what);
  const interfaces = card.supportedInterfaces;
  if (!Array.isArray(interfaces)) {
    throw new Error(`${what} has no supportedInterfaces; only A2A v1.0 agents are supported`);
  }
  const jsonRpc = interfaces
    .map((entry, index) => record(entry, `${what} supportedInterfaces[${index}]`))
    .find((entry) => entry.protocolBinding === 'JSONRPC' && typeof entry.protocolVersion === 'string' && /^1\.\d+$/.test(entry.protocolVersion));
  if (!jsonRpc) throw new Error(`${what} offers no JSONRPC interface for A2A 1.x`);
  const url = text(jsonRpc.url, `${what} interface url`);
  if (!url.startsWith('https://')) throw new Error(`${what} interface url must be https`);
  const skills = Array.isArray(card.skills)
    ? card.skills.map((raw, index) => {
        const skill = record(raw, `${what} skills[${index}]`);
        return { id: text(skill.id, `${what} skills[${index}].id`), name: text(skill.name, `${what} skills[${index}].name`) };
      })
    : [];
  return { name: text(card.name, `${what} name`), description: text(card.description, `${what} description`), url, skills };
}

function parsePart(raw: unknown, what: string): A2APart {
  const part = record(raw, what);
  if (typeof part.text === 'string') return { text: part.text };
  if ('data' in part) {
    const mediaType = optionalText(part.mediaType, `${what}.mediaType`);
    return mediaType === undefined ? { data: part.data } : { data: part.data, mediaType };
  }
  if (typeof part.url === 'string') {
    const mediaType = optionalText(part.mediaType, `${what}.mediaType`);
    const filename = optionalText(part.filename, `${what}.filename`);
    return { url: part.url, ...(mediaType === undefined ? {} : { mediaType }), ...(filename === undefined ? {} : { filename }) };
  }
  throw new Error(`${what} is neither text, data nor a url; inline file bytes (raw) are not supported`);
}

const parseParts = (raw: unknown, what: string): A2APart[] => {
  if (!Array.isArray(raw)) throw new Error(`${what} must be a list`);
  return raw.map((part, index) => parsePart(part, `${what}[${index}]`));
};

/**
 * A JSON-RPC response to SendMessage: `result.message` (a direct answer) or
 * `result.task`. A JSON-RPC error throws with the remote's code and message.
 */
export function parseSendMessageResponse(raw: unknown, requestId: string, agentName: string): A2AReply {
  const what = `${agentName}'s response`;
  const response = record(raw, what);
  if (response.jsonrpc !== '2.0') throw new Error(`${what} is not JSON-RPC 2.0`);
  if (response.id !== requestId) throw new Error(`${what} answers a different request id`);
  if (response.error !== undefined) {
    const error = record(response.error, `${what} error`);
    const message = typeof error.message === 'string' ? error.message.slice(0, 200) : 'no message';
    throw new Error(`${agentName} returned JSON-RPC error ${String(error.code)}: ${message}`);
  }
  const result = record(response.result, `${what} result`);

  if (result.message !== undefined) {
    const message = record(result.message, `${what} message`);
    return {
      state: 'completed',
      parts: parseParts(message.parts, `${what} message.parts`),
      ...(typeof message.contextId === 'string' ? { contextId: message.contextId } : {}),
    };
  }

  const task = record(result.task, `${what} task (neither message nor task was returned)`);
  const status = record(task.status, `${what} task.status`);
  const state = TASK_STATES[String(status.state)];
  if (!state) throw new Error(`${what} has an unknown task state ${String(status.state)}`);
  const artifacts = task.artifacts === undefined ? [] : task.artifacts;
  if (!Array.isArray(artifacts)) throw new Error(`${what} task.artifacts must be a list`);
  const artifactParts = artifacts.flatMap((artifact, index) =>
    parseParts(record(artifact, `${what} artifacts[${index}]`).parts, `${what} artifacts[${index}].parts`),
  );
  const statusParts = status.message === undefined
    ? []
    : parseParts(record(status.message, `${what} task.status.message`).parts, `${what} task.status.message.parts`);
  return {
    state,
    parts: artifactParts.length > 0 ? artifactParts : statusParts,
    taskId: text(task.id, `${what} task.id`),
    ...(typeof task.contextId === 'string' ? { contextId: task.contextId } : {}),
  };
}
