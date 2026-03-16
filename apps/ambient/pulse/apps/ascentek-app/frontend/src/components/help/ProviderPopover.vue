<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  PROVIDER_DEFINITIONS,
  getProviderDefinition,
  getLayerForProvider,
  PROVIDER_CODE_REFS,
  type ProviderDefinition,
  type LayerDefinition,
  type CodeReference,
} from '@agent-communication/shared-protocols';

const props = defineProps<{
  providerId: string;
  /** Anchor position relative to viewport */
  anchorX?: number;
  anchorY?: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'view-code', ref: CodeReference): void;
  (e: 'select-provider', id: string): void;
  (e: 'select-scenario', id: number): void;
}>();

const provider = computed<ProviderDefinition | undefined>(() =>
  getProviderDefinition(props.providerId),
);

const layer = computed<LayerDefinition | undefined>(() =>
  getLayerForProvider(props.providerId),
);

const codeRef = computed<CodeReference | undefined>(() =>
  PROVIDER_CODE_REFS.find((r) => r.id === props.providerId),
);

const showDetails = ref(false);

const popoverStyle = computed(() => ({
  left: `${Math.min(props.anchorX ?? 200, window.innerWidth - 400)}px`,
  top: `${Math.min(props.anchorY ?? 200, window.innerHeight - 520)}px`,
}));

// Close on escape
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div
    v-if="provider"
    class="fixed z-50 w-[380px] max-h-[500px] overflow-y-auto rounded-lg border border-slate-600/70 bg-slate-900/95 backdrop-blur-md shadow-2xl"
    :style="popoverStyle"
  >
    <!-- Header -->
    <div class="flex items-start justify-between px-4 pt-3 pb-2 border-b border-slate-700/50">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <!-- Layer badge -->
          <span
            v-if="layer"
            class="text-xxs px-1.5 py-0.5 rounded font-mono uppercase tracking-wide"
            :style="{
              backgroundColor: `${layer.color}20`,
              color: layer.color,
              borderColor: `${layer.color}40`,
              borderWidth: '1px',
            }"
          >
            {{ layer.name }}
          </span>
        </div>
        <h3 class="text-sm font-bold text-slate-100">{{ provider.name }}</h3>
        <p class="text-xs text-slate-400 mt-0.5">{{ provider.oneLiner }}</p>
      </div>
      <button
        class="text-slate-500 hover:text-slate-300 p-1 -mr-1"
        @click="$emit('close')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Body -->
    <div class="px-4 py-3 space-y-3">
      <!-- How It Works -->
      <div>
        <button
          class="flex items-center gap-1 text-xs font-semibold text-slate-300 mb-1 hover:text-slate-100"
          @click="showDetails = !showDetails"
        >
          <svg
            :class="['w-3 h-3 transition-transform', showDetails ? 'rotate-90' : '']"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          How It Works
        </button>
        <p v-if="showDetails" class="text-xs text-slate-400 leading-relaxed pl-4">
          {{ provider.howItWorks }}
        </p>
      </div>

      <!-- What To Look For -->
      <div>
        <h4 class="text-xs font-semibold text-emerald-400 mb-1">What to look for in the trace</h4>
        <p class="text-xs text-slate-400 leading-relaxed">{{ provider.whatToLookFor }}</p>
      </div>

      <!-- Used in Scenarios -->
      <div v-if="provider.scenarios.length > 0">
        <h4 class="text-xs font-semibold text-slate-300 mb-1">Used in scenarios</h4>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="sid in provider.scenarios"
            :key="sid"
            class="text-xxs px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/50 hover:bg-slate-700 hover:text-slate-200 transition-colors"
            @click="$emit('select-scenario', sid)"
          >
            S-{{ sid }}
          </button>
        </div>
      </div>

      <!-- Related Providers -->
      <div v-if="provider.relatedProviders.length > 0">
        <h4 class="text-xs font-semibold text-slate-300 mb-1">Related</h4>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="rp in provider.relatedProviders"
            :key="rp"
            class="text-xxs px-1.5 py-0.5 rounded bg-slate-800/60 text-blue-400 border border-slate-700/50 hover:bg-blue-900/30 hover:border-blue-700/50 transition-colors font-mono"
            @click="$emit('select-provider', rp)"
          >
            {{ rp }}
          </button>
        </div>
      </div>

      <!-- View Code -->
      <div v-if="codeRef" class="pt-1 border-t border-slate-700/30">
        <button
          class="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          @click="$emit('view-code', codeRef!)"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          View {{ codeRef.className }} source
        </button>
        <p class="text-xxs text-slate-600 font-mono mt-0.5 pl-5">{{ codeRef.sourceFile }}</p>
      </div>

      <!-- Spec reference -->
      <div class="text-xxs text-slate-600 pt-1">
        Spec: {{ provider.spec }}
      </div>
    </div>
  </div>
</template>
