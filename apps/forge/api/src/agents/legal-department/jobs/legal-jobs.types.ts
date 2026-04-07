/**
 * Types and DTOs for the Legal Department async job queue (law.agent_jobs).
 *
 * See: docs/efforts/current/prd.md §4.2, §4.3
 */
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export const LEGAL_AGENT_SLUG = 'legal-department';
export const DOCUMENT_ANALYSIS_JOB_TYPE = 'document-analysis';

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
    content: string;
    contentType?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export interface EnqueueJobResponse {
  jobId: string;
  conversationId: string;
  status: JobStatus;
}

export interface ListJobsResponse {
  jobs: AgentJobRow[];
}
