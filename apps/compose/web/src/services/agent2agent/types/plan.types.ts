/**
 * Plan-specific request and response types
 * Covers all 9 plan actions
 */

import { Plan, PlanVersion, TaskMode } from './index';

// ============================================================================
// PLAN ACTION REQUEST TYPES
// ============================================================================

/**
 * 1. CREATE - Create or refine a plan
 */
export interface CreatePlanRequest {
  mode: TaskMode.PLAN;
  action: 'create';
  conversationId: string;
  params: {
    title: string;
    content: string;
    format?: 'markdown' | 'json' | 'text';
    agentName?: string;
    organizationSlug?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * 2. READ - Get current plan
 */
export interface ReadPlanRequest {
  mode: TaskMode.PLAN;
  action: 'read';
  conversationId: string;
  params?: Record<string, never>; // No params needed
}

/**
 * 3. LIST - Get version history
 */
export interface ListPlanVersionsRequest {
  mode: TaskMode.PLAN;
  action: 'list';
  conversationId: string;
  params?: Record<string, never>;
}

/**
 * 4. EDIT - Save manual edit as new version
 */
export interface EditPlanRequest {
  mode: TaskMode.PLAN;
  action: 'edit';
  conversationId: string;
  params: {
    content: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * 5. SET_CURRENT - Set a specific version as current
 */
export interface SetCurrentPlanVersionRequest {
  mode: TaskMode.PLAN;
  action: 'set_current';
  conversationId: string;
  params: {
    versionId: string;
  };
}

/**
 * 6. DELETE_VERSION - Delete a specific version
 */
export interface DeletePlanVersionRequest {
  mode: TaskMode.PLAN;
  action: 'delete_version';
  conversationId: string;
  params: {
    versionId: string;
  };
}

/**
 * 7. MERGE_VERSIONS - LLM-based merge of multiple versions
 */
export interface MergePlanVersionsRequest {
  mode: TaskMode.PLAN;
  action: 'merge_versions';
  conversationId: string;
  params: {
    versionIds: string[];
    mergePrompt: string;
  };
}

/**
 * 8. COPY_VERSION - Duplicate a version
 */
export interface CopyPlanVersionRequest {
  mode: TaskMode.PLAN;
  action: 'copy_version';
  conversationId: string;
  params: {
    versionId: string;
  };
}

/**
 * 9. DELETE - Delete entire plan
 */
export interface DeletePlanRequest {
  mode: TaskMode.PLAN;
  action: 'delete';
  conversationId: string;
  params?: Record<string, never>;
}

/**
 * Union type of all plan requests
 */
export type PlanRequest =
  | CreatePlanRequest
  | ReadPlanRequest
  | ListPlanVersionsRequest
  | EditPlanRequest
  | SetCurrentPlanVersionRequest
  | DeletePlanVersionRequest
  | MergePlanVersionsRequest
  | CopyPlanVersionRequest
  | DeletePlanRequest;

// ============================================================================
// PLAN ACTION RESPONSE TYPES
// ============================================================================

/**
 * 1. CREATE response
 */
export interface CreatePlanResponse {
  success: true;
  data: {
    plan: Plan;
    version: PlanVersion;
    isNew: boolean;
  };
}

/**
 * 2. READ response
 */
export interface ReadPlanResponse {
  success: true;
  data: Plan & {
    currentVersion?: PlanVersion;
  };
}

/**
 * 3. LIST response
 */
export interface ListPlanVersionsResponse {
  success: true;
  data: {
    plan: Plan;
    versions: PlanVersion[];
  };
}

/**
 * 4. EDIT response
 */
export interface EditPlanResponse {
  success: true;
  data: {
    plan: Plan;
    version: PlanVersion;
  };
}

/**
 * 5. SET_CURRENT response
 */
export interface SetCurrentPlanVersionResponse {
  success: true;
  data: {
    plan: Plan;
    version: PlanVersion;
  };
}

/**
 * 6. DELETE_VERSION response
 */
export interface DeletePlanVersionResponse {
  success: true;
  data: {
    success: boolean;
    message: string;
  };
}

/**
 * 7. MERGE_VERSIONS response
 */
export interface MergePlanVersionsResponse {
  success: true;
  data: {
    plan: Plan;
    newVersion: PlanVersion;
    conflictSummary?: string;
  };
}

/**
 * 8. COPY_VERSION response
 */
export interface CopyPlanVersionResponse {
  success: true;
  data: {
    plan: Plan;
    version: PlanVersion;
  };
}

/**
 * 9. DELETE response
 */
export interface DeletePlanResponse {
  success: true;
  data: {
    success: boolean;
    message: string;
  };
}

/**
 * Error response (common to all actions)
 */
export interface PlanErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Union type of all plan responses
 */
export type PlanResponse =
  | CreatePlanResponse
  | ReadPlanResponse
  | ListPlanVersionsResponse
  | EditPlanResponse
  | SetCurrentPlanVersionResponse
  | DeletePlanVersionResponse
  | MergePlanVersionsResponse
  | CopyPlanVersionResponse
  | DeletePlanResponse
  | PlanErrorResponse;

// ============================================================================
// HELPER TYPES & BUILDERS
// ============================================================================

/**
 * Type guard to check if response is an error
 */
export function isPlanError(
  response: PlanResponse,
): response is PlanErrorResponse {
  return response.success === false;
}

/**
 * Builder functions for creating requests
 */
export const PlanRequestBuilder = {
  create: (
    conversationId: string,
    params: CreatePlanRequest['params'],
  ): CreatePlanRequest => ({
    mode: TaskMode.PLAN,
    action: 'create',
    conversationId,
    params,
  }),

  read: (conversationId: string): ReadPlanRequest => ({
    mode: TaskMode.PLAN,
    action: 'read',
    conversationId,
  }),

  list: (conversationId: string): ListPlanVersionsRequest => ({
    mode: TaskMode.PLAN,
    action: 'list',
    conversationId,
  }),

  edit: (
    conversationId: string,
    params: EditPlanRequest['params'],
  ): EditPlanRequest => ({
    mode: TaskMode.PLAN,
    action: 'edit',
    conversationId,
    params,
  }),

  setCurrent: (
    conversationId: string,
    versionId: string,
  ): SetCurrentPlanVersionRequest => ({
    mode: TaskMode.PLAN,
    action: 'set_current',
    conversationId,
    params: { versionId },
  }),

  deleteVersion: (
    conversationId: string,
    versionId: string,
  ): DeletePlanVersionRequest => ({
    mode: TaskMode.PLAN,
    action: 'delete_version',
    conversationId,
    params: { versionId },
  }),

  mergeVersions: (
    conversationId: string,
    versionIds: string[],
    mergePrompt: string,
  ): MergePlanVersionsRequest => ({
    mode: TaskMode.PLAN,
    action: 'merge_versions',
    conversationId,
    params: { versionIds, mergePrompt },
  }),

  copyVersion: (
    conversationId: string,
    versionId: string,
  ): CopyPlanVersionRequest => ({
    mode: TaskMode.PLAN,
    action: 'copy_version',
    conversationId,
    params: { versionId },
  }),

  delete: (conversationId: string): DeletePlanRequest => ({
    mode: TaskMode.PLAN,
    action: 'delete',
    conversationId,
  }),
};
