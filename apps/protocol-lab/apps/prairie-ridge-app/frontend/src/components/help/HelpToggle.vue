<script setup lang="ts">
defineProps<{
  active?: boolean;
}>();

defineEmits<{
  (e: 'toggle'): void;
}>();
</script>

<template>
  <button
    class="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 text-sm font-bold"
    :class="[
      active
        ? 'bg-blue-500/30 text-blue-200 border border-blue-400/60 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
        : 'bg-slate-800/80 text-slate-400 border border-slate-700/50 hover:bg-slate-700 hover:text-slate-200 hover:border-slate-500',
    ]"
    title="Toggle help panel (press ? to toggle)"
    @click="$emit('toggle')"
  >
    ?
  </button>
</template>
