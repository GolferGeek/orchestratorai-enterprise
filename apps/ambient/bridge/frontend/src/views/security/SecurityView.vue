<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useAgentsStore } from '../../stores/agents.store';
import type { ExternalAgent } from '../../types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:6600';

const store = useAgentsStore();

// Live SSE stream for real-time security events
const securityEvents = ref<Array<{ type: string; timestamp: string; agentId?: string; message?: string }>>([]);
const connected = ref(false);
let eventSource: EventSource | null = null;

// Computed from store stats
const stats = computed(() => store.stats);
const agents = computed(() => store.agents as unknown as ExternalAgent[]);

// Allowed origins = agents with online/offline status (all registered agents are on the allowlist)
const allowedOrigins = computed(() =>
  agents.value.map((a) => new URL(a.url).origin)
);

function connect() {
  eventSource = new EventSource(`${API_BASE}/stream/events`);
  eventSource.onopen = () => { connected.value = true; };
  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as { type: string; timestamp: string; agentId?: string; message?: string };
      if (event.type === 'security.violation' || event.type === 'inbound.rejected') {
        securityEvents.value.unshift(event);
        if (securityEvents.value.length > 50) securityEvents.value.splice(50);
        // Refresh stats on security events
        void store.fetchMessageStats();
      }
    } catch { /* ignore parse errors */ }
  };
  eventSource.onerror = () => { connected.value = false; };
}

onMounted(async () => {
  await Promise.all([
    store.fetchMessageStats(),
    store.fetchAgents(),
  ]);
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
        <h1 class="text-2xl font-bold text-white">Security Monitor</h1>
        <p class="text-gray-400 text-sm mt-1">
          Message statistics, security violations, and access control
        </p>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span :class="connected ? 'bg-green-500' : 'bg-red-500'" class="w-2 h-2 rounded-full"></span>
        <span :class="connected ? 'text-green-400' : 'text-red-400'">{{ connected ? 'Live' : 'Disconnected' }}</span>
      </div>
    </div>

    <!-- Message stats from DB -->
    <div v-if="stats" class="grid grid-cols-3 gap-4 mb-6">
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Messages</p>
        <p class="text-2xl font-bold text-white">{{ stats.total }}</p>
        <p class="text-xs text-gray-500 mt-1">
          {{ stats.inbound }} inbound / {{ stats.outbound }} outbound
        </p>
      </div>
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">Rejected / Rate Limited</p>
        <p class="text-2xl font-bold" :class="stats.rejected > 0 ? 'text-orange-400' : 'text-white'">
          {{ stats.rejected }}
        </p>
        <p class="text-xs text-gray-500 mt-1">blocked requests</p>
      </div>
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">Errors</p>
        <p class="text-2xl font-bold" :class="stats.error > 0 ? 'text-red-400' : 'text-white'">
          {{ stats.error }}
        </p>
        <p class="text-xs text-gray-500 mt-1">
          {{ stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 100 }}% success rate
        </p>
      </div>
    </div>

    <div v-else-if="store.statsLoading" class="mb-6 text-gray-500 text-sm">Loading stats...</div>

    <!-- Allowed origins -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
      <h2 class="text-sm font-medium text-gray-300 mb-3">Allowed Origins</h2>
      <div v-if="allowedOrigins.length === 0" class="text-xs text-gray-500 italic">
        No registered agents — all inbound origins will be rejected.
      </div>
      <div v-else class="flex flex-wrap gap-2">
        <span
          v-for="origin in allowedOrigins"
          :key="origin"
          class="text-xs px-2 py-1 bg-green-900/30 border border-green-700/50 text-green-400 rounded font-mono"
        >
          {{ origin }}
        </span>
      </div>
      <p class="text-xs text-gray-500 mt-2">
        Origins are added automatically when you register an agent via the Registry.
      </p>
    </div>

    <!-- Security layers summary -->
    <div class="grid grid-cols-2 gap-4 mb-6">
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 class="text-xs text-gray-400 uppercase tracking-wider mb-2">Origin Validation</h3>
        <p class="text-sm text-gray-300">Requests from unregistered origins are rejected at the boundary.</p>
        <code class="text-xs text-yellow-400 mt-2 block">Error code: -32003</code>
      </div>
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 class="text-xs text-gray-400 uppercase tracking-wider mb-2">Rate Limiting</h3>
        <p class="text-sm text-gray-300">100 req/min per agent ID. Configurable via env vars.</p>
        <code class="text-xs text-yellow-400 mt-2 block">Error code: -32029</code>
      </div>
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 class="text-xs text-gray-400 uppercase tracking-wider mb-2">Request Signing</h3>
        <p class="text-sm text-gray-300">HMAC-SHA256 signatures verified on all inbound requests (strict mode).</p>
        <code class="text-xs text-yellow-400 mt-2 block">Error code: -32002</code>
      </div>
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 class="text-xs text-gray-400 uppercase tracking-wider mb-2">Replay Protection</h3>
        <p class="text-sm text-gray-300">Nonce tracking within 5-minute window prevents replay attacks.</p>
        <code class="text-xs text-yellow-400 mt-2 block">Error code: -32001</code>
      </div>
    </div>

    <!-- Real-time security event log -->
    <div class="bg-gray-900 rounded-lg border border-gray-700">
      <div class="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <span class="text-xs text-gray-400">Security Events (real-time, newest first)</span>
        <button class="text-xs text-gray-500 hover:text-gray-300" @click="securityEvents = []">Clear</button>
      </div>
      <div class="overflow-y-auto max-h-64 divide-y divide-gray-800">
        <div v-if="securityEvents.length === 0" class="px-4 py-8 text-center text-gray-600 text-sm italic">
          No security violations detected
        </div>
        <div
          v-for="(event, idx) in securityEvents"
          :key="idx"
          class="px-4 py-2"
        >
          <div class="flex items-center gap-3">
            <span class="text-xs font-mono text-red-400 w-36 flex-shrink-0">{{ event.type }}</span>
            <span v-if="event.agentId" class="text-xs text-gray-400">{{ event.agentId }}</span>
            <span class="ml-auto text-xs text-gray-600">{{ new Date(event.timestamp).toLocaleTimeString() }}</span>
          </div>
          <p v-if="event.message" class="text-xs text-gray-500 mt-0.5 ml-36">{{ event.message }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
