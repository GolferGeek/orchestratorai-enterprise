/**
 * Build Request Builder
 * Creates fully-typed, validated build/deliverable requests
 *
 * **Store-First Approach (PRD Compliant):**
 * Each builder function gets context from the ExecutionContext store internally.
 * Context is NEVER passed as a parameter - builders access the store directly.
 *
 * @see docs/prd/unified-a2a-orchestrator.md - Phase 1, Item #2
 */

import type {
  StrictBuildRequest,
  AgentTaskMode,
  StrictTaskMessage,
} from '../../legacy-types';
import { useExecutionContextStore } from '@/stores/executionContextStore';

/**
 * Payload types for each build action
 */
export interface BuildExecutePayload {
  userMessage: string;
  planId?: string;
  messages?: StrictTaskMessage[];
  documents?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    base64Data: string;
  }>;
}

export interface BuildReadPayload {
  versionId?: string;
}

export interface BuildEditPayload {
  userMessage?: string;
  content?: string;
  versionId?: string;
}

export interface BuildRerunPayload {
  versionId: string;
  config: Record<string, unknown>;
  userMessage?: string;
}

export interface BuildMergePayload {
  versionIds: string[];
  mergePrompt: string;
  userMessage?: string;
}

export interface BuildVersionPayload {
  versionId: string;
}

/**
 * Helper to get context from store
 */
function getContext() {
  const store = useExecutionContextStore();
  return store.current;
}

/**
 * Validation helper
 */
function validateRequired(value: unknown, fieldName: string): void {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${fieldName} is required and cannot be empty`);
  }
}

/**
 * Build request builders
 * All 10 build actions from the strict type system
 *
 * **Store-First Approach:** Each method gets context from the store internally.
 * No metadata parameter - only action-specific payload data.
 */
export const buildBuilder = {
  /**
   * Execute build (create deliverable)
   */
  execute: (payload: BuildExecutePayload): StrictBuildRequest => {
    const ctx = getContext();
    validateRequired(payload.userMessage, 'userMessage');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.execute',
      params: {
        mode: 'build' as AgentTaskMode,
        userMessage: payload.userMessage,
        messages: payload.messages || [],
        planId: payload.planId || ctx.planId,
        payload: {
          action: 'create',  // Backend expects 'create' action for new deliverables
          planId: payload.planId || ctx.planId,
          ...(payload.documents?.length ? { documents: payload.documents } : {}),
        },
      },
    } as unknown as StrictBuildRequest;
  },

  /**
   * Read current deliverable
   */
  read: (payload?: BuildReadPayload): StrictBuildRequest => {
    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.read',
      params: {
        mode: 'build' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'read',
          ...(payload?.versionId && { versionId: payload.versionId }),
        },
      },
    } as unknown as StrictBuildRequest;
  },

  /**
   * List all deliverables in conversation
   */
  list: (): StrictBuildRequest => {
    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.list',
      params: {
        mode: 'build' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'list',
        },
      },
    } as unknown as StrictBuildRequest;
  },

  /**
   * Rerun a build with different LLM config
   */
  rerun: (payload: BuildRerunPayload): StrictBuildRequest => {
    validateRequired(payload.versionId, 'versionId');
    validateRequired(payload.config, 'config');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.rerun',
      params: {
        mode: 'build' as AgentTaskMode,
        userMessage: payload.userMessage || 'Regenerate deliverable',
        messages: [],
        payload: {
          action: 'rerun',
          versionId: payload.versionId,
          llmOverride: payload.config,  // Backend expects llmOverride, not config
        },
      },
    } as unknown as StrictBuildRequest;
  },

  /**
   * Edit deliverable
   */
  edit: (payload: BuildEditPayload): StrictBuildRequest => {
    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.edit',
      params: {
        mode: 'build' as AgentTaskMode,
        userMessage: payload.userMessage || 'Edit deliverable',
        messages: [],
        payload: {
          action: 'edit',
          ...(payload.versionId && { versionId: payload.versionId }),
          ...(payload.content && { content: payload.content }),
        },
      },
    } as unknown as StrictBuildRequest;
  },

  /**
   * Set current deliverable version
   */
  setCurrent: (payload: BuildVersionPayload): StrictBuildRequest => {
    validateRequired(payload.versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.set_current',
      params: {
        mode: 'build' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'set_current',
          versionId: payload.versionId,
        },
      },
    } as unknown as StrictBuildRequest;
  },

  /**
   * Delete deliverable version
   */
  deleteVersion: (payload: BuildVersionPayload): StrictBuildRequest => {
    validateRequired(payload.versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.delete_version',
      params: {
        mode: 'build' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'delete_version',
          versionId: payload.versionId,
        },
      },
    } as unknown as StrictBuildRequest;
  },

  /**
   * Merge deliverable versions
   */
  mergeVersions: (payload: BuildMergePayload): StrictBuildRequest => {
    validateRequired(payload.versionIds, 'versionIds');
    validateRequired(payload.mergePrompt, 'mergePrompt');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.merge_versions',
      params: {
        mode: 'build' as AgentTaskMode,
        userMessage: payload.userMessage || 'Merge deliverable versions',
        messages: [],
        payload: {
          action: 'merge_versions',
          versionIds: payload.versionIds,
          mergePrompt: payload.mergePrompt,
        },
      },
    } as unknown as StrictBuildRequest;
  },

  /**
   * Copy deliverable version
   */
  copyVersion: (payload: BuildVersionPayload): StrictBuildRequest => {
    validateRequired(payload.versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.copy_version',
      params: {
        mode: 'build' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'copy_version',
          versionId: payload.versionId,
        },
      },
    } as unknown as StrictBuildRequest;
  },

  /**
   * Delete deliverable
   * Uses deliverableId from context
   */
  delete: (): StrictBuildRequest => {
    const ctx = getContext();

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.delete',
      params: {
        mode: 'build' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'delete',
          deliverableId: ctx.deliverableId,
        },
      },
    } as unknown as StrictBuildRequest;
  },
};
