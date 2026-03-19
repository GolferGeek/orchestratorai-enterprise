<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useAgentsStore } from '../../stores/agents.store';
import type { AgentInfo, AgentStatus } from '../../types';
import ConnectionStatusDot from '../../components/shared/ConnectionStatusDot.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const agentsStore = useAgentsStore();
const { agents, loading, error } = storeToRefs(agentsStore);

// Track which agents are connected (local state — toggled by user)
const connectedAgentIds = ref<Set<string>>(new Set());

// Modal state for discovering a new agent
const showDiscoverModal = ref(false);
const discoverUrl = ref('');
const discoverError = ref<string | null>(null);
const discoverLoading = ref(false);

// Derive a mock status for each agent from their AgentInfo status
function agentStatus(agent: AgentInfo): AgentStatus {
  return agent.status;
}

function isConnected(agent: AgentInfo): boolean {
  return connectedAgentIds.value.has(agent.card.id);
}

function toggleConnection(agent: AgentInfo): void {
  const id = agent.card.id;
  if (connectedAgentIds.value.has(id)) {
    connectedAgentIds.value.delete(id);
  } else {
    connectedAgentIds.value.add(id);
  }
}

function formatLastSeen(lastHeartbeat: string): string {
  const date = new Date(lastHeartbeat);
  if (isNaN(date.getTime())) return 'Unknown';
  const diffMs = Date.now() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

async function handleDiscover(): Promise<void> {
  if (!discoverUrl.value.trim()) return;
  discoverError.value = null;
  discoverLoading.value = true;
  try {
    await agentsStore.discoverAgent(discoverUrl.value.trim());
    discoverUrl.value = '';
    showDiscoverModal.value = false;
  } catch (e) {
    discoverError.value = e instanceof Error ? e.message : String(e);
  } finally {
    discoverLoading.value = false;
  }
}

function closeModal(): void {
  showDiscoverModal.value = false;
  discoverUrl.value = '';
  discoverError.value = null;
}

onMounted(async () => {
  await agentsStore.fetchAgents();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Agent Sources</h1>
        <p class="text-gray-400 text-sm mt-1">
          All known agents available as data sources for the ContentForge pipeline
        </p>
      </div>
      <button
        class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        @click="showDiscoverModal = true"
      >
        Discover New Agents
      </button>
    </div>

    <!-- Error banner -->
    <div v-if="error" class="bg-gray-800 border border-red-500 rounded-lg p-4 flex items-center justify-between gap-4">
      <p class="text-red-400 text-sm">{{ error }}</p>
      <button class="btn-secondary text-sm shrink-0" @click="agentsStore.fetchAgents()">Retry</button>
    </div>

    <!-- Loading state -->
    <LoadingSpinner v-if="loading" label="Loading agent sources..." />

    <!-- Empty state -->
    <EmptyState
      v-else-if="agents.length === 0 && !error"
      title="No Agent Sources"
      message="No agents discovered yet. Use the &quot;Discover New Agents&quot; button above to add one."
    />

    <!-- Agent source grid -->
    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <div
        v-for="agent in agents"
        :key="agent.card.id"
        class="bg-gray-800 rounded-lg p-4 flex flex-col gap-3"
      >
        <!-- Card header: name + status dot -->
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-white truncate pr-2">
            {{ agent.card.name }}
          </h2>
          <ConnectionStatusDot :status="agentStatus(agent)" size="md" />
        </div>

        <!-- Description -->
        <p class="text-gray-400 text-xs leading-relaxed line-clamp-2">
          {{ agent.card.description }}
        </p>

        <!-- Capability badges -->
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="cap in agent.card.capabilities"
            :key="cap.id"
            class="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full"
          >
            {{ cap.name }}
          </span>
          <span
            v-if="agent.card.capabilities.length === 0"
            class="text-xs text-gray-500 italic"
          >
            No capabilities listed
          </span>
        </div>

        <!-- Trust score (numeric) -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">Trust score:</span>
          <span
            :class="[
              'text-xs font-bold',
              agent.messagesReceived + agent.messagesSent > 50
                ? 'text-green-400'
                : agent.messagesReceived + agent.messagesSent > 10
                  ? 'text-yellow-400'
                  : 'text-gray-400',
            ]"
          >
            {{ Math.min(100, Math.round(((agent.messagesReceived + agent.messagesSent) / 200) * 100)) }}
          </span>
          <span class="text-xs text-gray-500">
            ({{ agent.messagesReceived + agent.messagesSent }} msgs)
          </span>
        </div>

        <!-- Last seen -->
        <div class="flex items-center gap-1 text-xs text-gray-500">
          <span>Last seen:</span>
          <span class="text-gray-400">{{ formatLastSeen(agent.lastHeartbeat) }}</span>
        </div>

        <!-- Connect / Disconnect button -->
        <button
          :class="[
            'w-full mt-auto text-sm font-medium py-2 rounded-lg transition-colors',
            isConnected(agent)
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white',
          ]"
          @click="toggleConnection(agent)"
        >
          {{ isConnected(agent) ? 'Disconnect' : 'Connect' }}
        </button>
      </div>
    </div>

    <!-- Discover New Agents modal -->
    <Teleport to="body">
      <div
        v-if="showDiscoverModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @click.self="closeModal"
      >
        <div class="bg-gray-800 rounded-lg p-6 w-full max-w-md space-y-4 shadow-xl">
          <h2 class="text-lg font-semibold text-white">Discover New Agent</h2>
          <p class="text-gray-400 text-sm">
            Enter the base URL of the agent. The protocol API will fetch its
            <code class="text-gray-300 bg-gray-700 px-1 rounded">.well-known/agent.json</code>
            card automatically.
          </p>

          <div>
            <label class="block text-xs text-gray-400 mb-1">Agent URL</label>
            <input
              v-model="discoverUrl"
              type="url"
              placeholder="https://agent.example.com"
              class="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none placeholder-gray-500"
              @keyup.enter="handleDiscover"
            />
          </div>

          <p v-if="discoverError" class="text-red-400 text-sm">{{ discoverError }}</p>

          <div class="flex gap-3 justify-end">
            <button
              class="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              @click="closeModal"
            >
              Cancel
            </button>
            <button
              :disabled="discoverLoading || !discoverUrl.trim()"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              @click="handleDiscover"
            >
              {{ discoverLoading ? 'Discovering...' : 'Discover' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
