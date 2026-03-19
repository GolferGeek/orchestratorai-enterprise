<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  label?: string;
}>();

const stateConfig = computed(() => {
  switch (props.state) {
    case 'CLOSED':
      return {
        color: 'bg-green-500',
        textColor: 'text-green-400',
        borderColor: 'border-green-700',
        label: 'Closed',
        description: 'Normal operation',
      };
    case 'OPEN':
      return {
        color: 'bg-red-500',
        textColor: 'text-red-400',
        borderColor: 'border-red-700',
        label: 'Open',
        description: 'Blocking requests',
      };
    case 'HALF_OPEN':
      return {
        color: 'bg-yellow-500',
        textColor: 'text-yellow-400',
        borderColor: 'border-yellow-700',
        label: 'Half-Open',
        description: 'Testing recovery',
      };
  }
});
</script>

<template>
  <div class="flex items-center gap-2 text-xs">
    <div :class="[stateConfig.color, 'w-2 h-2 rounded-full flex-shrink-0']" />
    <div>
      <span class="text-gray-400">Circuit Breaker: </span>
      <span :class="stateConfig.textColor" class="font-medium">{{ stateConfig.label }}</span>
      <span class="text-gray-500 ml-1">— {{ stateConfig.description }}</span>
    </div>
  </div>
</template>
