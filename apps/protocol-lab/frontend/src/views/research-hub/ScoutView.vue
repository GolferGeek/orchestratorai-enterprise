<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useResearchHubStore } from '../../stores/research-hub.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const store = useResearchHubStore();

async function retry() {
  await store.fetchScoutSignals();
}

onMounted(async () => {
  await retry();
});

const isEmpty = computed(() => !store.loading && !store.error && store.scoutSignals.length === 0);

function relevanceColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-yellow-400';
  return 'text-gray-400';
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Scout Watchlist</h1>
      <p class="text-gray-400 text-sm mt-1">Detected signals matching your research interests</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading scout signals..." class="py-16" />

    <div v-else-if="store.error" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ store.error }}</p>
        <button
          class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          @click="retry"
        >
          Retry
        </button>
      </div>
    </div>

    <EmptyState
      v-else-if="isEmpty"
      title="No Signals"
      message="No emerging signals detected. Signals will appear when the Research Hub backend is actively monitoring."
      icon="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />

    <div v-else class="space-y-3">
      <div
        v-for="signal in store.scoutSignals"
        :key="signal.id"
        class="card"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h3 class="text-sm font-medium text-gray-200">{{ signal.title }}</h3>
            <div class="flex items-center gap-3 mt-2">
              <span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">{{ signal.category }}</span>
              <span class="text-xs text-gray-400">{{ signal.source }}</span>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span :class="['text-sm font-semibold', relevanceColor(signal.signalStrength)]">
              {{ signal.signalStrength }}%
            </span>
            <span class="text-xs text-gray-400">{{ new Date(signal.detectedAt).toLocaleString() }}</span>
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-2 line-clamp-2">{{ signal.description }}</p>
        <p class="text-xs text-gray-500 mt-1 italic">{{ signal.recommendedAction }}</p>
      </div>
    </div>
  </div>
</template>
