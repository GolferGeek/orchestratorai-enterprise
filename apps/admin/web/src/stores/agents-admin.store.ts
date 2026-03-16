/**
 * Agents Admin Store
 * State management for the agent registry — state ONLY, no async calls.
 * Service layer calls store mutations after API success.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AgentRegistryEntry, AgentDetail } from '@/services/admin-api.service';

export const useAgentsAdminStore = defineStore('agents-admin', () => {
  // ===================== State =====================
  const agents = ref<AgentRegistryEntry[]>([]);
  const selectedAgent = ref<AgentDetail | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ===================== Mutations =====================
  function setAgents(data: AgentRegistryEntry[]) {
    agents.value = data;
  }

  function setSelectedAgent(agent: AgentDetail | null) {
    selectedAgent.value = agent;
  }

  function setLoading(val: boolean) {
    loading.value = val;
  }

  function setError(msg: string | null) {
    error.value = msg;
  }

  function reset() {
    agents.value = [];
    selectedAgent.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    agents,
    selectedAgent,
    loading,
    error,
    setAgents,
    setSelectedAgent,
    setLoading,
    setError,
    reset,
  };
});
