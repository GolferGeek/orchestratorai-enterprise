/**
 * Types and DTOs for the Legal Department async job queue (law.agent_jobs).
 *
 * See: docs/efforts/current/prd.md §4.2, §4.3
 */
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// ── Access Control ─────────────────────────────────────────────────────────

export type AccessControlMode = 'open' | 'allowlist';

export interface AccessControl {
  mode: AccessControlMode;
  allowedUserIds?: string[];
}

export interface UpdateAccessControlRequest {
  context: ExecutionContext;
  accessControl: AccessControl;
}

export interface UpdateAccessControlResponse {
  jobId: string;
  accessControl: AccessControl;
}

// ── Job Status ─────────────────────────────────────────────────────────────

export type JobStatus =
  | 'queued'
  | 'processing'
  | 'awaiting_review'
  | 'review_rejected'
  | 'completed'
  | 'failed'
  | 'cancel_requested'
  | 'canceled';

/**
 * Decision recorded by the Forge web review modal when an attorney responds
 * to a HITL checkpoint. Stored verbatim in legal.agent_jobs.review_decision
 * and passed into the graph as Command({ resume: ReviewDecisionPayload }).
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

export const LEGAL_AGENT_SLUG = 'legal-department';
export const DOCUMENT_ANALYSIS_JOB_TYPE = 'document-analysis';
export const LEGAL_RESEARCH_JOB_TYPE = 'legal-research';
export const DD_JOB_TYPE = 'due-diligence';
export const DEAL_MEMO_JOB_TYPE = 'deal-memo-generation';

/**
 * Mirrors a row in law.agent_jobs. snake_case fields match the SQL columns
 * exactly so the repository can pass DB rows through with minimal mapping.
 */
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

  /**
   * Storage path (bucket-relative) for the original uploaded file under
   * MEDIA_STORAGE_PROVIDER. Null for jobs without a file upload (chat
   * mode, JSON body path) or jobs created before this column existed.
   */
  original_file_path: string | null;

  /**
   * Storage paths for all uploaded files (Phase 3 multi-document support).
   * Index-aligned with the documents[] in job.input.data.documents.
   * Empty array for single-file or JSON-body jobs before Phase 3.
   */
  document_paths: string[];

  /**
   * Count of documents in this job (1 for single-doc, N for multi-doc).
   * Added in Phase 2; present on all rows.
   */
  document_count: number;

  /**
   * Most recent attorney review decision, set by the POST /jobs/:id/review
   * endpoint. Cleared by the worker after the graph successfully resumes.
   * Null for jobs that have not yet hit a HITL checkpoint.
   */
  review_decision: ReviewDecisionPayload | null;

  access_control: AccessControl;

  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * POST /legal-department/jobs request body. Mirrors the v2 invoke shape:
 * { context, data, metadata? }. The controller does not derive context from
 * a JWT — the caller passes ExecutionContext directly, matching the existing
 * LegalDepartmentController posture (see PRD §4.3 / §5 Security).
 */
export interface EnqueueJobRequest {
  context: ExecutionContext;
  data: {
    /** Single-doc legacy path. Normalized to documents[] server-side. */
    content: string;
    contentType?: string;
    /** Multi-document path (Phase 3). When present, content is ignored by the worker. */
    documents?: Array<{
      content: string;
      contentType?: string;
      filename?: string;
      mimeType?: string;
      extractorMetadata?: unknown;
    }>;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export interface EnqueueJobResponse {
  jobId: string;
  conversationId: string;
  status: JobStatus;
}

/**
 * POST /legal-department/jobs/:id/review request body. Carries the full
 * ExecutionContext for org-scope validation plus the attorney's decision.
 */
export interface ReviewJobRequest {
  context: ExecutionContext;
  decision: ReviewDecisionPayload;
  /** Per-clause decisions for contract-review jobs. When present, decision is ignored. */
  clauseDecisions?: Array<{
    clauseId: string;
    decision: 'accept' | 'reject' | 'modify';
    modifiedLanguage?: string;
  }>;
}

export interface ReviewJobResponse {
  jobId: string;
  status: JobStatus;
}

export interface ListJobsResponse {
  jobs: AgentJobRow[];
}
