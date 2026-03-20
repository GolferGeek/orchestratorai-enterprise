<script setup lang="ts">
import { ref } from 'vue';
import EmptyState from '../../components/shared/EmptyState.vue';

interface TimelineMessage {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  protocol: string;
  status: 'success' | 'error' | 'pending';
  method: string;
  durationMs: number;
}

const hoveredId = ref<string | null>(null);

const now = Date.now();
const messages = ref<TimelineMessage[]>(
  Array.from({ length: 20 }, (_, i) => {
    const agents = ['research-hub', 'market-pulse', 'content-forge'];
    const protocols = ['A2A JSON-RPC', 'HTTP REST', 'WebSocket'];
    const methods = ['tasks/send', 'tasks/get', 'agent-card', 'feeds/sync', 'drafts/generate', 'topics/suggest'];
    const statuses: TimelineMessage['status'][] = ['success', 'success', 'success', 'error', 'pending'];
    const fromIdx = i % 3;
    const toIdx = (i + 1) % 3;

    return {
      id: `msg-${i}`,
      timestamp: new Date(now - (20 - i) * 180000).toISOString(),
      from: agents[fromIdx],
      to: agents[toIdx],
      protocol: protocols[i % protocols.length],
      status: statuses[i % statuses.length],
      method: methods[i % methods.length],
      durationMs: Math.floor(Math.random() * 800) + 50,
    };
  })
);

function statusColor(status: string): string {
  switch (status) {
    case 'success': return 'bg-green-500';
    case 'error': return 'bg-red-500';
    case 'pending': return 'bg-yellow-500';
    default: return 'bg-gray-500';
  }
}

function agentColor(agent: string): string {
  switch (agent) {
    case 'research-hub': return 'text-blue-400';
    case 'market-pulse': return 'text-green-400';
    case 'content-forge': return 'text-purple-400';
    default: return 'text-gray-400';
  }
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Message Timeline</h1>
      <p class="text-gray-400 text-sm mt-1">Chronological view of inter-agent messages</p>
    </div>

    <EmptyState
      v-if="messages.length === 0"
      title="No Messages"
      message="No messages in the selected time range. Send requests between agents to populate the timeline."
    />

    <template v-else>
      <div class="card overflow-x-auto">
        <div class="relative min-w-[800px] h-[200px]">
          <!-- Timeline axis -->
          <div class="absolute bottom-8 left-0 right-0 h-px bg-gray-700" />

          <!-- Time labels -->
          <div class="absolute bottom-0 left-0 text-xs text-gray-400">{{ formatTime(messages[0].timestamp) }}</div>
          <div class="absolute bottom-0 right-0 text-xs text-gray-400">{{ formatTime(messages[messages.length - 1].timestamp) }}</div>

          <!-- Message dots -->
          <div
            v-for="(msg, idx) in messages"
            :key="msg.id"
            class="absolute cursor-pointer"
            :style="{
              left: `${(idx / (messages.length - 1)) * 95 + 2}%`,
              bottom: '24px',
            }"
            @mouseenter="hoveredId = msg.id"
            @mouseleave="hoveredId = null"
          >
            <!-- Dot -->
            <div
              :class="[
                'w-4 h-4 rounded-full transition-transform',
                statusColor(msg.status),
                hoveredId === msg.id ? 'scale-150' : '',
              ]"
            />

            <!-- Tooltip -->
            <div
              v-if="hoveredId === msg.id"
              class="absolute bottom-8 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl z-10 whitespace-nowrap"
            >
              <p class="text-xs text-gray-400 mb-1">{{ formatTime(msg.timestamp) }}</p>
              <p class="text-sm">
                <span :class="agentColor(msg.from)">{{ msg.from }}</span>
                <span class="text-gray-400 mx-1">&rarr;</span>
                <span :class="agentColor(msg.to)">{{ msg.to }}</span>
              </p>
              <p class="text-xs text-gray-400 mt-1">{{ msg.protocol }} / {{ msg.method }}</p>
              <p class="text-xs text-gray-400">{{ msg.durationMs }}ms</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Message list -->
      <div class="card">
        <h2 class="text-sm font-medium text-gray-300 mb-3">All Messages</h2>
        <div class="divide-y divide-gray-700 max-h-[400px] overflow-y-auto">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="py-2 flex items-center gap-4"
          >
            <div :class="['w-2.5 h-2.5 rounded-full flex-shrink-0', statusColor(msg.status)]" />
            <span class="text-xs text-gray-400 w-20 flex-shrink-0">{{ formatTime(msg.timestamp) }}</span>
            <span :class="['text-xs w-28 flex-shrink-0', agentColor(msg.from)]">{{ msg.from }}</span>
            <span class="text-gray-400 text-xs">&rarr;</span>
            <span :class="['text-xs w-28 flex-shrink-0', agentColor(msg.to)]">{{ msg.to }}</span>
            <span class="text-xs text-gray-400 font-mono flex-1">{{ msg.method }}</span>
            <span class="text-xs text-gray-400 w-16 text-right">{{ msg.durationMs }}ms</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
