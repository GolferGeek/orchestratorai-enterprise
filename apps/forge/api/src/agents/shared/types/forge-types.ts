/**
 * Forge-Local Types
 *
 * Type definitions that are specific to the Forge product and are NOT
 * part of the shared @orchestrator-ai/transport-types package.
 *
 * These types cover:
 * - HITL (Human-in-the-Loop) workflow state types
 * - Dashboard request/response types for predictor and risk-runner capabilities
 *
 * These types are intentionally defined locally because they are implementation
 * details of Forge's LangGraph workflows and dashboard capabilities.
 */

// ============================================================================
// HITL (HUMAN-IN-THE-LOOP) TYPES
// ============================================================================

/**
 * HITL workflow status values.
 * Tracks the lifecycle of a LangGraph workflow that requires human approval.
 */
export type HitlStatus =
  | 'started'
  | 'in_progress'
  | 'generating'
  | 'hitl_pending'
  | 'hitl_waiting'
  | 'hitl_approved'
  | 'hitl_rejected'
  | 'completed'
  | 'rejected'
  | 'failed';

/**
 * HITL decision types — what the human decides to do with the generated content.
 */
export type HitlDecision =
  | 'approve'
  | 'reject'
  | 'edit'
  | 'regenerate'
  | 'replace'
  | 'skip';

/**
 * HITL generated content — the content produced by the LangGraph workflow
 * that requires human review before proceeding.
 */
export interface HitlGeneratedContent {
  /** Primary content field — the main generated output */
  content?: string;
  /** Optional title for the content */
  title?: string;
  /** Optional metadata about the generation */
  metadata?: Record<string, unknown>;
}

/**
 * HITL response — the full response from a HITL-capable workflow.
 * Contains both the generated content and current workflow status.
 */
export interface HitlResponse {
  /** Whether the workflow is currently paused waiting for human input */
  hitlPending: boolean;
  /** Current workflow status */
  status: HitlStatus;
  /** The content generated that requires review, if any */
  generatedContent?: HitlGeneratedContent;
  /** Task ID used as LangGraph thread_id for resuming */
  taskId?: string;
  /** Topic/subject of the HITL checkpoint */
  topic?: string;
  /** Human decision on the generated content */
  decision?: HitlDecision;
  /** Edited content if decision is 'edit' or 'replace' */
  editedContent?: unknown;
  /** Feedback text if decision is 'regenerate' */
  feedback?: string;
}

/**
 * HITL resume input — the human's decision input when resuming a HITL workflow.
 * Passed to the resume() service method.
 */
export interface HitlResumeInput {
  /** The human's decision */
  decision: HitlDecision;
  /** Edited content if decision is 'edit' or 'replace' */
  editedContent?: unknown;
  /** Feedback text if decision is 'regenerate' */
  feedback?: string;
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

/**
 * Dashboard request payload — the structured request for dashboard capability
 * operations in the predictor and risk-runner agents.
 *
 * Dashboard capabilities use a mode×action pattern where:
 * - entity: the type of entity to operate on (e.g., 'universe', 'prediction')
 * - action: the operation to perform (e.g., 'list', 'get', 'create')
 * - params: action-specific parameters
 */
export interface DashboardPagination {
  /** Page number (1-based) */
  page?: number;
  /** Number of items per page */
  pageSize?: number;
}

export interface DashboardRequestPayload {
  /** The entity type being operated on */
  entity: string;
  /** The action to perform on the entity */
  action: string;
  /** Action-specific parameters */
  params?: Record<string, unknown>;
  /** Pagination parameters for list operations */
  pagination?: DashboardPagination;
  /** Filter parameters for list operations */
  filters?: Record<string, unknown>;
}

/**
 * Dashboard response payload — the structured response from dashboard capability
 * operations.
 */
export interface DashboardResponsePayload {
  /** Whether the operation succeeded */
  success: boolean;
  /** Response data — entity-specific */
  data?: unknown;
  /** Total count for paginated responses */
  total?: number;
  /** Error message if success is false */
  error?: string;
}
