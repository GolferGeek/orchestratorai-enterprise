<script setup lang="ts">
import { onMounted } from 'vue';
import { useMarketPulseStore } from '../../stores/market-pulse.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const store = useMarketPulseStore();

onMounted(async () => {
  await loadData();
});

async function loadData(): Promise<void> {
  try {
    await store.fetchTrending();
  } catch {
    // Error captured in store
  }
}

function directionColor(direction: string): string {
  switch (direction) {
    case 'rising': return 'text-green-400';
    case 'declining': return 'text-red-400';
    default: return 'text-gray-400';
  }
}

function directionBg(direction: string): string {
  switch (direction) {
    case 'rising': return 'bg-green-900/30';
    case 'declining': return 'bg-red-900/30';
    default: return 'bg-gray-800';
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Trending Topics</h1>
      <p class="text-gray-400 text-sm mt-1">Topics gaining momentum across monitored sources</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading trending topics..." />

    <div v-else-if="store.error" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ store.error }}</p>
        <button class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm" @click="loadData">Retry</button>
      </div>
    </div>

    <EmptyState
      v-else-if="store.trending.length === 0"
      title="No Trending Topics"
      message="No trending topics detected"
    />

    <div v-else class="space-y-3">
      <div
        v-for="topic in store.trending"
        :key="topic.id"
        :class="['card', directionBg(topic.direction)]"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h3 class="text-lg font-medium text-gray-200">{{ topic.topic }}</h3>
            <div class="flex items-center gap-3 mt-2">
              <span class="text-sm text-gray-400">{{ topic.relatedArticleCount }} mentions</span>
              <span :class="['text-sm font-medium capitalize', directionColor(topic.direction)]">{{ topic.direction }}</span>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">{{ topic.category }}</span>
            </div>
          </div>
          <span class="text-xs text-gray-400">{{ new Date(topic.firstSeen).toLocaleDateString() }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
