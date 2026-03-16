<template>
  <div v-if="isLoading" class="loading-container">
    <ion-spinner name="crescent" />
    <p>Loading swarm results...</p>
  </div>
  <div v-else-if="loadError" class="error-container">
    <ion-icon :icon="alertCircleOutline" color="danger" />
    <p>{{ loadError }}</p>
  </div>
  <SwarmResults v-else @restart="$emit('restart')" />
</template>

<script lang="ts" setup>
import { ref, onMounted } from "vue";
import { IonSpinner, IonIcon } from "@ionic/vue";
import { alertCircleOutline } from "ionicons/icons";
import { useMarketingSwarmStore } from "@/stores/marketingSwarmStore";
import { getDeliverablesService } from "@/services/deliverablesService.impl";
import SwarmResults from "./SwarmResults.vue";

const props = defineProps<{
  conversationId: string;
}>();

defineEmits<{
  (e: "restart"): void;
}>();

const store = useMarketingSwarmStore();
const isLoading = ref(true);
const loadError = ref<string | null>(null);

onMounted(async () => {
  try {
    const deliverables = await getDeliverablesService().getConversationDeliverables(
      props.conversationId,
    );
    const swarmDeliverable = deliverables
      .filter((d) => d.currentVersion?.content)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];

    if (!swarmDeliverable?.currentVersion?.content) {
      loadError.value = "No swarm results found for this conversation.";
      return;
    }

    const state = JSON.parse(swarmDeliverable.currentVersion.content);

    // Hydrate the store
    if (state.outputs) store.setOutputs(state.outputs);
    if (state.evaluations) store.setEvaluations(state.evaluations);
    if (state.rankedResults) store.setRankedResults(state.rankedResults);
    if (state.initialRankings) store.setInitialRankings(state.initialRankings);
    if (state.finalRankings) store.setFinalRankings(state.finalRankings);

    // Switch to results view
    store.setUIView("results");
  } catch (err) {
    loadError.value =
      err instanceof Error ? err.message : "Failed to load swarm results";
  } finally {
    isLoading.value = false;
  }
});
</script>

<style scoped>
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
}

.error-container ion-icon {
  font-size: 48px;
}
</style>
