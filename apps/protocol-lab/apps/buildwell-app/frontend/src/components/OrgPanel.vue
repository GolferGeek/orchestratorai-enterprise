<script setup lang="ts">
import { computed } from 'vue';
import TrustProgression from './TrustProgression.vue';
import CircuitBreakerStatus from './CircuitBreakerStatus.vue';
import type { OrgMessage } from '@/stores/buildwell.store';

const props = defineProps<{
  orgName: string;
  orgId: string;
  role: string;
  identityProvider: string;
  trustScore: number;
  trustLevel: string;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  messages: OrgMessage[];
  accentColor?: string;
  loading?: boolean;
}>();

const accent = computed(() => props.accentColor ?? 'amber');

const accentBorder = computed(() => {
  switch (accent.value) {
    case 'blue': return 'border-blue-700/40';
    case 'amber': return 'border-amber-700/40';
    case 'green': return 'border-green-700/40';
    default: return 'border-gray-700';
  }
});

const accentHeader = computed(() => {
  switch (accent.value) {
    case 'blue': return 'text-blue-400';
    case 'amber': return 'text-amber-400';
    case 'green': return 'text-green-400';
    default: return 'text-gray-300';
  }
});

function layerColor(layer: string): string {
  const map: Record<string, string> = {
    transport: 'bg-blue-500/20 text-blue-300',
    identity: 'bg-purple-500/20 text-purple-300',
    encryption: 'bg-yellow-500/20 text-yellow-300',
    trust: 'bg-green-500/20 text-green-300',
    payment: 'bg-orange-500/20 text-orange-300',
    business: 'bg-pink-500/20 text-pink-300',
    data: 'bg-cyan-500/20 text-cyan-300',
    reliability: 'bg-red-500/20 text-red-300',
    orchestration: 'bg-indigo-500/20 text-indigo-300',
  };
  return map[layer] ?? 'bg-gray-500/20 text-gray-300';
}

function directionIcon(direction: 'inbound' | 'outbound'): string {
  return direction === 'inbound' ? '←' : '→';
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
</script>

<template>
  <div
    class="flex flex-col bg-gray-800 rounded-xl border h-full overflow-hidden"
    :class="accentBorder"
  >
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-700 flex-shrink-0">
      <div class="flex items-center justify-between mb-1">
        <h2 class="font-bold text-base" :class="accentHeader">{{ orgName }}</h2>
        <span class="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">{{ role }}</span>
      </div>
      <div class="text-xs text-gray-500">Identity: <span class="text-gray-300">{{ identityProvider }}</span></div>
    </div>

    <!-- Trust + Circuit Breaker -->
    <div class="px-4 py-3 border-b border-gray-700 flex-shrink-0 space-y-3">
      <TrustProgression :score="trustScore" :level="trustLevel" />
      <CircuitBreakerStatus :state="circuitBreakerState" />
    </div>

    <!-- Messages -->
    <div class="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
      <div v-if="loading" class="flex items-center justify-center h-full">
        <div class="text-gray-500 text-sm">Loading...</div>
      </div>
      <div v-else-if="messages.length === 0" class="flex items-center justify-center h-full">
        <div class="text-gray-600 text-sm text-center">
          <div class="text-2xl mb-1">○</div>
          No messages yet
        </div>
      </div>
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="rounded-lg p-2.5 bg-gray-700/50 border border-gray-600/50 text-xs space-y-1"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium text-gray-200 truncate">
            {{ directionIcon(msg.direction) }} {{ msg.summary }}
          </span>
          <span class="text-gray-500 flex-shrink-0">{{ formatTime(msg.timestamp) }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span :class="layerColor(msg.layer)" class="layer-badge">{{ msg.layer }}</span>
          <span class="text-gray-500">{{ msg.provider }}</span>
        </div>
        <div class="text-gray-500">
          {{ msg.from }} → {{ msg.to }}
        </div>
      </div>
    </div>
  </div>
</template>
