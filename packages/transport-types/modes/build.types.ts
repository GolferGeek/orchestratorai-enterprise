/**
 * Build Mode Types
 * Defines mode-specific payloads and metadata for build operations
 */

/**
 * Build Actions
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
 * Build Create Action Payload
 */
export interface BuildCreatePayload {
  action: 'create';
  /** Title for the deliverable (optional - can be inferred) */
  title?: string;
  /** Type of deliverable (optional - can be inferred) */
  type?: string;
  /** Initial deliverable content (optional - will be generated if not provided) */
  content?: string;
  /** Plan version ID to build from (optional - uses current plan version if not specified) */
  planVersionId?: string;
}

/**
 * Build Read Action Payload
 */
export interface BuildReadPayload {
  action: 'read';
  /** Optional version ID to read specific version (defaults to current) */
  versionId?: string;
}

/**
 * Build List Action Payload
 */
export interface BuildListPayload {
  action: 'list';
  /** Include archived versions (optional - defaults to false) */
  includeArchived?: boolean;
}

/**
 * Build Edit Action Payload
 */
export interface BuildEditPayload {
  action: 'edit';
  /** New content for the deliverable (REQUIRED) */
  editedContent: string;
  /** Optional comment about the edit */
  comment?: string;
}

/**
 * Build Rerun Action Payload
 * Used to regenerate a deliverable version with a different LLM configuration.
 */
export interface BuildRerunPayload {
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
 * Build Set Current Action Payload
 */
export interface BuildSetCurrentPayload {
  action: 'set_current';
  /** Version ID to set as current (REQUIRED) */
  versionId: string;
}

/**
 * Build Delete Version Action Payload
 */
export interface BuildDeleteVersionPayload {
  action: 'delete_version';
  /** Version ID to delete (REQUIRED) */
  versionId: string;
}

/**
 * Build Merge Versions Action Payload
 */
export interface BuildMergeVersionsPayload {
  action: 'merge_versions';
  /** Array of version IDs to merge (REQUIRED) */
  versionIds: string[];
  /** Instructions for how to merge (REQUIRED) */
  mergePrompt: string;
}

/**
 * Build Copy Version Action Payload
 */
export interface BuildCopyVersionPayload {
  action: 'copy_version';
  /** Version ID to copy (REQUIRED) */
  versionId: string;
}

/**
 * Build Delete Action Payload
 */
export interface BuildDeletePayload {
  action: 'delete';
}

/**
 * Build Mode Payload (union of all build actions)
 */
export type BuildModePayload =
  | BuildCreatePayload
  | BuildReadPayload
  | BuildListPayload
  | BuildEditPayload
  | BuildRerunPayload
  | BuildSetCurrentPayload
  | BuildDeleteVersionPayload
  | BuildMergeVersionsPayload
  | BuildCopyVersionPayload
  | BuildDeletePayload;

/**
 * Build Request Metadata
 * Note: userId, conversationId, provider, model are in ExecutionContext
 */
export interface BuildRequestMetadata {
  /** Source of the request (e.g., 'web-ui', 'api', 'cli') */
  source: string;
  /** Deliverable type context (optional) */
  deliverableType?: string;
  /** Output format preference (optional) */
  format?: string;
  /** Current sub-agent handling the request (for orchestrator delegation) */
  current_sub_agent?: string | null;
}

/**
 * Build Response Metadata
 */
export interface BuildResponseMetadata {
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
  /** Whether plan context was used (optional) */
  usedPlanContext?: boolean;
  /** Current sub-agent that handled the request (for orchestrator delegation) */
  current_sub_agent?: string | null;
}

/**
 * Build Create Response Content
 */
export interface BuildCreateResponseContent {
  deliverable: {
    id: string;
    conversationId: string;
    userId: string;
    agentName: string;
    organization: string;
    title: string;
    type: string;
    currentVersionId: string;
    createdAt: string;
    updatedAt: string;
  };
  version: {
    id: string;
    deliverableId: string;
    versionNumber: number;
    content: string;
    format: 'markdown' | 'json' | 'html';
    createdByType: 'agent' | 'user';
    createdById: string | null;
    metadata?: Record<string, any>;
    isCurrentVersion: boolean;
    createdAt: string;
  };
  isNew: boolean;
}
