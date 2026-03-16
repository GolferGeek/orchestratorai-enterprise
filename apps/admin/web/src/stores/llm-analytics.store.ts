/**
 * LLM Analytics Store
 * State management for LLM usage, models, and costs — state ONLY, no async calls.
 * Service layer calls store mutations after API success.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { LlmUsageSummary, LlmModel, LlmCostSummary } from '@/services/admin-api.service';

export const useLlmAnalyticsStore = defineStore('llm-analytics', () => {
  // ===================== State =====================
  const usageData = ref<LlmUsageSummary[]>([]);
  const models = ref<LlmModel[]>([]);
  const costs = ref<LlmCostSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ===================== Mutations =====================
  function setUsageData(data: LlmUsageSummary[]) {
    usageData.value = data;
  }

  function setModels(data: LlmModel[]) {
    models.value = data;
  }

  function setCosts(data: LlmCostSummary[]) {
    costs.value = data;
  }

  function setLoading(val: boolean) {
    loading.value = val;
  }

  function setError(msg: string | null) {
    error.value = msg;
  }

  function reset() {
    usageData.value = [];
    models.value = [];
    costs.value = [];
    loading.value = false;
    error.value = null;
  }

  return {
    usageData,
    models,
    costs,
    loading,
    error,
    setUsageData,
    setModels,
    setCosts,
    setLoading,
    setError,
    reset,
  };
});
