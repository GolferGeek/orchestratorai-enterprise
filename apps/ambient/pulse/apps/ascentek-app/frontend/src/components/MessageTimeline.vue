<script setup lang="ts">
import { useTimelineStore } from '@/stores/timeline.store';

const timelineStore = useTimelineStore();

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function selectMessage(id: string): void {
  timelineStore.selectMessage(id);
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div v-if="timelineStore.messages.length === 0" class="flex items-center justify-center h-full text-gray-600 text-sm">
      Run a scenario to see the message timeline
    </div>
    <div v-else class="space-y-1 p-2">
      <div
        v-for="msg in timelineStore.messages"
        :key="msg.id"
        class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs"
        :class="[
          timelineStore.selectedMessageId === msg.id
            ? 'bg-amber-500/20 border border-amber-600/50'
            : 'bg-gray-800 border border-gray-700 hover:bg-gray-700',
        ]"
        @click="selectMessage(msg.id)"
      >
        <span class="text-gray-500 w-20 flex-shrink-0">{{ formatTime(msg.timestamp) }}</span>
        <span class="text-amber-400 font-medium w-28 flex-shrink-0 truncate">{{ msg.scenarioName }}</span>
        <span class="text-blue-400 w-24 flex-shrink-0 truncate">{{ msg.source }}</span>
        <span class="text-gray-500">→</span>
        <span class="text-green-400 w-24 flex-shrink-0 truncate">{{ msg.target }}</span>
        <span class="text-gray-300 flex-1 truncate">{{ msg.method }}</span>
        <span class="text-gray-500 flex-shrink-0">{{ msg.durationMs }}ms</span>
        <span class="text-gray-600 flex-shrink-0">{{ msg.pipelineTrace.steps.length }} steps</span>
      </div>
    </div>
  </div>
</template>
