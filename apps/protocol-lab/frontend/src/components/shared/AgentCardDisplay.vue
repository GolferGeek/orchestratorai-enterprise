<script setup lang="ts">
import type { AgentCard } from '../../types';
import JsonPayloadViewer from './JsonPayloadViewer.vue';

const props = defineProps<{
  card: AgentCard;
}>();
</script>

<template>
  <div class="card space-y-4">
    <div class="flex items-start justify-between">
      <div>
        <h3 class="text-lg font-semibold text-gray-100">{{ props.card.name }}</h3>
        <p class="text-sm text-gray-400">{{ props.card.description }}</p>
      </div>
      <span class="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">v{{ props.card.version }}</span>
    </div>

    <div>
      <p class="text-xs text-gray-400 mb-1">URL</p>
      <p class="text-sm text-protocol-primary font-mono">{{ props.card.url }}</p>
    </div>

    <div>
      <p class="text-xs text-gray-400 mb-2">Capabilities ({{ props.card.capabilities.length }})</p>
      <div class="space-y-2">
        <div
          v-for="cap in props.card.capabilities"
          :key="cap.id"
          class="bg-gray-900 rounded-lg p-3"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-200">{{ cap.name }}</span>
            <span
              v-if="cap.pricing"
              :class="[
                'text-xs px-2 py-0.5 rounded',
                cap.pricing.model === 'free' ? 'bg-green-900 text-green-300' :
                cap.pricing.model === 'paid' ? 'bg-yellow-900 text-yellow-300' :
                'bg-blue-900 text-blue-300'
              ]"
            >
              {{ cap.pricing.model }}
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-1">{{ cap.description }}</p>
        </div>
      </div>
    </div>

    <div>
      <p class="text-xs text-gray-400 mb-2">Endpoints ({{ props.card.endpoints.length }})</p>
      <div class="space-y-1">
        <div
          v-for="(ep, i) in props.card.endpoints"
          :key="i"
          class="flex items-center gap-2 text-sm"
        >
          <span
            :class="[
              'text-xs font-mono px-1.5 py-0.5 rounded',
              ep.method === 'GET' ? 'bg-blue-900 text-blue-300' :
              ep.method === 'POST' ? 'bg-green-900 text-green-300' :
              ep.method === 'PUT' ? 'bg-yellow-900 text-yellow-300' :
              'bg-red-900 text-red-300'
            ]"
          >
            {{ ep.method }}
          </span>
          <span class="font-mono text-gray-300">{{ ep.path }}</span>
          <span class="text-gray-400 text-xs">{{ ep.description }}</span>
        </div>
      </div>
    </div>

    <JsonPayloadViewer :data="props.card.protocols" label="Supported Protocols" />

    <JsonPayloadViewer v-if="props.card.metadata" :data="props.card.metadata" label="Metadata" />
  </div>
</template>
