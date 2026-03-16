<script setup lang="ts">
import { ref, onMounted } from 'vue';

const props = defineProps<{
  message: string;
  dismissKey: string;
}>();

const dismissed = ref(true); // Start hidden, show only if not previously dismissed

onMounted(() => {
  try {
    const stored = localStorage.getItem(`hint-dismissed-${props.dismissKey}`);
    dismissed.value = stored === 'true';
  } catch {
    // localStorage may be unavailable in some browser contexts
    dismissed.value = false;
  }
});

function dismiss() {
  dismissed.value = true;
  try {
    localStorage.setItem(`hint-dismissed-${props.dismissKey}`, 'true');
  } catch {
    // localStorage may be unavailable in some browser contexts
  }
}
</script>

<template>
  <Transition name="hint">
    <div
      v-if="!dismissed"
      class="flex items-start gap-2.5 bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5"
    >
      <!-- Lightbulb icon -->
      <svg class="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 00.75.75h2.5a.75.75 0 00.75-.75v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.863 17.414a.75.75 0 00-.226 1.483 9.066 9.066 0 002.726 0 .75.75 0 00-.226-1.483 7.567 7.567 0 01-2.274 0z" />
      </svg>

      <p class="text-sm text-gray-400 flex-1 leading-relaxed">{{ message }}</p>

      <button
        class="text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors whitespace-nowrap flex-shrink-0"
        @click="dismiss"
      >
        Got it
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.hint-enter-active {
  transition: opacity 0.2s ease, max-height 0.3s ease;
}
.hint-leave-active {
  transition: opacity 0.15s ease, max-height 0.2s ease;
}
.hint-enter-from,
.hint-leave-to {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
}
.hint-enter-to,
.hint-leave-from {
  max-height: 100px;
}
</style>
