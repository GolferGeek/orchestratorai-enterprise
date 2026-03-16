<script setup lang="ts">
import type { SprintResponse } from '@/types/flow';
import SprintProgress from './SprintProgress.vue';

defineProps<{
  sprint: SprintResponse;
  taskCount?: number;
  doneCount?: number;
  selected?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', sprintId: string): void;
  (e: 'activate', sprintId: string): void;
}>();

function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
</script>

<template>
  <div
    class="card"
    :style="{
      cursor: 'pointer',
      borderColor: selected ? 'var(--color-primary)' : sprint.isActive ? 'var(--color-success)' : 'var(--color-border)',
      borderWidth: selected || sprint.isActive ? '2px' : '1px',
    }"
    @click="emit('select', sprint.id)"
  >
    <div class="flex items-start justify-between gap-2 mb-2">
      <div>
        <div class="font-semibold" style="font-size:14px;">{{ sprint.name }}</div>
        <div class="text-xs text-muted">{{ formatDate(sprint.startDate) }} → {{ formatDate(sprint.endDate) }}</div>
      </div>
      <div class="flex gap-1">
        <span v-if="sprint.isActive" class="badge badge-success">Active</span>
        <button
          v-else
          class="btn btn-ghost btn-sm"
          @click.stop="emit('activate', sprint.id)"
        >
          Activate
        </button>
      </div>
    </div>

    <div v-if="sprint.description" class="text-sm text-muted mb-3">
      {{ sprint.description }}
    </div>

    <SprintProgress :total="taskCount ?? 0" :done="doneCount ?? 0" />
  </div>
</template>
