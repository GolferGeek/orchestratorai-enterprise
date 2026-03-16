<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PipelineStep } from '@/types';
import { getLayerColor } from '@/types';
import { useHelpStore } from '@/stores/help.store';

const props = defineProps<{
  step: PipelineStep;
  isLast?: boolean;
}>();

const helpStore = useHelpStore();

function handleProviderClick(event: MouseEvent) {
  event.stopPropagation();
  helpStore.showProvider(props.step.provider, event.clientX, event.clientY);
}

function handleLayerClick(event: MouseEvent) {
  event.stopPropagation();
  // Could open LayerExplainer, but for now open the help drawer to the layers tab
  helpStore.openDrawer();
}

const expanded = ref(false);
const layerColor = computed(() => getLayerColor(props.step.layer));

const metadataEntries = computed(() =>
  Object.entries(props.step.metadata ?? {}).filter(([, v]) => v !== undefined && v !== null)
);

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Pretty print for key metadata fields
function metaLabel(key: string): string {
  const labels: Record<string, string> = {
    trustScore: 'Trust Score',
    trustLevel: 'Trust Level',
    signatureValid: 'Signature',
    encryptionAlgorithm: 'Encryption',
    state: 'CB State',
    failureCount: 'Failures',
    failureThreshold: 'Threshold',
  };
  return labels[key] ?? key;
}

function metaValueClass(key: string, value: unknown): string {
  if (key === 'signatureValid') return value ? 'text-emerald-400' : 'text-red-400';
  if (key === 'trustScore') return 'text-yellow-400';
  if (key === 'state') {
    if (value === 'CLOSED') return 'text-emerald-400';
    if (value === 'HALF-OPEN') return 'text-amber-400';
    if (value === 'OPEN') return 'text-red-400';
  }
  return 'text-slate-300';
}
</script>

<template>
  <div class="flex gap-3">
    <!-- Step indicator column -->
    <div class="flex flex-col items-center flex-shrink-0 w-8">
      <!-- Circle -->
      <div
        class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 z-10"
        :style="{
          backgroundColor: `${layerColor}20`,
          borderColor: layerColor,
          borderWidth: '1px',
          color: layerColor,
          boxShadow: `0 0 8px ${layerColor}40`,
        }"
      >
        {{ step.stepNumber }}
      </div>
      <!-- Connector line -->
      <div
        v-if="!isLast"
        class="w-px flex-1 mt-1"
        :style="{ backgroundColor: `${layerColor}30` }"
      />
    </div>

    <!-- Step content -->
    <div
      class="flex-1 mb-3 rounded-lg border overflow-hidden"
      :style="{
        borderColor: `${layerColor}30`,
        backgroundColor: `${layerColor}08`,
      }"
    >
      <!-- Step header — always visible -->
      <div
        class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
        @click="expanded = !expanded"
      >
        <!-- Layer badge (clickable) -->
        <button
          class="text-xxs px-1.5 py-0.5 rounded font-mono uppercase tracking-wide flex-shrink-0 hover:brightness-125 transition-all cursor-help"
          :style="{
            backgroundColor: `${layerColor}20`,
            color: layerColor,
            borderColor: `${layerColor}40`,
            borderWidth: '1px',
          }"
          title="Click to learn about this layer"
          @click="handleLayerClick"
        >
          {{ step.layer }}
        </button>

        <!-- Provider badge (clickable) -->
        <button
          class="text-xxs px-1.5 py-0.5 rounded font-mono bg-slate-800/70 text-blue-400 border border-slate-700 flex-shrink-0 hover:bg-blue-900/30 hover:border-blue-700/50 transition-colors cursor-help"
          title="Click to learn about this provider"
          @click="handleProviderClick"
        >
          {{ step.provider }}
        </button>

        <!-- Label -->
        <span class="text-xs text-slate-200 font-medium flex-1 truncate">{{ step.label }}</span>

        <!-- Duration -->
        <span class="text-xxs text-slate-500 font-mono flex-shrink-0">{{ formatDuration(step.duration) }}</span>

        <!-- Expand icon -->
        <svg
          :class="['w-3 h-3 text-slate-500 transition-transform flex-shrink-0', expanded ? 'rotate-180' : '']"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <!-- Metadata pills — always visible -->
      <div v-if="metadataEntries.length > 0" class="px-3 pb-2 flex flex-wrap gap-1.5">
        <div
          v-for="[key, value] in metadataEntries"
          :key="key"
          class="flex items-center gap-1 text-xxs font-mono"
        >
          <span class="text-slate-600">{{ metaLabel(key) }}:</span>
          <span :class="metaValueClass(key, value)">
            {{ typeof value === 'boolean' ? (value ? 'valid' : 'invalid') : String(value) }}
          </span>
        </div>
      </div>

      <!-- Expanded: JSON data viewer -->
      <div v-if="expanded" class="border-t border-slate-700/30">
        <div class="px-3 py-2 bg-slate-950/50">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xxs text-slate-500 uppercase tracking-wide">Data Snapshot</span>
            <span class="text-xxs text-slate-600 font-mono">{{ step.timestamp }}</span>
          </div>
          <pre class="text-xxs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto leading-relaxed">{{ formatJson(step.data) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
