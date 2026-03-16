import { defineStore } from 'pinia';
import { ref, onUnmounted } from 'vue';
import type { AgentInfo, A2AMessage, A2AMessageFilter, MessageStats } from '../types';
import { useApi } from '../composables/useApi';

export const useAgentsStore = defineStore('agents', () => {
  const { bridgeApi } = useApi();

  // Agent registry state
  const agents = ref<AgentInfo[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // A2A message log state
  const messages = ref<A2AMessage[]>([]);
  const messagesLoading = ref(false);
  const messagesError = ref<string | null>(null);

  // Aggregate stats state
  const stats = ref<MessageStats | null>(null);
  const statsLoading = ref(false);
  const statsError = ref<string | null>(null);

  // Auto-refresh interval handle
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ---------------------------------------------------------------------------
  // Agent actions
  // ---------------------------------------------------------------------------

  async function fetchAgents() {
    loading.value = true;
    error.value = null;
    try {
      const result = await bridgeApi.get<AgentInfo[]>('/registry/agents');
      agents.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function discoverAgent(url: string) {
    loading.value = true;
    error.value = null;
    try {
      const agent = await bridgeApi.post<AgentInfo>('/registry/agents/discover', { url });
      agents.value.push(agent);
      return agent;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function removeAgent(id: string) {
    loading.value = true;
    error.value = null;
    try {
      await bridgeApi.del(`/registry/agents/${id}`);
      agents.value = agents.value.filter((a) => (a as unknown as { id: string }).id !== id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function refreshStatuses() {
    try {
      const result = await bridgeApi.get<AgentInfo[]>('/registry/agents');
      agents.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Message log actions
  // ---------------------------------------------------------------------------

  async function fetchMessages(filters?: A2AMessageFilter) {
    messagesLoading.value = true;
    messagesError.value = null;
    try {
      const params = filters
        ? '?' + new URLSearchParams(
            Object.entries(filters)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => [k, String(v)])
          ).toString()
        : '';
      const result = await bridgeApi.get<A2AMessage[]>(`/a2a/messages${params}`);
      messages.value = result;
    } catch (e) {
      messagesError.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      messagesLoading.value = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Stats actions
  // ---------------------------------------------------------------------------

  async function fetchMessageStats() {
    statsLoading.value = true;
    statsError.value = null;
    try {
      const result = await bridgeApi.get<MessageStats>('/a2a/messages/stats');
      stats.value = result;
    } catch (e) {
      statsError.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      statsLoading.value = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-refresh — polls agents + stats every 30 seconds
  // ---------------------------------------------------------------------------

  function startAutoRefresh() {
    if (refreshTimer !== null) return;
    refreshTimer = setInterval(() => {
      void refreshStatuses();
      void fetchMessageStats();
    }, 30_000);
  }

  function stopAutoRefresh() {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // Clean up if the store is destroyed (component teardown)
  onUnmounted(stopAutoRefresh);

  return {
    // Agent registry
    agents,
    loading,
    error,
    fetchAgents,
    discoverAgent,
    removeAgent,
    refreshStatuses,
    // Message log
    messages,
    messagesLoading,
    messagesError,
    fetchMessages,
    // Stats
    stats,
    statsLoading,
    statsError,
    fetchMessageStats,
    // Auto-refresh
    startAutoRefresh,
    stopAutoRefresh,
  };
});
