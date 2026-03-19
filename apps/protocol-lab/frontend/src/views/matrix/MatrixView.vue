<script setup lang="ts">
import { ref } from 'vue';
import type { ProtocolLayer } from '../../types';
import { useProtocolStore } from '../../stores/protocol.store';
import ProtocolMatrix from '../../components/matrix/ProtocolMatrix.vue';

const protocolStore = useProtocolStore();
const selected = ref<{ layer: ProtocolLayer; suiteId: string; provider: string } | null>(null);
const lastLoadedPreset = ref<string | null>(null);

function onSelectCell(payload: { layer: ProtocolLayer; suiteId: string; provider: string }): void {
  selected.value = payload;
}

function onLoadPreset(presetId: string): void {
  protocolStore.selectPreset(presetId);
  lastLoadedPreset.value = presetId;
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold text-white">Protocol Compatibility Matrix</h1>
      <p class="text-sm text-slate-400 mt-1">
        Compare suite coverage across all 12 protocol layers. Click a suite header to load that preset.
      </p>
    </div>

    <div class="card space-y-3">
      <h2 class="text-sm font-semibold text-slate-200">Legend</h2>
      <div class="flex flex-wrap gap-3 text-xs">
        <span class="px-2 py-1 rounded-md border border-emerald-600/40 bg-emerald-900/20 text-emerald-200">
          Implemented
        </span>
        <span class="px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-900/20 text-cyan-200">
          Coupled Bundle
        </span>
        <span class="px-2 py-1 rounded-md border border-slate-700 bg-slate-900/50 text-slate-500">
          N/A
        </span>
      </div>
      <p v-if="lastLoadedPreset" data-testid="matrix-loaded-preset" class="text-xs text-indigo-300">
        Loaded preset: {{ lastLoadedPreset }}
      </p>
    </div>

    <div class="card">
      <ProtocolMatrix @select-cell="onSelectCell" @load-preset="onLoadPreset" />
    </div>

    <div class="card" v-if="selected" data-testid="matrix-provider-details">
      <h2 class="text-sm font-semibold text-slate-200 mb-2">Provider Details</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div class="rounded-md bg-slate-900/70 border border-slate-700 px-3 py-2">
          <p class="text-slate-400">Layer</p>
          <p class="text-slate-200">{{ selected.layer }}</p>
        </div>
        <div class="rounded-md bg-slate-900/70 border border-slate-700 px-3 py-2">
          <p class="text-slate-400">Suite</p>
          <p class="text-slate-200">{{ selected.suiteId }}</p>
        </div>
        <div class="rounded-md bg-slate-900/70 border border-slate-700 px-3 py-2">
          <p class="text-slate-400">Provider</p>
          <p class="text-slate-200">{{ selected.provider }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
