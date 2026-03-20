<script setup lang="ts">
import { onMounted } from 'vue';
import { useContentForgeStore } from '../../stores/content-forge.store';
import AgentCardDisplay from '../../components/shared/AgentCardDisplay.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const store = useContentForgeStore();

onMounted(async () => {
  await store.fetchAgentCard();
});
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">ContentForge Agent Card</h1>
      <p class="text-gray-400 text-sm mt-1">The agent card exposed by ContentForge for protocol discovery</p>
    </div>

    <div v-if="store.error" class="card border border-red-500 flex items-center justify-between gap-4">
      <p class="text-red-400 text-sm">{{ store.error }}</p>
      <button class="btn-secondary text-sm shrink-0" @click="store.fetchAgentCard()">Retry</button>
    </div>

    <LoadingSpinner v-if="store.loading" label="Loading agent card..." />

    <AgentCardDisplay v-else-if="store.agentCard" :card="store.agentCard" />

    <EmptyState
      v-else-if="!store.loading && !store.error"
      title="Agent Card Unavailable"
      message="Agent card not available. The ContentForge backend may not be running."
    />
  </div>
</template>
