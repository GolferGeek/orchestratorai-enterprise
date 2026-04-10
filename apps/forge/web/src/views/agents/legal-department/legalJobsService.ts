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

export type JobStatus =
  | 'queued'
  | 'processing'
  | 'awaiting_review'
  | 'review_rejected'
  | 'completed'
  | 'failed';

/**
 * Mirrors the API's ReviewDecisionPayload union (see
 * apps/forge/api/src/agents/legal-department/jobs/legal-jobs.types.ts).
 */
export type ReviewDecisionPayload =
  | { decision: 'approve' }
  | { decision: 'reject'; feedback: string }
  | {
      decision: 'modify';
      editedOutputs: Record<string, unknown>;
      feedback?: string;
    }
  | {
      decision: 'deepen';
      targetNodeIds: string[];
      guidance?: string;
    }
  | {
      decision: 'redirect';
      targetNodeId: string;
      replacementQuestions: string[];
    };

export interface ClauseSynthesis {
  clauseId: string;
  originalText: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
  annotations: Array<{
    clauseId: string;
    riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
    category: string;
    finding: string;
    suggestedLanguage?: string;
    reasoning: string;
  }>;
  suggestedRedline?: string;
  summary: string;
}

export interface RedlineOutput {
  clauses: ClauseSynthesis[];
  riskBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    acceptable: number;
  };
  totalClauses: number;
  flaggedClauses: number;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
}

export interface ClauseDecision {
  clauseId: string;
  decision: 'accept' | 'reject' | 'modify';
  modifiedLanguage?: string;
}

export interface ReviewPayloadSnapshot {
  specialistOutputs: Record<string, unknown>;
  synthesis?: unknown;
  documentsSummary: Array<{ name: string; type?: string; length: number }>;
  /** Clause-level risk assessments produced by the redlining capability (Phase 4). */
  redlineOutput?: RedlineOutput;
  /** Clause map from segmentation (Phase 4). */
  clauseMap?: Record<string, unknown>;
}
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
  /**
   * Completed job result. May include `redlineOutput: RedlineOutput` when
   * the job ran the clause-redlining capability (Phase 4).
   */
  result: Record<string, unknown> | null;
  /**
   * Storage path (bucket-relative) for the original uploaded file. Only
   * present on jobs created via the upload endpoint after Phase 5 of the
   * legal workspace review UX effort. Pre-existing jobs have null and
   * the modal renders the extracted-text fallback.
   */
  original_file_path: string | null;
  /**
   * Signed URL for the original file. Returned by `GET /jobs/:id` only
   * (not by `GET /jobs` list) and only when `original_file_path` is set.
   */
  originalFileUrl?: string;
  /**
   * Review payload surfaced by GET /jobs/:id when the job is paused at
   * HITL. Includes the specialist outputs + synthesis read from the
   * LangGraph checkpointer — the review modal renders from this.
   */
  reviewPayload?: ReviewPayloadSnapshot;
  /** Most recent review decision, written by POST /jobs/:id/review. */
  review_decision: ReviewDecisionPayload | null;
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

/**
 * Unified shape for observability events as the UI sees them. Two
 * sources feed this type:
 *
 * 1. The history endpoint (`GET /jobs/:id/events`) returns rows from
 *    `public.observability_events`. Those have a numeric `id` (the DB
 *    primary key) and a `created_at` ISO timestamp.
 * 2. The live SSE stream (`GET /observability/stream?conversationId=…`)
 *    pushes the in-memory `ObservabilityEventRecord` shape from the
 *    server. Those have a `timestamp` (Unix ms) but neither `id` nor
 *    `created_at`.
 *
 * Both shapes share `hook_event_type`, `step`, `message`, etc. The UI's
 * dedupe logic handles the missing-field case by falling back to a
 * `live:hook_event_type:timestamp` key.
 */
export interface ObservabilityEvent {
  id?: number;
  hook_event_type: string;
  status?: string | null;
  message?: string | null;
  step?: string | null;
  progress?: number | null;
  payload?: unknown;
  created_at?: string;
  timestamp?: number;
  conversation_id?: string;
  agent_slug?: string;
  context?: {
    conversationId?: string;
    [key: string]: unknown;
  };
}

async function jsonRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('authToken');
  const res = await fetch(input, {
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
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

  async listJobs(
    orgSlug: string,
    opts?: { status?: JobStatus; limit?: number; userId?: string },
  ): Promise<AgentJobRow[]> {
    const qs = new URLSearchParams({ orgSlug });
    if (opts?.status) qs.set('status', opts.status);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.userId) qs.set('userId', opts.userId);
    const data = await jsonRequest<{ jobs: AgentJobRow[] }>(
      `${FORGE_API_URL}/legal-department/jobs?${qs.toString()}`,
    );
    return data.jobs;
  },

  async cancelJob(jobId: string): Promise<{ success: boolean; status: string }> {
    return jsonRequest<{ success: boolean; status: string }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: 'POST', body: JSON.stringify({ context: { orgSlug: '*' } }) },
    );
  },

  async getJob(id: string, orgSlug: string): Promise<AgentJobRow> {
    const row = await jsonRequest<AgentJobRow>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(id)}?orgSlug=${encodeURIComponent(orgSlug)}`,
    );
    // The API returns originalFileUrl as a path relative to the API host
    // (e.g. `/legal-department/jobs/.../file?orgSlug=...`). Resolve it to
    // an absolute URL pointing at the Forge API so the modal's <iframe>
    // / <img> renders against the correct origin.
    if (row.originalFileUrl && row.originalFileUrl.startsWith('/')) {
      row.originalFileUrl = `${FORGE_API_URL}${row.originalFileUrl}`;
    }
    return row;
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
    return this.uploadFiles(context, [file], capabilitySlug);
  },

  async uploadFiles(
    context: ExecutionContextLike,
    files: File[],
    capabilitySlug = 'document-onboarding',
  ): Promise<{ jobId: string; conversationId: string; status: JobStatus }> {
    const form = new FormData();
    for (const file of files) {
      form.append('files', file);
    }
    form.append('context', JSON.stringify(context));
    form.append('capabilitySlug', capabilitySlug);
    const token = localStorage.getItem('authToken');
    const res = await fetch(`${FORGE_API_URL}/legal-department/jobs/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
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

  /**
   * POST a HITL review decision with per-clause decisions from the redlining
   * view (Phase 4). Sent when the reviewer has worked through the redlined
   * contract and assigned accept / reject / modify to individual clauses.
   */
  async reviewWithClauseDecisions(
    jobId: string,
    context: ExecutionContextLike,
    clauseDecisions: ClauseDecision[],
  ): Promise<{ jobId: string; status: JobStatus }> {
    return jsonRequest<{ jobId: string; status: JobStatus }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ context, clauseDecisions }),
      },
    );
  },

  /**
   * POST a HITL review decision. The endpoint is guarded server-side: a
   * 409 comes back if the job is no longer `awaiting_review`.
   */
  async review(
    jobId: string,
    context: ExecutionContextLike,
    decision: ReviewDecisionPayload,
  ): Promise<{ jobId: string; status: JobStatus }> {
    return jsonRequest<{ jobId: string; status: JobStatus }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ context, decision }),
      },
    );
  },

  /** Open an SSE stream for live observability events on a conversation. */
  openEventStream(conversationId: string): EventSource {
    return new EventSource(
      `${FORGE_API_URL}/observability/stream?conversationId=${encodeURIComponent(conversationId)}`,
    );
  },

  /**
   * Probe which specialist keys have captured reasoning for a given job.
   *
   * Calls `GET /legal-department/jobs/:id/reasoning?orgSlug=…` (no
   * specialistKey → probe mode).  Returns an array of specialist key strings
   * (e.g. `['contract', 'compliance']`).  Returns an empty array when the job
   * used a non-reasoning model or when no thinking content was captured.
   */
  async getReasoningForJob(
    jobId: string,
    orgSlug: string,
  ): Promise<string[]> {
    const qs = new URLSearchParams({ orgSlug });
    const data = await jsonRequest<{ jobId: string; specialistKeys: string[] }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/reasoning?${qs.toString()}`,
    );
    return data.specialistKeys;
  },

  /**
   * Fetch the captured reasoning content for a specific specialist on a job.
   *
   * Calls `GET /legal-department/jobs/:id/reasoning?orgSlug=…&specialistKey=…`.
   * Returns the thinking content and timing metadata, or throws with a 404
   * error when no reasoning was captured for that specialist.
   */
  async getReasoningForSpecialist(
    jobId: string,
    orgSlug: string,
    specialistKey: string,
  ): Promise<{
    jobId: string;
    specialistKey: string;
    thinkingContent: string;
    thinkingDurationMs: number | null;
    thinkingTokenCount: number | null;
  }> {
    const qs = new URLSearchParams({ orgSlug, specialistKey });
    return jsonRequest<{
      jobId: string;
      specialistKey: string;
      thinkingContent: string;
      thinkingDurationMs: number | null;
      thinkingTokenCount: number | null;
    }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/reasoning?${qs.toString()}`,
    );
  },
};
