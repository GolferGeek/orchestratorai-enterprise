<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useAgentsStore } from '../../stores/agents.store';
import type { ExternalAgent } from '../../types';

const store = useAgentsStore();

const discoverUrl = ref('');
const discoverError = ref('');
const discoverSuccess = ref('');

// Cast store.agents to ExternalAgent — registry returns ExternalAgentInfo shape
const agents = computed(() => store.agents as unknown as ExternalAgent[]);

async function loadAgents() {
  await store.fetchAgents();
}

async function discoverAgent() {
  if (!discoverUrl.value.trim()) return;
  discoverError.value = '';
  discoverSuccess.value = '';

  try {
    const agent = await store.discoverAgent(discoverUrl.value.trim()) as unknown as ExternalAgent;
    discoverSuccess.value = `Registered ${agent.name} (${agent.id})`;
    discoverUrl.value = '';
  } catch (e) {
    discoverError.value = e instanceof Error ? e.message : 'Discovery failed';
  }
}

async function removeAgent(id: string) {
  await store.removeAgent(id);
}

function trustLevelClass(level: string): string {
  if (level === 'trusted') return 'text-green-400';
  if (level === 'neutral') return 'text-yellow-400';
  if (level === 'untrusted') return 'text-red-400';
  return 'text-gray-400';
}

function trustBarClass(level: string): string {
  if (level === 'trusted') return 'bg-green-500';
  if (level === 'neutral') return 'bg-yellow-500';
  if (level === 'untrusted') return 'bg-red-500';
  return 'bg-gray-500';
}

function statusClass(status: string): string {
  if (status === 'online') return 'bg-green-900 text-green-300';
  if (status === 'offline') return 'bg-red-900 text-red-300';
  return 'bg-gray-700 text-gray-400';
}

function formatLastSeen(ts?: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

onMounted(async () => {
  await loadAgents();
  store.startAutoRefresh();
});

onUnmounted(() => {
  store.stopAutoRefresh();
});
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">External Agent Registry</h1>
        <p class="text-gray-400 text-sm mt-1">
          Registered external agents that Bridge can communicate with — persisted in database
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="w-2 h-2 rounded-full bg-green-500"></span>
        <span class="text-sm text-gray-400">{{ agents.length }} agents registered</span>
        <button
          class="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded font-medium"
          @click="loadAgents"
        >
          Refresh
        </button>
      </div>
    </div>

    <!-- Discover new agent -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
      <h2 class="text-sm font-medium text-gray-300 mb-3">Discover External Agent</h2>
      <div class="flex gap-2">
        <input
          v-model="discoverUrl"
          type="url"
          placeholder="https://external-agent.example.com"
          class="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          @keydown.enter="discoverAgent"
        />
        <button
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium disabled:opacity-50"
          :disabled="store.loading || !discoverUrl.trim()"
          @click="discoverAgent"
        >
          {{ store.loading ? 'Discovering...' : 'Discover' }}
        </button>
      </div>
      <p v-if="discoverError" class="mt-2 text-sm text-red-400">{{ discoverError }}</p>
      <p v-if="discoverSuccess" class="mt-2 text-sm text-green-400">{{ discoverSuccess }}</p>
      <p class="mt-2 text-xs text-gray-500">
        Bridge will fetch /.well-known/agent.json and register the agent's origin as trusted.
      </p>
    </div>

    <!-- Error state -->
    <div v-if="store.error" class="mb-4 p-3 bg-red-950/30 border border-red-700 rounded-lg">
      <p class="text-red-400 text-sm">{{ store.error }}</p>
    </div>

    <!-- Agent list -->
    <div v-if="store.loading && agents.length === 0" class="text-gray-400 text-sm">
      Loading agents...
    </div>

    <div v-else-if="agents.length === 0" class="text-gray-500 text-sm italic">
      No external agents registered yet. Use the discovery form above to register one.
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="agent in agents"
        :key="agent.id"
        class="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-500 transition-colors"
      >
        <div class="flex items-start justify-between gap-4">
          <!-- Left: Agent info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium text-white">{{ agent.name }}</span>
              <span :class="['text-xs px-2 py-0.5 rounded-full', statusClass(agent.status)]">
                {{ agent.status }}
              </span>
            </div>
            <p class="text-sm text-gray-400 mt-0.5">{{ agent.description }}</p>
            <p class="text-xs text-gray-500 mt-1 font-mono truncate">{{ agent.url }} &bull; v{{ agent.version }}</p>
            <div v-if="agent.capabilities.length > 0" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="cap in agent.capabilities"
                :key="cap"
                class="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded"
              >{{ cap }}</span>
            </div>
          </div>

          <!-- Right: Trust + meta -->
          <div class="text-right flex-shrink-0 space-y-2">
            <!-- Trust score bar -->
            <div class="w-32">
              <div class="flex items-center justify-between mb-1">
                <span :class="['text-xs font-medium', trustLevelClass(agent.trustLevel)]">
                  {{ agent.trustLevel }}
                </span>
                <span class="text-xs text-gray-400">{{ agent.trustScore }}/100</span>
              </div>
              <div class="w-full bg-gray-700 rounded-full h-1.5">
                <div
                  :class="['h-1.5 rounded-full transition-all', trustBarClass(agent.trustLevel)]"
                  :style="{ width: `${agent.trustScore}%` }"
                ></div>
              </div>
            </div>

            <!-- Interaction count -->
            <p class="text-xs text-gray-500">{{ agent.interactions }} interactions</p>

            <!-- Last heartbeat -->
            <p class="text-xs text-gray-500">
              Last seen: {{ formatLastSeen(agent.lastSeen) }}
            </p>

            <!-- Remove button -->
            <button
              class="text-xs text-red-500 hover:text-red-400 transition-colors"
              @click="removeAgent(agent.id)"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
