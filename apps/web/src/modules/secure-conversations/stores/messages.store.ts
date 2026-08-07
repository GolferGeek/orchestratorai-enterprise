import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { A2AMessage, A2AMessageFilter } from '../types';
import { useApi } from '../composables/useApi';
import {
  parseA2AMessage,
  parseA2AMessages,
} from '../services/response-validation';

export const useMessagesStore = defineStore('messages', () => {
  const { secureConversationsApi } = useApi();

  const messages = ref<A2AMessage[]>([]);
  const selectedMessage = ref<A2AMessage | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchMessages(filter?: A2AMessageFilter) {
    loading.value = true;
    error.value = null;
    try {
      const params = filter
        ? '?' + new URLSearchParams(
            Object.entries(filter)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          ).toString()
        : '';
      const result = await secureConversationsApi.get<unknown>(`/a2a/messages${params}`);
      messages.value = parseA2AMessages(result);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function selectMessage(id: string) {
    loading.value = true;
    error.value = null;
    try {
      const result = await secureConversationsApi.get<unknown>(`/a2a/messages/${id}`);
      selectedMessage.value = parseA2AMessage(result);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function clearSelection() {
    selectedMessage.value = null;
  }

  return {
    messages, selectedMessage, loading, error,
    fetchMessages, selectMessage, clearSelection,
  };
});
