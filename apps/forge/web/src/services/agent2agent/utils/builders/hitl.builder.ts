/**
 * HITL Request Builder
 * Creates fully-typed, validated HITL (Human-in-the-Loop) requests
 *
 * **Store-First Approach (PRD Compliant):**
 * Each builder function gets context from the ExecutionContext store internally.
 * Context is NEVER passed as a parameter - builders access the store directly.
 *
 * HITL operations use taskId for resuming workflows.
 * The taskId is used as LangGraph's thread_id internally.
 *
 * @see docs/prd/unified-a2a-orchestrator.md - Phase 1, Item #2
 */

import type {
  AgentTaskMode,
  HitlDecision,
  HitlGeneratedContent,
  StrictTaskMessage,
  StrictA2ARequest,
} from '@orchestrator-ai/transport-types';
import { useExecutionContextStore } from '@/stores/executionContextStore';

/**
 * Payload types for HITL actions
 */
export interface HitlResumePayload {
  decision: HitlDecision;
  feedback?: string;
  content?: HitlGeneratedContent;
  userMessage?: string;
  messages?: StrictTaskMessage[];
  /** The original taskId from when HITL was triggered - required for resume */
  originalTaskId: string;
}

export interface HitlPendingPayload {
  agentSlug?: string;
}

/**
 * Export for type compatibility
 */
export type StrictHitlRequest = StrictA2ARequest;

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
 * HITL request builders
 * All 4 HITL actions from the transport type system
 *
 * **Store-First Approach:** Each method gets context from the store internally.
 * No metadata parameter - only action-specific payload data.
 */
export const hitlBuilder = {
  /**
   * Resume HITL workflow with decision
   *
   * IMPORTANT: originalTaskId must be the taskId returned when HITL was first triggered.
   * This is the thread_id used by LangGraph to checkpoint the workflow state.
   * Using the wrong taskId will create a new execution instead of resuming.
   */
  resume: (payload: HitlResumePayload): StrictA2ARequest => {
    // Get context from store (required for store-first approach, even if not used)
    getContext();
    validateRequired(payload.decision, 'decision');
    validateRequired(payload.originalTaskId, 'originalTaskId');

    // Validate decision-specific requirements
    if (payload.decision === 'regenerate' && !payload.feedback) {
      throw new Error('feedback is required when decision is "regenerate"');
    }
    if (payload.decision === 'replace' && !payload.content) {
      throw new Error('content is required when decision is "replace"');
    }

    // Use the ORIGINAL taskId for LangGraph resume, not the current context's taskId
    const resumeTaskId = payload.originalTaskId;

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'hitl.resume',
      params: {
        mode: 'hitl' as AgentTaskMode,
        taskId: resumeTaskId,
        userMessage: payload.userMessage || `HITL decision: ${payload.decision}`,
        messages: payload.messages || [],
        payload: {
          action: 'resume',
          decision: payload.decision,
          taskId: resumeTaskId,
          ...(payload.feedback && { feedback: payload.feedback }),
          ...(payload.content && { content: payload.content }),
        },
      },
    } as unknown as StrictA2ARequest;
  },

  /**
   * Get current HITL status for a task
   */
  status: (): StrictA2ARequest => {
    const ctx = getContext();

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'hitl.status',
      params: {
        mode: 'hitl' as AgentTaskMode,
        taskId: ctx.taskId,
        userMessage: 'Get HITL status',
        messages: [],
        payload: {
          action: 'status',
        },
      },
    } as unknown as StrictA2ARequest;
  },

  /**
   * Get HITL history for a task
   */
  history: (): StrictA2ARequest => {
    const ctx = getContext();

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'hitl.history',
      params: {
        mode: 'hitl' as AgentTaskMode,
        taskId: ctx.taskId,
        userMessage: 'Get HITL history',
        messages: [],
        payload: {
          action: 'history',
        },
      },
    } as unknown as StrictA2ARequest;
  },

  /**
   * Get all pending HITL reviews
   */
  pending: (payload?: HitlPendingPayload): StrictA2ARequest => {
    const ctx = getContext();

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'hitl.pending',
      params: {
        mode: 'hitl' as AgentTaskMode,
        taskId: ctx.taskId || '',
        userMessage: 'Get pending HITL reviews',
        messages: [],
        payload: {
          action: 'pending',
          ...(payload?.agentSlug && { agentSlug: payload.agentSlug }),
        },
      },
    } as unknown as StrictA2ARequest;
  },
};
