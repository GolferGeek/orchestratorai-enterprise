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
    await store.fetchQueue();
  } catch {
    // Error captured in store
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case 'pending': return 'bg-blue-900 text-blue-300';
    case 'sent': return 'bg-yellow-900 text-yellow-300';
    case 'analyzed': return 'bg-green-900 text-green-300';
    case 'failed': return 'bg-red-900 text-red-300';
    default: return 'bg-gray-700 text-gray-300';
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Article Queue</h1>
      <p class="text-gray-400 text-sm mt-1">Articles queued for processing and analysis</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading queue..." />

    <div v-else-if="store.error" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ store.error }}</p>
        <button class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm" @click="loadData">Retry</button>
      </div>
    </div>

    <EmptyState
      v-else-if="store.queue.length === 0"
      title="No Queue Items"
      message="No articles in queue"
    />

    <div v-else>
      <div class="card overflow-hidden p-0">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-700">
              <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Title</th>
              <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Source</th>
              <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Relevance</th>
              <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Status</th>
              <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Added</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-700">
            <tr
              v-for="item in store.queue"
              :key="item.id"
              class="hover:bg-gray-700/30"
            >
              <td class="px-4 py-3 text-sm text-gray-300">{{ item.title }}</td>
              <td class="px-4 py-3 text-sm text-gray-400">{{ item.source }}</td>
              <td class="px-4 py-3">
                <span class="text-sm text-gray-300">{{ Math.round(item.relevanceScore * 100) }}%</span>
              </td>
              <td class="px-4 py-3">
                <span :class="['text-xs px-2 py-0.5 rounded', statusBadge(item.status)]">
                  {{ item.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-xs text-gray-400">
                {{ new Date(item.queuedAt).toLocaleString() }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
