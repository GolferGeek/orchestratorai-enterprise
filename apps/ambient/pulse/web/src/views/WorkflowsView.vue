<script setup lang="ts">
import { onMounted } from 'vue';
import { IonPage, IonContent } from '@ionic/vue';
import { usePulseStore } from '../stores/pulse.store';

const store = usePulseStore();

onMounted(async () => {
  await Promise.all([store.fetchWorkflows(), store.fetchWorkflowRuns()]);
});

async function execute(workflowId: string) {
  await store.executeWorkflow(workflowId);
}

function statusClass(status: string): string {
  switch (status) {
    case 'completed': return 'status-completed';
    case 'failed': return 'status-failed';
    case 'running': return 'status-running';
    default: return 'status-inactive';
  }
}
</script>

<template>
  <IonPage>
    <IonContent style="--background: var(--oai-bg-page, #0f172a)">
      <div class="space-y-6">
        <h1 class="text-2xl font-bold text-white">Workflows</h1>

        <!-- Workflow definitions -->
        <div class="card">
          <h2 class="text-lg font-semibold text-gray-200 mb-4">Defined Workflows</h2>
          <div v-if="store.workflows.length === 0" class="text-gray-500 text-sm text-center py-6">
            No workflows registered. POST to /api/workflows to register a workflow definition.
          </div>
          <div v-else class="space-y-4">
            <div
              v-for="wf in store.workflows"
              :key="wf.id"
              class="border border-gray-700 rounded-lg p-4"
            >
              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <span :class="wf.enabled ? 'status-active' : 'status-inactive'">
                      {{ wf.enabled ? 'Enabled' : 'Disabled' }}
                    </span>
                    <h3 class="text-sm font-medium text-gray-200">{{ wf.name }}</h3>
                  </div>
                  <p class="text-xs text-gray-400 mt-1">{{ wf.description }}</p>
                  <p class="text-xs text-gray-500 mt-1">Trigger: {{ wf.trigger }}</p>
                </div>
                <button class="btn-secondary text-xs" @click="execute(wf.id)">
                  Run Now
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Workflow runs -->
        <div class="card">
          <h2 class="text-lg font-semibold text-gray-200 mb-4">Run History</h2>
          <div v-if="store.workflowRuns.length === 0" class="text-gray-500 text-sm text-center py-6">
            No runs yet.
          </div>
          <div v-else class="divide-y divide-gray-700">
            <div
              v-for="run in store.workflowRuns"
              :key="run.id"
              class="py-3 flex items-center justify-between"
            >
              <div>
                <div class="text-sm text-gray-300">{{ run.workflowId }}</div>
                <div class="text-xs text-gray-500 mt-0.5">
                  Run {{ run.id }} &bull; Trigger: {{ run.triggeredBy }}
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span :class="['status-badge', statusClass(run.status)]">{{ run.status }}</span>
                <span class="text-xs text-gray-500">
                  {{ new Date(run.startedAt).toLocaleTimeString() }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
