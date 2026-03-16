<template>
  <!-- Empty state -->
  <div
    v-if="!file"
    class="flex flex-col items-center justify-center h-full text-gray-400 gap-3"
  >
    <svg class="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
    <p class="text-sm">Select a file to edit</p>
  </div>

  <!-- Editor -->
  <div v-else class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <div class="flex items-center gap-2 min-w-0">
        <span class="font-medium text-sm truncate">{{ file.name }}</span>
        <span class="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded shrink-0">
          {{ file.fileType }}
        </span>
        <span class="text-xs text-gray-500 shrink-0">
          {{ saving ? 'Saving...' : isDirty ? 'Unsaved changes' : 'Saved' }}
        </span>
      </div>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 shrink-0 transition-colors"
        :disabled="!isDirty || saving"
        @click="$emit('save')"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
        Save
      </button>
    </div>

    <!-- Text area -->
    <textarea
      :value="content"
      class="flex-1 resize-none border-0 outline-none font-mono text-sm p-4 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      placeholder="Start typing..."
      @input="$emit('contentChange', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import type { TeamFileResponse } from '@/types/flow';

interface Props {
  file: TeamFileResponse | null;
  content: string;
  isDirty: boolean;
  saving: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  contentChange: [value: string];
  save: [];
}>();

function handleKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (props.isDirty && !props.saving) {
      emit('save');
    }
  }
}

onMounted(() => document.addEventListener('keydown', handleKeyDown));
onUnmounted(() => document.removeEventListener('keydown', handleKeyDown));
</script>
