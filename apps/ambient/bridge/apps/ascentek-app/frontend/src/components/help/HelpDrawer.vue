<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  LAYER_DEFINITIONS,
  PROVIDER_DEFINITIONS,
  getProvidersByLayer,
  type CodeReference,
} from '@agent-communication/shared-protocols';
import LayerExplainer from './LayerExplainer.vue';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select-provider', id: string): void;
  (e: 'view-code', ref: CodeReference): void;
}>();

const activeTab = ref<'layers' | 'providers' | 'about'>('layers');
const searchQuery = ref('');

// Filter providers by search
const filteredProviders = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return PROVIDER_DEFINITIONS;
  return PROVIDER_DEFINITIONS.filter(
    (p) =>
      p.id.includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.layer.includes(q) ||
      p.oneLiner.toLowerCase().includes(q),
  );
});

// Group providers by layer for the providers tab
const providersByLayer = computed(() => {
  const groups: { layerId: string; layerName: string; color: string; providers: typeof PROVIDER_DEFINITIONS }[] = [];
  for (const layer of LAYER_DEFINITIONS) {
    const lp = filteredProviders.value.filter((p) => p.layer === layer.id);
    if (lp.length > 0) {
      groups.push({ layerId: layer.id, layerName: layer.name, color: layer.color, providers: lp });
    }
  }
  return groups;
});

// Close on Escape
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/40 z-40"
    @click="$emit('close')"
  />

  <!-- Drawer -->
  <div class="fixed top-0 right-0 bottom-0 w-[420px] max-w-[90vw] z-50 bg-slate-900 border-l border-slate-700/50 shadow-2xl flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-800/50 flex-shrink-0">
      <h2 class="text-sm font-bold text-slate-100">Protocol Reference</h2>
      <button class="text-slate-500 hover:text-slate-300 p-1" @click="$emit('close')">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-slate-700/50 flex-shrink-0">
      <button
        v-for="tab in (['layers', 'providers', 'about'] as const)"
        :key="tab"
        class="flex-1 text-xs py-2 font-medium transition-colors capitalize"
        :class="activeTab === tab ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'"
        @click="activeTab = tab"
      >
        {{ tab === 'layers' ? 'Layers (12)' : tab === 'providers' ? `Providers (${PROVIDER_DEFINITIONS.length})` : 'About' }}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <!-- Layers tab -->
      <div v-if="activeTab === 'layers'" class="p-3 space-y-2">
        <LayerExplainer
          v-for="layer in LAYER_DEFINITIONS"
          :key="layer.id"
          :layer-id="layer.id"
          @select-provider="$emit('select-provider', $event)"
        />
      </div>

      <!-- Providers tab -->
      <div v-else-if="activeTab === 'providers'" class="p-3">
        <!-- Search -->
        <div class="mb-3">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search providers..."
            class="w-full px-3 py-1.5 text-xs bg-slate-800 border border-slate-700/50 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
          />
        </div>

        <!-- Grouped list -->
        <div class="space-y-4">
          <div v-for="group in providersByLayer" :key="group.layerId">
            <div class="flex items-center gap-2 mb-1.5">
              <div
                class="w-2 h-2 rounded-full"
                :style="{ backgroundColor: group.color }"
              />
              <span class="text-xxs text-slate-500 uppercase tracking-wide font-semibold">{{ group.layerName }}</span>
            </div>
            <div class="space-y-1 pl-4">
              <button
                v-for="p in group.providers"
                :key="p.id"
                class="w-full text-left px-2.5 py-2 rounded bg-slate-800/40 border border-slate-700/30 hover:bg-slate-800 hover:border-slate-600/50 transition-colors"
                @click="$emit('select-provider', p.id)"
              >
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono font-semibold" :style="{ color: group.color }">{{ p.id }}</span>
                  <span class="text-xxs text-slate-600">{{ p.scenarios.map(s => `S-${s}`).join(', ') }}</span>
                </div>
                <p class="text-xxs text-slate-500 mt-0.5 line-clamp-1">{{ p.oneLiner }}</p>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- About tab -->
      <div v-else class="p-4 space-y-4">
        <div>
          <h3 class="text-sm font-bold text-slate-100 mb-2">Agent Communication Protocol Playground</h3>
          <p class="text-xs text-slate-400 leading-relaxed">
            This fishbowl demonstrates a complete agent-to-agent communication protocol stack. Each scenario runs a real multi-step pipeline through
            12 protocol layers using 31 different providers — from discovery and identity verification through encryption, trust evaluation, payment
            settlement, and tamper-evident audit logging.
          </p>
        </div>

        <div>
          <h4 class="text-xs font-semibold text-slate-200 mb-1">How to use this</h4>
          <ul class="space-y-1.5 text-xs text-slate-400">
            <li class="flex items-start gap-2">
              <span class="text-blue-400 mt-0.5 flex-shrink-0">1.</span>
              <span>Click a scenario card to run it. The pipeline trace shows each protocol step.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-blue-400 mt-0.5 flex-shrink-0">2.</span>
              <span>Click the <strong class="text-slate-300">info icon</strong> on a scenario card for an explanation of what's being tested and why.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-blue-400 mt-0.5 flex-shrink-0">3.</span>
              <span>Click any <strong class="text-slate-300">provider badge</strong> (e.g., "oauth-jwt", "envelope") to see how that technology works.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-blue-400 mt-0.5 flex-shrink-0">4.</span>
              <span>Click <strong class="text-slate-300">"View source"</strong> in any provider popover to see the actual TypeScript implementation.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-blue-400 mt-0.5 flex-shrink-0">5.</span>
              <span>Expand pipeline steps to see the raw JSON data captured at each layer.</span>
            </li>
          </ul>
        </div>

        <div>
          <h4 class="text-xs font-semibold text-slate-200 mb-1">Protocol stack</h4>
          <p class="text-xs text-slate-400 leading-relaxed">
            Every message passes through: <strong class="text-slate-300">Discovery</strong> (find the target) →
            <strong class="text-slate-300">Identity</strong> (prove who you are) →
            <strong class="text-slate-300">Encryption</strong> (protect the message) →
            <strong class="text-slate-300">Transport</strong> (deliver it) →
            <strong class="text-slate-300">Trust</strong> (should I accept this?) →
            <strong class="text-slate-300">Business</strong> (do the work) →
            <strong class="text-slate-300">Audit</strong> (record what happened).
            Additional layers (payment, negotiation, resilience, observability, orchestration) are added based on the scenario's requirements.
          </p>
        </div>

        <div class="text-xxs text-slate-600 border-t border-slate-800 pt-3">
          Press <kbd class="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-400">?</kbd> to toggle this panel.
          Press <kbd class="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-400">Esc</kbd> to close.
        </div>
      </div>
    </div>
  </div>
</template>
