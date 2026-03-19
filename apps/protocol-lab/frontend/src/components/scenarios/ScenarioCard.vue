<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useScenarioStore } from '../../stores/scenario.store';
import type { ScenarioDescriptor } from '../../stores/scenario.store';
import ProtocolBadge from '../shared/ProtocolBadge.vue';
import LoadingSpinner from '../shared/LoadingSpinner.vue';
import ScenarioConfigPanel from './ScenarioConfigPanel.vue';

const props = defineProps<{
  scenario: ScenarioDescriptor;
}>();

const store = useScenarioStore();
const router = useRouter();

const showConfig = ref(false);

const isRunning = computed(() => store.runningScenario === props.scenario.id);
const runResult = computed(() => store.runResults[props.scenario.id] ?? null);

async function handleRun(): Promise<void> {
  await store.runScenario(props.scenario.id);
}

function toggleConfig(): void {
  showConfig.value = !showConfig.value;
}

function goToTrace(messageId: string | undefined): void {
  if (!messageId) return;
  router.push({ name: 'observability-message-detail', params: { id: messageId } });
}

function resultSuccess(result: typeof runResult.value): boolean {
  if (!result) return false;
  const r = result.result as Record<string, unknown>;
  return !!r && !r.error;
}

function pipelineMessageId(result: typeof runResult.value): string | undefined {
  if (!result) return undefined;
  // Prefer top-level messageId (matches what was stored in Protocol API)
  if (result.messageId) return result.messageId;
  // Fallback to pipelineTrace.messageId for older responses
  const trace = result.pipelineTrace as Record<string, unknown> | null;
  return trace?.messageId as string | undefined;
}

// Show provider pills from defaultConfig layers that have values
const defaultProviderPills = computed(() => {
  const cfg = props.scenario.defaultConfig ?? {};
  return Object.entries(cfg)
    .filter(([, v]) => !!v)
    .map(([layer, provider]) => ({ layer, provider: provider as string }));
});
</script>

<template>
  <div class="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col gap-4 transition-colors hover:border-gray-600">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-mono text-gray-500">#{{ scenario.id }}</span>
          <span
            class="text-xs px-1.5 py-0.5 rounded font-medium"
            :class="scenario.ecosystem === 'ascentek' ? 'bg-indigo-900 text-indigo-300' : 'bg-teal-900 text-teal-300'"
          >
            {{ scenario.ecosystem === 'ascentek' ? 'Ascentek' : 'SunStream' }}
          </span>
        </div>
        <h3 class="text-white font-semibold text-base leading-snug">{{ scenario.name }}</h3>
        <p class="text-gray-400 text-sm mt-1 leading-relaxed">{{ scenario.description }}</p>
      </div>

      <!-- Config toggle button -->
      <button
        class="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
        :class="showConfig ? 'bg-gray-700 text-gray-200' : ''"
        title="Configure protocol overrides"
        @click="toggleConfig"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>

    <!-- Provider pills from defaultConfig -->
    <div v-if="defaultProviderPills.length > 0" class="flex flex-wrap gap-1.5">
      <ProtocolBadge
        v-for="pill in defaultProviderPills"
        :key="pill.layer"
        :layer="pill.layer"
        :provider="pill.provider"
      />
    </div>

    <!-- Config panel (inline) -->
    <ScenarioConfigPanel v-if="showConfig" :scenario-id="scenario.id" />

    <!-- Result summary -->
    <div
      v-if="runResult"
      class="rounded-lg p-3 text-sm"
      :class="resultSuccess(runResult) ? 'bg-green-950 border border-green-800' : 'bg-red-950 border border-red-800'"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full flex-shrink-0"
            :class="resultSuccess(runResult) ? 'bg-green-400' : 'bg-red-400'"
          ></span>
          <span :class="resultSuccess(runResult) ? 'text-green-300' : 'text-red-300'">
            {{ resultSuccess(runResult) ? 'Completed successfully' : 'Failed' }}
          </span>
        </div>
        <button
          v-if="pipelineMessageId(runResult)"
          class="text-xs text-gray-400 hover:text-gray-200 underline transition-colors"
          @click="goToTrace(pipelineMessageId(runResult))"
        >
          View trace
        </button>
      </div>

      <!-- Effective config summary -->
      <div class="mt-2 pt-2 border-t border-gray-700">
        <p class="text-xs text-gray-500 mb-1">Effective config used:</p>
        <div class="flex flex-wrap gap-1">
          <ProtocolBadge
            v-for="[layer, provider] in Object.entries(runResult.effectiveConfig)"
            :key="layer"
            :layer="layer"
            :provider="provider as string"
          />
        </div>
      </div>
    </div>

    <!-- Run button -->
    <div class="flex justify-end">
      <button
        class="btn-primary flex items-center gap-2 text-sm"
        :disabled="isRunning"
        @click="handleRun"
      >
        <LoadingSpinner v-if="isRunning" size="sm" />
        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {{ isRunning ? 'Running...' : 'Run' }}
      </button>
    </div>
  </div>
</template>
