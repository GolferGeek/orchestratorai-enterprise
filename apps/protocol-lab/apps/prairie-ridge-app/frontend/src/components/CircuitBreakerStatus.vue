<script setup lang="ts">
import type { CircuitBreakerState } from '@/types';

const props = defineProps<{
  state: CircuitBreakerState;
  label?: string;
  size?: 'sm' | 'md';
}>();

const stateConfig: Record<CircuitBreakerState, { color: string; bg: string; pulse: boolean }> = {
  CLOSED: { color: 'text-emerald-400', bg: 'bg-emerald-500', pulse: false },
  'HALF-OPEN': { color: 'text-amber-400', bg: 'bg-amber-500', pulse: true },
  OPEN: { color: 'text-red-400', bg: 'bg-red-500', pulse: true },
};

const dotSize = props.size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
const fontSize = props.size === 'sm' ? 'text-xxs' : 'text-xs';
</script>

<template>
  <div class="flex items-center gap-1.5">
    <div class="relative flex-shrink-0">
      <div
        :class="[dotSize, stateConfig[state].bg, 'rounded-full']"
      />
      <div
        v-if="stateConfig[state].pulse"
        :class="[dotSize, stateConfig[state].bg, 'rounded-full absolute inset-0 animate-ping opacity-75']"
      />
    </div>
    <span :class="[fontSize, stateConfig[state].color, 'font-medium tracking-wide']">
      {{ label ?? state }}
    </span>
  </div>
</template>
