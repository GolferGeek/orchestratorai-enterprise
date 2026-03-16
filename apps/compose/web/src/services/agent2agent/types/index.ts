/**
 * Frontend base types for agent-to-agent task operations
 * Mirrors backend types for consistency
 */

/**
 * Task modes define the high-level operation category
 */
export enum TaskMode {
  PLAN = 'plan',
  BUILD = 'build',
  CONVERSE = 'converse',
  TOOL = 'tool',
}

/**
 * Task actions define specific operations within a mode
 */
export type TaskAction = string;

/**
 * Task execution status
 */
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Base request structure for all task operations
 */
export interface BaseTaskRequest {
  mode: TaskMode;
  action: TaskAction;
  conversationId: string;
  userId?: string;
  agentSlug?: string;
}

/**
 * Standardized response structure for all task operations
 */
export interface TaskResponse<TResult = unknown> {
  success: boolean;
  mode: TaskMode;
  action: TaskAction;
  result?: TResult;
  error?: TaskError;
  metadata?: {
    taskId?: string;
    executionTime?: number;
    timestamp?: string;
    [key: string]: unknown;
  };
}

/**
 * Standardized error structure for task failures
 */
export interface TaskError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

/**
 * Common entity types
 */

export interface Plan {
  id: string;
  conversation_id: string;
  user_id: string;
  agent_name: string;
  organizationSlug: string;
  title: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanVersion {
  id: string;
  plan_id: string;
  version_number: number;
  content: string;
  format: 'markdown' | 'json' | 'text';
  created_by_type: 'agent' | 'user';
  created_by_id?: string;
  task_id?: string;
  metadata?: Record<string, unknown>;
  is_current_version: boolean;
  created_at: string;
}

export interface Deliverable {
  id: string;
  conversation_id: string;
  user_id: string;
  agent_name: string;
  organizationSlug: string;
  title: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliverableVersion {
  id: string;
  deliverable_id: string;
  version_number: number;
  content: string;
  format: 'markdown' | 'json' | 'text';
  created_by_type: 'agent' | 'user';
  created_by_id?: string;
  task_id?: string;
  metadata?: Record<string, unknown>;
  is_current_version: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title?: string;
  agent_slug: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// RE-EXPORT SPECIFIC ACTION TYPES
// ============================================================================

export * from './plan.types';
export * from './deliverable.types';
