/**
 * ExecutionContext Store
 *
 * The single source of truth for the current execution context in the UI layer.
 * This store manages the "capsule" that flows through the entire A2A system.
 *
 * Key Principles:
 * 1. Context is created once when conversation is selected
 * 2. ExecutionContext (the shared capsule) is immutable and has no product-local fields
 * 3. Product-local fields (taskId, planId, deliverableId) are stored as separate refs
 * 4. All A2A calls get context from this store - never passed as parameters
 * 5. The backend may echo context, but it never replaces the frontend capsule
 *
 * @see docs/prd/unified-a2a-orchestrator.md - ExecutionContext section
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// NIL_UUID constant for optional UUID fields (same value as transport-types)
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Generate a cryptographically secure UUID.
 */
function generateUUID(): string {
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.randomUUID !== 'function'
  ) {
    throw new Error('Secure UUID generation is unavailable');
  }
  return crypto.randomUUID();
}

function freezeContext(context: ExecutionContext): ExecutionContext {
  return Object.freeze(context);
}

/**
 * Parameters for initializing the ExecutionContext
 */
export interface ExecutionContextInitParams {
  orgSlug: string;
  userId: string;
  conversationId: string;
  agentSlug: string;
  agentType: string;
  provider: string;
  model: string;
  sovereignMode?: boolean;
  // Product-local fields — stored separately from ExecutionContext
  taskId?: string;
  planId?: string;
  deliverableId?: string;
}

export const useExecutionContextStore = defineStore('executionContext', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const context = ref<ExecutionContext | null>(null);

  // Product-local fields — not part of the shared ExecutionContext capsule
  const _taskId = ref<string | null>(null);
  const _planId = ref<string | null>(null);
  const _deliverableId = ref<string | null>(null);

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  /**
   * Get current context - throws if not initialized
   * Use this when context is required (most A2A operations)
   */
  const current = computed((): ExecutionContext => {
    if (!context.value) {
      throw new Error(
        'ExecutionContext not initialized. Select a conversation first.',
      );
    }
    return context.value;
  });

  /**
   * Check if context is initialized
   * Use this before operations that need context
   */
  const isInitialized = computed((): boolean => {
    return context.value !== null;
  });

  /**
   * Get context or null (for optional access)
   */
  const contextOrNull = computed((): ExecutionContext | null => {
    return context.value;
  });

  /**
   * Convenience getters for common fields
   */
  const conversationId = computed(() => context.value?.conversationId ?? null);
  const taskId = computed(() => _taskId.value);
  const planId = computed(() => _planId.value);
  const deliverableId = computed(() => _deliverableId.value);
  const agentSlug = computed(() => context.value?.agentSlug ?? null);
  const orgSlug = computed(() => context.value?.orgSlug ?? null);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Create the capsule when conversation is selected.
   * This is the ONLY place the capsule is created on the frontend.
   *
   * @param params - Required context parameters
   */
  function initialize(params: ExecutionContextInitParams): void {
    const taskId = params.taskId ?? generateUUID();
    context.value = freezeContext({
      orgSlug: params.orgSlug,
      userId: params.userId,
      conversationId: params.conversationId,
      agentSlug: params.agentSlug,
      agentType: params.agentType,
      provider: params.provider,
      model: params.model,
      ...(params.sovereignMode === undefined
        ? {}
        : { sovereignMode: params.sovereignMode }),
    });
    // Product-local fields stored separately
    _taskId.value = taskId;
    _planId.value = params.planId ?? NIL_UUID;
    _deliverableId.value = params.deliverableId ?? NIL_UUID;
  }

  /**
   * Generate a new taskId for a new task within the same conversation.
   * Call this before each A2A operation that creates a new task.
   *
   * This enables connecting to the task-specific stream BEFORE making the POST request,
   * ensuring we receive all progress events.
   *
   * @returns The new taskId
   */
  function newTaskId(): string {
    if (!context.value) {
      throw new Error(
        'ExecutionContext not initialized. Select a conversation first.',
      );
    }
    const newId = generateUUID();
    _taskId.value = newId;
    return newId;
  }

  /**
   * Change LLM for "rerun with different model" scenarios.
   * This is the ONLY user-initiated mutation of the context.
   *
   * All other mutations come from backend responses.
   *
   * @param provider - LLM provider (e.g., 'anthropic', 'openai')
   * @param model - Model identifier (e.g., 'llama3.2:1b')
   */
  function setLLM(provider: string, model: string): void {
    if (context.value) {
      context.value = freezeContext({ ...context.value, provider, model });
    }
  }

  /**
   * Update agent information when switching agents within same conversation
   *
   * @param agentSlug - New agent slug
   * @param agentType - New agent type
   */
  function setAgent(agentSlug: string, agentType: string): void {
    if (context.value) {
      context.value = freezeContext({ ...context.value, agentSlug, agentType });
    }
  }

  /**
   * Update conversation ID when switching to a different conversation
   * while keeping other context fields intact
   *
   * @param conversationId - New conversation ID
   */
  function setConversation(conversationId: string): void {
    if (context.value) {
      context.value = freezeContext({ ...context.value, conversationId });
    }
  }

  /**
   * Set sovereign mode flag for the current execution context.
   * When true, only local providers (Ollama) are allowed.
   *
   * @param enabled - Whether sovereign mode is active
   */
  function setSovereignMode(enabled: boolean): void {
    if (context.value) {
      context.value = freezeContext({
        ...context.value,
        sovereignMode: enabled,
      });
    }
  }

  /**
   * Update the product-local planId (not part of ExecutionContext capsule)
   */
  function setPlanId(id: string): void {
    _planId.value = id;
  }

  /**
   * Update the product-local deliverableId (not part of ExecutionContext capsule)
   */
  function setDeliverableId(id: string): void {
    _deliverableId.value = id;
  }

  /**
   * Clear when leaving conversation or logging out
   */
  function clear(): void {
    context.value = null;
    _taskId.value = null;
    _planId.value = null;
    _deliverableId.value = null;
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // Getters (computed)
    current,
    isInitialized,
    contextOrNull,
    conversationId,
    taskId,
    planId,
    deliverableId,
    agentSlug,
    orgSlug,

    // Actions
    initialize,
    setLLM,
    setAgent,
    setConversation,
    setSovereignMode,
    setPlanId,
    setDeliverableId,
    newTaskId,
    clear,
  };
});
