<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PipelineStep } from '@/services/api';
import { useHelpStore } from '@/stores/help.store';

const props = defineProps<{
  step: PipelineStep;
}>();

const helpStore = useHelpStore();

const expanded = ref(false);

const layerColor = computed(() => {
  const map: Record<string, string> = {
    transport: 'border-l-blue-500 bg-blue-500/5',
    identity: 'border-l-purple-500 bg-purple-500/5',
    encryption: 'border-l-yellow-500 bg-yellow-500/5',
    trust: 'border-l-green-500 bg-green-500/5',
    payment: 'border-l-orange-500 bg-orange-500/5',
    business: 'border-l-pink-500 bg-pink-500/5',
    data: 'border-l-cyan-500 bg-cyan-500/5',
    reliability: 'border-l-red-500 bg-red-500/5',
    orchestration: 'border-l-indigo-500 bg-indigo-500/5',
  };
  return map[props.step.layer] ?? 'border-l-gray-500 bg-gray-500/5';
});

const layerBadgeColor = computed(() => {
  const map: Record<string, string> = {
    transport: 'bg-blue-500/20 text-blue-300',
    identity: 'bg-purple-500/20 text-purple-300',
    encryption: 'bg-yellow-500/20 text-yellow-300',
    trust: 'bg-green-500/20 text-green-300',
    payment: 'bg-orange-500/20 text-orange-300',
    business: 'bg-pink-500/20 text-pink-300',
    data: 'bg-cyan-500/20 text-cyan-300',
    reliability: 'bg-red-500/20 text-red-300',
    orchestration: 'bg-indigo-500/20 text-indigo-300',
  };
  return map[props.step.layer] ?? 'bg-gray-600/50 text-gray-300';
});

function formatJson(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
</script>

<template>
  <div class="relative">
    <!-- Connector line (not for last step) -->
    <div class="absolute left-4 top-full w-0.5 h-3 bg-gray-700 z-10" />

    <!-- Step card -->
    <div
      class="border-l-4 rounded-r-lg px-3 py-2 cursor-pointer transition-colors"
      :class="[layerColor, expanded ? 'rounded-lg' : '']"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-2">
        <span class="text-gray-500 text-xs w-5 flex-shrink-0">{{ step.stepNumber }}</span>
        <button :class="layerBadgeColor" class="text-xs px-1.5 py-0.5 rounded flex-shrink-0 hover:brightness-125 cursor-help" @click.stop="helpStore.openDrawer()">{{ step.layer }}</button>
        <button class="text-blue-400 text-xs flex-shrink-0 hover:text-blue-300 cursor-help" @click.stop="helpStore.showProvider(step.provider, $event.clientX, $event.clientY)">{{ step.provider }}</button>
        <span class="text-gray-200 text-xs font-medium flex-1 truncate">{{ step.label }}</span>
        <span class="text-gray-600 text-xs flex-shrink-0">{{ step.durationMs }}ms</span>
        <span class="text-gray-600 text-xs">{{ expanded ? '▲' : '▼' }}</span>
      </div>

      <!-- Metadata row -->
      <div v-if="step.metadata && Object.keys(step.metadata).length > 0" class="flex gap-2 mt-1 ml-7 flex-wrap">
        <span
          v-if="step.metadata.trustScore !== undefined"
          class="text-xs text-green-400"
        >
          trust: {{ step.metadata.trustScore }}%
        </span>
        <span
          v-if="step.metadata.trustLevel"
          class="text-xs text-green-300"
        >
          ({{ step.metadata.trustLevel }})
        </span>
        <span
          v-if="step.metadata.paymentAmount !== undefined"
          class="text-xs text-orange-400"
        >
          {{ step.metadata.paymentCurrency }} {{ step.metadata.paymentAmount }}
        </span>
        <span
          v-if="step.metadata.encryptionAlgorithm"
          class="text-xs text-yellow-400"
        >
          {{ step.metadata.encryptionAlgorithm }}
        </span>
      </div>

      <!-- Expanded data snapshot -->
      <div v-if="expanded" class="mt-2 ml-7">
        <div class="text-xs text-gray-500 mb-1 flex items-center gap-2">
          <span>{{ formatTime(step.timestamp) }}</span>
          <span>·</span>
          <span>{{ step.durationMs }}ms</span>
        </div>
        <pre class="text-xs bg-gray-900 rounded-lg p-3 overflow-x-auto text-gray-300 max-h-48 overflow-y-auto">{{ formatJson(step.data) }}</pre>
      </div>
    </div>
  </div>
</template>
