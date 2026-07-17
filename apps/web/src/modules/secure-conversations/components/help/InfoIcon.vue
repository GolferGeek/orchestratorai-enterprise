<script setup lang="ts">
import { ref } from 'vue';
import { useHelpStore } from '../../stores/help.store';

const props = withDefaults(
  defineProps<{
    helpId: string;
    size?: 'sm' | 'md';
  }>(),
  { size: 'sm' },
);

const helpStore = useHelpStore();
const hovering = ref(false);

const entry = helpStore.entries.find((e) => e.id === props.helpId);

function handleClick() {
  helpStore.openHelp(props.helpId);
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
};
</script>

<template>
  <span
    class="inline-flex items-center justify-center relative cursor-pointer"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
    @click.stop="handleClick"
  >
    <svg
      :class="[
        sizeClasses[size],
        'text-gray-400 hover:text-indigo-400 transition-colors flex-shrink-0',
        helpStore.helpModeActive ? 'animate-help-pulse text-indigo-400' : '',
      ]"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clip-rule="evenodd"
      />
    </svg>

    <!-- Tooltip -->
    <Transition name="tooltip">
      <div
        v-if="hovering && entry"
        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-700 text-gray-200 text-xs rounded-lg shadow-lg whitespace-nowrap z-[70] pointer-events-none max-w-[280px]"
      >
        <span class="whitespace-normal">{{ entry.oneLiner }}</span>
        <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
          <div class="border-4 border-transparent border-t-gray-700" />
        </div>
      </div>
    </Transition>
  </span>
</template>

<style scoped>
@keyframes help-pulse {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(129, 140, 248, 0.4));
  }
  50% {
    filter: drop-shadow(0 0 8px rgba(129, 140, 248, 0.8));
  }
}

.animate-help-pulse {
  animation: help-pulse 2s ease-in-out infinite;
}

.tooltip-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.tooltip-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translate(-50%, 4px);
}
</style>
