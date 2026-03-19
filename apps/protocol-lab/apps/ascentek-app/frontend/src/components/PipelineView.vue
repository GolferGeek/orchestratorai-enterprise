<script setup lang="ts">
import { computed } from 'vue';
import PipelineStepCard from './PipelineStep.vue';
import { useTimelineStore } from '@/stores/timeline.store';

const timelineStore = useTimelineStore();

const selectedMessage = computed(() => timelineStore.getSelectedMessage());

const trace = computed(() => selectedMessage.value?.pipelineTrace ?? null);
</script>

<template>
  <div class="h-full flex flex-col">
    <div v-if="!trace" class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-600">
        <div class="text-3xl mb-2">⬡</div>
        <div class="text-sm">Select a message from the timeline<br>to view its pipeline trace</div>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto p-4 space-y-1">
      <!-- Trace header -->
      <div class="mb-4 p-3 bg-gray-700/50 rounded-lg border border-gray-600 text-xs space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-blue-400 font-medium">{{ trace.source }}</span>
          <span class="text-gray-500">→</span>
          <span class="text-green-400 font-medium">{{ trace.target }}</span>
          <span class="text-gray-500">·</span>
          <span class="text-gray-300">{{ trace.method }}</span>
        </div>
        <div class="flex gap-4 text-gray-500">
          <span>{{ trace.steps.length }} steps</span>
          <span>{{ trace.totalDurationMs }}ms total</span>
          <span class="text-gray-600">{{ trace.messageId.slice(0, 8) }}...</span>
        </div>
      </div>

      <!-- Steps -->
      <div class="space-y-3">
        <PipelineStepCard
          v-for="step in trace.steps"
          :key="step.stepNumber"
          :step="step"
        />
      </div>
    </div>
  </div>
</template>
