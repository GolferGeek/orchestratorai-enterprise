<script setup lang="ts">
import { onMounted } from 'vue';
import { useMarketPulseStore } from '../../stores/market-pulse.store';
import AgentCardDisplay from '../../components/shared/AgentCardDisplay.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const store = useMarketPulseStore();

onMounted(async () => {
  await loadData();
});

async function loadData(): Promise<void> {
  try {
    await store.fetchAgentCard();
  } catch {
    // Error captured in store
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">MarketPulse Agent Card</h1>
      <p class="text-gray-400 text-sm mt-1">The agent card exposed by MarketPulse for protocol discovery</p>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading agent card..." />

    <div v-else-if="store.error" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ store.error }}</p>
        <button class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm" @click="loadData">Retry</button>
      </div>
    </div>

    <AgentCardDisplay v-else-if="store.agentCard" :card="store.agentCard" />

    <EmptyState
      v-else
      title="Agent Card Unavailable"
      message="Agent card not available"
    />
  </div>
</template>
