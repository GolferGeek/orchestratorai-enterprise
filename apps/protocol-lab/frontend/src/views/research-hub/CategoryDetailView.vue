<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useResearchHubStore } from '../../stores/research-hub.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const route = useRoute();
const router = useRouter();
const store = useResearchHubStore();

const categoryId = computed(() => route.params.id as string);

const category = computed(() =>
  store.categories.find((c) => c.id === categoryId.value) ?? null
);

const categoryArticles = computed(() =>
  store.articles.filter((a) => a.categoryId === categoryId.value)
);

const averageSignalStrength = computed(() => {
  if (categoryArticles.value.length === 0) return 0;
  const sum = categoryArticles.value.reduce((acc, a) => acc + a.signalStrength, 0);
  return Math.round(sum / categoryArticles.value.length);
});

function signalStrengthLabel(strength: number): string {
  if (strength >= 80) return 'Strong';
  if (strength >= 50) return 'Moderate';
  return 'Weak';
}

function signalStrengthColor(strength: number): string {
  if (strength >= 80) return 'text-green-400';
  if (strength >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

function signalBarColor(strength: number): string {
  if (strength >= 80) return 'bg-green-500';
  if (strength >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

async function retry() {
  const fetches: Promise<void>[] = [
    store.fetchCategories(),
    store.fetchArticles(),
  ];
  await Promise.all(fetches);
}

onMounted(async () => {
  const fetches: Promise<void>[] = [];
  if (store.categories.length === 0) {
    fetches.push(store.fetchCategories().catch(() => {}));
  }
  if (store.articles.length === 0) {
    fetches.push(store.fetchArticles().catch(() => {}));
  }
  await Promise.all(fetches);
});
</script>

<template>
  <div class="space-y-6">
    <!-- Back navigation -->
    <button
      class="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      @click="router.push('/apps/research-hub/categories')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back to Categories
    </button>

    <LoadingSpinner v-if="store.loading" label="Loading category..." class="py-16" />

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

    <!-- Category not found -->
    <EmptyState
      v-else-if="!category"
      title="Category Not Found"
      message="This category could not be found. It may have been removed or the ID is invalid."
      icon="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      action-label="Back to Categories"
      action-route="/apps/research-hub/categories"
    />

    <template v-else>
      <!-- Category header -->
      <div class="bg-gray-800 rounded-lg p-6">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <h1 class="text-2xl font-bold text-white">{{ category.name }}</h1>
            <p class="text-gray-400 text-sm mt-2">{{ category.description }}</p>
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <span class="text-xs text-gray-400 uppercase tracking-wide">Signal Strength</span>
            <span
              class="text-lg font-semibold"
              :class="signalStrengthColor(averageSignalStrength)"
            >
              {{ averageSignalStrength }}% &mdash; {{ signalStrengthLabel(averageSignalStrength) }}
            </span>
            <div class="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="signalBarColor(averageSignalStrength)"
                :style="{ width: `${averageSignalStrength}%` }"
              />
            </div>
          </div>
        </div>

        <div class="mt-4 pt-4 border-t border-gray-700">
          <span class="text-sm text-gray-400">
            {{ categoryArticles.length }}
            {{ categoryArticles.length === 1 ? 'article' : 'articles' }}
          </span>
        </div>
      </div>

      <!-- Empty state for articles -->
      <EmptyState
        v-if="categoryArticles.length === 0"
        title="No Articles"
        message="No articles in this category yet."
        icon="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
      />

      <!-- Article grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="article in categoryArticles"
          :key="article.id"
          class="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-protocol-primary transition-colors cursor-pointer flex flex-col gap-3"
          @click="router.push(`/apps/research-hub/articles/${article.id}`)"
        >
          <div class="flex-1">
            <h3 class="text-sm font-semibold text-gray-200 leading-snug">{{ article.title }}</h3>
            <p class="text-xs text-gray-400 mt-2 line-clamp-3">{{ article.summary }}</p>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-gray-700">
            <span class="text-xs text-gray-400">{{ article.author }}</span>
            <span class="text-xs text-gray-400">
              {{ new Date(article.date).toLocaleDateString() }}
            </span>
          </div>

          <!-- Per-article signal strength bar -->
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-500">Signal</span>
              <span
                class="text-xs font-medium"
                :class="signalStrengthColor(article.signalStrength)"
              >
                {{ article.signalStrength }}%
              </span>
            </div>
            <div class="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full"
                :class="signalBarColor(article.signalStrength)"
                :style="{ width: `${article.signalStrength}%` }"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
