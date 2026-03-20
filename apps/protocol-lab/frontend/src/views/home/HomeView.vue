<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAgentsStore } from '../../stores/agents.store';
import { useMessagesStore } from '../../stores/messages.store';
import { useTrustStore } from '../../stores/trust.store';
import ConnectionStatusDot from '../../components/shared/ConnectionStatusDot.vue';
import TrustScoreIndicator from '../../components/shared/TrustScoreIndicator.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';

const agentsStore = useAgentsStore();
const messagesStore = useMessagesStore();
const trustStore = useTrustStore();

const discoverUrl = ref('');
const showDiscoverInput = ref(false);
const discoverError = ref<string | null>(null);

onMounted(async () => {
  try {
    await agentsStore.fetchAgents();
  } catch {
    // Error is captured in store
  }
  try {
    await messagesStore.fetchMessages({ limit: 10 });
  } catch {
    // Error is captured in store
  }
  try {
    await trustStore.fetchAllTrustScores();
  } catch {
    // Error is captured in store
  }
});

async function handleDiscover() {
  if (!discoverUrl.value.trim()) return;
  discoverError.value = null;
  try {
    await agentsStore.discoverAgent(discoverUrl.value.trim());
    discoverUrl.value = '';
    showDiscoverInput.value = false;
  } catch (e) {
    discoverError.value = e instanceof Error ? e.message : String(e);
  }
}

async function retryAgents() {
  try {
    await agentsStore.fetchAgents();
  } catch {
    // Error captured in store
  }
}

async function retryMessages() {
  try {
    await messagesStore.fetchMessages({ limit: 10 });
  } catch {
    // Error captured in store
  }
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleTimeString();
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
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Agent Communication Playground</h1>
        <p class="text-gray-400 text-sm mt-1">Monitor agents, inspect protocols, and observe inter-agent communication</p>
      </div>
      <button
        class="btn-primary"
        @click="showDiscoverInput = !showDiscoverInput"
      >
        Discover Agent
      </button>
    </div>

    <div v-if="showDiscoverInput" class="card">
      <div class="flex gap-3">
        <input
          v-model="discoverUrl"
          type="text"
          placeholder="Enter agent URL (e.g., http://localhost:6403)"
          class="input-field flex-1"
          @keyup.enter="handleDiscover"
        />
        <button class="btn-primary" @click="handleDiscover">Discover</button>
        <button class="btn-secondary" @click="showDiscoverInput = false">Cancel</button>
      </div>
      <p v-if="discoverError" class="text-red-400 text-sm mt-2">{{ discoverError }}</p>
    </div>

    <div v-if="agentsStore.error" class="card border border-red-500 bg-red-950/20">
      <div class="flex items-center justify-between">
        <p class="text-red-400 text-sm">{{ agentsStore.error }}</p>
        <button
          class="ml-4 px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
          @click="retryAgents"
        >
          Retry
        </button>
      </div>
    </div>

    <div>
      <h2 class="text-lg font-semibold text-gray-200 mb-3">Connected Agents</h2>

      <LoadingSpinner v-if="agentsStore.loading" label="Discovering agents..." />

      <div v-else-if="agentsStore.agents.length === 0" class="py-4">
        <EmptyState
          title="No Agents"
          message="No agents discovered yet. Click 'Discover Agent' above to add one."
          action-label="Run Discovery"
          action-route="/"
        />
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="agent in agentsStore.agents"
          :key="agent.card.id"
          class="card hover:border-protocol-primary transition-colors cursor-pointer"
        >
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2">
              <ConnectionStatusDot :status="agent.status" />
              <h3 class="text-white font-medium">{{ agent.card.name }}</h3>
            </div>
            <span class="text-xs text-gray-400">v{{ agent.card.version }}</span>
          </div>
          <p class="text-sm text-gray-400 mb-3">{{ agent.card.description }}</p>

          <div v-if="trustStore.trustScores[agent.card.id]" class="mb-3 flex justify-center">
            <TrustScoreIndicator :trust="trustStore.trustScores[agent.card.id]" />
          </div>

          <div class="flex items-center justify-between text-xs text-gray-400">
            <span>Last heartbeat: {{ formatTimestamp(agent.lastHeartbeat) }}</span>
            <div class="flex gap-3">
              <span>Sent: {{ agent.messagesSent }}</span>
              <span>Recv: {{ agent.messagesReceived }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div>
      <h2 class="text-lg font-semibold text-gray-200 mb-3">Recent Activity</h2>

      <div v-if="messagesStore.error" class="card border border-red-500 bg-red-950/20 mb-3">
        <div class="flex items-center justify-between">
          <p class="text-red-400 text-sm">{{ messagesStore.error }}</p>
          <button
            class="ml-4 px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
            @click="retryMessages"
          >
            Retry
          </button>
        </div>
      </div>

      <div class="card">
        <LoadingSpinner v-if="messagesStore.loading" label="Loading activity..." />

        <EmptyState
          v-else-if="messagesStore.messages.length === 0"
          title="No Activity"
          message="No messages yet. Activity will appear here as agents communicate."
        />

        <div v-else class="divide-y divide-gray-700">
          <div
            v-for="msg in messagesStore.messages"
            :key="msg.id"
            class="py-3 flex items-center justify-between"
          >
            <div class="flex items-center gap-3">
              <span :class="['text-xs font-medium', statusColor(msg.status)]">
                {{ msg.status.toUpperCase() }}
              </span>
              <span class="text-sm text-gray-300">
                {{ msg.source }} &rarr; {{ msg.target }}
              </span>
              <span class="text-xs text-gray-400 font-mono">{{ msg.method }}</span>
            </div>
            <div class="flex items-center gap-3 text-xs text-gray-400">
              <span v-if="msg.timing.durationMs">{{ msg.timing.durationMs }}ms</span>
              <span>{{ formatTimestamp(msg.timestamp) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
