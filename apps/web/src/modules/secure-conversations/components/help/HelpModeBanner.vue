<script setup lang="ts">
import { useHelpStore } from '../../stores/help.store';

const helpStore = useHelpStore();
</script>

<template>
  <Transition name="banner">
    <div
      v-if="helpStore.helpModeActive"
      class="fixed top-0 left-0 right-0 z-[55] bg-indigo-900/90 backdrop-blur-sm border-b border-indigo-500/50 animate-banner-pulse"
    >
      <div class="flex items-center justify-center gap-3 px-4 py-2">
        <svg class="w-4 h-4 text-indigo-300" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clip-rule="evenodd"
          />
        </svg>
        <span class="text-sm font-medium text-indigo-100">
          Help Mode Active — click any
          <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/40 text-indigo-200 text-[10px] font-bold mx-0.5">i</span>
          icon for details
        </span>
        <button
          class="ml-2 px-3 py-0.5 text-xs font-medium bg-indigo-700 hover:bg-indigo-600 text-indigo-100 rounded-full transition-colors"
          @click="helpStore.toggleHelpMode()"
        >
          Turn Off
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
@keyframes banner-pulse-border {
  0%, 100% {
    border-color: rgba(99, 102, 241, 0.3);
  }
  50% {
    border-color: rgba(99, 102, 241, 0.7);
  }
}

.animate-banner-pulse {
  animation: banner-pulse-border 3s ease-in-out infinite;
}

.banner-enter-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.banner-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.banner-enter-from,
.banner-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
