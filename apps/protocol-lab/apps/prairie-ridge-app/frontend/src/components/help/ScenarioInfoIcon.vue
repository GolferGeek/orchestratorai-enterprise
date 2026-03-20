<script setup lang="ts">
defineProps<{
  scenarioId: number;
  active?: boolean;
}>();

defineEmits<{
  (e: 'toggle', id: number): void;
}>();
</script>

<template>
  <button
    class="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 flex-shrink-0"
    :class="[
      active
        ? 'bg-blue-500/40 text-blue-200 border border-blue-400/60 shadow-[0_0_6px_rgba(59,130,246,0.3)]'
        : 'bg-slate-700/50 text-slate-500 border border-slate-600/50 hover:bg-slate-700 hover:text-slate-300 hover:border-slate-500',
    ]"
    title="Show scenario guide"
    @click.stop="$emit('toggle', scenarioId)"
  >
    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
  </button>
</template>
