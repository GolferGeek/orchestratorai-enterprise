import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { TrustInfo } from '../types';
import { useApi } from '../composables/useApi';

export const useTrustStore = defineStore('trust', () => {
  const { protocolApi } = useApi();

  const trustScores = ref<Record<string, TrustInfo>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchTrustScore(agentId: string) {
    loading.value = true;
    error.value = null;
    try {
      const result = await protocolApi.get<TrustInfo>(`/api/trust/${agentId}`);
      trustScores.value[agentId] = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchAllTrustScores() {
    loading.value = true;
    error.value = null;
    try {
      const result = await protocolApi.get<TrustInfo[]>('/api/trust');
      for (const trust of result) {
        trustScores.value[trust.agentId] = trust;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return { trustScores, loading, error, fetchTrustScore, fetchAllTrustScores };
});
