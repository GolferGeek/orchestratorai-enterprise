<script setup lang="ts">
defineProps<{
  id: string;
  title: string;
  taskCount: number;
  isDragOver?: boolean;
}>();
</script>

<template>
  <div
    class="kanban-col"
    :class="{ 'drag-over': isDragOver }"
    :style="isDragOver ? 'border-color: var(--color-primary); background: rgba(124, 106, 255, 0.05);' : ''"
  >
    <div class="kanban-col-header">
      <span class="font-medium text-sm">{{ title }}</span>
      <span class="badge badge-secondary">{{ taskCount }}</span>
    </div>

    <slot />
  </div>
</template>
