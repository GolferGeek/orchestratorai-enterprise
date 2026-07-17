<script setup lang="ts">
defineProps<{
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}>();

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2">
    <div
      :class="[
        'animate-spin rounded-full border-2 border-gray-600 border-t-protocol-primary',
        sizeClasses[size ?? 'md'],
      ]"
    />
    <span v-if="label" class="text-sm text-gray-400">{{ label }}</span>
  </div>
</template>
