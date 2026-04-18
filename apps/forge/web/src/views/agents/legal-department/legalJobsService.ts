/**
 * legalJobsService — typed HTTP client for the Legal Department async-jobs API.
 *
 * Talks to Forge API on port 5200. All requests pass an ExecutionContext-shaped
 * object in the request body (no JWT). Org scoping is enforced server-side via
 * the orgSlug query param on read routes.
 */

const FORGE_API_URL =
  (import.meta as { env: { VITE_FORGE_API_URL?: string } }).env
    .VITE_FORGE_API_URL ||
  (import.meta as { env: { VITE_API_BASE_URL?: string } }).env
    .VITE_API_BASE_URL || '/api/forge';

/**
 * The Auth API base URL. In dev, the Vite proxy routes /api/* so we use
 * an empty base (same-origin) just like FORGE_API_URL. In production,
 * VITE_API_BASE_URL is set and covers auth as well because the gateway
 * or reverse proxy forwards all /api traffic.
 */
const AUTH_API_URL =
  (import.meta as { env: { VITE_AUTH_API_URL?: string } }).env
    .VITE_AUTH_API_URL ||
  (import.meta as { env: { VITE_API_BASE_URL?: string } }).env
    .VITE_API_BASE_URL || '';

export type JobStatus =
  | 'queued'
  | 'processing'
  | 'awaiting_review'
  | 'review_rejected'
  | 'awaiting_answer'
  | 'completed'
  | 'failed'
  | 'cancel_requested'
  | 'canceled';

// ── Cross-Room Comparison Types ───────────────────────────────────────────────

export type RiskCategory =
  | 'contractual'
  | 'ip'
  | 'employment'
  | 'regulatory'
  | 'financial'
  | 'corporate'
  | 'environmental';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ComparisonRoomSummary {
  jobId: string;
  targetCompany: string;
  transactionType: string;
  dealValueRange?: string;
  jurisdictions: string[];
  status: JobStatus;
  progress: number;
  documentCount: number;
  analyzedCount: number;
  missingDocumentCount: number;
  dealBreakerCount: number;
  riskSummary: {
    byCategory: Record<RiskCategory, SeverityCounts>;
    totalBySeverity: SeverityCounts;
  };
  financialSummary: Record<
    string,
    {
      specialistKey: string;
      overallRisk: Severity;
      keyMetrics: Array<{ label: string; value: string | number }>;
      findingCount: number;
    }
  >;
  completedAt: string | null;
}

export interface ComparisonDealBreaker {
  jobId: string;
  targetCompany: string;
  finding: string;
  category: string;
  reasoning: string;
  recommendation: string;
}

export interface ComparisonMissingDocument {
  jobId: string;
  targetCompany: string;
  description: string;
  importance: Severity;
}

export interface ComparisonResult {
  rooms: ComparisonRoomSummary[];
  dealBreakers: ComparisonDealBreaker[];
  missingDocuments: ComparisonMissingDocument[];
}

// ── Access Control ────────────────────────────────────────────────────────────

export type AccessControlMode = 'open' | 'allowlist';

export interface AccessControl {
  mode: AccessControlMode;
  allowedUserIds?: string[];
}

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
    }
  | {
      decision: 'batch_review';
      batchId: string;
      documentDecisions: Array<{
        documentId: string;
        action: 'approve' | 'correct';
        flagSeniorReview?: boolean;
      }>;
      approveRemaining?: boolean;
      feedback?: string;
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
  /** When `gate === 'deal-memo'`, the memo HITL payload (Phase 3 deal-memo). */
  gate?: string;
  dealStructure?: DealStructure;
  memoMarkdown?: string;
  sectionDrafts?: Record<string, { draft: string; citations: CitationRef[] }>;
  sectionCitations?: Record<string, CitationRef[]>;
}

// ── Deal Memo Generation types (mirror api/.../deal-memo/deal-memo.types.ts) ─

export type DealStructure = 'stock-purchase' | 'asset-purchase' | 'merger';

export type DealMemoSectionId =
  | 'reps-warranties'
  | 'indemnification'
  | 'disclosure-schedules'
  | 'conditions-precedent'
  | 'covenants';

/** Reference back to a specific DD finding cited by a memo section. */
export interface CitationRef {
  findingId?: string;
  documentId?: string;
  riskRowId?: string;
  dealBreakerFlagId?: string;
  excerpt: string;
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
   * Count of documents in this job (1 for single-doc, N for multi-doc).
   * Added in Phase 2 of the legal department effort; present on all rows.
   */
  document_count?: number;
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
  /** Access control policy on this job. Defaults to open when absent. */
  access_control: AccessControl | null;
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
    opts?: {
      status?: JobStatus;
      limit?: number;
      userId?: string;
      jobType?: string;
      parentJobId?: string;
      callerUserId?: string;
    },
  ): Promise<AgentJobRow[]> {
    const qs = new URLSearchParams({ orgSlug });
    if (opts?.status) qs.set('status', opts.status);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.userId) qs.set('userId', opts.userId);
    if (opts?.jobType) qs.set('jobType', opts.jobType);
    if (opts?.parentJobId) qs.set('parentJobId', opts.parentJobId);
    if (opts?.callerUserId) qs.set('callerUserId', opts.callerUserId);
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

  async getJob(id: string, orgSlug: string, callerUserId?: string): Promise<AgentJobRow> {
    const qs = new URLSearchParams({ orgSlug });
    if (callerUserId) qs.set('callerUserId', callerUserId);
    const row = await jsonRequest<AgentJobRow>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(id)}?${qs.toString()}`,
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

  async getJobEvents(id: string, orgSlug: string, callerUserId?: string): Promise<ObservabilityEvent[]> {
    const qs = new URLSearchParams({ orgSlug });
    if (callerUserId) qs.set('callerUserId', callerUserId);
    const data = await jsonRequest<{ events: ObservabilityEvent[] }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(id)}/events?${qs.toString()}`,
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

  /**
   * Create a Due Diligence Room — uploads files with deal context and
   * metadata.jobType='due-diligence'.
   */
  async createDDRoom(
    context: ExecutionContextLike,
    files: File[],
    dealContext: {
      transactionType: string;
      targetCompany: string;
      buyerCompany: string;
      dealValueRange?: string;
      jurisdictions: string[];
      focusAreas: string[];
      knownIssues: string[];
      financialFocusAreas?: string[];
    },
    accessControl?: AccessControl,
  ): Promise<{ jobId: string; conversationId: string; status: JobStatus; documentCount?: number }> {
    const form = new FormData();
    for (const file of files) {
      form.append('files', file);
    }
    form.append('context', JSON.stringify(context));
    form.append('dealContext', JSON.stringify(dealContext));
    form.append('metadata', JSON.stringify({ jobType: 'due-diligence' }));
    if (accessControl) {
      form.append('accessControl', JSON.stringify(accessControl));
    }
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
      documentCount?: number;
    };
  },

  /**
   * Create a Discovery Document Review — uploads files with a ReviewProtocol
   * and metadata.jobType='discovery-review'.
   */
  async createDiscoveryReview(
    context: ExecutionContextLike,
    files: File[],
    reviewProtocol: {
      matterId: string;
      matterName: string;
      relevanceCriteria: {
        claims: string[];
        dateRange?: { start: string; end: string };
        keyParties: string[];
        keyTopics: string[];
        exclusions?: string[];
      };
      privilegeHolders: {
        attorneys: string[];
        firms: string[];
        inHouseCounsel: string[];
      };
      issueTags: Array<{ tagId: string; tagName: string; description: string }>;
      batchSize: number;
      confidenceThreshold: number;
      privilegeReviewRequired: boolean;
    },
  ): Promise<{ jobId: string; conversationId: string; status: JobStatus }> {
    const form = new FormData();
    for (const file of files) {
      form.append('files', file);
    }
    form.append('context', JSON.stringify(context));
    form.append('reviewProtocol', JSON.stringify(reviewProtocol));
    form.append('metadata', JSON.stringify({ jobType: 'discovery-review' }));
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

  /**
   * Add documents to a completed DD room for incremental analysis.
   */
  async addDocuments(
    jobId: string,
    orgSlug: string,
    files: File[],
  ): Promise<{
    jobId: string;
    conversationId: string;
    status: string;
    newDocumentCount: number;
    totalDocumentCount: number;
  }> {
    const form = new FormData();
    for (const file of files) {
      form.append('files', file);
    }
    form.append('orgSlug', orgSlug);
    const token = localStorage.getItem('authToken');
    const res = await fetch(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/add-documents`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${detail}`);
    }
    return (await res.json()) as {
      jobId: string;
      conversationId: string;
      status: string;
      newDocumentCount: number;
      totalDocumentCount: number;
    };
  },

  /**
   * Fetch the document index for a DD room job.
   */
  async fetchDocumentIndex(
    jobId: string,
    orgSlug: string,
    callerUserId?: string,
  ): Promise<{
    documentIndex: Array<Record<string, unknown>>;
    totalDocuments: number;
    analyzed: number;
    failed: number;
    pending: number;
  }> {
    const qs = new URLSearchParams({ orgSlug });
    if (callerUserId) qs.set('callerUserId', callerUserId);
    return jsonRequest<{
      documentIndex: Array<Record<string, unknown>>;
      totalDocuments: number;
      analyzed: number;
      failed: number;
      pending: number;
    }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/document-index?${qs.toString()}`,
    );
  },

  /**
   * Fetch the risk matrix for a DD room job.
   */
  async fetchRiskMatrix(
    jobId: string,
    orgSlug: string,
    callerUserId?: string,
  ): Promise<{
    riskMatrix: Record<string, unknown>;
    dealBreakerFlags: Array<Record<string, unknown>>;
    missingDocuments: Array<Record<string, unknown>>;
    crossReferenceMap: Array<Record<string, unknown>>;
  }> {
    const qs = new URLSearchParams({ orgSlug });
    if (callerUserId) qs.set('callerUserId', callerUserId);
    return jsonRequest<{
      riskMatrix: Record<string, unknown>;
      dealBreakerFlags: Array<Record<string, unknown>>;
      missingDocuments: Array<Record<string, unknown>>;
      crossReferenceMap: Array<Record<string, unknown>>;
    }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/risk-matrix?${qs.toString()}`,
    );
  },

  /**
   * Fetch the DD report for a job.
   */
  async fetchReport(
    jobId: string,
    orgSlug: string,
    callerUserId?: string,
  ): Promise<{ report: string }> {
    const qs = new URLSearchParams({ orgSlug });
    if (callerUserId) qs.set('callerUserId', callerUserId);
    return jsonRequest<{ report: string }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/report?${qs.toString()}`,
    );
  },

  // ── Deal Memo Generation ──────────────────────────────────────────────

  /**
   * Queue a new deal-memo job whose parent is a completed DD Room.
   * POST /legal-department/jobs/:parentJobId/generate-deal-memo
   */
  async generateDealMemo(
    parentJobId: string,
    context: ExecutionContextLike,
    payload: { dealStructure: DealStructure; reviewerNotes?: string },
  ): Promise<{ jobId: string; conversationId: string; status: JobStatus }> {
    return jsonRequest<{
      jobId: string;
      conversationId: string;
      status: JobStatus;
    }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(parentJobId)}/generate-deal-memo`,
      {
        method: 'POST',
        body: JSON.stringify({ context, ...payload }),
      },
    );
  },

  /**
   * Fetch the finalized memo (markdown + per-section citations + artifact paths).
   * Only valid for completed deal-memo jobs.
   * GET /legal-department/jobs/:id/deal-memo
   */
  async getDealMemo(
    jobId: string,
    orgSlug: string,
    callerUserId?: string,
  ): Promise<{
    jobId: string;
    status: JobStatus;
    memoMarkdown: string;
    sectionCitations: Record<string, CitationRef[]>;
    artifactPath?: string;
    docxArtifactPath?: string;
    dealStructure?: DealStructure;
    parentJobId?: string;
  }> {
    const qs = new URLSearchParams({ orgSlug });
    if (callerUserId) qs.set('callerUserId', callerUserId);
    return jsonRequest<{
      jobId: string;
      status: JobStatus;
      memoMarkdown: string;
      sectionCitations: Record<string, CitationRef[]>;
      artifactPath?: string;
      docxArtifactPath?: string;
      dealStructure?: DealStructure;
      parentJobId?: string;
    }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/deal-memo?${qs.toString()}`,
    );
  },

  /**
   * Trigger a download of the persisted memo artifact (md or docx). The
   * server streams the bytes through the org-scoped proxy. Returns a Blob
   * the caller can save with a programmatic <a download>.
   * GET /legal-department/jobs/:id/deal-memo/download?format=md|docx
   */
  async downloadDealMemo(
    jobId: string,
    orgSlug: string,
    format: 'md' | 'docx',
    callerUserId?: string,
  ): Promise<Blob> {
    const qs = new URLSearchParams({ orgSlug, format });
    if (callerUserId) qs.set('callerUserId', callerUserId);
    const token = localStorage.getItem('authToken');
    const res = await fetch(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/deal-memo/download?${qs.toString()}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${detail}`);
    }
    return res.blob();
  },

  /**
   * List deal-memo jobs created from a specific DD Room.
   * Convenience wrapper over `listJobs` with jobType + parentJobId filters.
   */
  async listDealMemosForRoom(
    orgSlug: string,
    parentJobId: string,
  ): Promise<AgentJobRow[]> {
    return this.listJobs(orgSlug, {
      jobType: 'deal-memo-generation',
      parentJobId,
    });
  },

  /**
   * Enqueue a Deposition Prep job (preparation-outline mode).
   * POST /legal-department/jobs with metadata.jobType='deposition-prep'.
   */
  async prepDeposition(
    context: ExecutionContextLike,
    payload: {
      mode?: 'preparation-outline' | 'predicted-cross-exam';
      caseFacts: string;
      witnessBackground: string;
      witnessType: string;
      depositionTopics?: string[];
      priorStatements?: string;
      opposingCounselName?: string;
      documents?: Array<{ name: string; content: string; type?: string }>;
    },
  ): Promise<{ jobId: string; conversationId: string; status: JobStatus }> {
    return jsonRequest<{ jobId: string; conversationId: string; status: JobStatus }>(
      `${FORGE_API_URL}/legal-department/jobs`,
      {
        method: 'POST',
        body: JSON.stringify({
          context,
          data: {
            content: JSON.stringify({
              mode: payload.mode ?? 'preparation-outline',
              caseFacts: payload.caseFacts,
              witnessBackground: payload.witnessBackground,
              depositionTopics: payload.depositionTopics ?? [],
              witnessType: payload.witnessType,
              priorStatements: payload.priorStatements,
              opposingCounselName: payload.opposingCounselName,
              documents: payload.documents,
            }),
            contentType: 'application/json',
          },
          metadata: { jobType: 'deposition-prep' },
        }),
      },
    );
  },

  /** Open an SSE stream for live observability events on a conversation. */
  openEventStream(conversationId: string): EventSource {
    return new EventSource(
      `${FORGE_API_URL}/observability/stream?conversationId=${encodeURIComponent(conversationId)}`,
    );
  },

  // ── Compliance Audit ──────────────────────────────────────────────────

  /**
   * Create a Compliance Audit — uploads files with audit context and
   * metadata.jobType='compliance-audit'.
   */
  async createComplianceAudit(
    context: ExecutionContextLike,
    files: File[],
    auditContext: {
      mode: 'scan' | 'full-audit';
      frameworkSlugs: string[];
      selectedThemes?: string[];
      organizationContext?: {
        industry?: string;
        jurisdiction?: string;
        employeeCount?: string;
      };
    },
  ): Promise<{
    jobId: string;
    conversationId: string;
    status: JobStatus;
  }> {
    const form = new FormData();
    for (const file of files) {
      form.append('files', file);
    }
    form.append('context', JSON.stringify(context));
    form.append('auditContext', JSON.stringify(auditContext));
    form.append(
      'metadata',
      JSON.stringify({ jobType: 'compliance-audit' }),
    );
    const token = localStorage.getItem('authToken');
    const res = await fetch(
      `${FORGE_API_URL}/legal-department/jobs/upload`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      },
    );
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

  /**
   * Fetch the compliance scorecard for a job.
   */
  async fetchScorecard(
    jobId: string,
    orgSlug: string,
  ): Promise<Record<string, unknown>> {
    return jsonRequest<Record<string, unknown>>(
      `${FORGE_API_URL}/legal-department/compliance-audit/${encodeURIComponent(jobId)}/scorecard?orgSlug=${encodeURIComponent(orgSlug)}`,
    );
  },

  /**
   * Fetch compliance findings with optional filtering.
   */
  async fetchFindings(
    jobId: string,
    orgSlug: string,
    filters?: {
      framework?: string;
      status?: string;
      severity?: string;
      theme?: string;
      offset?: number;
      limit?: number;
    },
  ): Promise<{
    total: number;
    offset: number;
    limit: number;
    findings: Array<Record<string, unknown>>;
  }> {
    const qs = new URLSearchParams({ orgSlug });
    if (filters?.framework) qs.set('framework', filters.framework);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.severity) qs.set('severity', filters.severity);
    if (filters?.theme) qs.set('theme', filters.theme);
    if (filters?.offset != null) qs.set('offset', String(filters.offset));
    if (filters?.limit != null) qs.set('limit', String(filters.limit));
    return jsonRequest<{
      total: number;
      offset: number;
      limit: number;
      findings: Array<Record<string, unknown>>;
    }>(
      `${FORGE_API_URL}/legal-department/compliance-audit/${encodeURIComponent(jobId)}/findings?${qs.toString()}`,
    );
  },

  /**
   * Fetch the remediation plan for a compliance audit job.
   */
  async fetchRemediation(
    jobId: string,
    orgSlug: string,
  ): Promise<Array<Record<string, unknown>>> {
    return jsonRequest<Array<Record<string, unknown>>>(
      `${FORGE_API_URL}/legal-department/compliance-audit/${encodeURIComponent(jobId)}/remediation?orgSlug=${encodeURIComponent(orgSlug)}`,
    );
  },

  /**
   * Fetch available regulatory frameworks.
   */
  async fetchFrameworks(
    orgSlug: string,
  ): Promise<
    Array<{
      slug: string;
      name: string;
      description: string;
      hasThemeConfig: boolean;
      themes?: Array<{
        themeId: string;
        themeName: string;
        questionCount: number;
      }>;
    }>
  > {
    return jsonRequest<
      Array<{
        slug: string;
        name: string;
        description: string;
        hasThemeConfig: boolean;
        themes?: Array<{
          themeId: string;
          themeName: string;
          questionCount: number;
        }>;
      }>
    >(
      `${FORGE_API_URL}/legal-department/frameworks?orgSlug=${encodeURIComponent(orgSlug)}`,
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
    callerUserId?: string,
  ): Promise<string[]> {
    const qs = new URLSearchParams({ orgSlug });
    if (callerUserId) qs.set('callerUserId', callerUserId);
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
    callerUserId?: string,
  ): Promise<{
    jobId: string;
    specialistKey: string;
    thinkingContent: string;
    thinkingDurationMs: number | null;
    thinkingTokenCount: number | null;
  }> {
    const qs = new URLSearchParams({ orgSlug, specialistKey });
    if (callerUserId) qs.set('callerUserId', callerUserId);
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

  /**
   * List users in an organization. Uses the Auth API RBAC endpoint.
   */
  async listOrganizationUsers(
    orgSlug: string,
  ): Promise<Array<{ userId: string; email: string; displayName?: string }>> {
    const data = await jsonRequest<{ users: Array<{ userId: string; email: string; displayName?: string }> }>(
      `${AUTH_API_URL}/api/rbac/organizations/${encodeURIComponent(orgSlug)}/users`,
    );
    return data.users;
  },

  // ── Cross-Room Comparison ──────────────────────────────────────────────

  /**
   * POST /legal-department/jobs/compare — compare 2–10 DD rooms.
   */
  async compareRooms(
    context: ExecutionContextLike,
    jobIds: string[],
  ): Promise<ComparisonResult> {
    return jsonRequest<ComparisonResult>(
      `${FORGE_API_URL}/legal-department/jobs/compare`,
      {
        method: 'POST',
        body: JSON.stringify({ context, jobIds }),
      },
    );
  },

  /**
   * Update the access control policy on a DD Room job.
   * PATCH /legal-department/jobs/:id/access-control
   */
  async updateAccessControl(
    jobId: string,
    context: ExecutionContextLike,
    accessControl: AccessControl,
  ): Promise<{ jobId: string; accessControl: AccessControl }> {
    return jsonRequest<{ jobId: string; accessControl: AccessControl }>(
      `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/access-control`,
      {
        method: 'PATCH',
        body: JSON.stringify({ context, accessControl }),
      },
    );
  },

  /**
   * Start a new cross-examination simulation session.
   * POST /legal-department/jobs with metadata.jobType='cross-exam-simulation'.
   */
  async enqueueSimulation(
    context: ExecutionContextLike,
    payload: {
      caseFacts: string;
      witnessBackground: string;
      priorStatements?: string;
      maxQuestions: number;
      simulationFocus?: string;
      documents?: Array<{ name: string; content: string; type?: string }>;
    },
  ): Promise<{ jobId: string; conversationId: string; status: JobStatus }> {
    return jsonRequest<{ jobId: string; conversationId: string; status: JobStatus }>(
      `${FORGE_API_URL}/legal-department/jobs`,
      {
        method: 'POST',
        body: JSON.stringify({
          context,
          data: {
            content: JSON.stringify({
              caseFacts: payload.caseFacts,
              witnessBackground: payload.witnessBackground,
              priorStatements: payload.priorStatements,
              maxQuestions: payload.maxQuestions,
              simulationFocus: payload.simulationFocus,
              documents: payload.documents ?? [],
            }),
            contentType: 'application/json',
          },
          metadata: { jobType: 'cross-exam-simulation' },
        }),
      },
    );
  },

  /**
   * Submit a witness answer during an active cross-exam simulation.
   * POST /legal-department/jobs/:id/answer → 204 No Content
   * Throws if the server returns a non-2xx status.
   */
  async submitSimulationAnswer(
    jobId: string,
    answer: string,
    context: ExecutionContextLike,
  ): Promise<void> {
    const token = localStorage.getItem('authToken');
    const url = `${FORGE_API_URL}/legal-department/jobs/${encodeURIComponent(jobId)}/answer`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ context, answer }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`submitSimulationAnswer failed (${res.status}): ${body}`);
    }
  },

  async estimateMonteCarloCost(input: {
    simulationCount: number;
    evidenceCount: number;
    witnessCount: number;
    provider: string;
  }): Promise<{
    simulationCount: number;
    estimatedLlmCalls: number;
    estimatedTokensPerCall: number;
    estimatedTotalTokens: number;
    estimatedCostUsd: number | null;
    estimatedDurationHours: number;
    provider: string;
    warning?: string;
  }> {
    return jsonRequest(
      `${FORGE_API_URL}/legal-department/monte-carlo/estimate`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },
};
