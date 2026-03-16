/**
 * HITL (Human-in-the-Loop) Mode Types
 * Defines mode-specific payloads and metadata for HITL operations
 *
 * HITL flow:
 * 1. Agent task returns with status 'hitl_waiting' and generated content
 * 2. Frontend displays content for human review
 * 3. Human makes decision (approve/reject/regenerate/replace/skip)
 * 4. Frontend sends HITL resume request with decision
 * 5. Agent completes or handles rejection
 *
 * KEY DESIGN DECISIONS:
 * - Uses `taskId` consistently (LangGraph uses it as thread_id internally)
 * - No separate HITL controller - use existing A2A endpoint
 * - Deliverable-based responses for version tracking
 */

// ============================================================================
// HITL Decision & Status
// ============================================================================

export type HitlDecision = 'approve' | 'reject' | 'regenerate' | 'replace' | 'skip' | 'edit';

/**
 * HITL Response structure (for resume operations)
 * This is what comes back when resuming from a HITL interrupt
 */
export interface HitlResponse {
  decision: HitlDecision;
  editedContent?: unknown;
  feedback?: string;
}

export type HitlStatus =
  | 'started'
  | 'generating'
  | 'hitl_waiting'
  | 'regenerating'
  | 'completed'
  | 'rejected'
  | 'failed';

// ============================================================================
// HITL Actions
// ============================================================================

export type HitlAction =
  | 'resume' // Resume from HITL with decision
  | 'status' // Get current HITL status
  | 'history' // Get HITL state history
  | 'pending'; // Get all pending HITL reviews

// ============================================================================
// Generated Content Structure
// ============================================================================

/**
 * Generated content structure for Extended Post Writer and similar agents
 * This is what the agent produces and sends back for review
 */
export interface HitlGeneratedContent {
  /** Blog post content */
  blogPost?: string;
  /** SEO meta description */
  seoDescription?: string;
  /** Social media posts */
  socialPosts?: string[];
  /** Extensible for other content types */
  [key: string]: unknown;
}

/**
 * HITL Content wrapper - can be extended for different agent types
 */
export interface HitlContent {
  /** Content type identifier (e.g., 'extended-post-writer', 'data-analyst') */
  contentType: string;
  /** The generated content (structure varies by contentType) */
  content: HitlGeneratedContent | Record<string, unknown>;
}

// ============================================================================
// Deliverable-Based Response Types
// ============================================================================

/**
 * HITL Response with Deliverable (returned by API to frontend)
 * Used when workflow hits interrupt() and returns for review
 */
export interface HitlDeliverableResponse {
  /** Task ID for resuming (used as LangGraph thread_id) */
  taskId: string;
  /** Conversation ID */
  conversationId: string;
  /** Current HITL status */
  status: HitlStatus;
  /** Deliverable ID */
  deliverableId: string;
  /** Current version number */
  currentVersionNumber: number;
  /** Message for the user */
  message: string;
  /** Topic/subject */
  topic?: string;
  /** Agent that generated this */
  agentSlug?: string;
  /** Node that triggered HITL (for serialized HITL) */
  nodeName?: string;
  /** Generated content for immediate display */
  generatedContent: HitlGeneratedContent;
}

/**
 * HITL Resume Request (from frontend to API via A2A endpoint)
 */
export interface HitlResumeRequest {
  /** Task ID to resume */
  taskId: string;
  /** User's decision */
  decision: HitlDecision;
  /** Feedback for regeneration (required if decision is 'regenerate') */
  feedback?: string;
  /** Replacement content (required if decision is 'replace') */
  content?: HitlGeneratedContent;
}

/**
 * HITL Status Response
 */
export interface HitlStatusResponse {
  /** Task ID */
  taskId: string;
  /** Current status */
  status: HitlStatus;
  /** Whether HITL is pending review */
  hitlPending: boolean;
  /** Deliverable ID (if exists) */
  deliverableId?: string;
  /** Current version number */
  currentVersionNumber?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * HITL History Response (uses deliverable versions)
 */
export interface HitlHistoryResponse {
  /** Task ID */
  taskId: string;
  /** Deliverable ID */
  deliverableId: string;
  /** Total version count */
  versionCount: number;
  /** Current version number */
  currentVersionNumber: number;
}

// ============================================================================
// HITL Pending List Types (for sidebar)
// ============================================================================

/**
 * Single item in the HITL pending list (sidebar)
 * Note: taskId is the PRIMARY identifier since hitl_pending is on tasks table
 */
export interface HitlPendingItem {
  /** Task ID - primary identifier for resuming */
  taskId: string;
  /** Agent slug that generated this (from task) */
  agentSlug: string;
  /** When HITL became pending (from task.hitl_pending_since) */
  pendingSince: string;
  /** Conversation ID (for navigation) */
  conversationId: string;
  /** Conversation title */
  conversationTitle: string;
  /** Deliverable ID (if exists) */
  deliverableId?: string;
  /** Deliverable title (if exists) */
  deliverableTitle?: string;
  /** Current version number */
  currentVersionNumber?: number;
  /** Agent display name */
  agentName?: string;
  /** Topic/subject */
  topic?: string;
}

/**
 * Response for hitl.pending query
 */
export interface HitlPendingListResponse {
  /** List of pending HITL items */
  items: HitlPendingItem[];
  /** Total count */
  totalCount: number;
}

// ============================================================================
// Payload Types (use taskId instead of threadId)
// ============================================================================

export interface HitlResumePayload {
  action: 'resume';
  taskId: string;
  decision: HitlDecision;
  editedContent?: Partial<HitlGeneratedContent>;
  feedback?: string;
}

export interface HitlStatusPayload {
  action: 'status';
  taskId: string;
}

export interface HitlHistoryPayload {
  action: 'history';
  taskId: string;
}

export interface HitlPendingPayload {
  action: 'pending';
  // No additional params - queries for current user
}

/**
 * HITL Mode Payload (union of all HITL actions)
 */
export type HitlModePayload =
  | HitlResumePayload
  | HitlStatusPayload
  | HitlHistoryPayload
  | HitlPendingPayload;

// ============================================================================
// Request/Response Metadata (legacy compatibility)
// ============================================================================

/**
 * HITL Request Metadata
 * Note: userId, conversationId, orgSlug, taskId, provider, model are in ExecutionContext
 */
export interface HitlRequestMetadata {
  /** Source of the request (e.g., 'web-ui', 'api') */
  source: string;
  /** Original task ID that triggered HITL (for reference) */
  originalTaskId?: string;
}

/**
 * HITL Response Metadata
 */
export interface HitlResponseMetadata {
  /** Agent type that produced the content */
  agentType: string;
  /** Agent slug */
  agentSlug: string;
  /** LLM provider used for generation */
  provider?: string;
  /** LLM model used for generation */
  model?: string;
  /** Token usage for generation */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost?: number;
  };
  /** Timestamp when HITL was triggered */
  hitlTriggeredAt?: string;
  /** Timestamp when decision was made */
  decisionAt?: string;
}

// ============================================================================
// Legacy Response Content Types (for backward compatibility)
// ============================================================================

/**
 * HITL Status Response Payload (legacy)
 * @deprecated Use HitlStatusResponse instead
 */
export interface HitlStatusResponsePayload {
  /** Thread/execution ID for resuming */
  threadId: string;
  /** Current HITL status */
  status: HitlStatus;
  /** Topic/subject of the content */
  topic: string;
  /** Whether HITL is pending review */
  hitlPending: boolean;
  /** Generated content awaiting review (present when status is hitl_waiting) */
  generatedContent?: HitlGeneratedContent;
  /** Final approved/edited content (present when status is completed) */
  finalContent?: HitlGeneratedContent;
  /** Error message if status is failed */
  error?: string;
  /** Duration in ms (present when completed) */
  duration?: number;
}

/**
 * HITL Resume Response Content (legacy)
 */
export interface HitlResumeResponseContent {
  /** Thread ID */
  threadId: string;
  /** Final status after resume */
  status: HitlStatus;
  /** Topic of the content */
  topic: string;
  /** Original generated content */
  generatedContent?: HitlGeneratedContent;
  /** Final content (may be edited) */
  finalContent?: HitlGeneratedContent;
  /** The decision that was made */
  decision: HitlDecision;
  /** Duration from start to completion */
  duration?: number;
  /** Error if something went wrong */
  error?: string;
}

/**
 * HITL Status Response Content (legacy)
 */
export interface HitlStatusResponseContent {
  /** Thread ID */
  threadId: string;
  /** Current status */
  status: HitlStatus;
  /** Topic of the content */
  topic: string;
  /** Whether HITL is pending */
  hitlPending: boolean;
  /** Generated content (if available) */
  generatedContent?: HitlGeneratedContent;
  /** Final content (if completed) */
  finalContent?: HitlGeneratedContent;
  /** Error message (if failed) */
  error?: string;
}

/**
 * HITL History Entry (legacy)
 */
export interface HitlHistoryEntry {
  /** Thread ID */
  threadId: string;
  /** Status at this point in history */
  status: HitlStatus;
  /** Topic */
  topic: string;
  /** Generated content at this point */
  generatedContent?: HitlGeneratedContent;
  /** Final content at this point */
  finalContent?: HitlGeneratedContent;
  /** Timestamp */
  timestamp: string;
}

/**
 * HITL History Response Content (legacy)
 */
export interface HitlHistoryResponseContent {
  /** Thread ID */
  threadId: string;
  /** Array of history entries */
  entries: HitlHistoryEntry[];
  /** Total count */
  count: number;
}

// ============================================================================
// LangGraph Response Structure (for API Runner detection)
// ============================================================================

/**
 * LangGraph interrupt response structure
 * This is what LangGraph returns when interrupt() is called
 */
export interface LangGraphInterruptValue {
  reason: string; // 'human_review'
  nodeName: string; // Node that called interrupt
  content: HitlGeneratedContent;
  message: string; // User-facing message
  topic?: string;
}

export interface LangGraphInterruptItem {
  value: LangGraphInterruptValue;
  resumable: boolean; // Always true for HITL
  ns: string[]; // Namespace
}

export interface LangGraphInterruptResponse {
  /** Present when interrupt() was called */
  __interrupt__: LangGraphInterruptItem[];
  /** Current state values */
  values: Record<string, unknown>;
}

/**
 * Type guard for LangGraph interrupt response
 */
export function isLangGraphInterruptResponse(
  response: unknown
): response is LangGraphInterruptResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    '__interrupt__' in response &&
    Array.isArray((response as LangGraphInterruptResponse).__interrupt__) &&
    (response as LangGraphInterruptResponse).__interrupt__.length > 0
  );
}
