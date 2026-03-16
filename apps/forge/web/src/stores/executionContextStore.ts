/**
 * ExecutionContext Store
 *
 * The single source of truth for the current execution context in the UI layer.
 * This store manages the "capsule" that flows through the entire A2A system.
 *
 * Key Principles:
 * 1. Context is created once when conversation is selected
 * 2. Context is immutable except for backend updates (planId, deliverableId)
 * 3. All A2A calls get context from this store - never passed as parameters
 * 4. After every A2A response, the store is updated with returned context
 *
 * @see docs/prd/unified-a2a-orchestrator.md - ExecutionContext section
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// NIL_UUID constant for optional UUID fields (same value as transport-types)
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Generate a UUID - polyfill for crypto.randomUUID()
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback implementation for browsers that don't support crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  // Optional: pre-set these if loading existing conversation
  taskId?: string;
  planId?: string;
  deliverableId?: string;
}

export const useExecutionContextStore = defineStore('executionContext', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const context = ref<ExecutionContext | null>(null);

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  /**
   * Get current context - throws if not initialized
   * Use this when context is required (most A2A operations)
   */
  const current = computed((): ExecutionContext => {
    if (!context.value) {
      throw new Error('ExecutionContext not initialized. Select a conversation first.');
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
  const taskId = computed(() => context.value?.taskId ?? null);
  const planId = computed(() => context.value?.planId ?? null);
  const deliverableId = computed(() => context.value?.deliverableId ?? null);
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
    context.value = {
      orgSlug: params.orgSlug,
      userId: params.userId,
      conversationId: params.conversationId,
      agentSlug: params.agentSlug,
      agentType: params.agentType,
      provider: params.provider,
      model: params.model,
      // Generate taskId upfront (like conversationId) so we can connect to stream before POST
      // Backend will use this ID to create the task record
      taskId: params.taskId ?? generateUUID(),
      planId: params.planId ?? NIL_UUID,
      deliverableId: params.deliverableId ?? NIL_UUID,
    };
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
      throw new Error('ExecutionContext not initialized. Select a conversation first.');
    }
    const newId = generateUUID();
    context.value = { ...context.value, taskId: newId };
    return newId;
  }

  /**
   * Replace capsule with one returned from API.
   * Called after EVERY API response - backend may have added planId or deliverableId.
   *
   * This is the ONLY way the context changes after initialization (besides setLLM).
   * The orchestrator never mutates context - it only reads from store and updates after response.
   *
   * @param ctx - The ExecutionContext returned from the API
   */
  function update(ctx: ExecutionContext): void {
    context.value = ctx;
  }

  /**
   * Change LLM for "rerun with different model" scenarios.
   * This is the ONLY user-initiated mutation of the context.
   *
   * All other mutations come from backend responses (planId/deliverableId).
   *
   * @param provider - LLM provider (e.g., 'anthropic', 'openai')
   * @param model - Model identifier (e.g., 'llama3.2:1b')
   */
  function setLLM(provider: string, model: string): void {
    if (context.value) {
      context.value = { ...context.value, provider, model };
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
      context.value = { ...context.value, agentSlug, agentType };
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
      context.value = { ...context.value, conversationId };
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
      context.value = { ...context.value, sovereignMode: enabled };
    }
  }

  /**
   * Clear when leaving conversation or logging out
   */
  function clear(): void {
    context.value = null;
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
    update,
    setLLM,
    setAgent,
    setConversation,
    setSovereignMode,
    newTaskId,
    clear,
  };
});
