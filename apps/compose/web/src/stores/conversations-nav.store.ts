/**
 * Conversations Nav Store
 *
 * Manages the conversation list shown in the left sidebar.
 * Distinct from conversationsStore.ts which manages active conversation messages.
 *
 * State ONLY — no async in mutations.
 * fetchConversations() calls the API and then calls mutations.
 *
 * Three-layer architecture:
 *   AgentNavTree → conversationsNavStore → composeApiService → Compose API
 */

import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import { composeApiService } from '@/services/compose-api.service';
import type { ConversationNavItem } from '@/services/compose-api.service';

export type { ConversationNavItem };

export const useConversationsNavStore = defineStore('conversations-nav', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const conversations = ref<ConversationNavItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ============================================================================
  // GETTERS
  // ============================================================================

  /**
   * Returns conversations for a specific agent slug (matched by agentName field).
   */
  const conversationsForAgent = computed(() => (agentSlug: string) => {
    return conversations.value.filter((c) => c.agentName === agentSlug);
  });

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Fetch conversations for the authenticated user from the Compose API.
   * User is identified from the JWT token — no userId parameter needed.
   */
  async function fetchConversations(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const items = await composeApiService.fetchConversations();
      conversations.value = items;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Remove a conversation from local state after deletion.
   */
  function removeConversation(id: string): void {
    conversations.value = conversations.value.filter((c) => c.id !== id);
  }

  /**
   * Clear all conversations (on sign-out).
   */
  function clearAll(): void {
    conversations.value = [];
    error.value = null;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    conversations: readonly(conversations),
    loading: readonly(loading),
    error: readonly(error),
    conversationsForAgent,
    fetchConversations,
    removeConversation,
    clearAll,
  };
});
