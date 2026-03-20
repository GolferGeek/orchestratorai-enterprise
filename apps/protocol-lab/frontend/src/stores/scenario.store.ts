import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ProtocolConfig } from '../types';
import { useApi } from '../composables/useApi';

export interface ScenarioDescriptor {
  id: number;
  name: string;
  description: string;
  providers: string[];
  defaultConfig: Partial<ProtocolConfig>;
  ecosystem: 'buildwell' | 'prairie-ridge';
}

export interface ScenarioRunResult {
  scenario: ScenarioDescriptor;
  result: Record<string, unknown>;
  pipelineTrace: unknown;
  effectiveConfig: ProtocolConfig;
  messageId?: string;
}

export const useScenarioStore = defineStore('scenario', () => {
  const { buildwellApi, prairieRidgeApi, protocolApi } = useApi();

  const scenarios = ref<ScenarioDescriptor[]>([]);
  const scenarioConfigs = ref<Record<number, Partial<ProtocolConfig>>>({});
  const availableProviders = ref<Record<string, string[]>>({});
  const runResults = ref<Record<number, ScenarioRunResult>>({});
  const runningScenario = ref<number | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const buildwellScenarios = computed(() =>
    scenarios.value.filter((s) => s.ecosystem === 'buildwell'),
  );

  const prairieRidgeScenarios = computed(() =>
    scenarios.value.filter((s) => s.ecosystem === 'prairie-ridge'),
  );

  async function fetchScenarios(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [buildwellList, prairieRidgeList] = await Promise.all([
        buildwellApi.get<Omit<ScenarioDescriptor, 'ecosystem'>[]>('/scenarios/list'),
        prairieRidgeApi.get<Omit<ScenarioDescriptor, 'ecosystem'>[]>('/scenarios/list'),
      ]);

      const tagged: ScenarioDescriptor[] = [
        ...buildwellList.map((s) => ({ ...s, ecosystem: 'buildwell' as const })),
        ...prairieRidgeList.map((s) => ({ ...s, ecosystem: 'prairie-ridge' as const })),
      ];

      // Deduplicate by id+ecosystem — scenario 11 appears in both ecosystems
      // Keep both since they can be run independently
      scenarios.value = tagged;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchProviders(): Promise<void> {
    const result = await protocolApi.get<Record<string, string[]>>('/api/protocol/providers');
    availableProviders.value = result;
  }

  function getEffectiveConfig(scenarioId: number): Partial<ProtocolConfig> {
    const scenario = scenarios.value.find((s) => s.id === scenarioId);
    const defaults = scenario?.defaultConfig ?? {};
    const overrides = scenarioConfigs.value[scenarioId] ?? {};
    return { ...defaults, ...overrides };
  }

  function setScenarioConfig(
    scenarioId: number,
    layer: keyof ProtocolConfig,
    providerId: string,
  ): void {
    const current = scenarioConfigs.value[scenarioId] ?? {};
    scenarioConfigs.value[scenarioId] = { ...current, [layer]: providerId };
  }

  function resetScenarioConfig(scenarioId: number): void {
    delete scenarioConfigs.value[scenarioId];
  }

  async function runScenario(scenarioId: number): Promise<ScenarioRunResult> {
    const scenario = scenarios.value.find((s) => s.id === scenarioId);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }

    runningScenario.value = scenarioId;
    error.value = null;
    try {
      const config = scenarioConfigs.value[scenarioId];
      const body = config ? { config } : {};

      const api = scenario.ecosystem === 'buildwell' ? buildwellApi : prairieRidgeApi;
      const result = await api.post<ScenarioRunResult>(`/scenarios/run/${scenarioId}`, body);

      runResults.value[scenarioId] = result;
      return result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      runningScenario.value = null;
    }
  }

  async function runAll(): Promise<void> {
    for (const scenario of scenarios.value) {
      try {
        await runScenario(scenario.id);
      } catch {
        // Individual failures captured in error; continue running remaining scenarios
      }
    }
  }

  return {
    scenarios,
    buildwellScenarios,
    prairieRidgeScenarios,
    scenarioConfigs,
    availableProviders,
    runResults,
    runningScenario,
    loading,
    error,
    fetchScenarios,
    fetchProviders,
    getEffectiveConfig,
    setScenarioConfig,
    resetScenarioConfig,
    runScenario,
    runAll,
  };
});
