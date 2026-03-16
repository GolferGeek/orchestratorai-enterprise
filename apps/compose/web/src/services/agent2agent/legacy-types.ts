/**
 * Legacy A2A Types
 *
 * These types were previously imported from @orchestrator-ai/transport-types
 * but no longer exist there. They are kept here for the legacy agent2agent
 * service layer. The new invoke/ layer uses the current transport-types.
 *
 * These types support the agent2agent/ directory which is the legacy entry
 * point. The canonical entry point is now invoke/.
 */

import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// ============================================================================
// TASK MODE
// ============================================================================

/** Agent task mode string union */
export type AgentTaskMode = 'converse' | 'plan' | 'build' | 'hitl' | string;

// ============================================================================
// PLAN / DELIVERABLE DATA TYPES
// ============================================================================

export interface PlanData {
  id: string;
  conversationId: string;
  userId?: string;
  agentName?: string;
  organization?: string;
  status?: string;
  summary?: string | null;
  currentVersionId?: string;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface PlanVersionData {
  id: string;
  planId?: string;
  versionNumber: number;
  content: string;
  format?: 'markdown' | 'json' | 'html' | string;
  isCurrentVersion?: boolean;
  createdByType?: 'agent' | 'user' | string;
  createdById?: string | null;
  taskId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface DeliverableData {
  id: string;
  userId?: string;
  agentName?: string;
  organization?: string;
  conversationId?: string;
  title?: string;
  type?: string;
  currentVersionId?: string;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface DeliverableVersionData {
  id: string;
  deliverableId: string;
  versionNumber: number;
  content: string;
  format?: 'markdown' | 'json' | 'html' | string;
  isCurrentVersion?: boolean;
  createdByType?: 'agent' | 'user' | string;
  createdById?: string | null;
  taskId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

// ============================================================================
// HITL TYPES
// ============================================================================

export type HitlStatus = 'hitl_waiting' | 'regenerating' | 'completed' | 'rejected' | string;
export type HitlDecision = 'approve' | 'reject' | 'regenerate' | 'replace' | 'skip';
export type HitlGeneratedContent = Record<string, unknown>;

export interface HitlDeliverableResponse {
  status?: string;
  taskId?: string;
  topic?: string;
  message?: string;
  generatedContent?: HitlGeneratedContent;
  deliverableId?: string;
}

// ============================================================================
// STRICT A2A REQUEST / RESPONSE TYPES
// ============================================================================

export type PlanAction =
  | 'create' | 'read' | 'list' | 'edit' | 'rerun'
  | 'set_current' | 'delete_version' | 'merge_versions' | 'copy_version' | 'delete';

export type BuildAction =
  | 'create' | 'read' | 'list' | 'edit' | 'rerun'
  | 'set_current' | 'delete_version' | 'merge_versions' | 'copy_version' | 'delete';

export interface StrictTaskMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StrictA2ARequestParams {
  context?: ExecutionContext;
  mode?: AgentTaskMode;
  userMessage?: string;
  messages?: StrictTaskMessage[];
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StrictA2ARequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: StrictA2ARequestParams;
}

export interface StrictPlanRequestParams extends StrictA2ARequestParams {
  mode: 'plan';
  payload: {
    action: PlanAction;
    [key: string]: unknown;
  };
}

export interface StrictPlanRequest extends StrictA2ARequest {
  method: string; // 'plan.create', 'plan.read', etc.
  params: StrictPlanRequestParams;
}

export interface StrictBuildRequestParams extends StrictA2ARequestParams {
  mode: 'build';
  payload: {
    action: BuildAction;
    [key: string]: unknown;
  };
}

export interface StrictBuildRequest extends StrictA2ARequest {
  method: string; // 'build.execute', 'build.read', etc.
  params: StrictBuildRequestParams;
}

export interface StrictConverseRequestParams extends StrictA2ARequestParams {
  mode: 'converse';
}

export interface StrictConverseRequest extends StrictA2ARequest {
  method: string; // 'converse'
  params: StrictConverseRequestParams;
}

// ============================================================================
// STRICT A2A RESPONSE TYPES
// ============================================================================

export interface StrictA2ASuccessResult {
  success: boolean;
  mode: string;
  payload: {
    content: unknown;
    metadata?: unknown;
  };
}

export interface StrictA2ASuccessResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result: StrictA2ASuccessResult;
}

export interface StrictA2AErrorData {
  code: number;
  message: string;
  data?: {
    mode?: string;
    [key: string]: unknown;
  };
}

export interface StrictA2AErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: StrictA2AErrorData;
}

export type StrictA2AResponse = StrictA2ASuccessResponse | StrictA2AErrorResponse;

export interface StrictPlanResponse extends StrictA2ASuccessResponse {
  result: StrictA2ASuccessResult & { mode: 'plan' };
}

export interface StrictBuildResponse extends StrictA2ASuccessResponse {
  result: StrictA2ASuccessResult & { mode: 'build' };
}

export interface StrictConverseResponse extends StrictA2ASuccessResponse {
  result: StrictA2ASuccessResult & { mode: 'converse' };
}

// ============================================================================
// TASK RESPONSE (legacy)
// ============================================================================

export interface TaskResponse {
  success: boolean;
  mode: string;
  payload?: {
    content?: unknown;
    metadata?: Record<string, unknown>;
  };
  error?: {
    code?: string | number;
    message?: string;
  };
  humanResponse?: {
    message?: string;
    thinking?: string;
  };
}

// ============================================================================
// JSON-RPC RESPONSE TYPES (legacy)
// ============================================================================

export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number | null;
  result: T;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

// ============================================================================
// SSE STREAM EVENT TYPES (legacy)
// ============================================================================

export interface AgentStreamChunk {
  type: string;
  content?: string;
  metadata?: {
    progress?: number;
    [key: string]: unknown;
  };
}

export interface AgentStreamChunkSSEEvent {
  type: 'agent_stream_chunk';
  data: {
    chunk: AgentStreamChunk;
    taskId?: string;
    streamId?: string;
  };
}

export interface AgentStreamCompleteSSEEvent {
  type: 'agent_stream_complete';
  data: {
    type: string;
    streamId?: string;
    taskId?: string;
  };
}

export interface AgentStreamErrorSSEEvent {
  type: 'agent_stream_error';
  data: {
    error?: string;
    code?: string;
    taskId?: string;
  };
}

export interface BaseSSEEvent {
  type: string;
  timestamp?: string;
}

export interface AgentStreamContext {
  taskId?: string;
  conversationId?: string;
  agentSlug?: string;
}
