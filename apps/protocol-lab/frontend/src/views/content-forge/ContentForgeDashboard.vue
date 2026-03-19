<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useContentForgeStore } from '../../stores/content-forge.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const router = useRouter();
const store = useContentForgeStore();

async function loadData() {
  await Promise.all([
    store.fetchDrafts(),
    store.fetchTopics(),
    store.fetchWorkflowHistory(),
  ]);
}

onMounted(async () => {
  await loadData();
});

function navigateTo(path: string) {
  router.push(path);
}

function statusBadge(status: string): string {
  switch (status) {
    case 'draft': return 'bg-gray-700 text-gray-300';
    case 'review': return 'bg-yellow-900 text-yellow-300';
    case 'published': return 'bg-green-900 text-green-300';
    default: return 'bg-gray-700 text-gray-300';
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">ContentForge</h1>
      <p class="text-gray-400 text-sm mt-1">AI-powered content generation and multi-agent workflows</p>
    </div>

    <div v-if="store.error" class="card border border-red-500 flex items-center justify-between gap-4">
      <p class="text-red-400 text-sm">{{ store.error }}</p>
      <button class="btn-secondary text-sm shrink-0" @click="loadData">Retry</button>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading dashboard..." />

    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div
        class="card hover:border-protocol-primary transition-colors cursor-pointer"
        @click="navigateTo('/apps/content-forge/drafts')"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-purple-900/50 flex items-center justify-center">
            <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div>
            <p class="text-2xl font-bold text-white">{{ store.drafts.length }}</p>
            <p class="text-xs text-gray-400">Drafts</p>
          </div>
        </div>
      </div>

      <div
        class="card hover:border-protocol-primary transition-colors cursor-pointer"
        @click="navigateTo('/apps/content-forge/topics')"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-blue-900/50 flex items-center justify-center">
            <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <p class="text-2xl font-bold text-white">{{ store.topics.length }}</p>
            <p class="text-xs text-gray-400">Topics</p>
          </div>
        </div>
      </div>

      <div
        class="card hover:border-protocol-primary transition-colors cursor-pointer"
        @click="navigateTo('/apps/content-forge/workflow')"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-green-900/50 flex items-center justify-center">
            <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div>
            <p class="text-2xl font-bold text-white">{{ store.workflowHistory.length }}</p>
            <p class="text-xs text-gray-400">Workflow Executions</p>
          </div>
        </div>
      </div>
    </div>

    <EmptyState
      v-if="!store.loading && !store.error && store.drafts.length === 0 && store.topics.length === 0 && store.workflowHistory.length === 0"
      title="No Data"
      message="No content data available. Start by generating a draft or running the content pipeline."
    />

    <div v-if="store.drafts.length > 0">
      <h2 class="text-lg font-semibold text-gray-200 mb-3">Recent Drafts</h2>
      <div class="space-y-3">
        <div
          v-for="draft in store.drafts.slice(0, 5)"
          :key="draft.id"
          class="card cursor-pointer hover:border-protocol-primary transition-colors"
          @click="navigateTo(`/apps/content-forge/drafts/${draft.id}`)"
        >
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-sm font-medium text-gray-200">{{ draft.title }}</h3>
              <p class="text-xs text-gray-400 mt-1">{{ draft.sources.length }} sources</p>
            </div>
            <div class="flex items-center gap-2">
              <span :class="['text-xs px-2 py-0.5 rounded', statusBadge(draft.status)]">{{ draft.status }}</span>
              <span class="text-xs text-gray-400">{{ new Date(draft.updatedAt).toLocaleDateString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
