<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  getLayerDefinition,
  getProvidersByLayer,
  type LayerDefinition,
  type ProviderDefinition,
} from '@agent-communication/shared-protocols';

const props = defineProps<{
  layerId: string;
  /** Start expanded */
  expanded?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-provider', id: string): void;
}>();

const isExpanded = ref(props.expanded ?? false);

const layer = computed<LayerDefinition | undefined>(() =>
  getLayerDefinition(props.layerId),
);

const providers = computed<ProviderDefinition[]>(() =>
  getProvidersByLayer(props.layerId),
);
</script>

<template>
  <div
    v-if="layer"
    class="rounded-lg border overflow-hidden transition-colors"
    :style="{
      borderColor: `${layer.color}30`,
      backgroundColor: `${layer.color}06`,
    }"
  >
    <!-- Header — always visible -->
    <button
      class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
      @click="isExpanded = !isExpanded"
    >
      <!-- Color dot -->
      <div
        class="w-2.5 h-2.5 rounded-full flex-shrink-0"
        :style="{ backgroundColor: layer.color, boxShadow: `0 0 6px ${layer.color}60` }"
      />

      <!-- Layer name -->
      <span class="text-sm font-semibold text-slate-100 flex-1">{{ layer.name }}</span>

      <!-- Question -->
      <span class="text-xs text-slate-500 italic hidden sm:inline">{{ layer.question }}</span>

      <!-- Expand icon -->
      <svg
        :class="['w-4 h-4 text-slate-500 transition-transform flex-shrink-0', isExpanded ? 'rotate-180' : '']"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Expanded content -->
    <div v-if="isExpanded" class="px-3 pb-3 space-y-2.5 border-t" :style="{ borderColor: `${layer.color}15` }">
      <!-- Summary -->
      <p class="text-xs text-slate-400 leading-relaxed pt-2">{{ layer.summary }}</p>

      <!-- Real-world analogy -->
      <div class="bg-slate-800/30 rounded px-2.5 py-2">
        <span class="text-xxs text-slate-500 uppercase tracking-wide">Real-world analogy</span>
        <p class="text-xs text-slate-300 mt-0.5 leading-relaxed">{{ layer.realWorldAnalogy }}</p>
      </div>

      <!-- Why it matters -->
      <div>
        <span class="text-xxs text-amber-500 uppercase tracking-wide font-semibold">Why it matters</span>
        <p class="text-xs text-slate-400 mt-0.5 leading-relaxed">{{ layer.whyItMatters }}</p>
      </div>

      <!-- Providers in this layer -->
      <div v-if="providers.length > 0">
        <span class="text-xxs text-slate-500 uppercase tracking-wide">Providers</span>
        <div class="flex flex-wrap gap-1.5 mt-1">
          <button
            v-for="p in providers"
            :key="p.id"
            class="text-xxs px-2 py-1 rounded bg-slate-800/60 border border-slate-700/50 hover:bg-slate-700 transition-colors font-mono text-left"
            :style="{ color: layer.color }"
            @click="$emit('select-provider', p.id)"
          >
            <span class="block">{{ p.id }}</span>
            <span class="block text-slate-500 font-sans text-[9px] mt-0.5 line-clamp-1">{{ p.oneLiner }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
