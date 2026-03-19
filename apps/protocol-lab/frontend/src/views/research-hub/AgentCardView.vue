<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useResearchHubStore } from '../../stores/research-hub.store';
import AgentCardDisplay from '../../components/shared/AgentCardDisplay.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const store = useResearchHubStore();

async function retry() {
  await store.fetchAgentCard();
}

onMounted(async () => {
  await retry();
});

const isEmpty = computed(() => !store.loading && !store.error && !store.agentCard);
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Research Hub Agent Card</h1>
      <p class="text-gray-400 text-sm mt-1">The agent card exposed by the Research Hub for protocol discovery</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading agent card..." class="py-16" />

    <div v-else-if="store.error" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ store.error }}</p>
        <button
          class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          @click="retry"
        >
          Retry
        </button>
      </div>
    </div>

    <EmptyState
      v-else-if="isEmpty"
      title="Agent Card Unavailable"
      message="Agent card not available. The Research Hub backend may not be running."
      icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />

    <AgentCardDisplay v-else :card="store.agentCard!" />
  </div>
</template>
