<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useTimelineStore } from '@/stores/timeline.store';

const timelineStore = useTimelineStore();
const { messages, selectedMessageId } = storeToRefs(timelineStore);

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const orgColor = (name: string): string => {
  if (name.includes('agriserv') || name.includes('FCS')) return 'text-blue-400';
  if (name.includes('prairie-ridge') || name.includes('Prairie Ridge Credit')) return 'text-emerald-400';
  if (name.includes('central-farm-bank') || name.includes('Central Farm Bank')) return 'text-amber-400';
  if (name.includes('new-association')) return 'text-violet-400';
  return 'text-slate-400';
};

const orgBorderColor = (name: string): string => {
  if (name.includes('agriserv') || name.includes('FCS')) return 'border-l-blue-500';
  if (name.includes('prairie-ridge') || name.includes('Prairie Ridge Credit')) return 'border-l-emerald-500';
  if (name.includes('central-farm-bank') || name.includes('Central Farm Bank')) return 'border-l-amber-500';
  if (name.includes('new-association')) return 'border-l-violet-500';
  return 'border-l-slate-600';
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-3 py-2 border-b border-slate-700/50 bg-slate-900/50 flex items-center justify-between">
      <span class="text-xs font-semibold text-slate-300 tracking-wide">MESSAGE TIMELINE</span>
      <span class="text-xxs text-slate-500">{{ messages.length }} messages</span>
    </div>

    <!-- Column headers -->
    <div class="px-3 py-1.5 border-b border-slate-800 bg-slate-900/30 grid grid-cols-12 gap-2">
      <span class="col-span-2 text-xxs text-slate-500 uppercase tracking-wide">Time</span>
      <span class="col-span-2 text-xxs text-slate-500 uppercase tracking-wide">Source</span>
      <span class="col-span-2 text-xxs text-slate-500 uppercase tracking-wide">Target</span>
      <span class="col-span-3 text-xxs text-slate-500 uppercase tracking-wide">Method</span>
      <span class="col-span-2 text-xxs text-slate-500 uppercase tracking-wide">Duration</span>
      <span class="col-span-1 text-xxs text-slate-500 uppercase tracking-wide">Steps</span>
    </div>

    <!-- Message rows -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <div
        v-if="messages.length === 0"
        class="flex items-center justify-center h-full"
      >
        <div class="text-center">
          <div class="text-2xl mb-2">🎣</div>
          <p class="text-sm text-slate-500">Run a scenario to see messages here</p>
          <p class="text-xxs text-slate-600 mt-1">Click any scenario card above to start</p>
        </div>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="[
          'px-3 py-2 border-b border-slate-800/50 cursor-pointer transition-all duration-100 grid grid-cols-12 gap-2 items-center border-l-2',
          orgBorderColor(msg.source),
          selectedMessageId === msg.id
            ? 'bg-slate-700/50'
            : 'hover:bg-slate-800/40',
        ]"
        @click="timelineStore.selectMessage(msg.id)"
      >
        <span class="col-span-2 text-xxs font-mono text-slate-500">
          {{ formatTime(msg.timestamp) }}
        </span>
        <span :class="['col-span-2 text-xxs font-mono truncate', orgColor(msg.source)]">
          {{ msg.source }}
        </span>
        <span :class="['col-span-2 text-xxs font-mono truncate', orgColor(msg.target)]">
          {{ msg.target }}
        </span>
        <span class="col-span-3 text-xxs font-mono text-slate-200 truncate">
          {{ msg.method }}
        </span>
        <span class="col-span-2 text-xxs font-mono text-slate-400">
          {{ formatDuration(msg.duration) }}
        </span>
        <span class="col-span-1 text-xxs font-mono text-slate-500">
          {{ msg.pipelineTrace?.steps?.length ?? 0 }}
        </span>
      </div>
    </div>
  </div>
</template>
