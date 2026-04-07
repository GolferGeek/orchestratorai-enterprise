/**
 * legalJobsService — typed HTTP client for the Legal Department async-jobs API.
 *
 * Talks to Forge API on port 5200. All requests pass an ExecutionContext-shaped
 * object in the request body (no JWT). Org scoping is enforced server-side via
 * the orgSlug query param on read routes.
 */

const FORGE_API_URL =
  (import.meta as { env: { VITE_FORGE_API_URL?: string } }).env
    .VITE_FORGE_API_URL || 'http://localhost:5200';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type CapabilityRole = 'workhorse' | 'thinking' | 'image';

export interface AgentJobRow {
  id: string;
  org_slug: string;
  user_id: string;
  conversation_id: string;
  agent_slug: string;
  job_type: string;
  provider: string;
  model: string;
  status: JobStatus;
  current_step: string | null;
  progress: number;
  last_message: string | null;
  error: string | null;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface CapabilityModelConfigRow {
  id: string;
  capability_slug: string;
  role: CapabilityRole;
  provider: string | null;
  model: string | null;
  updated_at: string;
}

export interface ExecutionContextLike {
  orgSlug: string;
  userId: string;
  conversationId: string;
  agentSlug: string;
  agentType: string;
  provider: string;
  model: string;
}

export interface ObservabilityEvent {
  id: number;
  hook_event_type: string;
  status?: string | null;
  message?: string | null;
  step?: string | null;
  progress?: number | null;
  payload?: unknown;
  created_at: string;
  conversation_id?: string;
  agent_slug?: string;
}

async function jsonRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return (await res.json()) as T;
}

export const legalJobsService = {
  baseUrl: FORGE_API_URL,

  async listJobs(orgSlug: string, opts?: { status?: JobStatus; limit?: number }): Promise<AgentJobRow[]> {
    const qs = new URLSearchParams({ orgSlug });
    if (opts?.status) qs.set('status', opts.status);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const data = await jsonRequest<{ jobs: AgentJobRow[] }>(
      `${FORGE_API_URL}/legal-department/jobs?${qs.toString()}`,
    );
    return data.jobs;
  },

  async getJob(id: string, orgSlug: string): Promise<AgentJobRow> {
    return jsonRequest<AgentJobRow>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(id)}?orgSlug=${encodeURIComponent(orgSlug)}`,
    );
  },

  async getJobEvents(id: string, orgSlug: string): Promise<ObservabilityEvent[]> {
    const data = await jsonRequest<{ events: ObservabilityEvent[] }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(id)}/events?orgSlug=${encodeURIComponent(orgSlug)}`,
    );
    return data.events;
  },

  async enqueueJsonJob(
    context: ExecutionContextLike,
    content: string,
  ): Promise<{ jobId: string; conversationId: string; status: JobStatus }> {
    return jsonRequest<{ jobId: string; conversationId: string; status: JobStatus }>(
      `${FORGE_API_URL}/legal-department/jobs`,
      {
        method: 'POST',
        body: JSON.stringify({
          context,
          data: { content, contentType: 'text/plain' },
        }),
      },
    );
  },

  async uploadFile(
    context: ExecutionContextLike,
    file: File,
    capabilitySlug = 'document-onboarding',
  ): Promise<{ jobId: string; conversationId: string; status: JobStatus }> {
    const form = new FormData();
    form.append('file', file);
    form.append('context', JSON.stringify(context));
    form.append('capabilitySlug', capabilitySlug);
    const res = await fetch(`${FORGE_API_URL}/legal-department/jobs/upload`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${detail}`);
    }
    return (await res.json()) as {
      jobId: string;
      conversationId: string;
      status: JobStatus;
    };
  },

  async getCapabilityModels(
    capabilitySlug: string,
  ): Promise<CapabilityModelConfigRow[]> {
    const data = await jsonRequest<{
      capability: string;
      roles: CapabilityModelConfigRow[];
    }>(
      `${FORGE_API_URL}/legal-department/capabilities/${encodeURIComponent(capabilitySlug)}/models`,
    );
    return data.roles;
  },

  async putCapabilityModel(
    capabilitySlug: string,
    role: CapabilityRole,
    provider: string | null,
    model: string | null,
  ): Promise<CapabilityModelConfigRow> {
    return jsonRequest<CapabilityModelConfigRow>(
      `${FORGE_API_URL}/legal-department/capabilities/${encodeURIComponent(capabilitySlug)}/models`,
      {
        method: 'PUT',
        body: JSON.stringify({ role, provider, model }),
      },
    );
  },

  /** Open an SSE stream for live observability events on a conversation. */
  openEventStream(conversationId: string): EventSource {
    return new EventSource(
      `${FORGE_API_URL}/observability/stream?conversationId=${encodeURIComponent(conversationId)}`,
    );
  },
};
