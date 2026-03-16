<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  total: number;
  done: number;
}>();

const percent = computed(() => (props.total === 0 ? 0 : Math.round((props.done / props.total) * 100)));
</script>

<template>
  <div>
    <div class="flex items-center justify-between text-xs mb-1">
      <span class="text-muted">Progress</span>
      <span class="font-medium">{{ done }}/{{ total }} ({{ percent }}%)</span>
    </div>
    <div
      style="height:6px;background:var(--color-bg-secondary);border-radius:3px;overflow:hidden;"
    >
      <div
        style="height:100%;border-radius:3px;transition:width 0.3s;background:var(--color-primary);"
        :style="{ width: percent + '%' }"
      />
    </div>
  </div>
</template>
