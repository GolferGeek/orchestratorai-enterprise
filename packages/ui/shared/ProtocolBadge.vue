<script setup lang="ts">
import { LAYER_COLORS } from '../../types';

const props = defineProps<{
  layer: string;
  provider: string;
}>();
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white',
      LAYER_COLORS[props.layer] ?? 'bg-gray-500',
    ]"
  >
    <span class="opacity-75">{{ props.layer }}:</span>
    <span>{{ props.provider }}</span>
  </span>
</template>
