import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { scenariosApi, type ScenarioDescriptor, type ScenarioResult, type PipelineStep } from '@/services/api';
import { useTimelineStore } from './timeline.store';
import { useAscentekStore } from './ascentek.store';
import { useLubeTechStore } from './lube-tech.store';
import { useOemPartnerStore } from './oem-partner.store';
import type { OrgMessage } from './ascentek.store';

export const useScenarioStore = defineStore('scenario', () => {
  const scenarios = ref<ScenarioDescriptor[]>([]);
  const selectedScenarioId = ref<number | null>(null);
  const running = ref<number | null>(null);
  const completed = ref<Set<number>>(new Set());
  const lastResult = ref<ScenarioResult | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const selectedScenario = computed(() =>
    scenarios.value.find((s) => s.id === selectedScenarioId.value) ?? null,
  );

  const isRunning = computed(() => running.value !== null);

  async function fetchScenarios(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      scenarios.value = await scenariosApi.list();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function executeScenario(id: number): Promise<ScenarioResult> {
    running.value = id;
    error.value = null;
    try {
      const result = await scenariosApi.run(id);
      lastResult.value = result;
      completed.value.add(id);
      selectedScenarioId.value = id;

      // Push to timeline
      const timelineStore = useTimelineStore();
      const trace = result.pipelineTrace;
      timelineStore.addMessage({
        id: trace.messageId,
        timestamp: trace.startedAt,
        source: trace.source,
        target: trace.target,
        method: trace.method,
        scenarioId: result.scenario.id,
        scenarioName: result.scenario.name,
        durationMs: trace.totalDurationMs,
        pipelineTrace: trace,
      });
      timelineStore.selectMessage(trace.messageId);

      // Distribute to org panels
      distributeMessages(result.scenario.id, trace.steps);

      return result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      running.value = null;
    }
  }

  function distributeMessages(scenarioId: number, steps: PipelineStep[]): void {
    const ascentekStore = useAscentekStore();
    const lubeTechStore = useLubeTechStore();
    const oemStore = useOemPartnerStore();
    const now = new Date().toISOString();

    steps.forEach((step) => {
      const msg: OrgMessage = {
        id: `${step.stepNumber}-${Date.now()}`,
        timestamp: step.timestamp ?? now,
        direction: 'outbound',
        from: '',
        to: '',
        method: step.label,
        layer: step.layer,
        provider: step.provider,
        summary: step.label,
      };

      if (scenarioId === 6) {
        if (step.stepNumber <= 3) {
          oemStore.addMessage({ ...msg, direction: 'outbound', from: 'OEM', to: 'Ascentek' });
        } else if (step.stepNumber <= 6) {
          ascentekStore.addMessage({ ...msg, direction: 'inbound', from: 'OEM', to: 'Ascentek' });
        } else {
          lubeTechStore.addMessage({ ...msg, direction: 'inbound', from: 'Ascentek', to: 'Lube-Tech' });
        }
      } else if (scenarioId === 7) {
        if (step.stepNumber <= 2) {
          oemStore.addMessage({ ...msg, direction: 'outbound', from: 'OEM', to: 'Ascentek' });
        } else {
          ascentekStore.addMessage({ ...msg, direction: 'inbound', from: 'OEM', to: 'Ascentek' });
        }
      } else if (scenarioId === 8) {
        if (step.stepNumber <= 4) {
          lubeTechStore.addMessage({ ...msg, direction: 'outbound', from: 'Lube-Tech', to: 'Ascentek' });
        } else if (step.stepNumber <= 7) {
          ascentekStore.addMessage({ ...msg, direction: 'inbound', from: 'Lube-Tech', to: 'Ascentek' });
        } else {
          oemStore.addMessage({ ...msg, direction: 'inbound', from: 'Ascentek', to: 'OEM' });
        }
      } else if (scenarioId === 9) {
        if (step.stepNumber <= 3) {
          oemStore.addMessage({ ...msg, direction: 'outbound', from: 'OEM', to: 'Ascentek' });
        } else {
          ascentekStore.addMessage({ ...msg, direction: 'inbound', from: 'OEM', to: 'Ascentek' });
        }
      } else if (scenarioId === 10) {
        if (step.layer === 'trust' || step.provider === 'reputation' || step.provider === 'first-contact') {
          ascentekStore.addMessage({ ...msg, direction: 'inbound', from: 'OEM-New', to: 'Ascentek' });
          oemStore.addMessage({ ...msg, direction: 'outbound', from: 'OEM-New', to: 'Ascentek' });
        } else if (step.stepNumber <= 6) {
          oemStore.addMessage({ ...msg, direction: 'outbound', from: 'OEM-New', to: 'Ascentek' });
        } else {
          ascentekStore.addMessage({ ...msg, direction: 'inbound', from: 'OEM-New', to: 'Ascentek' });
        }
      } else if (scenarioId === 12) {
        if (step.stepNumber <= 2) {
          oemStore.addMessage({ ...msg, direction: 'outbound', from: 'OEM', to: 'Ascentek' });
        } else {
          ascentekStore.addMessage({ ...msg, direction: 'inbound', from: 'OEM', to: 'Ascentek' });
        }
      } else if (scenarioId === 13) {
        if (step.stepNumber <= 2) {
          oemStore.addMessage({ ...msg, direction: 'outbound', from: 'OEM', to: 'Ascentek' });
        } else {
          ascentekStore.addMessage({ ...msg, direction: 'inbound', from: 'OEM', to: 'Ascentek' });
        }
      } else if (scenarioId === 14) {
        if (step.stepNumber <= 2) {
          oemStore.addMessage({ ...msg, direction: 'outbound', from: 'OEM', to: 'Ascentek' });
        } else {
          ascentekStore.addMessage({ ...msg, direction: 'inbound', from: 'OEM', to: 'Ascentek' });
        }
      } else if (scenarioId === 15) {
        if (step.stepNumber <= 2) {
          oemStore.addMessage({ ...msg, direction: 'outbound', from: 'OEM', to: 'Ascentek' });
        } else {
          ascentekStore.addMessage({ ...msg, direction: 'inbound', from: 'OEM', to: 'Ascentek' });
        }
      }
    });
  }

  function selectScenario(id: number): void {
    selectedScenarioId.value = id;
  }

  function clearResult(): void {
    lastResult.value = null;
  }

  return {
    scenarios,
    selectedScenarioId,
    running,
    completed,
    lastResult,
    loading,
    error,
    selectedScenario,
    isRunning,
    fetchScenarios,
    executeScenario,
    selectScenario,
    clearResult,
  };
});
