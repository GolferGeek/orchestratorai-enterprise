<template>
  <div v-if="message" class="mb-4 p-3 bg-red-950/30 border border-red-700 rounded-lg">
    <p class="text-red-400 text-sm">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ message: string | null }>();
</script>
