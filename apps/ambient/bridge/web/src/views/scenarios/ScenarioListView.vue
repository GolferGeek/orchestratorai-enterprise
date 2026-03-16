<script setup lang="ts">
import { ref, onMounted } from 'vue';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:6600';

interface ScenarioStep {
  step: number;
  name: string;
  description: string;
  action: string;
}

interface Scenario {
  id: string;
  name: string;
  description: string;
  steps: ScenarioStep[];
  expectedOutcomes: string[];
  securityLayer: string;
}

const scenarios = ref<Scenario[]>([]);
const selected = ref<Scenario | null>(null);
const loading = ref(false);
const error = ref('');

onMounted(async () => {
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/training/scenarios`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    scenarios.value = await res.json() as Scenario[];
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});

async function loadScenario(id: string) {
  try {
    const res = await fetch(`${API_BASE}/training/scenarios/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    selected.value = await res.json() as Scenario;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Guided Scenarios</h1>
      <p class="text-gray-400 text-sm mt-1">Step-by-step walkthroughs for external A2A protocol flows</p>
    </div>

    <div v-if="error" class="bg-red-950/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">
      {{ error }}
    </div>

    <div v-if="loading" class="text-gray-400 text-sm">Loading scenarios...</div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <button
        v-for="scenario in scenarios"
        :key="scenario.id"
        class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-blue-500 transition-colors"
        :class="selected?.id === scenario.id ? 'border-blue-500' : ''"
        @click="loadScenario(scenario.id)"
      >
        <h3 class="text-sm font-medium text-white mb-1">{{ scenario.name }}</h3>
        <p class="text-xs text-gray-400">{{ scenario.description }}</p>
        <div class="mt-2 flex items-center gap-2">
          <span class="text-xs text-blue-400">{{ scenario.steps?.length ?? 0 }} steps</span>
          <span v-if="scenario.securityLayer" class="text-xs text-yellow-400">{{ scenario.securityLayer }}</span>
        </div>
      </button>
    </div>

    <div v-if="selected" class="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-white">{{ selected.name }}</h2>
        <p class="text-sm text-gray-400 mt-1">{{ selected.description }}</p>
      </div>

      <div>
        <h3 class="text-sm font-medium text-gray-300 mb-3">Steps</h3>
        <div class="space-y-3">
          <div
            v-for="step in selected.steps"
            :key="step.step"
            class="flex gap-3"
          >
            <div class="w-6 h-6 bg-blue-700 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0">
              {{ step.step }}
            </div>
            <div>
              <p class="text-sm font-medium text-gray-200">{{ step.name }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ step.description }}</p>
              <code class="text-xs text-blue-300 font-mono">{{ step.action }}</code>
            </div>
          </div>
        </div>
      </div>

      <div v-if="selected.expectedOutcomes?.length">
        <h3 class="text-sm font-medium text-gray-300 mb-2">Expected Outcomes</h3>
        <ul class="space-y-1">
          <li
            v-for="(outcome, i) in selected.expectedOutcomes"
            :key="i"
            class="text-xs text-gray-400 flex items-start gap-2"
          >
            <span class="text-green-400 flex-shrink-0">+</span>
            {{ outcome }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
