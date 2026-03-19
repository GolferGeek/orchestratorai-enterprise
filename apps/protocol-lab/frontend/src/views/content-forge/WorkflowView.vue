<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useContentForgeStore } from '../../stores/content-forge.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const store = useContentForgeStore();
const topicInput = ref('');
const executeError = ref<string | null>(null);
const executing = ref(false);

onMounted(async () => {
  await store.fetchWorkflowHistory();
});

async function handleExecute() {
  if (!topicInput.value) return;
  executeError.value = null;
  executing.value = true;
  try {
    await store.executeWorkflow(topicInput.value);
    topicInput.value = '';
  } catch (e) {
    executeError.value = e instanceof Error ? e.message : String(e);
  } finally {
    executing.value = false;
  }
}

const agentColors: Record<string, string> = {
  'research-hub': 'border-blue-500 bg-blue-900/30',
  'market-pulse': 'border-green-500 bg-green-900/30',
  'content-forge': 'border-purple-500 bg-purple-900/30',
};

const agentDotColors: Record<string, string> = {
  'research-hub': 'bg-blue-500',
  'market-pulse': 'bg-green-500',
  'content-forge': 'bg-purple-500',
};

function getAgentColor(agentId: string): string {
  return agentColors[agentId] ?? 'border-gray-600 bg-gray-800';
}

function getAgentDotColor(agentId: string): string {
  return agentDotColors[agentId] ?? 'bg-gray-500';
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Content Pipeline</h1>
      <p class="text-gray-400 text-sm mt-1">Execute multi-agent content generation workflows</p>
    </div>

    <div class="card">
      <h2 class="text-sm font-medium text-gray-300 mb-3">Execute Pipeline</h2>
      <div class="flex gap-3">
        <input
          v-model="topicInput"
          type="text"
          placeholder="Enter a topic to run through the content pipeline..."
          class="input-field flex-1"
        />
        <button class="btn-primary" :disabled="executing || !topicInput" @click="handleExecute">
          {{ executing ? 'Executing...' : 'Execute' }}
        </button>
      </div>
      <p v-if="executeError" class="text-red-400 text-sm mt-2">{{ executeError }}</p>
    </div>

    <div v-if="store.error" class="card border border-red-500 flex items-center justify-between gap-4">
      <p class="text-red-400 text-sm">{{ store.error }}</p>
      <button class="btn-secondary text-sm shrink-0" @click="store.fetchWorkflowHistory()">Retry</button>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading workflow history..." />

    <EmptyState
      v-else-if="store.workflowHistory.length === 0 && !store.error"
      title="No Active Workflow"
      message="No active workflow executions. Enter a topic above to run the content pipeline."
    />

    <div v-else class="space-y-6">
      <div
        v-for="execution in store.workflowHistory"
        :key="execution.id"
        class="card"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-medium text-gray-200">{{ execution.topic }}</h3>
          <span class="text-xs text-gray-400">{{ new Date(execution.createdAt).toLocaleString() }}</span>
        </div>

        <div class="relative ml-4">
          <div class="absolute left-3 top-0 bottom-0 w-px bg-gray-700" />

          <div
            v-for="(step, idx) in execution.steps"
            :key="idx"
            class="relative pl-10 pb-4 last:pb-0"
          >
            <div :class="['absolute left-1 top-1 w-5 h-5 rounded-full flex items-center justify-center', getAgentDotColor(step.agentId)]">
              <span class="text-[10px] text-white font-bold">{{ idx + 1 }}</span>
            </div>

            <div :class="['rounded-lg border p-3', getAgentColor(step.agentId)]">
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-gray-300">{{ step.agentId }}</span>
                  <span class="text-xs text-gray-400">{{ step.action }}</span>
                </div>
                <span class="text-xs text-gray-400">{{ step.duration }}ms</span>
              </div>
              <p class="text-xs text-gray-400">{{ step.result }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
