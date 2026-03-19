<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useMarketPulseStore } from '../../stores/market-pulse.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const router = useRouter();
const store = useMarketPulseStore();

onMounted(async () => {
  await loadData();
});

async function loadData(): Promise<void> {
  try {
    await Promise.all([
      store.fetchFeeds(),
      store.fetchTrending(),
      store.fetchQueue(),
    ]);
  } catch {
    // Errors captured in store
  }
}

const isEmpty = computed(
  () => store.feeds.length === 0 && store.trending.length === 0 && store.queue.length === 0,
);

function navigateTo(path: string) {
  router.push(path);
}

function directionColor(direction: string): string {
  switch (direction) {
    case 'rising': return 'text-green-400';
    case 'declining': return 'text-red-400';
    default: return 'text-gray-400';
  }
}

function directionArrow(direction: string): string {
  switch (direction) {
    case 'rising': return '\u2191';
    case 'declining': return '\u2193';
    default: return '\u2192';
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">MarketPulse</h1>
      <p class="text-gray-400 text-sm mt-1">Real-time market intelligence and trend monitoring</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading dashboard..." />

    <div v-else-if="store.error" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ store.error }}</p>
        <button class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm" @click="loadData">Retry</button>
      </div>
    </div>

    <EmptyState
      v-else-if="isEmpty"
      title="No Data"
      message="No market data available yet"
    />

    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          class="card hover:border-protocol-primary transition-colors cursor-pointer"
          @click="navigateTo('/apps/market-pulse/feeds')"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-blue-900/50 flex items-center justify-center">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-white">{{ store.feeds.length }}</p>
              <p class="text-xs text-gray-400">Active Feeds</p>
            </div>
          </div>
        </div>

        <div
          class="card hover:border-protocol-primary transition-colors cursor-pointer"
          @click="navigateTo('/apps/market-pulse/trending')"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-green-900/50 flex items-center justify-center">
              <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-white">{{ store.trending.length }}</p>
              <p class="text-xs text-gray-400">Trending Topics</p>
            </div>
          </div>
        </div>

        <div
          class="card hover:border-protocol-primary transition-colors cursor-pointer"
          @click="navigateTo('/apps/market-pulse/queue')"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-yellow-900/50 flex items-center justify-center">
              <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-white">{{ store.queue.length }}</p>
              <p class="text-xs text-gray-400">Queue Items</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="store.trending.length > 0">
        <h2 class="text-lg font-semibold text-gray-200 mb-3">Top Trending</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="topic in store.trending.slice(0, 4)"
            :key="topic.id"
            class="card"
          >
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-sm font-medium text-gray-200">{{ topic.topic }}</h3>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs text-gray-400">{{ topic.category }}</span>
                  <span :class="['text-xs', directionColor(topic.direction)]">{{ directionArrow(topic.direction) }} {{ topic.direction }}</span>
                </div>
              </div>
              <span class="text-xs text-gray-400">{{ topic.relatedArticleCount }} articles</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
