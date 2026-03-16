/**
 * Unified A2A Orchestrator Types
 *
 * These types define the orchestrator's interface for all A2A operations.
 * The transport type determines both request building and response handling.
 */

import type {
  ExecutionContext,
  PlanData,
  PlanVersionData,
  DeliverableData,
  DeliverableVersionData,
  HitlGeneratedContent,
} from '@orchestrator-ai/transport-types';

// Re-export for convenience
export type { ExecutionContext };
export { NIL_UUID, isNilUuid } from '@orchestrator-ai/transport-types';

// ============================================================================
// TRIGGERS - All possible actions that can initiate an A2A call
// ============================================================================

/**
 * All possible triggers that can initiate an A2A call
 * Format: mode.action
 */
export type A2ATrigger =
  // Plan triggers (10 actions)
  | 'plan.create'
  | 'plan.read'
  | 'plan.list'
  | 'plan.edit'
  | 'plan.rerun'
  | 'plan.set_current'
  | 'plan.delete_version'
  | 'plan.merge_versions'
  | 'plan.copy_version'
  | 'plan.delete'
  // Build triggers (10 actions)
  | 'build.create'
  | 'build.read'
  | 'build.list'
  | 'build.edit'
  | 'build.rerun'
  | 'build.set_current'
  | 'build.delete_version'
  | 'build.merge_versions'
  | 'build.copy_version'
  | 'build.delete'
  // Converse triggers (1 action)
  | 'converse.send'
  // HITL triggers (8 actions - including decision variations)
  | 'hitl.approve'
  | 'hitl.reject'
  | 'hitl.regenerate'
  | 'hitl.replace'
  | 'hitl.skip'
  | 'hitl.status'
  | 'hitl.history'
  | 'hitl.pending';

// ============================================================================
// PAYLOAD - Trigger-specific data (NOT context - context comes from store)
// ============================================================================

/**
 * LLM override configuration for rerun operations
 */
export interface LlmOverrideConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Trigger-specific payload data (action-specific fields only)
 *
 * Note: Entity IDs (conversationId, taskId, planId, deliverableId) are in ExecutionContext.
 * Payload only contains action-specific data like versionId, userMessage, feedback, etc.
 */
export interface A2APayload {
  // Version-related (for version operations)
  versionId?: string;

  // Content-related
  userMessage?: string;
  feedback?: string;
  editedContent?: unknown;

  // Conversation history for multi-turn context (converse mode)
  messages?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;

  // Rerun-specific LLM override (for regenerating with a different model)
  // Note: This is DIFFERENT from ExecutionContext's provider/model which is the system default
  // This allows one-time override for a specific rerun without changing the system default
  rerunLlmOverride?: LlmOverrideConfig;

  // Multi-version operations
  versionIds?: string[];
  mergePrompt?: string;

  // Plan-specific
  planData?: Record<string, unknown>;

  // HITL-specific
  content?: HitlGeneratedContent;
  /** The original taskId from when HITL was triggered - required for resume operations */
  originalTaskId?: string;

  // Agent filter (for pending list)
  agentSlug?: string;

  // File attachments (documents/images for multimodal support)
  documents?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    base64Data: string;
  }>;

  // Voice/text interaction mode for converse — voice gets ultra-concise responses
  interactionMode?: 'voice' | 'text';
}

// ============================================================================
// RESULTS - What the UI receives after orchestrator processes the response
// ============================================================================

/**
 * Plan result - returned when a plan operation succeeds
 */
export interface PlanResult {
  type: 'plan';
  plan: PlanData;
  version?: PlanVersionData;
  context: ExecutionContext;
}

/**
 * Deliverable result - returned when a build operation succeeds
 */
export interface DeliverableResult {
  type: 'deliverable';
  deliverable: DeliverableData;
  version?: DeliverableVersionData;
  context: ExecutionContext;
}

/**
 * Message result - returned for converse operations
 */
export interface MessageResult {
  type: 'message';
  message: string;
  metadata?: Record<string, unknown>;
  context: ExecutionContext;
}

/**
 * HITL waiting result - returned when workflow is paused for human review
 */
export interface HitlWaitingResult {
  type: 'hitl_waiting';
  taskId: string;
  topic: string;
  generatedContent: HitlGeneratedContent;
  context: ExecutionContext;
}

/**
 * Success result - generic success without specific data
 */
export interface SuccessResult {
  type: 'success';
  message?: string;
  context: ExecutionContext;
}

/**
 * Error result - returned when operation fails
 */
export interface ErrorResult {
  type: 'error';
  error: string;
  code?: number;
  context?: ExecutionContext;
}

/**
 * Streaming result - returned when content will arrive via SSE stream
 */
export interface StreamingResult {
  type: 'streaming';
  taskId: string;
  streamEndpoint?: string;
  metadata?: Record<string, unknown>;
  context: ExecutionContext;
}

/**
 * Unified result type - what the UI receives after orchestrator processes response
 *
 * Note: All successful results include the updated ExecutionContext from the response.
 * The ExecutionContext store is automatically updated by handleA2AResponse(),
 * but the result also includes it for convenience.
 */
export type A2AResult =
  | PlanResult
  | DeliverableResult
  | MessageResult
  | HitlWaitingResult
  | SuccessResult
  | ErrorResult
  | StreamingResult;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isPlanResult(result: A2AResult): result is PlanResult {
  return result.type === 'plan';
}

export function isDeliverableResult(result: A2AResult): result is DeliverableResult {
  return result.type === 'deliverable';
}

export function isMessageResult(result: A2AResult): result is MessageResult {
  return result.type === 'message';
}

export function isHitlWaitingResult(result: A2AResult): result is HitlWaitingResult {
  return result.type === 'hitl_waiting';
}

export function isSuccessResult(result: A2AResult): result is SuccessResult {
  return result.type === 'success';
}

export function isErrorResult(result: A2AResult): result is ErrorResult {
  return result.type === 'error';
}

export function isStreamingResult(result: A2AResult): result is StreamingResult {
  return result.type === 'streaming';
}

// ============================================================================
// STREAMING PROGRESS - Events received during execution
// ============================================================================

/**
 * Progress event from observability stream during execution
 */
export interface StreamProgressEvent {
  /** Event type (e.g., 'agent.started', 'agent.progress', 'agent.llm.started') */
  hookEventType: string;
  /** Progress percentage (0-100) or null if not applicable */
  progress: number | null;
  /** Human-readable message */
  message: string | null;
  /** Current step/phase name */
  step: string | null;
  /** Status string */
  status: string | null;
  /** Execution context for this event */
  context: ExecutionContext;
  /** Unix timestamp */
  timestamp: number;
}
