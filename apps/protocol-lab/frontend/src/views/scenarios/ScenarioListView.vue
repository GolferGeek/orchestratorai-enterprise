<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useScenarioStore } from '../../stores/scenario.store';
import ScenarioCard from '../../components/scenarios/ScenarioCard.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';

const store = useScenarioStore();
const runningAll = ref(false);

onMounted(async () => {
  await Promise.all([store.fetchScenarios(), store.fetchProviders()]);
});

async function handleRunAll(): Promise<void> {
  runningAll.value = true;
  try {
    await store.runAll();
  } finally {
    runningAll.value = false;
  }
}
</script>

<template>
  <div class="space-y-8">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-white">Scenarios</h1>
        <p class="text-gray-400 mt-1">
          Run end-to-end protocol scenarios with per-scenario config overrides.
          Each scenario exercises specific protocol layers across its ecosystem.
        </p>
      </div>
      <button
        class="btn-secondary flex items-center gap-2 whitespace-nowrap flex-shrink-0"
        :disabled="runningAll || store.loading"
        @click="handleRunAll"
      >
        <LoadingSpinner v-if="runningAll" size="sm" />
        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Run All
      </button>
    </div>

    <!-- Error state -->
    <div
      v-if="store.error"
      class="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm"
    >
      {{ store.error }}
    </div>

    <!-- Loading state -->
    <div v-if="store.loading" class="flex justify-center py-12">
      <LoadingSpinner size="lg" label="Loading scenarios..." />
    </div>

    <template v-else>
      <!-- SunStream Ecosystem (ids 1-5) -->
      <section>
        <div class="flex items-center gap-3 mb-4">
          <h2 class="text-lg font-semibold text-white">SunStream Ecosystem</h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-teal-900 text-teal-300 font-medium">
            Scenarios 1–5
          </span>
        </div>
        <div
          v-if="store.sunstreamScenarios.length === 0"
          class="text-gray-500 text-sm py-4"
        >
          No SunStream scenarios loaded.
        </div>
        <div v-else class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <ScenarioCard
            v-for="scenario in store.sunstreamScenarios"
            :key="`sunstream-${scenario.id}`"
            :scenario="scenario"
          />
        </div>
      </section>

      <!-- Ascentek Ecosystem (ids 6-11) -->
      <section>
        <div class="flex items-center gap-3 mb-4">
          <h2 class="text-lg font-semibold text-white">Ascentek Ecosystem</h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-indigo-900 text-indigo-300 font-medium">
            Scenarios 6–11
          </span>
        </div>
        <div
          v-if="store.ascentekScenarios.length === 0"
          class="text-gray-500 text-sm py-4"
        >
          No Ascentek scenarios loaded.
        </div>
        <div v-else class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <ScenarioCard
            v-for="scenario in store.ascentekScenarios"
            :key="`ascentek-${scenario.id}`"
            :scenario="scenario"
          />
        </div>
      </section>
    </template>
  </div>
</template>
