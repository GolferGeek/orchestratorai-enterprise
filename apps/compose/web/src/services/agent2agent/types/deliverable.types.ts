/**
 * Deliverable-specific request and response types
 * Covers all 10 deliverable actions
 */

import { Deliverable, DeliverableVersion, TaskMode } from './index';

// ============================================================================
// DELIVERABLE ACTION REQUEST TYPES
// ============================================================================

/**
 * 1. CREATE - Create or enhance a deliverable
 */
export interface CreateDeliverableRequest {
  mode: TaskMode.BUILD;
  action: 'create';
  conversationId: string;
  params: {
    title: string;
    content: string;
    format?: 'markdown' | 'json' | 'text' | 'html';
    type?: string;
    agentName?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * 2. READ - Get current deliverable
 */
export interface ReadDeliverableRequest {
  mode: TaskMode.BUILD;
  action: 'read';
  conversationId: string;
  params?: Record<string, never>;
}

/**
 * 3. LIST - Get version history
 */
export interface ListDeliverableVersionsRequest {
  mode: TaskMode.BUILD;
  action: 'list';
  conversationId: string;
  params?: Record<string, never>;
}

/**
 * 4. EDIT - Save manual edit as new version
 */
export interface EditDeliverableRequest {
  mode: TaskMode.BUILD;
  action: 'edit';
  conversationId: string;
  params: {
    content: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * 5. RERUN - Rerun with different LLM
 */
export interface RerunDeliverableRequest {
  mode: TaskMode.BUILD;
  action: 'rerun';
  conversationId: string;
  params: {
    versionId: string;
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
}

/**
 * 6. SET_CURRENT - Set a specific version as current
 */
export interface SetCurrentDeliverableVersionRequest {
  mode: TaskMode.BUILD;
  action: 'set_current';
  conversationId: string;
  params: {
    versionId: string;
  };
}

/**
 * 7. DELETE_VERSION - Delete a specific version
 */
export interface DeleteDeliverableVersionRequest {
  mode: TaskMode.BUILD;
  action: 'delete_version';
  conversationId: string;
  params: {
    versionId: string;
  };
}

/**
 * 8. MERGE_VERSIONS - LLM-based merge of multiple versions
 */
export interface MergeDeliverableVersionsRequest {
  mode: TaskMode.BUILD;
  action: 'merge_versions';
  conversationId: string;
  params: {
    versionIds: string[];
    mergePrompt: string;
  };
}

/**
 * 9. COPY_VERSION - Duplicate a version
 */
export interface CopyDeliverableVersionRequest {
  mode: TaskMode.BUILD;
  action: 'copy_version';
  conversationId: string;
  params: {
    versionId: string;
  };
}

/**
 * 10. DELETE - Delete entire deliverable
 */
export interface DeleteDeliverableRequest {
  mode: TaskMode.BUILD;
  action: 'delete';
  conversationId: string;
  params?: Record<string, never>;
}

/**
 * Union type of all deliverable requests
 */
export type DeliverableRequest =
  | CreateDeliverableRequest
  | ReadDeliverableRequest
  | ListDeliverableVersionsRequest
  | EditDeliverableRequest
  | RerunDeliverableRequest
  | SetCurrentDeliverableVersionRequest
  | DeleteDeliverableVersionRequest
  | MergeDeliverableVersionsRequest
  | CopyDeliverableVersionRequest
  | DeleteDeliverableRequest;

// ============================================================================
// DELIVERABLE ACTION RESPONSE TYPES
// ============================================================================

/**
 * 1. CREATE response
 */
export interface CreateDeliverableResponse {
  success: true;
  data: {
    deliverable: Deliverable;
    version: DeliverableVersion;
    isNew: boolean;
  };
}

/**
 * 2. READ response
 */
export interface ReadDeliverableResponse {
  success: true;
  data: Deliverable & {
    currentVersion?: DeliverableVersion;
  };
}

/**
 * 3. LIST response
 */
export interface ListDeliverableVersionsResponse {
  success: true;
  data: {
    deliverable: Deliverable;
    versions: DeliverableVersion[];
  };
}

/**
 * 4. EDIT response
 */
export interface EditDeliverableResponse {
  success: true;
  data: {
    deliverable: Deliverable;
    version: DeliverableVersion;
  };
}

/**
 * 5. RERUN response
 */
export interface RerunDeliverableResponse {
  success: true;
  data: DeliverableVersion;
}

/**
 * 6. SET_CURRENT response
 */
export interface SetCurrentDeliverableVersionResponse {
  success: true;
  data: {
    deliverable: Deliverable;
    version: DeliverableVersion;
  };
}

/**
 * 7. DELETE_VERSION response
 */
export interface DeleteDeliverableVersionResponse {
  success: true;
  data: {
    success: boolean;
    message: string;
  };
}

/**
 * 8. MERGE_VERSIONS response
 */
export interface MergeDeliverableVersionsResponse {
  success: true;
  data: {
    deliverable: Deliverable;
    newVersion: DeliverableVersion;
    conflictSummary?: string;
  };
}

/**
 * 9. COPY_VERSION response
 */
export interface CopyDeliverableVersionResponse {
  success: true;
  data: {
    deliverable: Deliverable;
    version: DeliverableVersion;
  };
}

/**
 * 10. DELETE response
 */
export interface DeleteDeliverableResponse {
  success: true;
  data: {
    success: boolean;
    message: string;
  };
}

/**
 * Error response (common to all actions)
 */
export interface DeliverableErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Union type of all deliverable responses
 */
export type DeliverableResponse =
  | CreateDeliverableResponse
  | ReadDeliverableResponse
  | ListDeliverableVersionsResponse
  | EditDeliverableResponse
  | RerunDeliverableResponse
  | SetCurrentDeliverableVersionResponse
  | DeleteDeliverableVersionResponse
  | MergeDeliverableVersionsResponse
  | CopyDeliverableVersionResponse
  | DeleteDeliverableResponse
  | DeliverableErrorResponse;

// ============================================================================
// HELPER TYPES & BUILDERS
// ============================================================================

/**
 * Type guard to check if response is an error
 */
export function isDeliverableError(
  response: DeliverableResponse,
): response is DeliverableErrorResponse {
  return response.success === false;
}

/**
 * Builder functions for creating requests
 */
export const DeliverableRequestBuilder = {
  create: (
    conversationId: string,
    params: CreateDeliverableRequest['params'],
  ): CreateDeliverableRequest => ({
    mode: TaskMode.BUILD,
    action: 'create',
    conversationId,
    params,
  }),

  read: (conversationId: string): ReadDeliverableRequest => ({
    mode: TaskMode.BUILD,
    action: 'read',
    conversationId,
  }),

  list: (conversationId: string): ListDeliverableVersionsRequest => ({
    mode: TaskMode.BUILD,
    action: 'list',
    conversationId,
  }),

  edit: (
    conversationId: string,
    params: EditDeliverableRequest['params'],
  ): EditDeliverableRequest => ({
    mode: TaskMode.BUILD,
    action: 'edit',
    conversationId,
    params,
  }),

  rerun: (
    conversationId: string,
    params: RerunDeliverableRequest['params'],
  ): RerunDeliverableRequest => ({
    mode: TaskMode.BUILD,
    action: 'rerun',
    conversationId,
    params,
  }),

  setCurrent: (
    conversationId: string,
    versionId: string,
  ): SetCurrentDeliverableVersionRequest => ({
    mode: TaskMode.BUILD,
    action: 'set_current',
    conversationId,
    params: { versionId },
  }),

  deleteVersion: (
    conversationId: string,
    versionId: string,
  ): DeleteDeliverableVersionRequest => ({
    mode: TaskMode.BUILD,
    action: 'delete_version',
    conversationId,
    params: { versionId },
  }),

  mergeVersions: (
    conversationId: string,
    versionIds: string[],
    mergePrompt: string,
  ): MergeDeliverableVersionsRequest => ({
    mode: TaskMode.BUILD,
    action: 'merge_versions',
    conversationId,
    params: { versionIds, mergePrompt },
  }),

  copyVersion: (
    conversationId: string,
    versionId: string,
  ): CopyDeliverableVersionRequest => ({
    mode: TaskMode.BUILD,
    action: 'copy_version',
    conversationId,
    params: { versionId },
  }),

  delete: (conversationId: string): DeleteDeliverableRequest => ({
    mode: TaskMode.BUILD,
    action: 'delete',
    conversationId,
  }),
};
