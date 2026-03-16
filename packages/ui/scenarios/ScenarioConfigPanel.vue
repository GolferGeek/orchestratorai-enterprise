<script setup lang="ts">
import { computed } from 'vue';
import { useScenarioStore } from '../../stores/scenario.store';
import type { ProtocolConfig } from '../../types';
import { PROTOCOL_LAYERS, LAYER_TEXT_COLORS } from '../../types';

const props = defineProps<{
  scenarioId: number;
}>();

const store = useScenarioStore();

const scenario = computed(() => store.scenarios.find((s) => s.id === props.scenarioId));
const effectiveConfig = computed(() => store.getEffectiveConfig(props.scenarioId));
const userOverrides = computed(() => store.scenarioConfigs[props.scenarioId] ?? {});

function isOverridden(layer: string): boolean {
  return layer in userOverrides.value;
}

function providersForLayer(layer: string): string[] {
  return store.availableProviders[layer] ?? [];
}

function currentProvider(layer: string): string {
  return (effectiveConfig.value as Record<string, string>)[layer] ?? '';
}

function handleChange(layer: keyof ProtocolConfig, value: string): void {
  store.setScenarioConfig(props.scenarioId, layer, value);
}

function handleReset(): void {
  store.resetScenarioConfig(props.scenarioId);
}

const hasOverrides = computed(() => Object.keys(userOverrides.value).length > 0);

const layerLabels: Record<string, string> = {
  discovery: 'Discovery',
  transport: 'Transport',
  negotiation: 'Negotiation',
  identity: 'Identity',
  payment: 'Payment',
  wallet: 'Wallet',
  trust: 'Trust',
  encryption: 'Encryption',
  resilience: 'Resilience',
  observability: 'Observability',
  orchestration: 'Orchestration',
  audit: 'Audit',
};
</script>

<template>
  <div class="bg-gray-900 border border-gray-700 rounded-xl p-4 mt-3">
    <div class="flex items-center justify-between mb-4">
      <h4 class="text-sm font-semibold text-gray-200">Protocol Config Override</h4>
      <button
        v-if="hasOverrides"
        class="text-xs text-gray-400 hover:text-gray-200 transition-colors underline"
        @click="handleReset"
      >
        Reset to defaults
      </button>
    </div>

    <p v-if="!scenario" class="text-xs text-gray-500">Scenario not loaded.</p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div
        v-for="layer in PROTOCOL_LAYERS"
        :key="layer"
        class="flex flex-col gap-1"
      >
        <label
          :class="[
            'text-xs font-medium',
            isOverridden(layer) ? 'text-yellow-400' : LAYER_TEXT_COLORS[layer] ?? 'text-gray-400',
          ]"
        >
          {{ layerLabels[layer] ?? layer }}
          <span v-if="isOverridden(layer)" class="ml-1 text-yellow-500 font-normal">(override)</span>
        </label>

        <select
          v-if="providersForLayer(layer).length > 0"
          :value="currentProvider(layer)"
          class="select-field text-xs py-1"
          @change="handleChange(layer as keyof ProtocolConfig, ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>Select {{ layerLabels[layer] ?? layer }}...</option>
          <option
            v-for="provider in providersForLayer(layer)"
            :key="provider"
            :value="provider"
          >
            {{ provider }}
          </option>
        </select>

        <input
          v-else
          type="text"
          :value="currentProvider(layer)"
          class="input-field text-xs py-1"
          :placeholder="layer"
          @change="handleChange(layer as keyof ProtocolConfig, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </div>
</template>
