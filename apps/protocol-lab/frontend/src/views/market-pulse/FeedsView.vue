<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useMarketPulseStore } from '../../stores/market-pulse.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { Feed } from '../../types';

const store = useMarketPulseStore();
const showAddForm = ref(false);
const newFeed = ref({ name: '', url: '', type: 'RSS' as Feed['type'] });
const addError = ref<string | null>(null);

onMounted(async () => {
  await loadData();
});

async function loadData(): Promise<void> {
  try {
    await store.fetchFeeds();
  } catch {
    // Error captured in store
  }
}

async function handleAddFeed() {
  if (!newFeed.value.name || !newFeed.value.url) return;
  addError.value = null;
  try {
    await store.addFeed(newFeed.value);
    newFeed.value = { name: '', url: '', type: 'RSS' };
    showAddForm.value = false;
  } catch (e) {
    addError.value = e instanceof Error ? e.message : String(e);
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case 'active': return 'bg-green-900 text-green-300';
    case 'paused': return 'bg-yellow-900 text-yellow-300';
    case 'error': return 'bg-red-900 text-red-300';
    default: return 'bg-gray-700 text-gray-300';
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Feed Sources</h1>
        <p class="text-gray-400 text-sm mt-1">Manage data feed sources for market intelligence</p>
      </div>
      <button class="btn-primary" @click="showAddForm = !showAddForm">Add Feed</button>
    </div>

    <div v-if="showAddForm" class="card">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Name</label>
          <input v-model="newFeed.name" type="text" placeholder="Feed name" class="input-field w-full" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">URL</label>
          <input v-model="newFeed.url" type="text" placeholder="https://..." class="input-field w-full" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Type</label>
          <select v-model="newFeed.type" class="select-field w-full">
            <option value="RSS">RSS</option>
            <option value="API">API</option>
            <option value="SCRAPE">Scraper</option>
          </select>
        </div>
      </div>
      <div class="flex gap-3 mt-3">
        <button class="btn-primary text-sm" @click="handleAddFeed">Save</button>
        <button class="btn-secondary text-sm" @click="showAddForm = false">Cancel</button>
      </div>
      <p v-if="addError" class="text-red-400 text-sm mt-2">{{ addError }}</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading feeds..." />

    <div v-else-if="store.error" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ store.error }}</p>
        <button class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm" @click="loadData">Retry</button>
      </div>
    </div>

    <EmptyState
      v-else-if="store.feeds.length === 0"
      title="No Feed Sources"
      message="No feed sources configured"
      actionLabel="Add Feed Source"
      actionRoute="/apps/market-pulse/feeds"
    />

    <div v-else class="space-y-3">
      <div
        v-for="feed in store.feeds"
        :key="feed.id"
        class="card"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-medium text-gray-200">{{ feed.name }}</h3>
              <span :class="['text-xs px-2 py-0.5 rounded', statusBadge(feed.status)]">{{ feed.status }}</span>
              <span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">{{ feed.type }}</span>
            </div>
            <p class="text-xs text-gray-400 font-mono mt-1">{{ feed.url }}</p>
          </div>
          <div class="text-right">
            <p class="text-sm text-gray-300">{{ feed.articleCount }} articles</p>
            <p class="text-xs text-gray-400">Last: {{ new Date(feed.lastFetch).toLocaleString() }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
