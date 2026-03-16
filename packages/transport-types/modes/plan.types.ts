/**
 * Plan Mode Types
 * Defines mode-specific payloads and metadata for plan operations
 */

/**
 * Plan Actions
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
 * Plan Create Action Payload
 */
export interface PlanCreatePayload {
  action: 'create';
  /** Title for the plan (optional - can be inferred from conversation) */
  title?: string;
  /** Initial plan content (optional - will be generated if not provided) */
  content?: string;
  /** Force creation of new plan even if one exists (optional - defaults to false) */
  forceNew?: boolean;
}

/**
 * Plan Read Action Payload
 */
export interface PlanReadPayload {
  action: 'read';
  /** Optional version ID to read specific version (defaults to current) */
  versionId?: string;
}

/**
 * Plan List Action Payload
 */
export interface PlanListPayload {
  action: 'list';
  /** Include archived versions (optional - defaults to false) */
  includeArchived?: boolean;
}

/**
 * Plan Edit Action Payload
 */
export interface PlanEditPayload {
  action: 'edit';
  /** New content for the plan (REQUIRED) */
  editedContent: string;
  /** Optional comment about the edit */
  comment?: string;
}

/**
 * Plan Rerun Action Payload
 * Used to regenerate a plan version with a different LLM configuration.
 */
export interface PlanRerunPayload {
  action: 'rerun';
  /** Version ID to rerun (REQUIRED) */
  versionId: string;
  /** LLM configuration for this rerun (REQUIRED - this is why you're calling rerun) */
  llmOverride: {
    /** LLM provider */
    provider: string;
    /** LLM model */
    model: string;
    /** Temperature for generation (optional - defaults to model default) */
    temperature?: number;
    /** Max tokens for generation (optional - defaults to model default) */
    maxTokens?: number;
  };
}

/**
 * Plan Set Current Action Payload
 */
export interface PlanSetCurrentPayload {
  action: 'set_current';
  /** Version ID to set as current (REQUIRED) */
  versionId: string;
}

/**
 * Plan Delete Version Action Payload
 */
export interface PlanDeleteVersionPayload {
  action: 'delete_version';
  /** Version ID to delete (REQUIRED) */
  versionId: string;
}

/**
 * Plan Merge Versions Action Payload
 */
export interface PlanMergeVersionsPayload {
  action: 'merge_versions';
  /** Array of version IDs to merge (REQUIRED) */
  versionIds: string[];
  /** Instructions for how to merge (REQUIRED) */
  mergePrompt: string;
}

/**
 * Plan Copy Version Action Payload
 */
export interface PlanCopyVersionPayload {
  action: 'copy_version';
  /** Version ID to copy (REQUIRED) */
  versionId: string;
}

/**
 * Plan Delete Action Payload
 */
export interface PlanDeletePayload {
  action: 'delete';
}

/**
 * Plan Mode Payload (union of all plan actions)
 */
export type PlanModePayload =
  | PlanCreatePayload
  | PlanReadPayload
  | PlanListPayload
  | PlanEditPayload
  | PlanRerunPayload
  | PlanSetCurrentPayload
  | PlanDeleteVersionPayload
  | PlanMergeVersionsPayload
  | PlanCopyVersionPayload
  | PlanDeletePayload;

/**
 * Plan Request Metadata
 * Note: userId, conversationId, provider, model are in ExecutionContext
 */
export interface PlanRequestMetadata {
  /** Source of the request (e.g., 'web-ui', 'api', 'cli') */
  source: string;
  /** Current sub-agent handling the request (for orchestrator delegation) */
  current_sub_agent?: string | null;
}

/**
 * Plan Response Metadata
 */
export interface PlanResponseMetadata {
  /** LLM provider used (REQUIRED - empty string for non-LLM actions) */
  provider: string;
  /** LLM model used (REQUIRED - empty string for non-LLM actions) */
  model: string;
  /** Token usage statistics (REQUIRED - use zeros for non-LLM actions) */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
  /** Routing decision information (optional) */
  routingDecision?: Record<string, any>;
  /** Current sub-agent that handled the request (for orchestrator delegation) */
  current_sub_agent?: string | null;
}

/**
 * Plan Create Response Content
 */
export interface PlanCreateResponseContent {
  plan: {
    id: string;
    conversationId: string;
    userId: string;
    agentName: string;
    organization: string;
    title: string;
    currentVersionId: string;
    createdAt: string;
    updatedAt: string;
  };
  version: {
    id: string;
    planId: string;
    versionNumber: number;
    content: string;
    format: 'markdown' | 'json';
    createdByType: 'agent' | 'user';
    createdById: string | null;
    metadata?: Record<string, any>;
    isCurrentVersion: boolean;
    createdAt: string;
  };
  isNew: boolean;
}

/**
 * Plan Read Response Content
 */
export interface PlanReadResponseContent {
  plan: {
    id: string;
    conversationId: string;
    userId: string;
    agentName: string;
    organization: string;
    title: string;
    currentVersionId: string;
    createdAt: string;
    updatedAt: string;
    currentVersion?: {
      id: string;
      planId: string;
      versionNumber: number;
      content: string;
      format: 'markdown' | 'json';
      createdByType: 'agent' | 'user';
      createdById: string | null;
      metadata?: Record<string, any>;
      isCurrentVersion: boolean;
      createdAt: string;
    };
  };
}

/**
 * Plan List Response Content
 */
export interface PlanListResponseContent {
  plan: {
    id: string;
    conversationId: string;
    userId: string;
    agentName: string;
    organization: string;
    title: string;
    currentVersionId: string;
    createdAt: string;
    updatedAt: string;
  };
  versions: Array<{
    id: string;
    planId: string;
    versionNumber: number;
    content: string;
    format: 'markdown' | 'json';
    createdByType: 'agent' | 'user';
    createdById: string | null;
    metadata?: Record<string, any>;
    isCurrentVersion: boolean;
    createdAt: string;
  }>;
}

/**
 * Plan Rerun Response Content
 */
export interface PlanRerunResponseContent {
  plan: {
    id: string;
    conversationId: string;
    userId: string;
    agentName: string;
    organization: string;
    title: string;
    currentVersionId: string;
    createdAt: string;
    updatedAt: string;
  };
  version: {
    id: string;
    planId: string;
    versionNumber: number;
    content: string;
    format: 'markdown' | 'json';
    createdByType: 'agent' | 'user';
    createdById: string | null;
    taskId?: string;
    metadata?: Record<string, any>;
    isCurrentVersion: boolean;
    createdAt: string;
  };
}
