<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { IonPage, IonContent } from '@ionic/vue';
import { usePulseStore } from '../stores/pulse.store';
import type { ExecutionRecord } from '../stores/pulse.store';

const store = usePulseStore();
const selectedExecution = ref<ExecutionRecord | null>(null);

onMounted(async () => {
  await store.fetchExecutions();
});

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusClass(status: string): string {
  switch (status) {
    case 'completed': return 'status-completed';
    case 'failed': return 'status-failed';
    case 'skipped': return 'bg-yellow-900 text-yellow-300 status-badge';
    case 'pending': return 'status-running';
    default: return 'status-inactive';
  }
}

function sourceTypeColor(sourceType: string): string {
  switch (sourceType) {
    case 'db': return 'bg-blue-900 text-blue-300';
    case 'file': return 'bg-yellow-900 text-yellow-300';
    case 'a2a': return 'bg-purple-900 text-purple-300';
    case 'schedule': return 'bg-cyan-900 text-cyan-300';
    default: return 'bg-gray-700 text-gray-400';
  }
}

function selectExecution(execution: ExecutionRecord) {
  selectedExecution.value = selectedExecution.value?.id === execution.id ? null : execution;
}
</script>

<template>
  <IonPage>
    <IonContent style="--background: var(--oai-bg-page, #0f172a)">
      <div class="space-y-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Executions</h1>
          <p class="text-gray-400 text-sm mt-1">
            Audit trail of all trigger firings and their outcomes.
          </p>
        </div>

        <!-- Summary row -->
        <div class="grid grid-cols-4 gap-4">
          <div class="card">
            <div class="text-xs text-gray-400 mb-1">Total</div>
            <div class="text-2xl font-bold text-gray-200">{{ store.executions.length }}</div>
          </div>
          <div class="card">
            <div class="text-xs text-gray-400 mb-1">Completed</div>
            <div class="text-2xl font-bold text-green-400">
              {{ store.executions.filter((e) => e.status === 'completed').length }}
            </div>
          </div>
          <div class="card">
            <div class="text-xs text-gray-400 mb-1">Failed</div>
            <div class="text-2xl font-bold text-red-400">
              {{ store.executions.filter((e) => e.status === 'failed').length }}
            </div>
          </div>
          <div class="card">
            <div class="text-xs text-gray-400 mb-1">Skipped</div>
            <div class="text-2xl font-bold text-yellow-400">
              {{ store.executions.filter((e) => e.status === 'skipped').length }}
            </div>
          </div>
        </div>

        <!-- Execution table -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-gray-300">Execution History</h2>
            <button class="btn-secondary text-xs" @click="store.fetchExecutions()">Refresh</button>
          </div>

          <div v-if="store.loading" class="text-gray-500 text-sm text-center py-6">
            Loading executions...
          </div>
          <div v-else-if="store.executions.length === 0" class="text-gray-500 text-sm text-center py-6">
            No executions recorded yet. Trigger a workflow or simulate an event to see results here.
          </div>
          <div v-else class="divide-y divide-gray-700">
            <!-- Table header -->
            <div class="grid grid-cols-6 gap-4 pb-2 text-xs text-gray-500 font-medium uppercase tracking-wide">
              <div class="col-span-2">Trigger</div>
              <div>Source</div>
              <div>Fired At</div>
              <div>Status</div>
              <div>Duration</div>
            </div>

            <!-- Table rows -->
            <div
              v-for="execution in store.executions"
              :key="execution.id"
              class="py-3 cursor-pointer hover:bg-gray-700/30 transition-colors rounded"
              @click="selectExecution(execution)"
            >
              <div class="grid grid-cols-6 gap-4 items-center">
                <div class="col-span-2">
                  <div class="text-sm text-gray-200">{{ execution.triggerName }}</div>
                  <div v-if="execution.skipReason" class="text-xs text-yellow-400 mt-0.5">
                    Skipped: {{ execution.skipReason }}
                  </div>
                </div>
                <div>
                  <span :class="['status-badge', sourceTypeColor(execution.sourceType)]">
                    {{ execution.sourceType }}
                  </span>
                </div>
                <div class="text-xs text-gray-400">{{ formatTime(execution.firedAt) }}</div>
                <div>
                  <span :class="['status-badge', statusClass(execution.status)]">
                    {{ execution.status }}
                  </span>
                </div>
                <div class="text-xs text-gray-400">{{ formatDuration(execution.durationMs) }}</div>
              </div>

              <!-- Expanded detail panel -->
              <div
                v-if="selectedExecution?.id === execution.id"
                class="mt-4 space-y-3 bg-gray-900/50 border border-gray-700 rounded-lg p-4"
                @click.stop
              >
                <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Execution Detail</h3>
                <div class="text-xs text-gray-500 font-mono">ID: {{ execution.id }}</div>

                <div v-if="execution.executionContext" class="space-y-2">
                  <div class="grid grid-cols-2 gap-3">
                    <div class="bg-gray-800 rounded p-2">
                      <div class="text-xs text-gray-500">Provider</div>
                      <div class="text-sm text-white font-medium">{{ execution.executionContext.provider }}</div>
                    </div>
                    <div class="bg-gray-800 rounded p-2">
                      <div class="text-xs text-gray-500">Model</div>
                      <div class="text-sm text-white font-medium">{{ execution.executionContext.model }}</div>
                    </div>
                  </div>
                  <details class="text-xs">
                    <summary class="text-gray-400 font-semibold cursor-pointer">Full Execution Context</summary>
                    <pre class="text-gray-300 bg-gray-800 rounded p-3 overflow-x-auto whitespace-pre-wrap mt-1">{{ JSON.stringify(execution.executionContext, null, 2) }}</pre>
                  </details>
                </div>

                <div v-if="execution.sourceEvent" class="space-y-1">
                  <div class="text-xs text-gray-400 font-semibold">Source Event</div>
                  <pre class="text-xs text-gray-300 bg-gray-800 rounded p-3 overflow-x-auto whitespace-pre-wrap">{{ JSON.stringify(execution.sourceEvent, null, 2) }}</pre>
                </div>

                <div v-if="execution.a2aResponse" class="space-y-1">
                  <div class="text-xs text-gray-400 font-semibold">A2A Response</div>
                  <pre class="text-xs text-gray-300 bg-gray-800 rounded p-3 overflow-x-auto whitespace-pre-wrap">{{ JSON.stringify(execution.a2aResponse, null, 2) }}</pre>
                </div>

                <div v-if="!execution.executionContext && !execution.sourceEvent && !execution.a2aResponse" class="text-xs text-gray-500">
                  No additional detail available for this execution.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
