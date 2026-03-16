<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useAgentsStore } from '../../stores/agents.store';
import type { A2AMessageFilter } from '../../types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:6600';

const store = useAgentsStore();

// Live SSE stream for real-time events
const connected = ref(false);
let eventSource: EventSource | null = null;

// Filters
const filterAgentId = ref('');
const filterStatus = ref('');

// Computed: inbound messages from store
const inboundMessages = computed(() => store.messages);

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'success': return 'bg-green-900 text-green-300';
    case 'error': return 'bg-red-900 text-red-300';
    case 'rejected': return 'bg-orange-900 text-orange-300';
    case 'rate_limited': return 'bg-yellow-900 text-yellow-300';
    case 'pending': return 'bg-blue-900 text-blue-300';
    default: return 'bg-gray-700 text-gray-400';
  }
}

function formatTime(ts?: string): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

async function applyFilters() {
  const filter: A2AMessageFilter = { direction: 'inbound', limit: 100 };
  if (filterAgentId.value) filter.agentId = filterAgentId.value;
  if (filterStatus.value) filter.status = filterStatus.value as A2AMessageFilter['status'];
  await store.fetchMessages(filter);
}

async function loadInbound() {
  await store.fetchMessages({ direction: 'inbound', limit: 100 });
}

// Connect to SSE stream for live event badge
function connect() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`${API_BASE}/stream/events`);
  eventSource.onopen = () => { connected.value = true; };
  eventSource.onmessage = () => {
    // On any inbound event, refresh the message list silently
    void store.fetchMessages({ direction: 'inbound', limit: 100 });
  };
  eventSource.onerror = () => { connected.value = false; };
}

onMounted(async () => {
  await loadInbound();
  connect();
  store.startAutoRefresh();
});

onUnmounted(() => {
  eventSource?.close();
  store.stopAutoRefresh();
});
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Inbound A2A</h1>
        <p class="text-gray-400 text-sm mt-1">
          Inbound A2A requests from external agents — persisted message history
        </p>
      </div>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2 text-sm">
          <span :class="connected ? 'bg-green-500' : 'bg-gray-500'" class="w-2 h-2 rounded-full"></span>
          <span :class="connected ? 'text-green-400' : 'text-gray-500'">
            {{ connected ? 'Live' : 'Polling' }}
          </span>
        </div>
        <button
          class="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded font-medium"
          @click="loadInbound"
        >
          Refresh
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
      <div class="flex gap-3 items-end flex-wrap">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Agent ID</label>
          <input
            v-model="filterAgentId"
            type="text"
            placeholder="Filter by agent ID..."
            class="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Status</label>
          <select
            v-model="filterStatus"
            class="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="rejected">Rejected</option>
            <option value="rate_limited">Rate Limited</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <button
          class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium"
          @click="applyFilters"
        >
          Apply
        </button>
        <button
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium"
          @click="filterAgentId = ''; filterStatus = ''; loadInbound()"
        >
          Reset
        </button>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="store.messagesError" class="mb-4 p-3 bg-red-950/30 border border-red-700 rounded-lg">
      <p class="text-red-400 text-sm">{{ store.messagesError }}</p>
    </div>

    <!-- Message table -->
    <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      <div class="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <span class="text-xs text-gray-400">Inbound Messages (newest first)</span>
        <span class="text-xs text-gray-500">{{ inboundMessages.length }} records</span>
      </div>

      <div v-if="store.messagesLoading" class="px-4 py-8 text-center text-gray-500 text-sm">
        Loading...
      </div>

      <div v-else-if="inboundMessages.length === 0" class="px-4 py-8 text-center text-gray-600 text-sm italic">
        No inbound messages recorded yet
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Time</th>
              <th class="text-left px-4 py-2">Agent</th>
              <th class="text-left px-4 py-2">Method</th>
              <th class="text-left px-4 py-2">Status</th>
              <th class="text-left px-4 py-2">Duration</th>
              <th class="text-left px-4 py-2">Rejection Reason</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr
              v-for="msg in inboundMessages"
              :key="msg.id ?? msg.created_at"
              class="hover:bg-gray-800/50 transition-colors"
            >
              <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">
                {{ formatTime(msg.created_at) }}
              </td>
              <td class="px-4 py-2 text-gray-300 text-xs">
                {{ msg.external_agent_id ?? '—' }}
              </td>
              <td class="px-4 py-2 text-gray-300 font-mono text-xs">
                {{ msg.method ?? '—' }}
              </td>
              <td class="px-4 py-2">
                <span :class="['text-xs px-2 py-0.5 rounded-full font-medium', statusBadgeClass(msg.status)]">
                  {{ msg.status }}
                </span>
              </td>
              <td class="px-4 py-2 text-gray-400 text-xs">
                {{ msg.duration_ms != null ? `${msg.duration_ms}ms` : '—' }}
              </td>
              <td class="px-4 py-2 text-orange-400 text-xs">
                {{ msg.rejection_reason ?? '' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Endpoint reference -->
    <div class="mt-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h2 class="text-sm font-medium text-gray-300 mb-2">Inbound Endpoint</h2>
      <code class="text-sm text-green-400 font-mono">POST {{ API_BASE }}/a2a/tasks</code>
      <p class="text-xs text-gray-500 mt-2">
        External agents send JSON-RPC 2.0 requests to this endpoint.
        Required headers: X-Agent-Id, X-Security-Envelope (in strict mode).
      </p>
    </div>
  </div>
</template>
