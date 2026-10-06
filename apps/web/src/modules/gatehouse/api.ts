/**
 * The Gatehouse pages' API: /api/gatehouse (A2A agents, callers, inbound
 * tasks, outbound calls) and the ambient events and storage watches the
 * Gatehouse feeds. Requests carry the current organization; an admin of every
 * organization ('*') sees every org, except for ambient, which needs one.
 */
import { tokenStorage } from '@/services/tokenStorageService';
import { useRbacStore } from '@/stores/rbacStore';
import { resolveConcreteOrganization } from '@/shared/services/organization-context';
import type {
  A2AAgent,
  A2AAgentDraft,
  A2AAgentStatus,
  AgentKey,
  AmbientEvent,
  Caller,
  ConsentChoice,
  ConsentRequest,
  EventDetail,
  GatehouseTask,
  NewAgentKey,
  OutboundCall,
  StorageWatch,
  TaskState,
} from './types';

/** An error the API answered with; `message` is what it said. */
export class GatehouseApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Scope = 'current' | 'all' | 'concrete';

async function request<T>(method: string, path: string, scope: Scope, body?: unknown): Promise<T> {
  const text = await send(method, path, scope, body);
  if (!text) throw new GatehouseApiError(200, `${method} ${path} answered with no body`);
  return JSON.parse(text) as T;
}

/** A request whose answer is 204 No Content. */
async function requestNoContent(method: string, path: string, scope: Scope): Promise<void> {
  const text = await send(method, path, scope);
  if (text) throw new GatehouseApiError(200, `${method} ${path} answered with a body where none was expected`);
}

async function send(method: string, path: string, scope: Scope, body?: unknown): Promise<string> {
  const token = await tokenStorage.getAccessToken();
  if (!token) throw new Error('Sign in to use the Gatehouse');
  const rbac = useRbacStore();
  await rbac.initialize();
  const organization =
    scope === 'all' ? '*' : scope === 'concrete' ? await resolveConcreteOrganization(rbac) : rbac.currentOrganization;
  if (!organization) throw new Error('Choose an organization first');

  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': organization,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text || response.statusText;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === 'string') message = parsed.message;
    } catch {
      // The body was not JSON: keep it as the message.
    }
    throw new GatehouseApiError(response.status, message);
  }
  return text;
}

const query = (params: Record<string, string | number | undefined>): string => {
  const entries = Object.entries(params).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== '');
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : '';
};

export const gatehouseApi = {
  agents: () => request<A2AAgent[]>('GET', '/gatehouse/agents', 'current'),
  agent: (slug: string) => request<A2AAgent>('GET', `/gatehouse/agents/${encodeURIComponent(slug)}`, 'current'),
  createAgent: (draft: A2AAgentDraft & { slug: string; orgSlug?: string }) => request<A2AAgent>('POST', '/gatehouse/agents', 'current', draft),
  updateAgent: (slug: string, draft: A2AAgentDraft) => request<A2AAgent>('PUT', `/gatehouse/agents/${encodeURIComponent(slug)}`, 'current', draft),
  setAgentStatus: (slug: string, status: A2AAgentStatus) =>
    request<A2AAgent>('PATCH', `/gatehouse/agents/${encodeURIComponent(slug)}/status`, 'current', { status }),

  frontDoor: () => request<{ orgSlug: string; frontDoor: string | null }>('GET', '/gatehouse/front-door', 'current'),
  setFrontDoor: (slug: string | null) => request<{ orgSlug: string; frontDoor: string | null }>('PUT', '/gatehouse/front-door', 'current', { slug }),

  keys: () => request<AgentKey[]>('GET', '/gatehouse/keys', 'current'),
  /** The key is in this answer only; it is never shown again. */
  issueKey: (key: NewAgentKey) => request<{ grant: AgentKey; key: string }>('POST', '/gatehouse/keys', 'current', key),
  revokeKey: (id: string) => request<AgentKey>('DELETE', `/gatehouse/keys/${encodeURIComponent(id)}`, 'current'),

  tasks: (filter: { agent?: string; state?: TaskState | ''; limit?: number } = {}) =>
    request<GatehouseTask[]>('GET', `/gatehouse/tasks${query(filter)}`, 'current'),
  outbound: (limit = 100) => request<OutboundCall[]>('GET', `/gatehouse/outbound${query({ limit })}`, 'current'),

  // Callers are platform-wide: only an admin of every organization manages them.
  callers: () => request<Caller[]>('GET', '/gatehouse/callers', 'all'),
  registerCaller: (caller: { name: string; cardUrl: string; jwks: unknown }) => request<Caller>('POST', '/gatehouse/callers', 'all', caller),
  setCallerStatus: (id: string, status: Caller['status']) => request<Caller>('PATCH', `/gatehouse/callers/${id}`, 'all', { status }),
  deleteCaller: (id: string) => request<{ deleted: string }>('DELETE', `/gatehouse/callers/${id}`, 'all'),
  jwks: () => request<{ keys: Array<Record<string, unknown>> }>('GET', '/gatehouse/jwks.json', 'current'),

  events: (limit = 100) => request<AmbientEvent[]>('GET', `/ambient/events${query({ limit })}`, 'concrete'),
  event: (id: string) => request<EventDetail>('GET', `/ambient/events/${id}`, 'concrete'),
  watches: () => request<StorageWatch[]>('GET', '/ambient/storage-watches', 'concrete'),
  createWatch: (watch: { bucket: string; prefix: string; event: string }) => request<StorageWatch>('POST', '/ambient/storage-watches', 'concrete', watch),
  deleteWatch: (id: string) => requestNoContent('DELETE', `/ambient/storage-watches/${id}`, 'concrete'),
};

/** "Log in with <company>": the consent page's calls. Signed in, with no organization header: the person picks one. */
async function consent<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await tokenStorage.getAccessToken();
  if (!token) throw new Error('Sign in to connect an agent');
  const response = await fetch(`/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text || response.statusText;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === 'string') message = parsed.message;
    } catch {
      // The body was not JSON: keep it as the message.
    }
    throw new GatehouseApiError(response.status, message);
  }
  return JSON.parse(text) as T;
}

export const consentApi = {
  describe: (request: Record<string, string>, org?: string) =>
    consent<ConsentRequest>('GET', `/gatehouse/oauth/consent${query({ ...request, org })}`),
  allow: (request: Record<string, string>, choice: ConsentChoice) =>
    consent<{ redirect: string } | { show: string }>('POST', '/gatehouse/oauth/consent/allow', { query: request, ...choice }),
  deny: (request: Record<string, string>) => consent<{ redirect: string } | { show: string }>('POST', '/gatehouse/oauth/consent/deny', { query: request }),
};
