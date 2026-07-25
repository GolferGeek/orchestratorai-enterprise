/**
 * Conversations Nav Store
 *
 * Manages the conversation list shown in the left sidebar.
 * Distinct from conversation.store.ts which manages active conversation messages.
 *
 * State ONLY — no async in mutations.
 * fetchConversations() calls the API and then calls mutations.
 */

import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import {
  agentsApiService,
  type ConversationNavItem,
} from '@/modules/agents/services/agents-api.service';

export type { ConversationNavItem };

export const useConversationsNavStore = defineStore('conversations-nav', () => {
  const conversations = ref<ConversationNavItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const conversationsForAgent = computed(() => (agentSlug: string) =>
    conversations.value.filter((c) => c.agentName === agentSlug),
  );

  async function fetchConversations(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      conversations.value = await agentsApiService.fetchConversations();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function removeConversation(id: string): void {
    conversations.value = conversations.value.filter((c) => c.id !== id);
  }

  function clearAll(): void {
    conversations.value = [];
    error.value = null;
  }

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
