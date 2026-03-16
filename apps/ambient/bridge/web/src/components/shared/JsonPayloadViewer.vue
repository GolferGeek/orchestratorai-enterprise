<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  data: unknown;
  label?: string;
  initialOpen?: boolean;
}>();

const isOpen = ref(props.initialOpen ?? false);

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function toggle() {
  isOpen.value = !isOpen.value;
}
</script>

<template>
  <div class="border border-gray-700 rounded-lg overflow-hidden">
    <button
      class="w-full flex items-center justify-between px-3 py-2 bg-gray-800 hover:bg-gray-750 text-left text-sm font-medium text-gray-300"
      @click="toggle"
    >
      <span>{{ props.label ?? 'JSON Payload' }}</span>
      <svg
        :class="['w-4 h-4 transition-transform', isOpen ? 'rotate-180' : '']"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    <div v-if="isOpen" class="bg-gray-900 p-3 overflow-x-auto">
      <pre class="text-xs text-gray-300 font-mono whitespace-pre">{{ formatJson(props.data) }}</pre>
    </div>
  </div>
</template>
