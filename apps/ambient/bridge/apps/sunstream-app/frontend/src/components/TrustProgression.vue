<script setup lang="ts">
import type { TrustLevel } from '@/types';
import { computed } from 'vue';

const props = defineProps<{
  level: TrustLevel;
  score: number;
  showLabel?: boolean;
}>();

const levelConfig: Record<TrustLevel, { color: string; label: string; min: number; max: number }> = {
  UNTRUSTED:     { color: '#ef4444', label: 'UNTRUSTED',     min: 0,   max: 25  },
  'FIRST-CONTACT': { color: '#f97316', label: 'FIRST-CONTACT', min: 0,   max: 25  },
  UNVERIFIED:    { color: '#f59e0b', label: 'UNVERIFIED',    min: 25,  max: 50  },
  TRUSTED:       { color: '#22c55e', label: 'TRUSTED',       min: 50,  max: 80  },
  MAXIMUM:       { color: '#10b981', label: 'MAXIMUM',       min: 80,  max: 100 },
};

const config = computed(() => levelConfig[props.level] ?? levelConfig.UNTRUSTED);
const clampedScore = computed(() => Math.min(100, Math.max(0, props.score)));
</script>

<template>
  <div class="space-y-1">
    <div class="flex items-center justify-between">
      <span v-if="showLabel !== false" class="text-xxs text-slate-400 tracking-wide">TRUST</span>
      <div class="flex items-center gap-1.5">
        <span class="text-xxs font-semibold" :style="{ color: config.color }">
          {{ config.label }}
        </span>
        <span class="text-xxs text-slate-500">{{ clampedScore }}%</span>
      </div>
    </div>

    <!-- Track -->
    <div class="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <!-- Background gradient zones -->
      <div class="absolute inset-0 flex">
        <div class="h-full w-1/4 bg-red-900 opacity-30" />
        <div class="h-full w-1/4 bg-orange-900 opacity-30" />
        <div class="h-full w-1/4 bg-yellow-900 opacity-30" />
        <div class="h-full w-1/4 bg-green-900 opacity-30" />
      </div>

      <!-- Fill bar -->
      <div
        class="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
        :style="{
          width: `${clampedScore}%`,
          backgroundColor: config.color,
          boxShadow: `0 0 6px ${config.color}80`,
        }"
      />
    </div>

    <!-- Milestone ticks -->
    <div class="relative h-1 flex justify-between px-0">
      <div v-for="tick in [25, 50, 75]" :key="tick" class="w-px h-1 bg-slate-600" />
    </div>
  </div>
</template>
