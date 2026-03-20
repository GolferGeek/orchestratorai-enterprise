<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useResearchHubStore } from '../../stores/research-hub.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const router = useRouter();
const store = useResearchHubStore();

async function retry() {
  await store.fetchCategories();
}

onMounted(async () => {
  await retry();
});

const isEmpty = computed(() => !store.loading && !store.error && store.categories.length === 0);
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Categories</h1>
      <p class="text-gray-400 text-sm mt-1">Research categories organized by topic</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading categories..." class="py-16" />

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
      title="No Research Categories"
      message="No research categories found. Check the data directory."
      icon="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="category in store.categories"
        :key="category.id"
        class="card hover:border-protocol-primary transition-colors cursor-pointer"
        @click="router.push(`/apps/research-hub/categories/${category.id}`)"
      >
        <h3 class="text-lg font-semibold text-white mb-1">{{ category.name }}</h3>
        <p class="text-sm text-gray-400 mb-3">{{ category.description }}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400">{{ category.articleCount }} articles</span>
          <span class="text-xs text-gray-500">View articles &rarr;</span>
        </div>
      </div>
    </div>
  </div>
</template>
