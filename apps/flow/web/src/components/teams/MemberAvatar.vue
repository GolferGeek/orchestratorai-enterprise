<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  displayName?: string | null;
  userId?: string;
  size?: number;
}>();

const initials = computed(() => {
  const name = props.displayName ?? props.userId ?? '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
});

const bg = computed(() => {
  const seed = props.userId ?? props.displayName ?? '';
  const colors = ['#7c6aff', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash += seed.charCodeAt(i);
  return colors[hash % colors.length];
});

const size = computed(() => props.size ?? 32);
</script>

<template>
  <div
    class="avatar"
    :style="{
      width: size + 'px',
      height: size + 'px',
      fontSize: Math.round(size * 0.375) + 'px',
      background: bg,
    }"
    :title="displayName ?? userId"
  >
    {{ initials }}
  </div>
</template>
