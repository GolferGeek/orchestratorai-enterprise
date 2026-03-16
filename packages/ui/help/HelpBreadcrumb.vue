<script setup lang="ts">
import { useHelpStore } from '../../stores/help.store';

const helpStore = useHelpStore();

function getEntryTitle(id: string): string {
  const entry = helpStore.entries.find((e) => e.id === id);
  return entry?.title ?? id;
}
</script>

<template>
  <div
    v-if="helpStore.activeEntryId && helpStore.recentlyViewed.length > 1"
    class="px-4 py-2 border-b border-gray-700/50 flex-shrink-0"
  >
    <div class="flex items-center gap-1.5 overflow-x-auto">
      <span class="text-[10px] text-gray-400 uppercase tracking-wider flex-shrink-0 mr-1">Recent</span>
      <button
        v-for="id in helpStore.recentlyViewed"
        :key="id"
        :class="[
          'px-2 py-0.5 text-[11px] font-medium rounded-full transition-colors flex-shrink-0',
          id === helpStore.activeEntryId
            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200',
        ]"
        @click="helpStore.openHelp(id)"
      >
        {{ getEntryTitle(id) }}
      </button>
    </div>
  </div>
</template>
