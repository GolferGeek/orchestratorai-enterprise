<script setup lang="ts">
import { computed } from 'vue';
import type { TrustInfo } from '../../types';

const props = defineProps<{
  trust: TrustInfo;
}>();

const levelConfig = computed(() => {
  switch (props.trust.level) {
    case 'trusted':
      return { stroke: 'stroke-green-500', text: 'text-green-400', label: 'Trusted' };
    case 'neutral':
      return { stroke: 'stroke-yellow-500', text: 'text-yellow-400', label: 'Neutral' };
    case 'untrusted':
      return { stroke: 'stroke-red-500', text: 'text-red-400', label: 'Untrusted' };
    case 'unknown':
      return { stroke: 'stroke-gray-500', text: 'text-gray-400', label: 'Unknown' };
  }
});

const circumference = 2 * Math.PI * 36;

const dashOffset = computed(() => {
  const progress = props.trust.score / 100;
  return circumference * (1 - progress);
});
</script>

<template>
  <div class="flex flex-col items-center">
    <div class="relative w-24 h-24">
      <svg class="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke-width="6"
          class="stroke-gray-700"
        />
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke-width="6"
          stroke-linecap="round"
          :class="levelConfig.stroke"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="dashOffset"
        />
      </svg>
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-xl font-bold text-white">{{ props.trust.score }}</span>
      </div>
    </div>
    <span :class="['text-sm font-medium mt-1', levelConfig.text]">{{ levelConfig.label }}</span>
    <span class="text-xs text-gray-400 mt-0.5">{{ props.trust.interactions }} interactions</span>
    <span class="text-xs text-gray-400 mt-0.5">{{ props.trust.provider }}</span>
  </div>
</template>
