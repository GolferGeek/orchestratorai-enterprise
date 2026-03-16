/**
 * Forge-Local Types
 *
 * Type definitions that are specific to the Forge product web application.
 * These types were previously imported from @orchestrator-ai/transport-types but
 * are Forge-specific and must be defined locally.
 *
 * Covers:
 * - HITL (Human-in-the-Loop) types for LangGraph workflow approvals
 * - Plan and Deliverable data shapes for the plan/build mode stores
 * - Agent task mode types
 * - Strict A2A request/response types for the old agent2agent protocol
 * - Dashboard request/response payload types for predictor and risk-runner
 * - SSE event types for streaming agent output
 * - JSON-RPC response types
 */

import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// ============================================================================
// HITL (HUMAN-IN-THE-LOOP) TYPES
// ============================================================================

/**
 * HITL workflow status values.
 */
export type HitlStatus =
  | 'started'
  | 'in_progress'
  | 'hitl_pending'
  | 'hitl_approved'
  | 'hitl_rejected'
  | 'completed'
  | 'failed';

/**
 * HITL decision — what the human decides to do with the generated content.
 */
export type HitlDecision =
  | 'approve'
  | 'reject'
  | 'regenerate'
  | 'replace'
  | 'skip';

/**
 * HITL generated content — the content produced by a LangGraph workflow
 * that requires human review before proceeding.
 */
export interface HitlGeneratedContent {
  content: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

/**
 * HITL pending item — a workflow awaiting human review.
 */
export interface HitlPendingItem {
  taskId: string;
  agentSlug: string;
  orgSlug: string;
  topic: string;
  generatedContent: HitlGeneratedContent;
  pendingSince: string;
  conversationId?: string;
}

// ============================================================================
// PLAN DATA TYPES
// ============================================================================

/**
 * Plan data — represents a plan entity in the plan mode.
 */
export interface PlanData {
  id: string;
  conversationId: string;
  agentSlug: string;
  organizationSlug?: string | null;
  title?: string | null;
  status: string;
  currentVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Plan version data — a specific version of a plan.
 */
export interface PlanVersionData {
  id: string;
  planId: string;
  versionNumber: number;
  content: string;
  format: string;
  createdByType: 'agent' | 'user';
  createdById?: string | null;
  taskId?: string | null;
  isCurrent?: boolean;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

// ============================================================================
// DELIVERABLE DATA TYPES
// ============================================================================

/**
 * Deliverable data — represents a deliverable entity in the build mode.
 */
export interface DeliverableData {
  id: string;
  conversationId: string;
  agentSlug: string;
  organizationSlug?: string | null;
  title?: string | null;
  type?: string | null;
  status: string;
  currentVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Deliverable version data — a specific version of a deliverable.
 */
export interface DeliverableVersionData {
  id: string;
  deliverableId: string;
  versionNumber: number;
  content: string;
  format: string;
  createdByType: 'agent' | 'user';
  createdById?: string | null;
  taskId?: string | null;
  isCurrent?: boolean;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

// ============================================================================
// AGENT TASK MODE
// ============================================================================

/**
 * Agent task mode — the primary operation type for an agent interaction.
 * Used in the old A2A task protocol.
 */
export enum AgentTaskMode {
  PLAN = 'plan',
  BUILD = 'build',
  CONVERSE = 'converse',
  DASHBOARD = 'dashboard',
  HITL = 'hitl',
}

// ============================================================================
// STRICT A2A REQUEST/RESPONSE TYPES (OLD TASK PROTOCOL)
// ============================================================================

/**
 * Task message — a message payload within an A2A task request.
 */
export interface StrictTaskMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

/**
 * Plan action types
 */
export type PlanAction =
  | 'create'
  | 'read'
  | 'list'
  | 'edit'
  | 'rerun'
  | 'set_current'
  | 'delete_version'
  | 'merge_versions'
  | 'copy_version'
  | 'delete';

/**
 * Build action types
 */
export type BuildAction =
  | 'create'
  | 'read'
  | 'list'
  | 'edit'
  | 'rerun'
  | 'set_current'
  | 'delete_version'
  | 'merge_versions'
  | 'copy_version'
  | 'delete';

/**
 * Strict A2A request — the typed JSON-RPC request structure.
 */
export interface StrictA2ARequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: {
    context?: ExecutionContext;
    userMessage?: string;
    messages?: StrictTaskMessage[];
    mode?: string;
    action?: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/**
 * Strict plan request
 */
export type StrictPlanRequest = StrictA2ARequest;

/**
 * Strict build request
 */
export type StrictBuildRequest = StrictA2ARequest;

/**
 * Strict converse request
 */
export type StrictConverseRequest = StrictA2ARequest;

/**
 * Strict A2A success response
 */
export interface StrictA2ASuccessResponse {
  jsonrpc: '2.0';
  id: string;
  result: {
    success: true;
    mode: string;
    payload: {
      content: unknown;
      metadata?: unknown;
    };
    context?: ExecutionContext;
  };
}

/**
 * Strict A2A error response
 */
export interface StrictA2AErrorResponse {
  jsonrpc: '2.0';
  id: string;
  error: {
    code: number;
    message: string;
    data?: {
      mode?: string;
      [key: string]: unknown;
    };
  };
}

/**
 * Union type for strict A2A responses
 */
export type StrictA2AResponse = StrictA2ASuccessResponse | StrictA2AErrorResponse;

/**
 * Strict plan response
 */
export type StrictPlanResponse = StrictA2ASuccessResponse;

/**
 * Strict build response
 */
export type StrictBuildResponse = StrictA2ASuccessResponse;

/**
 * Strict converse response
 */
export type StrictConverseResponse = StrictA2ASuccessResponse;

/**
 * Task response — the inner result payload from a JSON-RPC A2A call.
 */
export interface TaskResponse {
  success: boolean;
  mode: string;
  action?: string;
  payload?: {
    content?: unknown;
    metadata?: Record<string, unknown>;
  };
  hitlPending?: boolean;
  hitlTaskId?: string;
  hitlTopic?: string;
  generatedContent?: HitlGeneratedContent;
  context?: ExecutionContext;
  error?: string;
}

/**
 * HITL deliverable response — returned when a build workflow produces HITL content
 */
export interface HitlDeliverableResponse {
  hitlPending: true;
  taskId: string;
  topic: string;
  generatedContent: HitlGeneratedContent;
}

// ============================================================================
// DASHBOARD PAYLOAD TYPES
// ============================================================================

/**
 * Dashboard request payload — structured request for predictor and risk-runner
 * dashboard capability operations.
 */
export interface DashboardRequestPayload {
  entity: string;
  action: string;
  params?: Record<string, unknown>;
}

/**
 * Dashboard response payload — structured response from dashboard capabilities.
 */
export interface DashboardResponsePayload {
  success: boolean;
  data?: unknown;
  total?: number;
  error?: string;
}

// ============================================================================
// SSE STREAM EVENT TYPES (OLD AGENT STREAM PROTOCOL)
// ============================================================================

/**
 * Agent stream chunk SSE event — carries partial content during streaming.
 */
export interface AgentStreamChunkSSEEvent {
  type: 'chunk';
  data: {
    chunk: string;
    taskId?: string;
    timestamp?: number;
  };
}

/**
 * Agent stream complete SSE event — signals end of stream.
 */
export interface AgentStreamCompleteSSEEvent {
  type: 'complete';
  data: {
    taskId?: string;
    timestamp?: number;
    finalContent?: string;
  };
}

/**
 * Agent stream error SSE event — signals a stream error.
 */
export interface AgentStreamErrorSSEEvent {
  type: 'error';
  data: {
    error: string;
    code?: number;
    taskId?: string;
    timestamp?: number;
  };
}

// ============================================================================
// JSON-RPC RESPONSE TYPES
// ============================================================================

/**
 * JSON-RPC success response
 */
export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result: T;
}

/**
 * JSON-RPC error response
 */
export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}
