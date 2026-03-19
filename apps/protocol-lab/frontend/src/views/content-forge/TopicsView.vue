<script setup lang="ts">
import { onMounted } from 'vue';
import { useContentForgeStore } from '../../stores/content-forge.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const store = useContentForgeStore();

onMounted(async () => {
  await store.fetchTopics();
});
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Topic Suggestions</h1>
      <p class="text-gray-400 text-sm mt-1">AI-generated topic ideas from cross-agent intelligence</p>
    </div>

    <div v-if="store.error" class="card border border-red-500 flex items-center justify-between gap-4">
      <p class="text-red-400 text-sm">{{ store.error }}</p>
      <button class="btn-secondary text-sm shrink-0" @click="store.fetchTopics()">Retry</button>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading topics..." />

    <EmptyState
      v-else-if="store.topics.length === 0 && !store.error"
      title="No Topics"
      message="No topics suggested yet. Topics are generated from cross-agent intelligence data."
    />

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="topic in store.topics"
        :key="topic.id"
        class="card"
      >
        <h3 class="text-sm font-medium text-gray-200 mb-2">{{ topic.title }}</h3>
        <span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">{{ topic.category }}</span>

        <div class="mt-3">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-gray-400">Relevance</span>
            <span class="text-xs text-gray-400">{{ Math.round(topic.relevanceScore * 100) }}%</span>
          </div>
          <div class="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="topic.relevanceScore > 0.7 ? 'bg-green-500' : topic.relevanceScore > 0.4 ? 'bg-yellow-500' : 'bg-red-500'"
              :style="{ width: `${topic.relevanceScore * 100}%` }"
            />
          </div>
        </div>

        <div v-if="topic.sources.length > 0" class="mt-3 flex gap-1 flex-wrap">
          <span
            v-for="source in topic.sources"
            :key="source"
            class="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded"
          >
            {{ source }}
          </span>
        </div>

        <p class="text-xs text-gray-400 mt-2">{{ new Date(topic.createdAt).toLocaleDateString() }}</p>
      </div>
    </div>
  </div>
</template>
