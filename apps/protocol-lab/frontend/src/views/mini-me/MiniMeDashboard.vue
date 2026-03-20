<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useMiniMeStore } from '../../stores/mini-me.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import MiniMeChat from './MiniMeChat.vue';
import MiniMeInbox from './MiniMeInbox.vue';
import MiniMeAgentInfo from './MiniMeAgentInfo.vue';

const store = useMiniMeStore();
const activeTab = ref<'chat' | 'inbox' | 'agent-card'>('chat');

onMounted(async () => {
  await store.checkStatus();
  if (store.connected) {
    await Promise.all([store.fetchAgentCard(), store.fetchInbox()]);
  }
});

async function retry() {
  store.error = null;
  await store.checkStatus();
  if (store.connected) {
    await Promise.all([store.fetchAgentCard(), store.fetchInbox()]);
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Mini-Me</h1>
        <p class="text-gray-400 text-sm mt-1">A2A communication with your personal research agent</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <div
            :class="[
              'w-2.5 h-2.5 rounded-full',
              store.connected ? 'bg-green-400 animate-pulse' : 'bg-red-400',
            ]"
          />
          <span class="text-sm" :class="store.connected ? 'text-green-400' : 'text-red-400'">
            {{ store.connected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
        <span v-if="store.agentCard" class="text-xs text-gray-500">
          v{{ store.agentCard.version }}
        </span>
      </div>
    </div>

    <!-- Not connected state -->
    <div v-if="!store.connected && !store.loading" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ store.error || 'Mini-Me is not reachable at http://gg-macstudio:3030' }}</p>
        <button
          class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          @click="retry"
        >
          Retry Connection
        </button>
      </div>
    </div>

    <LoadingSpinner v-else-if="store.loading" label="Connecting to Mini-Me..." class="py-16" />

    <template v-else>
      <!-- Tabs -->
      <div class="flex gap-1 bg-gray-800 rounded-lg p-1">
        <button
          v-for="tab in [
            { id: 'chat' as const, label: 'Chat', count: store.conversation.length },
            { id: 'inbox' as const, label: 'Request Inbox', count: store.inbox.length },
            { id: 'agent-card' as const, label: 'Agent Card' },
          ]"
          :key="tab.id"
          :class="[
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === tab.id
              ? 'bg-protocol-primary text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700',
          ]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
          <span
            v-if="tab.count !== undefined && tab.count > 0"
            class="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full"
          >
            {{ tab.count }}
          </span>
        </button>
      </div>

      <!-- Tab content -->
      <MiniMeChat v-if="activeTab === 'chat'" />
      <MiniMeInbox v-else-if="activeTab === 'inbox'" />
      <MiniMeAgentInfo v-else-if="activeTab === 'agent-card'" />
    </template>
  </div>
</template>
