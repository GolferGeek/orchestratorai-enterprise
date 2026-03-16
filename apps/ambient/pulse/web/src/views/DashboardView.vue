<script setup lang="ts">
import { onMounted } from 'vue';
import { IonPage, IonContent } from '@ionic/vue';
import { usePulseStore } from '../stores/pulse.store';
import { useSse } from '../composables/useSse';

const store = usePulseStore();
const { connected, events } = useSse();

onMounted(async () => {
  await Promise.all([
    store.fetchListeners(),
    store.fetchWorkflows(),
    store.fetchWorkflowRuns(),
    store.fetchTriggers(),
    store.fetchExecutions(),
  ]);
});

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}

function executionStatusClass(status: string): string {
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
</script>

<template>
  <IonPage>
    <IonContent style="--background: var(--oai-bg-page, #0f172a)">
      <div class="space-y-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Pulse Dashboard</h1>
          <p class="text-gray-400 text-sm mt-1">
            Internal ambient automation — watching database changes, file system events, and internal A2A messages.
          </p>
        </div>

        <!-- Status cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="card">
            <div class="text-sm text-gray-400 mb-1">Active Listeners</div>
            <div class="text-3xl font-bold text-green-400">
              {{ store.listeners.filter((l) => l.active).length }}
            </div>
            <div class="text-xs text-gray-500 mt-1">of {{ store.listeners.length }} registered</div>
          </div>

          <div class="card">
            <div class="text-sm text-gray-400 mb-1">Enabled Workflows</div>
            <div class="text-3xl font-bold text-purple-400">
              {{ store.workflows.filter((w) => w.enabled).length }}
            </div>
            <div class="text-xs text-gray-500 mt-1">of {{ store.workflows.length }} defined</div>
          </div>

          <div class="card">
            <div class="text-sm text-gray-400 mb-1">Triggers</div>
            <div class="text-3xl font-bold text-cyan-400">
              {{ store.triggers.filter((t) => t.enabled).length }}
            </div>
            <div class="text-xs text-gray-500 mt-1">
              active / {{ store.triggers.length }} total
            </div>
          </div>

          <div class="card">
            <div class="text-sm text-gray-400 mb-1">SSE Stream</div>
            <div class="text-3xl font-bold" :class="connected ? 'text-green-400' : 'text-red-400'">
              {{ connected ? 'Connected' : 'Disconnected' }}
            </div>
            <div class="text-xs text-gray-500 mt-1">{{ events.length }} events received</div>
          </div>
        </div>

        <!-- Listener connection status -->
        <div class="card">
          <h2 class="text-lg font-semibold text-gray-200 mb-4">Listener Status</h2>
          <div v-if="store.listeners.length === 0" class="text-gray-500 text-sm text-center py-4">
            No listeners registered.
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <div
              v-for="listener in store.listeners"
              :key="listener.id"
              class="flex items-center gap-2 px-3 py-2 bg-gray-700/50 rounded-md border border-gray-700"
            >
              <span :class="['w-2 h-2 rounded-full', listener.active ? 'bg-green-400' : 'bg-gray-600']" />
              <span class="text-sm text-gray-300">{{ listener.name }}</span>
              <span :class="['status-badge', listener.active ? 'status-active' : 'status-inactive']">
                {{ listener.active ? 'connected' : 'disconnected' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Recent trigger fires -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-gray-200">Recent Trigger Fires</h2>
            <router-link to="/executions" class="text-xs text-purple-400 hover:text-purple-300 transition-colors">
              View all executions
            </router-link>
          </div>
          <div v-if="store.executions.length === 0" class="text-gray-500 text-sm text-center py-6">
            No trigger executions yet. Trigger a workflow or simulate an event.
          </div>
          <div v-else class="divide-y divide-gray-700">
            <div
              v-for="execution in store.executions.slice(0, 5)"
              :key="execution.id"
              class="py-3 flex items-center justify-between"
            >
              <div>
                <div class="flex items-center gap-2">
                  <span :class="['status-badge', sourceTypeColor(execution.sourceType)]">
                    {{ execution.sourceType }}
                  </span>
                  <span class="text-sm text-gray-200">{{ execution.triggerName }}</span>
                </div>
                <div class="text-xs text-gray-500 mt-0.5">
                  {{ formatTime(execution.firedAt) }}
                  <span v-if="execution.skipReason"> &bull; {{ execution.skipReason }}</span>
                </div>
              </div>
              <span :class="['status-badge', executionStatusClass(execution.status)]">
                {{ execution.status }}
              </span>
            </div>
          </div>
        </div>

        <!-- Recent workflow runs -->
        <div class="card">
          <h2 class="text-lg font-semibold text-gray-200 mb-4">Recent Workflow Runs</h2>
          <div v-if="store.workflowRuns.length === 0" class="text-gray-500 text-sm text-center py-6">
            No workflow runs yet. Trigger a workflow from the Workflows page or simulate an event.
          </div>
          <div v-else class="divide-y divide-gray-700">
            <div
              v-for="run in store.workflowRuns.slice(0, 10)"
              :key="run.id"
              class="py-3 flex items-center justify-between"
            >
              <div>
                <div class="text-sm text-gray-200">{{ run.workflowId }}</div>
                <div class="text-xs text-gray-500 mt-0.5">
                  Triggered by: {{ run.triggeredBy }} &bull; Started: {{ formatTime(run.startedAt) }}
                </div>
              </div>
              <span
                :class="[
                  'status-badge',
                  run.status === 'completed' ? 'status-completed' : run.status === 'failed' ? 'status-failed' : 'status-running',
                ]"
              >
                {{ run.status }}
              </span>
            </div>
          </div>
        </div>

        <!-- Recent SSE events -->
        <div class="card">
          <h2 class="text-lg font-semibold text-gray-200 mb-4">Recent Events</h2>
          <div v-if="events.length === 0" class="text-gray-500 text-sm text-center py-6">
            Waiting for events... Connect to /api/streaming/events to see real-time data.
          </div>
          <div v-else class="divide-y divide-gray-700 max-h-64 overflow-y-auto">
            <div
              v-for="(event, i) in events.slice(0, 20)"
              :key="i"
              class="py-2 flex items-center justify-between"
            >
              <div class="flex items-center gap-3">
                <span class="text-xs font-mono text-purple-400">{{ event.type }}</span>
                <span class="text-xs text-gray-500">{{ formatTime(event.timestamp) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
