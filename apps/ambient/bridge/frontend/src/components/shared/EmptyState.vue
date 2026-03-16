<script setup lang="ts">
import { RouterLink } from 'vue-router';

defineProps<{
  title: string;
  message: string;
  icon?: string;
  actionLabel?: string;
  actionRoute?: string;
}>();
</script>

<template>
  <div class="flex items-center justify-center w-full h-full">
    <div class="bg-gray-800 rounded-lg p-8 flex flex-col items-center text-center space-y-4 max-w-md w-full">
      <svg
        v-if="icon"
        class="text-gray-500"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="icon" />
      </svg>
      <h2 class="text-lg font-semibold text-white">{{ title }}</h2>
      <p class="text-sm text-gray-400">{{ message }}</p>
      <RouterLink
        v-if="actionLabel && actionRoute"
        :to="actionRoute"
        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
      >
        {{ actionLabel }}
      </RouterLink>
    </div>
  </div>
</template>
