<script setup lang="ts">
import { PROTOCOL_LAYERS, LAYER_COLORS, LAYER_TEXT_COLORS } from '../../types';
import type { ProtocolConfig } from '../../types';

const props = defineProps<{
  config: ProtocolConfig;
}>();

const emit = defineEmits<{
  'open-drawer': [];
}>();
</script>

<template>
  <button
    type="button"
    class="w-full text-left flex flex-wrap gap-1 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 transition-colors cursor-pointer"
    @click="emit('open-drawer')"
  >
    <span
      v-for="layer in PROTOCOL_LAYERS"
      :key="layer"
      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
    >
      <span
        class="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        :class="LAYER_COLORS[layer] ?? 'bg-gray-500'"
      />
      <span class="text-gray-500 font-normal">{{ layer }}:</span>
      <span :class="LAYER_TEXT_COLORS[layer] ?? 'text-gray-400'">
        {{ props.config[layer as keyof ProtocolConfig] }}
      </span>
    </span>
  </button>
</template>
