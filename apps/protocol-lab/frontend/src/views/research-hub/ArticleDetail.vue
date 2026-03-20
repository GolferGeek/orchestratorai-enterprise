<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useResearchHubStore } from '../../stores/research-hub.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';

const route = useRoute();
const router = useRouter();
const store = useResearchHubStore();

onMounted(async () => {
  const id = route.params.id as string;
  try {
    await store.fetchArticle(id);
  } catch {
    // Error captured in store
  }
});
</script>

<template>
  <div class="space-y-6">
    <button
      class="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
      @click="router.push('/apps/research-hub/articles')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back to Articles
    </button>

    <div v-if="store.error" class="card border-red-500">
      <p class="text-red-400 text-sm">{{ store.error }}</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading article..." />

    <div v-else-if="store.currentArticle" class="card">
      <h1 class="text-xl font-bold text-white mb-2">{{ store.currentArticle.title }}</h1>
      <div class="flex items-center gap-3 mb-4">
        <span class="text-sm text-gray-400">{{ store.currentArticle.author }}</span>
        <span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">{{ store.currentArticle.categoryId }}</span>
        <span class="text-xs text-gray-400">Published {{ new Date(store.currentArticle.date).toLocaleDateString() }}</span>
      </div>
      <p class="text-gray-300 leading-relaxed">{{ store.currentArticle.summary }}</p>
      <div class="mt-4 pt-4 border-t border-gray-700">
        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-300">Signal Strength: {{ Math.round(store.currentArticle.signalStrength * 100) }}%</span>
        </div>
      </div>
      <div class="mt-3 text-xs text-gray-400">
        Date: {{ new Date(store.currentArticle.date).toLocaleString() }}
      </div>
    </div>

    <div v-else class="card text-center py-8">
      <p class="text-gray-400">Article not found.</p>
    </div>
  </div>
</template>
