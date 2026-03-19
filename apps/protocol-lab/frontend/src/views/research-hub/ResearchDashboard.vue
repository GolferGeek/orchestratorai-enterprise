<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useResearchHubStore } from '../../stores/research-hub.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const router = useRouter();
const store = useResearchHubStore();

async function retry() {
  await Promise.all([
    store.fetchCategories(),
    store.fetchArticles(),
    store.fetchScoutSignals(),
  ]);
}

onMounted(async () => {
  await retry();
});

const isEmpty = computed(
  () =>
    !store.loading &&
    !store.error &&
    store.categories.length === 0 &&
    store.articles.length === 0 &&
    store.scoutSignals.length === 0,
);

function navigateTo(path: string) {
  router.push(path);
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Research Hub</h1>
      <p class="text-gray-400 text-sm mt-1">AI-powered research aggregation and narrative generation</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading dashboard..." class="py-16" />

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
      title="No Data"
      message="No research data available yet. Start the Research Hub backend to begin aggregating data."
      icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />

    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          class="card hover:border-protocol-primary transition-colors cursor-pointer"
          @click="navigateTo('/apps/research-hub/categories')"
        >
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-lg bg-blue-900/50 flex items-center justify-center">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-white">{{ store.categories.length }}</p>
              <p class="text-xs text-gray-400">Categories</p>
            </div>
          </div>
        </div>

        <div
          class="card hover:border-protocol-primary transition-colors cursor-pointer"
          @click="navigateTo('/apps/research-hub/narratives')"
        >
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-lg bg-purple-900/50 flex items-center justify-center">
              <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-white">{{ store.narratives.length }}</p>
              <p class="text-xs text-gray-400">Narratives</p>
            </div>
          </div>
        </div>

        <div
          class="card hover:border-protocol-primary transition-colors cursor-pointer"
          @click="navigateTo('/apps/research-hub/articles')"
        >
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-lg bg-green-900/50 flex items-center justify-center">
              <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-white">{{ store.articles.length }}</p>
              <p class="text-xs text-gray-400">Articles</p>
            </div>
          </div>
        </div>

        <div
          class="card hover:border-protocol-primary transition-colors cursor-pointer"
          @click="navigateTo('/apps/research-hub/scout')"
        >
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-lg bg-yellow-900/50 flex items-center justify-center">
              <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-white">{{ store.scoutSignals.length }}</p>
              <p class="text-xs text-gray-400">Scout Signals</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="store.articles.length > 0">
        <h2 class="text-lg font-semibold text-gray-200 mb-3">Recent Articles</h2>
        <div class="space-y-2">
          <div
            v-for="article in store.articles.slice(0, 5)"
            :key="article.id"
            class="card hover:border-gray-600 transition-colors cursor-pointer"
            @click="navigateTo(`/apps/research-hub/articles/${article.id}`)"
          >
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-sm font-medium text-gray-200">{{ article.title }}</h3>
                <p class="text-xs text-gray-400 mt-1">{{ article.author }} &middot; {{ article.categoryId }}</p>
              </div>
              <span class="text-xs text-gray-400">{{ new Date(article.date).toLocaleDateString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
