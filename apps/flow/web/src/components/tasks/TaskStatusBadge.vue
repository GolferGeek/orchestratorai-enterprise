<script setup lang="ts">
import type { SharedTaskStatus } from '@/types/flow';

const props = defineProps<{
  status: SharedTaskStatus | string;
}>();

const statusConfig: Record<string, { label: string; color: string }> = {
  projects: { label: 'Projects', color: '#7c6aff' },
  this_week: { label: 'This Week', color: '#3b82f6' },
  today: { label: 'Today', color: '#f59e0b' },
  in_progress: { label: 'In Progress', color: '#22c55e' },
  done: { label: 'Done', color: '#888' },
};

function getConfig() {
  return statusConfig[props.status] ?? { label: props.status, color: '#888' };
}
</script>

<template>
  <span
    class="badge"
    :style="{
      background: getConfig().color + '22',
      color: getConfig().color,
    }"
  >
    {{ getConfig().label }}
  </span>
</template>
