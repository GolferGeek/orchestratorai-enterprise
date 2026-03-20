<script setup lang="ts">
import { ref, computed } from 'vue';
import type { TrustEvent } from '../../types';

const props = defineProps<{
  events: TrustEvent[]
  currentScore: number
}>();

const activeTooltipIndex = ref<number | null>(null);

function dotColorClass(score: number): string {
  if (score < 0.3) return 'bg-red-500';
  if (score <= 0.7) return 'bg-yellow-500';
  return 'bg-green-500';
}

function dotSizeClass(index: number): string {
  return index === props.events.length - 1 ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5';
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const lastEventIndex = computed(() => props.events.length - 1);
</script>

<template>
  <div class="w-full" style="height: 2rem;">
    <div class="relative flex items-center h-full">

      <!-- Connecting line spanning the full width between first and last dot -->
      <div
        v-if="props.events.length > 1"
        class="absolute top-1/2 -translate-y-1/2 bg-gray-600"
        style="height: 2px; left: 6px; right: 6px;"
      />

      <!-- Dots -->
      <div class="relative flex items-center justify-between w-full">
        <div
          v-for="(evt, index) in props.events"
          :key="index"
          class="relative flex flex-col items-center"
        >
          <!-- Dot -->
          <div
            :class="[
              'rounded-full cursor-pointer relative z-10 flex-shrink-0',
              dotColorClass(evt.score),
              dotSizeClass(index),
              index === lastEventIndex ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800' : '',
            ]"
            @mouseenter="activeTooltipIndex = index"
            @mouseleave="activeTooltipIndex = null"
          />

          <!-- Current score label below last dot -->
          <div
            v-if="index === lastEventIndex"
            class="absolute top-full mt-0.5 text-xs text-teal-400 whitespace-nowrap font-medium"
            style="transform: translateX(-50%); left: 50%;"
          >
            {{ props.currentScore.toFixed(2) }}
          </div>

          <!-- Tooltip -->
          <div
            v-if="activeTooltipIndex === index"
            class="absolute bottom-full mb-2 z-20 bg-gray-900 border border-gray-600 rounded-lg p-2 shadow-xl text-xs whitespace-nowrap"
            style="transform: translateX(-50%); left: 50%;"
          >
            <p class="text-gray-200 font-medium mb-0.5">{{ evt.event }}</p>
            <p class="text-teal-400">Score: {{ evt.score.toFixed(2) }}</p>
            <p class="text-gray-400">{{ formatTimestamp(evt.timestamp) }}</p>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
