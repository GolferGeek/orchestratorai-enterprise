<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useResearchHubStore } from '../../stores/research-hub.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const router = useRouter();
const store = useResearchHubStore();

async function retry() {
  await store.fetchArticles();
}

onMounted(async () => {
  await retry();
});

const isEmpty = computed(() => !store.loading && !store.error && store.articles.length === 0);
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Articles</h1>
      <p class="text-gray-400 text-sm mt-1">Aggregated research articles</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading articles..." class="py-16" />

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
      title="No Articles"
      message="No articles found. Articles will appear when the Research Hub backend starts scraping."
      icon="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
    />

    <div v-else class="space-y-3">
      <div
        v-for="article in store.articles"
        :key="article.id"
        class="card hover:border-protocol-primary transition-colors cursor-pointer"
        @click="router.push(`/apps/research-hub/articles/${article.id}`)"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h3 class="text-sm font-medium text-gray-200">{{ article.title }}</h3>
            <p class="text-xs text-gray-400 mt-1 line-clamp-2">{{ article.summary }}</p>
            <div class="flex items-center gap-3 mt-2">
              <span class="text-xs text-gray-400">{{ article.author }}</span>
              <span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">{{ article.categoryId }}</span>
            </div>
          </div>
          <span class="text-xs text-gray-400 ml-4 whitespace-nowrap">
            {{ new Date(article.date).toLocaleDateString() }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
