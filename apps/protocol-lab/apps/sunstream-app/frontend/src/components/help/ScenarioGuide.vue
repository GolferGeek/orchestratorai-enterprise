<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  getScenarioExplanation,
  getProviderDefinition,
  type ScenarioExplanation,
  type CodeReference,
} from '@agent-communication/shared-protocols';

const props = defineProps<{
  scenarioId: number;
  ecosystem: 'sunstream' | 'ascentek';
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select-provider', id: string): void;
  (e: 'view-code', ref: CodeReference): void;
}>();

const mode = ref<'summary' | 'deep-dive'>('summary');

const explanation = computed<ScenarioExplanation | undefined>(() =>
  getScenarioExplanation(props.ecosystem, props.scenarioId),
);

const techEntries = computed(() =>
  Object.entries(explanation.value?.keyTechnologies ?? {}),
);
</script>

<template>
  <div
    v-if="explanation"
    class="bg-slate-900/90 border border-slate-700/50 rounded-lg overflow-hidden"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/40 bg-slate-800/30">
      <div class="flex items-center gap-2">
        <span class="text-xxs font-mono text-slate-500">S-{{ explanation.id }}</span>
        <h3 class="text-sm font-bold text-slate-100">{{ explanation.name }}</h3>
      </div>
      <div class="flex items-center gap-2">
        <!-- Mode toggle -->
        <div class="flex rounded overflow-hidden border border-slate-700/50">
          <button
            class="text-xxs px-2 py-1 transition-colors"
            :class="mode === 'summary' ? 'bg-blue-600/40 text-blue-200' : 'bg-slate-800 text-slate-500 hover:text-slate-300'"
            @click="mode = 'summary'"
          >
            Summary
          </button>
          <button
            class="text-xxs px-2 py-1 transition-colors"
            :class="mode === 'deep-dive' ? 'bg-blue-600/40 text-blue-200' : 'bg-slate-800 text-slate-500 hover:text-slate-300'"
            @click="mode = 'deep-dive'"
          >
            Deep Dive
          </button>
        </div>
        <!-- Close -->
        <button class="text-slate-500 hover:text-slate-300 p-0.5" @click="$emit('close')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Summary mode -->
    <div v-if="mode === 'summary'" class="px-4 py-3">
      <p class="text-xs text-slate-300 leading-relaxed">{{ explanation.whatIsBeingTested }}</p>
    </div>

    <!-- Deep dive mode -->
    <div v-else class="px-4 py-3 space-y-3 max-h-[400px] overflow-y-auto">
      <!-- What's being tested -->
      <div>
        <h4 class="text-xs font-semibold text-slate-200 mb-1">What's being tested</h4>
        <p class="text-xs text-slate-400 leading-relaxed">{{ explanation.whatIsBeingTested }}</p>
      </div>

      <!-- Why this matters -->
      <div>
        <h4 class="text-xs font-semibold text-amber-400 mb-1">Why this matters</h4>
        <p class="text-xs text-slate-400 leading-relaxed">{{ explanation.whyThisMatters }}</p>
      </div>

      <!-- Key technologies -->
      <div v-if="techEntries.length > 0">
        <h4 class="text-xs font-semibold text-blue-400 mb-2">Key technologies</h4>
        <div class="space-y-2">
          <div
            v-for="[techId, description] in techEntries"
            :key="techId"
            class="flex gap-2 items-start"
          >
            <button
              class="text-xxs px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 hover:bg-blue-900/30 hover:border-blue-700/50 text-blue-400 font-mono flex-shrink-0 mt-0.5 transition-colors"
              @click="$emit('select-provider', techId.split(' ')[0].replace('→', '').replace('+', '').trim())"
            >
              {{ techId }}
            </button>
            <p class="text-xs text-slate-400 leading-relaxed">{{ description }}</p>
          </div>
        </div>
      </div>

      <!-- What to verify -->
      <div v-if="explanation.whatToVerify.length > 0">
        <h4 class="text-xs font-semibold text-emerald-400 mb-1.5">What to verify</h4>
        <ul class="space-y-1">
          <li
            v-for="(item, idx) in explanation.whatToVerify"
            :key="idx"
            class="flex items-start gap-2 text-xs text-slate-400"
          >
            <span class="text-emerald-600 mt-0.5 flex-shrink-0">&#9744;</span>
            <span class="leading-relaxed">{{ item }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
