/**
 * Plan Request Builder
 * Creates fully-typed, validated plan requests
 *
 * **Store-First Approach (PRD Compliant):**
 * Each builder function gets context from the ExecutionContext store internally.
 * Context is NEVER passed as a parameter - builders access the store directly.
 *
 * @see docs/prd/unified-a2a-orchestrator.md - Phase 1, Item #2
 */

import type {
  StrictPlanRequest,
  AgentTaskMode,
  StrictTaskMessage,
} from '@orchestrator-ai/transport-types';
import { useExecutionContextStore } from '@/stores/executionContextStore';

/**
 * Payload types for each plan action
 */
export interface PlanCreatePayload {
  userMessage: string;
  planData?: Record<string, unknown>;
  messages?: StrictTaskMessage[];
  documents?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    base64Data: string;
  }>;
}

export interface PlanReadPayload {
  versionId?: string;
}

export interface PlanEditPayload {
  userMessage?: string;
  content?: string;
  versionId?: string;
}

export interface PlanRerunPayload {
  versionId: string;
  config: Record<string, unknown>;
  userMessage?: string;
}

export interface PlanMergePayload {
  versionIds: string[];
  mergePrompt: string;
  userMessage?: string;
}

export interface PlanVersionPayload {
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
 * Plan request builders
 * All 10 plan actions from the strict type system
 *
 * **Store-First Approach:** Each method gets context from the store internally.
 * No metadata parameter - only action-specific payload data.
 */
export const planBuilder = {
  /**
   * Create a new plan
   */
  create: (payload: PlanCreatePayload): StrictPlanRequest => {
    validateRequired(payload.userMessage, 'userMessage');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.create',
      params: {
        mode: 'plan' as AgentTaskMode,
        userMessage: payload.userMessage,
        messages: payload.messages || [],
        payload: {
          action: 'create',
          ...(payload.planData || {}),
          ...(payload.documents?.length ? { documents: payload.documents } : {}),
        },
      },
    } as unknown as StrictPlanRequest;
  },

  /**
   * Read current plan
   */
  read: (payload?: PlanReadPayload): StrictPlanRequest => {
    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.read',
      params: {
        mode: 'plan' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'read',
          ...(payload?.versionId && { versionId: payload.versionId }),
        },
      },
    } as unknown as StrictPlanRequest;
  },

  /**
   * List all plans in conversation
   */
  list: (): StrictPlanRequest => {
    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.list',
      params: {
        mode: 'plan' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'list',
        },
      },
    } as unknown as StrictPlanRequest;
  },

  /**
   * Edit plan
   */
  edit: (payload: PlanEditPayload): StrictPlanRequest => {
    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.edit',
      params: {
        mode: 'plan' as AgentTaskMode,
        userMessage: payload.userMessage || 'Edit plan',
        messages: [],
        payload: {
          action: 'edit',
          ...(payload.versionId && { versionId: payload.versionId }),
          ...(payload.content && { content: payload.content }),
        },
      },
    } as unknown as StrictPlanRequest;
  },

  /**
   * Rerun a plan with different LLM config
   */
  rerun: (payload: PlanRerunPayload): StrictPlanRequest => {
    validateRequired(payload.versionId, 'versionId');
    validateRequired(payload.config, 'config');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.rerun',
      params: {
        mode: 'plan' as AgentTaskMode,
        userMessage: payload.userMessage || 'Regenerate plan',
        messages: [],
        payload: {
          action: 'rerun',
          versionId: payload.versionId,
          config: payload.config,
        },
      },
    } as unknown as StrictPlanRequest;
  },

  /**
   * Set current plan version
   */
  setCurrent: (payload: PlanVersionPayload): StrictPlanRequest => {
    validateRequired(payload.versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.set_current',
      params: {
        mode: 'plan' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'set_current',
          versionId: payload.versionId,
        },
      },
    } as unknown as StrictPlanRequest;
  },

  /**
   * Delete plan version
   */
  deleteVersion: (payload: PlanVersionPayload): StrictPlanRequest => {
    validateRequired(payload.versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.delete_version',
      params: {
        mode: 'plan' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'delete_version',
          versionId: payload.versionId,
        },
      },
    } as unknown as StrictPlanRequest;
  },

  /**
   * Merge plan versions
   */
  mergeVersions: (payload: PlanMergePayload): StrictPlanRequest => {
    validateRequired(payload.versionIds, 'versionIds');
    validateRequired(payload.mergePrompt, 'mergePrompt');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.merge_versions',
      params: {
        mode: 'plan' as AgentTaskMode,
        userMessage: payload.userMessage || 'Merge plan versions',
        messages: [],
        payload: {
          action: 'merge_versions',
          versionIds: payload.versionIds,
          mergePrompt: payload.mergePrompt,
        },
      },
    } as unknown as StrictPlanRequest;
  },

  /**
   * Copy plan version
   */
  copyVersion: (payload: PlanVersionPayload): StrictPlanRequest => {
    validateRequired(payload.versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.copy_version',
      params: {
        mode: 'plan' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'copy_version',
          versionId: payload.versionId,
        },
      },
    } as unknown as StrictPlanRequest;
  },

  /**
   * Delete plan
   * Uses planId from context
   */
  delete: (): StrictPlanRequest => {
    const ctx = getContext();

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.delete',
      params: {
        mode: 'plan' as AgentTaskMode,
        userMessage: '',
        messages: [],
        payload: {
          action: 'delete',
          planId: ctx.planId,
        },
      },
    } as unknown as StrictPlanRequest;
  },
};
