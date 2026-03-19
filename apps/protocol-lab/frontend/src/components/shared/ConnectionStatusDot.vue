<script setup lang="ts">
import type { AgentStatus } from '../../types';

const props = defineProps<{
  status: AgentStatus;
  size?: 'sm' | 'md' | 'lg';
}>();

const sizeClasses = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
};

const colorClasses = {
  online: 'bg-green-500',
  offline: 'bg-red-500',
  degraded: 'bg-yellow-500',
};
</script>

<template>
  <span
    :class="[
      'inline-block rounded-full',
      sizeClasses[props.size ?? 'md'],
      colorClasses[props.status],
    ]"
    :title="props.status"
  />
</template>
