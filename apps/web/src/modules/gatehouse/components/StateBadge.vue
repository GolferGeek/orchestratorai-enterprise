<template>
  <span :class="['text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', tone]">{{ label ?? state }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ state: string; label?: string }>();

const GOOD = new Set(['completed', 'answered', 'active', 'published', 'sent']);
const BAD = new Set(['failed', 'rejected', 'refused', 'suspended']);
const BUSY = new Set(['working', 'submitted', 'sending', 'waiting']);

const tone = computed(() => {
  if (GOOD.has(props.state)) return 'bg-green-900 text-green-300';
  if (BAD.has(props.state)) return 'bg-red-900 text-red-300';
  if (BUSY.has(props.state)) return 'bg-blue-900 text-blue-300';
  return 'bg-gray-700 text-gray-400';
});
</script>
