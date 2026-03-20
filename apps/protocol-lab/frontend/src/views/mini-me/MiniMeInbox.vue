<script setup lang="ts">
import { useMiniMeStore } from '../../stores/mini-me.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const store = useMiniMeStore();

async function refresh() {
  await store.fetchInbox();
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return 'text-red-400 bg-red-900/30';
    case 'high': return 'text-orange-400 bg-orange-900/30';
    case 'normal': return 'text-blue-400 bg-blue-900/30';
    case 'low': return 'text-gray-400 bg-gray-800';
    default: return 'text-gray-400 bg-gray-800';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'pending': return 'text-yellow-400 bg-yellow-900/30';
    case 'in-progress': return 'text-blue-400 bg-blue-900/30';
    case 'completed': return 'text-green-400 bg-green-900/30';
    default: return 'text-gray-400 bg-gray-800';
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-200">Mini-Me's Request Inbox</h2>
        <p class="text-sm text-gray-500">Work requests sent to Mini-Me via the agent-request skill</p>
      </div>
      <button
        class="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
        @click="refresh"
      >
        Refresh
      </button>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading inbox..." class="py-8" />

    <EmptyState
      v-else-if="store.inbox.length === 0"
      title="Inbox Empty"
      message="No work requests yet. Use the Chat tab to send a work request to Mini-Me."
      icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />

    <div v-else class="space-y-3">
      <div
        v-for="request in store.inbox"
        :key="request.id"
        class="bg-gray-800 border border-gray-700 rounded-lg p-4"
      >
        <div class="flex items-start justify-between mb-2">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-medium text-gray-200">{{ request.subject }}</h3>
            <span :class="['px-2 py-0.5 rounded text-xs font-medium', priorityColor(request.priority)]">
              {{ request.priority }}
            </span>
            <span :class="['px-2 py-0.5 rounded text-xs font-medium', statusColor(request.status)]">
              {{ request.status }}
            </span>
          </div>
          <span class="text-xs text-gray-500 whitespace-nowrap ml-3">
            {{ new Date(request.timestamp).toLocaleString() }}
          </span>
        </div>

        <p class="text-sm text-gray-400">{{ request.message }}</p>

        <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span>From: {{ request.from }}</span>
          <span>ID: {{ request.id }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
