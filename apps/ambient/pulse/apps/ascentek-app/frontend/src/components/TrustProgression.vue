<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  score: number;
  level: string;
  history?: Array<{ score: number; level: string; trigger: string; step?: number }>;
}>();

const barColor = computed(() => {
  if (props.score >= 80) return 'bg-green-500';
  if (props.score >= 50) return 'bg-yellow-500';
  if (props.score >= 25) return 'bg-orange-500';
  return 'bg-red-500';
});

const levelColor = computed(() => {
  switch (props.level) {
    case 'TRUSTED': return 'text-green-400';
    case 'ESTABLISHED': return 'text-yellow-400';
    case 'BASIC': return 'text-orange-400';
    case 'INTERNAL': return 'text-blue-400';
    default: return 'text-red-400';
  }
});
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between text-xs">
      <span class="text-gray-400">Trust</span>
      <span :class="levelColor" class="font-medium">{{ level }}</span>
    </div>
    <div class="relative h-2 bg-gray-700 rounded-full overflow-hidden">
      <div
        :class="barColor"
        class="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
        :style="{ width: `${Math.min(100, Math.max(0, score))}%` }"
      />
    </div>
    <div class="text-right text-xs text-gray-400">{{ score }}%</div>

    <!-- Trust history markers -->
    <div v-if="history && history.length > 0" class="flex gap-1 flex-wrap mt-1">
      <div
        v-for="(h, idx) in history"
        :key="idx"
        class="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300"
        :title="h.trigger"
      >
        {{ h.score }}%
      </div>
    </div>
  </div>
</template>
