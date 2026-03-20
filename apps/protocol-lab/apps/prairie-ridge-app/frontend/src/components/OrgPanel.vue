<script setup lang="ts">
import { computed } from 'vue';
import type { OrgId, TrustLevel, CircuitBreakerState } from '@/types';
import { ORG_INFO } from '@/types';
import CircuitBreakerStatus from './CircuitBreakerStatus.vue';
import TrustProgression from './TrustProgression.vue';

const props = defineProps<{
  orgId: OrgId;
  trustLevel: TrustLevel;
  trustScore: number;
  circuitBreakerState: CircuitBreakerState;
  circuitBreakerTarget: string;
  recentMessages: Array<{
    id: string;
    method: string;
    source: string;
    target: string;
    timestamp: string;
    duration: number;
  }>;
  dataCount?: number;
  dataLabel?: string;
}>();

const org = computed(() => ORG_INFO[props.orgId]);

const orgColorClass = computed(() => {
  switch (props.orgId) {
    case 'agriserv': return 'border-blue-500/50 bg-blue-950/20';
    case 'prairie-ridge': return 'border-emerald-500/50 bg-emerald-950/20';
    case 'central-farm-bank': return 'border-amber-500/50 bg-amber-950/20';
  }
});

const headerColorClass = computed(() => {
  switch (props.orgId) {
    case 'agriserv': return 'text-blue-400';
    case 'prairie-ridge': return 'text-emerald-400';
    case 'central-farm-bank': return 'text-amber-400';
  }
});

const identityBadgeColor = computed(() => {
  switch (props.orgId) {
    case 'agriserv': return 'bg-blue-900/60 text-blue-300 border-blue-700';
    case 'prairie-ridge': return 'bg-emerald-900/60 text-emerald-300 border-emerald-700';
    case 'central-farm-bank': return 'bg-amber-900/60 text-amber-300 border-amber-700';
  }
});

const messageSourceColor = (source: string) => {
  if (source.includes('agriserv')) return 'text-blue-400';
  if (source.includes('prairie-ridge')) return 'text-emerald-400';
  if (source.includes('central-farm-bank')) return 'text-amber-400';
  return 'text-slate-400';
};

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatTime = (ts: string) => {
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
};
</script>

<template>
  <div :class="['flex flex-col h-full border rounded-lg overflow-hidden', orgColorClass]">
    <!-- Header -->
    <div class="px-3 py-2.5 border-b border-slate-700/50 bg-slate-900/50">
      <div class="flex items-center justify-between mb-1.5">
        <h3 :class="['font-bold text-sm tracking-wide', headerColorClass]">
          {{ org.name }}
        </h3>
        <CircuitBreakerStatus :state="circuitBreakerState" size="sm" />
      </div>

      <!-- Identity + trust provider badges -->
      <div class="flex items-center gap-1.5 mb-2">
        <span :class="['text-xxs px-1.5 py-0.5 rounded border font-mono', identityBadgeColor]">
          {{ org.identityProvider }}
        </span>
        <span class="text-xxs px-1.5 py-0.5 rounded border border-slate-600 bg-slate-800/50 text-slate-300 font-mono">
          {{ org.trustProvider }}
        </span>
      </div>

      <!-- Trust meter toward peer -->
      <TrustProgression :level="trustLevel" :score="trustScore" />

      <!-- Circuit breaker label -->
      <div class="mt-1.5 text-xxs text-slate-500">
        CB → {{ circuitBreakerTarget }}:
        <span :class="{
          'text-emerald-400': circuitBreakerState === 'CLOSED',
          'text-amber-400': circuitBreakerState === 'HALF-OPEN',
          'text-red-400': circuitBreakerState === 'OPEN',
        }">{{ circuitBreakerState }}</span>
      </div>
    </div>

    <!-- Data summary -->
    <div v-if="dataCount !== undefined" class="px-3 py-1.5 border-b border-slate-700/30 bg-slate-900/30">
      <span class="text-xxs text-slate-500">{{ dataLabel ?? 'records' }}:</span>
      <span class="text-xxs text-slate-300 ml-1 font-semibold">{{ dataCount }}</span>
    </div>

    <!-- Recent messages -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <div v-if="recentMessages.length === 0" class="px-3 py-4 text-center">
        <p class="text-xxs text-slate-600 italic">No messages yet — run a scenario</p>
      </div>

      <div
        v-for="msg in recentMessages.slice(0, 8)"
        :key="msg.id"
        class="px-3 py-1.5 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-xxs font-mono text-slate-300 truncate flex-1">{{ msg.method }}</span>
          <span class="text-xxs text-slate-500 flex-shrink-0">{{ formatDuration(msg.duration) }}</span>
        </div>
        <div class="flex items-center gap-1 mt-0.5">
          <span :class="['text-xxs font-mono truncate', messageSourceColor(msg.source)]">
            {{ msg.source }}
          </span>
          <span class="text-xxs text-slate-600">→</span>
          <span :class="['text-xxs font-mono truncate', messageSourceColor(msg.target)]">
            {{ msg.target }}
          </span>
          <span class="text-xxs text-slate-600 ml-auto flex-shrink-0">{{ formatTime(msg.timestamp) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
