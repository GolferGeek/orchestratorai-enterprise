import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ProtocolMessage, MessageFilter } from '../types';
import { useApi } from '../composables/useApi';

export const useMessagesStore = defineStore('messages', () => {
  const { bridgeApi } = useApi();

  const messages = ref<ProtocolMessage[]>([]);
  const selectedMessage = ref<ProtocolMessage | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchMessages(filter?: MessageFilter) {
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
      const result = await bridgeApi.get<{ messages: ProtocolMessage[]; total: number } | ProtocolMessage[]>(`/messages${params}`);
      messages.value = Array.isArray(result) ? result : result.messages;
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
      const result = await bridgeApi.get<ProtocolMessage>(`/messages/${id}`);
      selectedMessage.value = result;
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
