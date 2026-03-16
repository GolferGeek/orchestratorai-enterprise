<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ProtocolMessage } from '../../types';
import { PROTOCOL_LAYERS } from '../../types';
import ProtocolBadge from './ProtocolBadge.vue';

const props = withDefaults(
  defineProps<{
    messages: ProtocolMessage[];
    maxItems?: number;
  }>(),
  {
    maxItems: 20,
  },
);

const emit = defineEmits<{
  select: [id: string];
}>();

// Filter state
const selectedApp = ref<string>('all');
const selectedLayer = ref<string>('all');
const selectedStatus = ref<string>('all');

// Derive unique app names from source/target across all messages
const availableApps = computed<string[]>(() => {
  const apps = new Set<string>();
  for (const msg of props.messages) {
    apps.add(msg.source);
    apps.add(msg.target);
  }
  return Array.from(apps).sort();
});

const availableLayers = computed<string[]>(() => Array.from(PROTOCOL_LAYERS));

const filteredMessages = computed<ProtocolMessage[]>(() => {
  let result = [...props.messages];

  if (selectedApp.value !== 'all') {
    result = result.filter(
      (m) => m.source === selectedApp.value || m.target === selectedApp.value,
    );
  }

  if (selectedLayer.value !== 'all') {
    const layer = selectedLayer.value as keyof ProtocolMessage['protocol'];
    result = result.filter((m) => layer in m.protocol);
  }

  if (selectedStatus.value !== 'all') {
    result = result.filter((m) => m.status === selectedStatus.value);
  }

  // Chronological order, newest first, capped at maxItems
  return result
    .slice()
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, props.maxItems);
});

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const STATUS_DOT: Record<ProtocolMessage['status'], string> = {
  success: 'bg-green-400',
  error: 'bg-red-400',
  pending: 'bg-yellow-400',
  timeout: 'bg-orange-400',
};

// Pick a single representative layer + provider from the message to show in badge
function primaryLayer(msg: ProtocolMessage): { layer: string; provider: string } {
  // Prefer the selected layer filter if active and present on msg, otherwise first available
  if (selectedLayer.value !== 'all') {
    const layer = selectedLayer.value as keyof ProtocolMessage['protocol'];
    if (msg.protocol[layer]) {
      return { layer: selectedLayer.value, provider: msg.protocol[layer] };
    }
  }
  const entries = Object.entries(msg.protocol);
  if (entries.length > 0) {
    return { layer: entries[0][0], provider: entries[0][1] };
  }
  return { layer: 'unknown', provider: 'unknown' };
}

function handleSelect(id: string) {
  emit('select', id);
}
</script>

<template>
  <div class="flex flex-col bg-gray-900 rounded-lg overflow-hidden h-full">
    <!-- Filter chips -->
    <div class="flex flex-wrap gap-2 p-3 border-b border-gray-700">
      <!-- App filter -->
      <div class="flex items-center gap-1 flex-wrap">
        <span class="text-xs text-gray-500 mr-1">App:</span>
        <button
          :class="[
            'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
            selectedApp === 'all'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          @click="selectedApp = 'all'"
        >
          All
        </button>
        <button
          v-for="app in availableApps"
          :key="app"
          :class="[
            'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
            selectedApp === app
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          @click="selectedApp = app"
        >
          {{ app }}
        </button>
      </div>

      <!-- Layer filter -->
      <div class="flex items-center gap-1 flex-wrap">
        <span class="text-xs text-gray-500 mr-1">Layer:</span>
        <button
          :class="[
            'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
            selectedLayer === 'all'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          @click="selectedLayer = 'all'"
        >
          All
        </button>
        <button
          v-for="layer in availableLayers"
          :key="layer"
          :class="[
            'px-2 py-0.5 rounded-full text-xs font-medium transition-colors capitalize',
            selectedLayer === layer
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          @click="selectedLayer = layer"
        >
          {{ layer }}
        </button>
      </div>

      <!-- Status filter -->
      <div class="flex items-center gap-1">
        <span class="text-xs text-gray-500 mr-1">Status:</span>
        <button
          :class="[
            'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
            selectedStatus === 'all'
              ? 'bg-gray-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          @click="selectedStatus = 'all'"
        >
          All
        </button>
        <button
          :class="[
            'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
            selectedStatus === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          @click="selectedStatus = 'success'"
        >
          Success
        </button>
        <button
          :class="[
            'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
            selectedStatus === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          @click="selectedStatus = 'error'"
        >
          Error
        </button>
        <button
          :class="[
            'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
            selectedStatus === 'pending'
              ? 'bg-yellow-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
          ]"
          @click="selectedStatus = 'pending'"
        >
          Pending
        </button>
      </div>
    </div>

    <!-- Message list -->
    <div class="flex-1 overflow-y-auto max-h-[600px]">
      <!-- Empty state -->
      <div
        v-if="filteredMessages.length === 0"
        class="flex flex-col items-center justify-center h-40 text-gray-500"
      >
        <svg
          class="w-8 h-8 mb-2 opacity-40"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <span class="text-sm">No activity yet</span>
      </div>

      <!-- Activity entries -->
      <ul v-else class="divide-y divide-gray-700">
        <li
          v-for="msg in filteredMessages"
          :key="msg.id"
          class="flex items-start gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-750 cursor-pointer transition-colors hover:bg-gray-700"
          @click="handleSelect(msg.id)"
        >
          <!-- Status dot -->
          <div class="mt-1 flex-shrink-0">
            <span
              :class="[
                'block w-2.5 h-2.5 rounded-full',
                STATUS_DOT[msg.status] ?? 'bg-gray-400',
              ]"
              :title="msg.status"
            />
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <!-- Top row: source→target and timestamp -->
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-gray-100 truncate">
                <span class="text-indigo-300">{{ msg.source }}</span>
                <span class="text-gray-500 mx-1">&#x2192;</span>
                <span class="text-teal-300">{{ msg.target }}</span>
              </span>
              <span class="text-xs text-gray-500 flex-shrink-0">
                {{ formatRelativeTime(msg.timestamp) }}
              </span>
            </div>

            <!-- Method -->
            <p class="text-xs text-gray-400 mt-0.5 truncate font-mono">
              {{ msg.method }}
            </p>

            <!-- Protocol badge -->
            <div class="mt-1.5">
              <ProtocolBadge
                :layer="primaryLayer(msg).layer"
                :provider="primaryLayer(msg).provider"
              />
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
