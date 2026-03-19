import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AgentInfo } from '../types';
import { useApi } from '../composables/useApi';

export const useAgentsStore = defineStore('agents', () => {
  const { protocolApi } = useApi();

  const agents = ref<AgentInfo[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchAgents() {
    loading.value = true;
    error.value = null;
    try {
      const result = await protocolApi.get<AgentInfo[]>('/api/agents');
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
      const agent = await protocolApi.post<AgentInfo>('/api/agents/discover', { url });
      agents.value.push(agent);
      return agent;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function refreshStatuses() {
    try {
      const result = await protocolApi.get<AgentInfo[]>('/api/agents');
      agents.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  return { agents, loading, error, fetchAgents, discoverAgent, refreshStatuses };
});
