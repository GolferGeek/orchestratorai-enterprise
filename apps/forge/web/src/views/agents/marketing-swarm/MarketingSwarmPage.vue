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
        @browse-history="showBrowseModal = true"
      />

      <!-- Progress View -->
      <SwarmProgress v-else-if="uiState.currentView === 'progress'" />

      <!-- Results View -->
      <SwarmResults
        v-else-if="uiState.currentView === 'results'"
        @restart="handleRestart"
      />
    </ion-content>

    <!-- Browse Previous Swarms Modal -->
    <DeliverablesBrowseModal
      :is-open="showBrowseModal"
      agent-slug="marketing-swarm"
      agent-display-name="Marketing Swarm"
      @close="showBrowseModal = false"
      @select="handleDeliverableSelect"
    />
  </ion-page>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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
import { useMarketingSwarmStore } from "@/stores/marketingSwarmStore";
import { marketingSwarmService } from "@/services/marketingSwarmService";
import { tasksService } from "@/services/tasksService";
import { useRbacStore } from "@/stores/rbacStore";
import { useAgentsStore } from "@/stores/agentsStore";
import { getDeliverablesService } from "@/services/deliverablesService.impl";
import {
  DeliverableType,
  DeliverableFormat,
} from "@/services/deliverablesService";
import { DeliverablesBrowseModal } from "@/components/AgentDashboard";
import type { DeliverableSearchResult } from "@/services/deliverablesService";
import SwarmConfigForm from "./components/SwarmConfigForm.vue";
import SwarmProgress from "./components/SwarmProgress.vue";
import SwarmResults from "./components/SwarmResults.vue";
import type { PromptData, SwarmConfig } from "@/types/marketing-swarm";

const route = useRoute();
const store = useMarketingSwarmStore();
const rbacStore = useRbacStore();
const agentsStore = useAgentsStore();

const isLoading = computed(() => store.isLoading);
const isExecuting = computed(() => store.isExecuting);
const error = computed(() => store.error);
const uiState = computed(() => store.uiState);

const showBrowseModal = ref(false);

// Get conversationId from route query (passed from AgentsPage when creating conversation)
const conversationId = ref<string | null>(null);

// Get org slug from agent record or route — use the agent's registered org, not the user's chosen org
const orgSlug = computed(() => {
  const agentRecord = agentsStore.availableAgents.find(
    (a) => a.name === "marketing-swarm",
  );
  return (
    (route.params.orgSlug as string) ||
    agentRecord?.organizationSlug ||
    "marketing"
  );
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

    // Use conversationId from route query (created when user clicked on agent in sidebar)
    // or create a new one if not provided (direct navigation to page)
    let currentConversationId = conversationId.value;

    if (!currentConversationId) {
      // Fallback: Create conversation if not provided (e.g., direct URL access)
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

// Handle selecting a previous deliverable from the modal
// Uses the same approach as MarketingSwarmTab.loadConversationState:
// query tasks for the conversation, then load state from LangGraph
async function handleDeliverableSelect(deliverable: DeliverableSearchResult) {
  if (!deliverable.conversationId) return;

  try {
    // Reset state before loading
    store.resetTaskState();
    conversationId.value = deliverable.conversationId;

    // Query tasks for this conversation (same as MarketingSwarmTab.loadConversationState)
    const tasksResponse = await tasksService.listTasks({
      conversationId: deliverable.conversationId,
      limit: 10,
    });

    if (tasksResponse.tasks.length > 0) {
      for (const task of tasksResponse.tasks) {
        try {
          const state = await marketingSwarmService.getSwarmState(task.id);
          const hasData = state.outputs && state.outputs.length > 0;

          if (
            !hasData &&
            tasksResponse.tasks.indexOf(task) < tasksResponse.tasks.length - 1
          ) {
            continue; // Try next task
          }

          store.setCurrentTaskId(task.id);

          if (state.phase === "completed" || task.status === "completed") {
            store.setUIView("results");
          } else if (hasData) {
            store.setUIView("progress");
          }
          return;
        } catch (langGraphErr) {
          console.log(
            "[MarketingSwarm] LangGraph state not available for task:",
            task.id,
            langGraphErr,
          );
          // Last task fallback
          if (
            tasksResponse.tasks.indexOf(task) ===
            tasksResponse.tasks.length - 1
          ) {
            store.setCurrentTaskId(task.id);
            if (task.status === "completed") {
              store.setUIView("results");
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[MarketingSwarm] Failed to load conversation state:", err);
  }
}

// Save swarm results as a deliverable when execution completes
async function saveSwarmDeliverable() {
  if (!conversationId.value) return;

  try {
    const outputs = store.outputs;
    const evaluations = store.evaluations;
    const rankedResults = store.rankedResults;

    if (outputs.length === 0) return;

    const persistedState = {
      outputs,
      evaluations,
      rankedResults,
      phase2Outputs: store.phase2Outputs,
      phase2Evaluations: store.phase2Evaluations,
      initialRankings: store.initialRankings,
      finalRankings: store.finalRankings,
    };

    const title = `Marketing Swarm - ${new Date().toLocaleDateString()}`;

    await getDeliverablesService().createDeliverable({
      title,
      description: `Marketing Swarm execution with ${outputs.length} outputs`,
      type: DeliverableType.REPORT,
      conversationId: conversationId.value,
      agentName: "marketing-swarm",
      initialContent: JSON.stringify(persistedState),
      initialFormat: DeliverableFormat.JSON,
    });

    console.log("[MarketingSwarm] Swarm results saved as deliverable");
  } catch (err) {
    console.error("[MarketingSwarm] Failed to save deliverable:", err);
  }
}

// Watch for results view (execution complete) to auto-save deliverable
watch(
  () => uiState.value.currentView,
  (newView) => {
    if (newView === "results") {
      saveSwarmDeliverable();
    }
  },
);
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
