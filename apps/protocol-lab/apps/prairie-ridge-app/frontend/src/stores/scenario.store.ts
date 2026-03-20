import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ScenarioDefinition, ScenarioResult } from '@/types';
import { fetchScenarios, runScenario } from '@/services/api';
import { useTimelineStore } from './timeline.store';

export const useScenarioStore = defineStore('scenario', () => {
  const scenarios = ref<ScenarioDefinition[]>([]);
  const selectedScenarioId = ref<number | null>(null);
  const running = ref<number | null>(null);
  const completed = ref<Set<number>>(new Set());
  const lastResult = ref<ScenarioResult | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadScenarios() {
    loading.value = true;
    error.value = null;
    try {
      scenarios.value = await fetchScenarios();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function executeScenario(id: number) {
    running.value = id;
    error.value = null;
    try {
      const result = await runScenario(id);
      lastResult.value = result;
      completed.value.add(id);
      selectedScenarioId.value = id;

      // Push to timeline store
      const timeline = useTimelineStore();
      timeline.addFromScenarioResult(result);

      return result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      running.value = null;
    }
  }

  function selectScenario(id: number) {
    selectedScenarioId.value = id;
  }

  return {
    scenarios,
    selectedScenarioId,
    running,
    completed,
    lastResult,
    loading,
    error,
    loadScenarios,
    executeScenario,
    selectScenario,
  };
});
