<script setup lang="ts">
import { ref, watch } from 'vue';
import { useHelpStore } from '../../stores/help.store';
import type { HelpEntry } from '../../content/help';
import HelpBreadcrumb from './HelpBreadcrumb.vue';

const helpStore = useHelpStore();
const searchQuery = ref('');
const searchResults = ref<HelpEntry[]>([]);

watch(searchQuery, (query) => {
  searchResults.value = helpStore.searchHelp(query);
});

function getCrossLinkEntry(linkId: string): HelpEntry | undefined {
  return helpStore.entries.find((e) => e.id === linkId);
}

function navigateTo(id: string) {
  searchQuery.value = '';
  searchResults.value = [];
  helpStore.openHelp(id);
}

const categoryColors: Record<string, string> = {
  protocol: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  provider: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  concept: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  app: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
};
</script>

<template>
  <Teleport to="body">
    <Transition name="panel">
      <div
        v-if="helpStore.activeEntry"
        class="fixed inset-0 z-[65]"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/40"
          @click="helpStore.closeHelp()"
        />

        <!-- Panel -->
        <div class="absolute right-0 top-0 bottom-0 w-[420px] bg-gray-800 border-l border-gray-700 overflow-y-auto shadow-2xl flex flex-col">
          <!-- Header -->
          <div class="p-4 border-b border-gray-700 flex-shrink-0">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-semibold text-white">{{ helpStore.activeEntry.title }}</h2>
                <span
                  :class="[
                    'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                    categoryColors[helpStore.activeEntry.category],
                  ]"
                >
                  {{ helpStore.activeEntry.category }}
                </span>
              </div>
              <button
                class="text-gray-400 hover:text-white transition-colors"
                @click="helpStore.closeHelp()"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p class="text-sm text-gray-400 mb-3">{{ helpStore.activeEntry.oneLiner }}</p>

            <!-- Search -->
            <div class="relative">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search help..."
                class="w-full bg-gray-900 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <!-- Search Results -->
            <div v-if="searchQuery && searchResults.length > 0" class="mt-2 bg-gray-900 rounded-lg border border-gray-700 max-h-[200px] overflow-y-auto">
              <button
                v-for="result in searchResults"
                :key="result.id"
                class="w-full text-left px-3 py-2 hover:bg-gray-700/50 transition-colors border-b border-gray-700/50 last:border-b-0"
                @click="navigateTo(result.id)"
              >
                <div class="text-sm text-white font-medium">{{ result.title }}</div>
                <div class="text-xs text-gray-400 truncate">{{ result.oneLiner }}</div>
              </button>
            </div>
            <div v-else-if="searchQuery && searchResults.length === 0" class="mt-2 text-sm text-gray-400 text-center py-2">
              No results for "{{ searchQuery }}"
            </div>
          </div>

          <!-- Breadcrumb -->
          <HelpBreadcrumb />

          <!-- Content -->
          <div class="p-4 space-y-5 flex-1">
            <div
              v-for="section in helpStore.activeEntry.sections"
              :key="section.heading"
              class="space-y-1.5"
            >
              <h3 class="text-sm font-semibold text-gray-200">{{ section.heading }}</h3>
              <p class="text-sm text-gray-400 leading-relaxed">{{ section.content }}</p>
            </div>
          </div>

          <!-- Cross-links -->
          <div
            v-if="helpStore.activeEntry.crossLinks.length > 0"
            class="p-4 border-t border-gray-700 flex-shrink-0"
          >
            <h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Related</h4>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="linkId in helpStore.activeEntry.crossLinks"
                :key="linkId"
                class="px-2.5 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-full transition-colors"
                @click="navigateTo(linkId)"
              >
                {{ getCrossLinkEntry(linkId)?.title ?? linkId }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.panel-enter-active {
  transition: opacity 0.2s ease;
}
.panel-enter-active > :last-child {
  transition: transform 0.25s ease;
}
.panel-leave-active {
  transition: opacity 0.15s ease;
}
.panel-leave-active > :last-child {
  transition: transform 0.15s ease;
}
.panel-enter-from {
  opacity: 0;
}
.panel-enter-from > :last-child {
  transform: translateX(100%);
}
.panel-leave-to {
  opacity: 0;
}
.panel-leave-to > :last-child {
  transform: translateX(100%);
}
</style>
