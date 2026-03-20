<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useTimelineStore } from '@/stores/timeline.store';
import PipelineStep from './PipelineStep.vue';

const timelineStore = useTimelineStore();
const { selectedMessage } = storeToRefs(timelineStore);

const trace = computed(() => selectedMessage.value?.pipelineTrace ?? null);

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const orgColor = (name: string) => {
  if (!name) return 'text-slate-400';
  if (name.includes('agriserv')) return 'text-blue-400';
  if (name.includes('prairie-ridge')) return 'text-emerald-400';
  if (name.includes('central-farm-bank')) return 'text-amber-400';
  if (name.includes('new-association')) return 'text-violet-400';
  return 'text-slate-300';
};

// Layer coverage summary
const layerCoverage = computed(() => {
  if (!trace.value) return [];
  const layers = new Map<string, number>();
  for (const step of trace.value.steps) {
    layers.set(step.layer, (layers.get(step.layer) ?? 0) + 1);
  }
  return Array.from(layers.entries());
});

const LAYER_COLORS: Record<string, string> = {
  identity: '#3b82f6',
  encryption: '#10b981',
  transport: '#8b5cf6',
  trust: '#f59e0b',
  audit: '#ef4444',
  payment: '#ec4899',
  business: '#6b7280',
  data: '#14b8a6',
  observability: '#6366f1',
  resilience: '#f97316',
  negotiation: '#06b6d4',
  orchestration: '#84cc16',
  discovery: '#a78bfa',
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-3 py-2 border-b border-slate-700/50 bg-slate-900/50">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-slate-300 tracking-wide">PIPELINE TRACE</span>
        <span v-if="trace" class="text-xxs text-slate-500 font-mono">
          {{ formatDuration(trace.totalDuration) }} total
        </span>
      </div>

      <!-- Source → Target + method -->
      <div v-if="trace" class="flex items-center gap-2 mt-1.5">
        <span :class="['text-xs font-mono font-bold', orgColor(trace.source)]">{{ trace.source }}</span>
        <svg class="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
        <span :class="['text-xs font-mono font-bold', orgColor(trace.target)]">{{ trace.target }}</span>
        <span class="text-xs text-slate-500 font-mono">·</span>
        <span class="text-xs text-slate-400 font-mono">{{ trace.method }}</span>
      </div>

      <!-- Layer coverage pills -->
      <div v-if="layerCoverage.length > 0" class="flex flex-wrap gap-1 mt-2">
        <span
          v-for="[layer, count] in layerCoverage"
          :key="layer"
          class="text-xxs px-1.5 py-0.5 rounded font-mono"
          :style="{
            backgroundColor: `${LAYER_COLORS[layer] ?? '#6b7280'}15`,
            color: LAYER_COLORS[layer] ?? '#6b7280',
            borderColor: `${LAYER_COLORS[layer] ?? '#6b7280'}40`,
            borderWidth: '1px',
          }"
        >
          {{ layer }} ({{ count }})
        </span>
      </div>
    </div>

    <!-- No message selected -->
    <div v-if="!trace" class="flex-1 flex items-center justify-center">
      <div class="text-center px-4">
        <div class="text-3xl mb-3">🔬</div>
        <p class="text-sm text-slate-400">Select a message from the timeline</p>
        <p class="text-xxs text-slate-600 mt-1">Pipeline steps will appear here</p>
      </div>
    </div>

    <!-- Steps waterfall -->
    <div v-else class="flex-1 overflow-y-auto min-h-0 px-3 py-3">
      <div class="text-xxs text-slate-600 mb-3 font-mono">
        {{ trace.steps.length }} pipeline steps
      </div>

      <PipelineStep
        v-for="(step, index) in trace.steps"
        :key="step.stepNumber"
        :step="step"
        :is-last="index === trace.steps.length - 1"
      />
    </div>
  </div>
</template>
