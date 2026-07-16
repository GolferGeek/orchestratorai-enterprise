<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button></ion-menu-button>
        </ion-buttons>
        <ion-title>Marketing Swarm</ion-title>
        <ion-buttons slot="end">
          <ion-button
            v-if="uiState.currentView !== 'config'"
            @click="handleRestart"
          >
            <ion-icon :icon="arrowBackOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner name="crescent" />
        <p>Loading configuration...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error && !isExecuting" class="error-container">
        <ion-icon :icon="alertCircleOutline" color="danger" />
        <p>{{ error }}</p>
        <ion-button @click="loadConfiguration">Retry</ion-button>
      </div>

      <!-- Config Form -->
      <SwarmConfigForm
        v-else-if="uiState.currentView === 'config'"
        @execute="handleExecute"
      />

      <!-- Progress View -->
      <SwarmProgress v-else-if="uiState.currentView === 'progress'" />

      <!-- Results View -->
      <SwarmResults
        v-else-if="uiState.currentView === 'results'"
        @restart="handleRestart"
      />
    </ion-content>

  </ion-page>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonButton,
  IonContent,
  IonSpinner,
  IonIcon,
} from "@ionic/vue";
import { arrowBackOutline, alertCircleOutline } from "ionicons/icons";
import { useMarketingSwarmStore } from "@/modules/workflows/stores/marketingSwarmStore";
import { marketingSwarmService } from "@/modules/workflows/services/marketingSwarmService";
import { useRbacStore } from "@/stores/rbacStore";
import SwarmConfigForm from "./components/SwarmConfigForm.vue";
import SwarmProgress from "./components/SwarmProgress.vue";
import SwarmResults from "./components/SwarmResults.vue";
import type { PromptData, SwarmConfig } from "@/modules/workflows/types/marketing-swarm";

const route = useRoute();
const store = useMarketingSwarmStore();
const rbacStore = useRbacStore();

const isLoading = computed(() => store.isLoading);
const isExecuting = computed(() => store.isExecuting);
const error = computed(() => store.error);
const uiState = computed(() => store.uiState);

const conversationId = ref<string | null>(null);

const orgSlug = computed(() => {
  return (route.params.orgSlug as string) || rbacStore.currentOrganization || "marketing";
});

const userId = computed(() => {
  return rbacStore.user?.id || "";
});

// Load configuration data on mount
async function loadConfiguration() {
  try {
    await marketingSwarmService.fetchAllConfiguration(orgSlug.value);
  } catch (err) {
    console.error("Failed to load configuration:", err);
  }
}

onMounted(() => {
  // Get conversationId from route query
  conversationId.value = (route.query.conversationId as string) || null;
  console.log(
    "[MarketingSwarm] Mounted with conversationId:",
    conversationId.value,
  );

  loadConfiguration();
});

// Clean up SSE connection on unmount
onUnmounted(() => {
  marketingSwarmService.disconnectSSEStream();
});

// Handle execute from config form
async function handleExecute(data: {
  contentTypeSlug: string;
  contentTypeContext: string;
  promptData: PromptData;
  config: SwarmConfig;
}) {
  try {
    if (!userId.value) {
      throw new Error("User not authenticated. Please log in and try again.");
    }
    // Reset state before starting a new execution to clear any previous outputs
    store.resetTaskState();

    // Initialize agent card states
    for (const writer of data.config.writers) {
      store.setAgentCardState(writer.agentSlug, writer.llmConfigId, {
        agentSlug: writer.agentSlug,
        llmConfigId: writer.llmConfigId,
        status: "idle",
      });
    }
    for (const editor of data.config.editors) {
      store.setAgentCardState(editor.agentSlug, editor.llmConfigId, {
        agentSlug: editor.agentSlug,
        llmConfigId: editor.llmConfigId,
        status: "idle",
      });
    }
    for (const evaluator of data.config.evaluators) {
      store.setAgentCardState(evaluator.agentSlug, evaluator.llmConfigId, {
        agentSlug: evaluator.agentSlug,
        llmConfigId: evaluator.llmConfigId,
        status: "idle",
      });
    }

    let currentConversationId = conversationId.value;

    if (!currentConversationId) {
      currentConversationId =
        await marketingSwarmService.createSwarmConversation(
          orgSlug.value,
          userId.value,
          data.config,
        );
      console.log(
        "[MarketingSwarm] Created new conversation:",
        currentConversationId,
      );
    } else {
      // Initialize ExecutionContext with existing conversation from sidebar
      marketingSwarmService.initializeWithExistingConversation(
        currentConversationId,
        orgSlug.value,
        userId.value,
        data.config,
      );
      console.log(
        "[MarketingSwarm] Using existing conversation:",
        currentConversationId,
      );
    }

    // Store conversationId for saving deliverable later
    conversationId.value = currentConversationId;

    // Phase 2: Connect to SSE stream for real-time updates
    marketingSwarmService.connectToSSEStream(currentConversationId);

    // Start execution (uses the initialized ExecutionContext)
    const response = await marketingSwarmService.startSwarmExecution(
      data.contentTypeSlug,
      data.contentTypeContext,
      data.promptData,
      data.config,
    );

    console.log("Swarm execution completed:", response);
  } catch (err) {
    console.error("Swarm execution failed:", err);
    // Disconnect SSE on error
    marketingSwarmService.disconnectSSEStream();
  }
}

// Handle restart - go back to config
function handleRestart() {
  // Disconnect SSE when restarting
  marketingSwarmService.disconnectSSEStream();
  store.resetTaskState();
    store.setUIView("config");
}
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

.error-container p {
  color: var(--ion-color-medium);
  text-align: center;
  max-width: 300px;
}
</style>
