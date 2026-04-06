<script setup lang="ts">
import { ref, onMounted } from 'vue';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5600';

const health = ref<Record<string, unknown> | null>(null);
const agentCount = ref(0);
const sseClients = ref(0);

async function loadStatus() {
  try {
    const [healthRes, agentsRes, sseRes] = await Promise.all([
      fetch(`${API_BASE}/health`),
      fetch(`${API_BASE}/registry/agents`),
      fetch(`${API_BASE}/stream/status`),
    ]);

    if (healthRes.ok) health.value = await healthRes.json();
    if (agentsRes.ok) {
      const agents = await agentsRes.json() as unknown[];
      agentCount.value = agents.length;
    }
    if (sseRes.ok) {
      const sse = await sseRes.json() as { clients: number };
      sseClients.value = sse.clients;
    }
  } catch { /* non-fatal */ }
}

onMounted(loadStatus);
</script>

<template>
  <div class="p-6">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center gap-3 mb-2">
        <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white">Bridge</h1>
        <span class="text-xs px-2 py-0.5 bg-blue-900 text-blue-300 rounded-full">External A2A Gateway</span>
      </div>
      <p class="text-gray-400">
        Bridge handles inbound and outbound agent-to-agent communication with external agents.
        It applies production security hardening at the trust boundary.
      </p>
    </div>

    <!-- Status cards -->
    <div class="grid grid-cols-3 gap-4 mb-8">
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">API Status</p>
        <div class="flex items-center gap-2">
          <span :class="health ? 'bg-green-500' : 'bg-gray-500'" class="w-2 h-2 rounded-full"></span>
          <span class="text-sm font-medium text-white">{{ health ? 'Online' : 'Checking...' }}</span>
        </div>
        <p v-if="health" class="text-xs text-gray-500 mt-1">Port {{ health.port }}</p>
      </div>

      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">External Agents</p>
        <p class="text-2xl font-bold text-white">{{ agentCount }}</p>
        <p class="text-xs text-gray-500 mt-1">registered in registry</p>
      </div>

      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">SSE Clients</p>
        <p class="text-2xl font-bold text-white">{{ sseClients }}</p>
        <p class="text-xs text-gray-500 mt-1">monitoring Bridge stream</p>
      </div>
    </div>

    <!-- Quick navigation -->
    <div class="grid grid-cols-2 gap-4 mb-8">
      <router-link
        to="/registry"
        class="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-blue-500 transition-colors group"
      >
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span class="text-sm font-medium text-white group-hover:text-blue-300">External Agent Registry</span>
        </div>
        <p class="text-xs text-gray-500">Register and discover external agents via .well-known/agent.json</p>
      </router-link>

      <router-link
        to="/inbound"
        class="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-green-500 transition-colors group"
      >
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span class="text-sm font-medium text-white group-hover:text-green-300">Inbound A2A</span>
        </div>
        <p class="text-xs text-gray-500">Live stream of inbound requests from external agents</p>
      </router-link>

      <router-link
        to="/outbound"
        class="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-purple-500 transition-colors group"
      >
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          <span class="text-sm font-medium text-white group-hover:text-purple-300">Outbound A2A</span>
        </div>
        <p class="text-xs text-gray-500">Send signed requests to registered external agents</p>
      </router-link>

      <router-link
        to="/security"
        class="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-red-500 transition-colors group"
      >
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span class="text-sm font-medium text-white group-hover:text-red-300">Security Monitor</span>
        </div>
        <p class="text-xs text-gray-500">Real-time security violations and rejected requests</p>
      </router-link>
    </div>

    <!-- A2A Flow diagram -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h2 class="text-sm font-medium text-gray-300 mb-4">External A2A Flow</h2>
      <div class="flex items-center gap-2 text-xs overflow-x-auto pb-2">
        <div class="flex flex-col items-center gap-1 flex-shrink-0">
          <div class="w-24 h-10 bg-gray-700 rounded flex items-center justify-center text-gray-300 text-center leading-tight px-1">External Agent</div>
          <span class="text-gray-500">external</span>
        </div>
        <div class="text-gray-600 flex-shrink-0">→</div>
        <div class="flex flex-col items-center gap-1 flex-shrink-0">
          <div class="w-28 h-10 bg-blue-900 border border-blue-700 rounded flex items-center justify-center text-blue-300 text-center leading-tight px-1">Bridge Validator</div>
          <span class="text-gray-500">origin+sig+rate</span>
        </div>
        <div class="text-gray-600 flex-shrink-0">→</div>
        <div class="flex flex-col items-center gap-1 flex-shrink-0">
          <div class="w-24 h-10 bg-gray-700 rounded flex items-center justify-center text-gray-300 text-center leading-tight px-1">Bridge Router</div>
          <span class="text-gray-500">forge/compose?</span>
        </div>
        <div class="text-gray-600 flex-shrink-0">→</div>
        <div class="flex flex-col items-center gap-1 flex-shrink-0">
          <div class="w-24 h-10 bg-gray-700 rounded flex items-center justify-center text-gray-300 text-center leading-tight px-1">Forge / Compose</div>
          <span class="text-gray-500">internal agent</span>
        </div>
        <div class="text-gray-600 flex-shrink-0">←</div>
        <div class="flex flex-col items-center gap-1 flex-shrink-0">
          <div class="w-24 h-10 bg-blue-900 border border-blue-700 rounded flex items-center justify-center text-blue-300 text-center leading-tight px-1">JSON-RPC 2.0 Response</div>
          <span class="text-gray-500">to external</span>
        </div>
      </div>
    </div>
  </div>
</template>
