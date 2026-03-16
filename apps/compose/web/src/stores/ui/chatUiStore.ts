/**
 * Chat UI Store
 * Manages UI-only state for chat interface
 *
 * This store contains ONLY UI state - no domain data.
 * Domain data (conversations, messages, tasks) lives in domain stores.
 *
 * Architecture:
 * - UI State ONLY (no domain data)
 * - Synchronous mutations only
 * - No API calls, no business logic
 * - Vue reactivity updates UI automatically
 */

import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import { useConversationsStore } from '../conversationsStore';
import { useExecutionContextStore } from '../executionContextStore';
import { useAuthStore } from '../rbacStore';
// llmPreferencesStore removed in Compose — provider/model come from agent API metadata
import type { JsonObject } from '@/types';
import type { ExecutionMode } from '@/types/conversation';

// ============================================================================
// Types
// ============================================================================

/**
 * Chat mode for conversation
 */
export type ChatMode = 'converse' | 'plan' | 'build';

/**
 * Pending action in UI
 */
export interface PendingAction {
  type: 'plan' | 'build';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  conversationId?: string;
  metadata?: JsonObject;
}

const isJsonObject = (value: unknown): value is JsonObject => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const sanitizePendingAction = (
  action: PendingAction | null,
): PendingAction | null => {
  if (!action) {
    return null;
  }

  const metadata = action.metadata;
  return {
    ...action,
    metadata: metadata && isJsonObject(metadata) ? metadata : undefined,
  };
};

// ============================================================================
// Store Definition
// ============================================================================

export const useChatUiStore = defineStore('chatUi', () => {
  // ============================================================================
  // STATE - UI-only reactive data
  // ============================================================================

  const activeConversationId = ref<string | null>(null);
  const openConversationTabs = ref<string[]>([]); // Array of open conversation tab IDs
  const pendingAction = ref<PendingAction | null>(null);
  const chatMode = ref<ChatMode>('converse');
  const lastMessageWasSpeech = ref(false);

  // Message sending state
  const isSendingMessage = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // UI layout state
  const sidebarCollapsed = ref(false);
  const rightPanelVisible = ref(true);
  const inputFocused = ref(false);

  // ============================================================================
  // GETTERS - Computed UI state
  // ============================================================================

  const hasActiveConversation = computed(() => activeConversationId.value !== null);

  /**
   * Get active conversation object from conversationsStore
   */
  const activeConversation = computed(() => {
    if (!activeConversationId.value) return null;
    const conversationsStore = useConversationsStore();
    return conversationsStore.conversationById(activeConversationId.value);
  });

  const hasPendingAction = computed(() => pendingAction.value !== null);

  const isPendingActionInProgress = computed(() =>
    pendingAction.value?.status === 'in_progress'
  );

  const isConversationalMode = computed(() => chatMode.value === 'converse');
  const isPlanMode = computed(() => chatMode.value === 'plan');
  const isBuildMode = computed(() => chatMode.value === 'build');

  /**
   * Get effective execution mode for active conversation
   * Prefers 'real-time' (SSE streaming) if available, then falls back to first supported mode
   */
  const effectiveExecutionMode = computed(() => {
    const currentMode = activeConversation.value?.executionMode;
    const supportedModes = activeConversation.value?.supportedExecutionModes || [];
    const isOverride = activeConversation.value?.isExecutionModeOverride;

    // If user explicitly overrode the mode, respect it
    if (isOverride && currentMode) {
      return currentMode;
    }

    // If mode is already set, use it
    if (currentMode) {
      if (!isOverride && currentMode === 'immediate') {
        if (supportedModes.includes('auto')) {
          return 'auto';
        }
        if (supportedModes.includes('real-time')) {
          return 'real-time';
        }
      }
      return currentMode;
    }

    const priority: ExecutionMode[] = ['auto', 'real-time', 'polling', 'immediate'];
    const preferred = priority.find((mode) => supportedModes.includes(mode));

    // Fall back to first supported mode or 'immediate'
    return preferred || supportedModes[0] || 'immediate';
  });

  /**
   * Get execution mode (alias for compatibility)
   */
  const executionMode = computed(() => {
    return effectiveExecutionMode.value;
  });

  // ============================================================================
  // MUTATIONS - ONLY way to mutate state (synchronous only)
  // ============================================================================

  /**
   * Set active conversation
   */
  function setActiveConversation(conversationId: string | null): void {
    activeConversationId.value = conversationId;

    // Add to open tabs if not already there
    if (conversationId && !openConversationTabs.value.includes(conversationId)) {
      openConversationTabs.value.push(conversationId);
    }

    // Set chat mode based on conversation's allowed modes
    if (conversationId) {
      const conversationsStore = useConversationsStore();
      const conversation = conversationsStore.conversationById(conversationId);
      if (conversation?.allowedChatModes) {
        // Filter to only primary chat modes (converse, plan, build)
        const primaryModes = conversation.allowedChatModes.filter(
          (mode): mode is ChatMode => mode === 'converse' || mode === 'plan' || mode === 'build'
        );

        // Prefer 'converse' if available, otherwise use first primary mode
        const preferredMode = primaryModes.includes('converse')
          ? 'converse'
          : primaryModes[0];
        if (preferredMode && preferredMode !== chatMode.value) {
          chatMode.value = preferredMode;
        }
      }

      // Initialize ExecutionContext when conversation is selected
      if (conversation) {
        const executionContextStore = useExecutionContextStore();
        const authStore = useAuthStore();

        // Get agent info from conversation
        const agentSlug = conversation.agentName || conversation.agent?.name || 'unknown';
        const agentType = conversation.agentType || conversation.agent?.type || 'context';

        // Use conversation's organization (from agent) if available, otherwise fall back to user's current org
        const agentOrgSlug = conversation.organizationSlug || conversation.agent?.organizationSlug;
        const resolvedOrgSlug = agentOrgSlug || authStore.currentOrganization;
        if (!resolvedOrgSlug) {
          throw new Error('Cannot initialize ExecutionContext: no organization selected');
        }
        const orgSlug: string = resolvedOrgSlug;

        // Provider/model: Compose uses env-configured defaults; overridden by agent API metadata
        const provider = import.meta.env.VITE_DEFAULT_PROVIDER || 'anthropic';
        const model = import.meta.env.VITE_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022';

        executionContextStore.initialize({
          orgSlug,
          userId: authStore.user?.id || 'anonymous',
          conversationId,
          agentSlug,
          agentType,
          provider,
          model,
        });
      }
    } else {
      // Clear ExecutionContext when no conversation is selected
      const executionContextStore = useExecutionContextStore();
      executionContextStore.clear();
    }
  }

  /**
   * Open conversation tab
   */
  function openConversationTab(conversationId: string): void {
    if (!openConversationTabs.value.includes(conversationId)) {
      openConversationTabs.value.push(conversationId);
    }
    setActiveConversation(conversationId);
  }

  /**
   * Close conversation tab
   */
  function closeConversationTab(conversationId: string): void {
    const index = openConversationTabs.value.indexOf(conversationId);
    if (index > -1) {
      // Create a new array to trigger Vue reactivity
      openConversationTabs.value = openConversationTabs.value.filter(id => id !== conversationId);
    }

    // If closing active tab, switch to another open tab or null
    if (activeConversationId.value === conversationId) {
      if (openConversationTabs.value.length > 0) {
        // Switch to the last tab
        activeConversationId.value = openConversationTabs.value[openConversationTabs.value.length - 1];
      } else {
        activeConversationId.value = null;
      }
    }
  }

  /**
   * Set pending action
   */
  function setPendingAction(action: PendingAction | null): void {
    pendingAction.value = sanitizePendingAction(action);
  }

  /**
   * Update pending action status
   */
  function updatePendingActionStatus(status: PendingAction['status']): void {
    if (pendingAction.value) {
      pendingAction.value = {
        ...pendingAction.value,
        status,
      };
    }
  }

  /**
   * Clear pending action
   */
  function clearPendingAction(): void {
    pendingAction.value = null;
  }

  /**
   * Set chat mode
   */
  function setChatMode(mode: ChatMode): void {
    chatMode.value = mode;
  }

  /**
   * Set last message was speech flag
   */
  function setLastMessageWasSpeech(wasSpeech: boolean): void {
    lastMessageWasSpeech.value = wasSpeech;
  }

  /**
   * Toggle sidebar collapsed state
   */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  /**
   * Set sidebar collapsed state
   */
  function setSidebarCollapsed(collapsed: boolean): void {
    sidebarCollapsed.value = collapsed;
  }

  /**
   * Toggle right panel visibility
   */
  function toggleRightPanel(): void {
    rightPanelVisible.value = !rightPanelVisible.value;
  }

  /**
   * Set right panel visibility
   */
  function setRightPanelVisible(visible: boolean): void {
    rightPanelVisible.value = visible;
  }

  /**
   * Set input focused state
   */
  function setInputFocused(focused: boolean): void {
    inputFocused.value = focused;
  }

  /**
   * Set sending message state
   */
  function setIsSendingMessage(sending: boolean): void {
    isSendingMessage.value = sending;
  }

  /**
   * Set execution mode for active conversation
   */
  function setExecutionMode(mode: ExecutionMode): void {
    if (!activeConversationId.value) return;

    const conversationsStore = useConversationsStore();

    // Use store mutation to trigger reactivity
    conversationsStore.updateConversation(activeConversationId.value, {
      executionMode: mode,
      isExecutionModeOverride: true,
    });
  }

  /**
   * Reset execution mode to default for active conversation
   */
  function resetExecutionMode(): void {
    if (!activeConversationId.value) return;

    const conversationsStore = useConversationsStore();
    const conversation = conversationsStore.conversationById(activeConversationId.value);

    if (conversation) {
      // Reset to preferred mode (real-time if available, otherwise first supported mode)
      const supportedModes = conversation.supportedExecutionModes || [];
      const priority: ExecutionMode[] = ['auto', 'real-time', 'polling', 'immediate'];
      const defaultMode =
        priority.find((mode) => supportedModes.includes(mode)) ||
        supportedModes[0] ||
        'immediate';

      conversationsStore.updateConversation(activeConversationId.value, {
        executionMode: defaultMode,
        isExecutionModeOverride: false,
      });
    }
  }

  /**
   * Set loading state
   */
  function setIsLoading(loading: boolean): void {
    isLoading.value = loading;
  }

  /**
   * Set error
   */
  function setError(errorMessage: string | null): void {
    error.value = errorMessage;
  }

  /**
   * Clear all UI state (logout or reset)
   */
  function clearAll(): void {
    activeConversationId.value = null;
    openConversationTabs.value = [];
    pendingAction.value = null;
    chatMode.value = 'converse';
    lastMessageWasSpeech.value = false;
    isSendingMessage.value = false;
    isLoading.value = false;
    error.value = null;
    sidebarCollapsed.value = false;
    rightPanelVisible.value = true;
    inputFocused.value = false;
  }

  // ============================================================================
  // RETURN PUBLIC API
  // ============================================================================

  return {
    // State (read-only exposure)
    activeConversationId: readonly(activeConversationId),
    openConversationTabs: readonly(openConversationTabs),
    pendingAction: readonly(pendingAction),
    chatMode: readonly(chatMode),
    lastMessageWasSpeech: readonly(lastMessageWasSpeech),
    isSendingMessage: readonly(isSendingMessage),
    isLoading: readonly(isLoading),
    error: readonly(error),
    sidebarCollapsed: readonly(sidebarCollapsed),
    rightPanelVisible: readonly(rightPanelVisible),
    inputFocused: readonly(inputFocused),

    // Computed getters
    hasActiveConversation,
    activeConversation,
    hasPendingAction,
    isPendingActionInProgress,
    isConversationalMode,
    isPlanMode,
    isBuildMode,
    effectiveExecutionMode,
    executionMode,

    // Mutations
    setActiveConversation,
    openConversationTab,
    closeConversationTab,
    setPendingAction,
    updatePendingActionStatus,
    clearPendingAction,
    setChatMode,
    setLastMessageWasSpeech,
    setIsSendingMessage,
    setIsLoading,
    setError,
    toggleSidebar,
    setSidebarCollapsed,
    toggleRightPanel,
    setRightPanelVisible,
    setInputFocused,
    setExecutionMode,
    resetExecutionMode,
    clearAll,
  };
});
