<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useMessagesStore } from '../../stores/messages.store';
import MessageDetail from './MessageDetail.vue';
import AuditTrailView from './AuditTrailView.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { MessageFilter } from '../../types';

const messagesStore = useMessagesStore();

const activeTab = ref<'message-log' | 'audit-trail'>('message-log');

const filterSource = ref('');
const filterTarget = ref('');
const filterStatus = ref('');

onMounted(async () => {
  try {
    await messagesStore.fetchMessages({ limit: 50 });
  } catch {
    // Error captured in store
  }
});

async function applyFilters() {
  const filter: MessageFilter = { limit: 50 };
  if (filterSource.value) filter.source = filterSource.value;
  if (filterTarget.value) filter.target = filterTarget.value;
  if (filterStatus.value) filter.status = filterStatus.value as MessageFilter['status'];
  try {
    await messagesStore.fetchMessages(filter);
  } catch {
    // Error captured in store
  }
}

async function retryFetch() {
  try {
    await messagesStore.fetchMessages({ limit: 50 });
  } catch {
    // Error captured in store
  }
}

async function handleSelectMessage(id: string) {
  try {
    await messagesStore.selectMessage(id);
  } catch {
    // Error captured in store
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'success': return 'text-green-400';
    case 'error': return 'text-red-400';
    case 'pending': return 'text-yellow-400';
    case 'timeout': return 'text-orange-400';
    default: return 'text-gray-400';
  }
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold text-white">Observability</h1>

    <!-- Tab navigation -->
    <div class="flex gap-1 border-b border-gray-700 pb-0">
      <button
        class="px-4 py-2 rounded-t text-sm font-medium transition-colors"
        :class="activeTab === 'message-log' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'"
        @click="activeTab = 'message-log'"
      >
        Message Log
      </button>
      <button
        class="px-4 py-2 rounded-t text-sm font-medium transition-colors"
        :class="activeTab === 'audit-trail' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'"
        @click="activeTab = 'audit-trail'"
      >
        Audit Trail
      </button>
    </div>

    <!-- Message Log tab -->
    <template v-if="activeTab === 'message-log'">
      <div class="flex gap-3 items-end">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Source</label>
          <input v-model="filterSource" type="text" placeholder="Filter by source" class="input-field text-sm" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Target</label>
          <input v-model="filterTarget" type="text" placeholder="Filter by target" class="input-field text-sm" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Status</label>
          <select v-model="filterStatus" class="select-field text-sm">
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="pending">Pending</option>
            <option value="timeout">Timeout</option>
          </select>
        </div>
        <button class="btn-primary text-sm" @click="applyFilters">Filter</button>
      </div>

      <div v-if="messagesStore.error" class="card border border-red-500 bg-red-950/20">
        <div class="flex items-center justify-between">
          <p class="text-red-400 text-sm">{{ messagesStore.error }}</p>
          <button class="ml-4 px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white transition-colors" @click="retryFetch">Retry</button>
        </div>
      </div>

      <div class="flex gap-4 h-[calc(100vh-280px)]">
        <div class="w-1/2 card overflow-y-auto">
          <LoadingSpinner v-if="messagesStore.loading" label="Loading messages..." />

          <EmptyState
            v-else-if="messagesStore.messages.length === 0"
            title="No Messages"
            message="No messages recorded yet. Send a request to see activity here."
            action-label="Send a request"
            action-route="/playground"
          />

          <div v-else class="divide-y divide-gray-700">
            <button
              v-for="msg in messagesStore.messages"
              :key="msg.id"
              :class="[
                'w-full text-left py-3 px-2 hover:bg-gray-700/50 transition-colors',
                messagesStore.selectedMessage?.id === msg.id ? 'bg-gray-700/50 border-l-2 border-protocol-primary' : '',
              ]"
              @click="handleSelectMessage(msg.id)"
            >
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <span :class="['text-xs font-medium', statusColor(msg.status)]">
                    {{ msg.status.toUpperCase() }}
                  </span>
                  <span class="text-sm text-gray-300">{{ msg.source }} &rarr; {{ msg.target }}</span>
                </div>
                <span class="text-xs text-gray-400">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 font-mono">{{ msg.method }}</span>
                <span v-if="msg.timing.durationMs" class="text-xs text-gray-400">{{ msg.timing.durationMs }}ms</span>
              </div>
            </button>
          </div>
        </div>

        <div class="w-1/2 card overflow-y-auto">
          <MessageDetail
            v-if="messagesStore.selectedMessage"
            :message="messagesStore.selectedMessage"
          />
          <div v-else class="flex items-center justify-center h-full">
            <p class="text-gray-400">Select a message to view details</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Audit Trail tab -->
    <template v-if="activeTab === 'audit-trail'">
      <div class="overflow-y-auto h-[calc(100vh-220px)]">
        <AuditTrailView />
      </div>
    </template>
  </div>
</template>
