<template>
  <div class="legal-department-conversation">
    <!-- Loading State -->
    <div v-if="isLoading || isLoadingExisting" class="loading-container">
      <ion-spinner name="crescent" />
      <p>
        {{
          isLoadingExisting
            ? "Loading previous analysis..."
            : "Initializing Legal Department AI..."
        }}
      </p>
    </div>

    <!-- Main Conversation Pane -->
    <template v-else>
      <!-- Scrollable Response Area -->
      <div class="response-area" ref="responseAreaRef">
        <!-- Welcome State (no request yet, and not loading existing, and no load error) -->
        <div
          v-if="
            !hasActiveRequest &&
            !analysisResults &&
            !isLoadingExisting &&
            !error
          "
          class="welcome-state"
        >
          <div class="welcome-content">
            <ion-icon :icon="scaleOutline" class="welcome-icon" />
            <h2>Legal Department AI</h2>
            <p>Upload a document or ask a legal question to get started.</p>
            <div class="capabilities">
              <div class="capability">
                <ion-icon :icon="documentTextOutline" />
                <span>Contract Analysis</span>
              </div>
              <div class="capability">
                <ion-icon :icon="shieldCheckmarkOutline" />
                <span>Compliance Review</span>
              </div>
              <div class="capability">
                <ion-icon :icon="bulbOutline" />
                <span>IP Assessment</span>
              </div>
              <div class="capability">
                <ion-icon :icon="lockClosedOutline" />
                <span>Privacy Analysis</span>
              </div>
            </div>
            <div class="model-selector">
              <CompactLLMControl />
            </div>
            <ion-button
              fill="outline"
              color="medium"
              size="default"
              class="history-button"
              @click="emit('browse-history')"
            >
              <ion-icon :icon="timeOutline" slot="start" />
              Previous Analyses
            </ion-button>
          </div>
        </div>

        <!-- Active Analysis Content -->
        <template v-if="hasActiveRequest || analysisResults">
          <!-- User Request Display -->
          <div v-if="currentRequest" class="request-display">
            <div class="request-header">
              <ion-icon :icon="personCircleOutline" />
              <span>Your Request</span>
            </div>
            <p class="request-message">{{ currentRequest.message }}</p>
            <div
              v-if="currentRequest.attachedDocument"
              class="request-attachment"
            >
              <ion-icon :icon="documentAttachOutline" />
              <span>{{ currentRequest.attachedDocument.name }}</span>
            </div>
          </div>

          <!-- Processing Indicator (when no results yet) -->
          <div
            v-if="isProcessing && !analysisResults"
            class="processing-indicator"
          >
            <div class="thinking-content">
              <div class="thinking-avatar">
                <ion-spinner name="dots" color="secondary" />
              </div>
              <div class="thinking-bubble">
                <div class="thinking-text">
                  <div class="agent-thinking-name">Legal Department AI</div>
                  <div class="thinking-message">{{ thinkingMessage }}</div>
                </div>
                <div class="thinking-dots">
                  <span class="dot"></span>
                  <span class="dot"></span>
                  <span class="dot"></span>
                </div>
              </div>
            </div>
            <div class="progress-section">
              <p class="progress-step">{{ currentStep || "Processing..." }}</p>
              <ion-progress-bar :value="analysisProgress.percentage / 100" />
            </div>
          </div>

          <!-- Text-Only Response (for queries without document analysis) -->
          <div
            v-if="isTextOnlyResponse && analysisResults && !isProcessing"
            class="text-response-panel"
          >
            <div class="response-header">
              <ion-icon :icon="chatbubbleOutline" />
              <span>Legal Department AI Response</span>
            </div>
            <!-- eslint-disable-next-line vue/no-v-html -- Intentional: Rendering sanitized markdown/HTML content from trusted source -->
            <div class="response-content markdown-content" v-html="marked(analysisResults.summary || '')"></div>
            <div class="response-hint">
              <ion-icon :icon="informationCircleOutline" />
              <span>Upload a document for detailed specialist analysis</span>
            </div>
          </div>

          <!-- Full Document Analysis View -->
          <template v-if="!isTextOnlyResponse">
            <!-- Routing Visualization -->
            <RoutingVisualization
              v-if="routingDecision"
              :routing-decision="routingDecision"
              :specialist-states="specialistStates"
              @specialist-click="handleSpecialistClick"
            />

            <!-- Specialist Tabs (when we have outputs) -->
            <SpecialistTabs
              v-if="hasSpecialistOutputs"
              :specialist-outputs="analysisResults?.specialistOutputs"
              :routing-decision="routingDecision"
              :specialist-statuses="getSpecialistStatuses()"
            />

            <!-- Synthesis Panel (when analysis complete) -->
            <SynthesisPanel
              v-if="analysisResults && !isProcessing"
              :results="analysisResults"
              :specialist-outputs="analysisResults?.specialistOutputs"
            />
          </template>

          <!-- HITL Controls (when analysis complete - show for both text and document) -->
          <HITLControls
            v-if="analysisResults && !isProcessing"
            :disabled="hitlActionTaken"
            :show-export="!isTextOnlyResponse"
            @action="handleHITLAction"
            @export="handleExport"
          />

          <!-- New Analysis button (when viewing completed analysis) -->
          <div
            v-if="analysisResults && !isProcessing"
            class="new-analysis-action"
          >
            <ion-button
              fill="outline"
              size="small"
              @click="navigateToNewAnalysis"
            >
              <ion-icon :icon="addCircleOutline" slot="start" />
              New Analysis
            </ion-button>
          </div>
        </template>

        <!-- Error Display -->
        <div v-if="error" class="error-display">
          <ion-icon :icon="alertCircleOutline" color="danger" />
          <p>{{ error }}</p>
          <div class="error-actions">
            <ion-button size="small" @click="handleRetry">Retry</ion-button>
            <ion-button size="small" fill="outline" @click="startNewAnalysis"
              >Start New Analysis</ion-button
            >
          </div>
        </div>
      </div>

      <!-- Fixed Request Input at Bottom -->
      <RequestInput
        :disabled="isProcessing"
        :placeholder="inputPlaceholder"
        :conversation-id="currentConversationId"
        @submit="handleRequestSubmit"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  IonSpinner,
  IonIcon,
  IonButton,
  IonProgressBar,
  toastController,
} from "@ionic/vue";
import {
  alertCircleOutline,
  scaleOutline,
  documentTextOutline,
  shieldCheckmarkOutline,
  bulbOutline,
  lockClosedOutline,
  personCircleOutline,
  documentAttachOutline,
  chatbubbleOutline,
  informationCircleOutline,
  addCircleOutline,
  timeOutline,
} from "ionicons/icons";
import { marked } from "marked";

// Configure marked for GFM
marked.setOptions({ breaks: true, gfm: true });
import { useExecutionContextStore } from "@/stores/executionContextStore";
import { useRbacStore } from "@/stores/rbacStore";
import { useChatUiStore } from "@/stores/ui/chatUiStore";
import { useUserPreferencesStore } from "@/stores/userPreferencesStore";
import { useLLMPreferencesStore } from "@/stores/llmPreferencesStore";
import { useAgentsStore } from "@/stores/agentsStore";
import { agentsService } from "@/services/agentsService";
import {
  legalDepartmentService,
  type ProgressEvent,
} from "./legalDepartmentService";
import agent2AgentConversationsService from "@/services/agent2AgentConversationsService";
import { apiService } from "@/services/apiService";
import { getDeliverablesService } from "@/services/deliverablesService.impl";
import {
  DeliverableType,
  DeliverableFormat,
} from "@/services/deliverablesService";
import RequestInput from "./components/RequestInput.vue";
import RoutingVisualization from "./components/RoutingVisualization.vue";
import SpecialistTabs from "./components/SpecialistTabs.vue";
import SynthesisPanel from "./components/SynthesisPanel.vue";
import HITLControls from "./components/HITLControls.vue";
import CompactLLMControl from "@/components/CompactLLMControl.vue";
import type {
  AnalysisPhase,
  AnalysisResults,
  RoutingDecision,
  SpecialistType,
  SpecialistStatus,
  SpecialistState,
  HITLAction,
  ConversationRequest,
} from "./legalDepartmentTypes";

// Props
const props = defineProps<{
  conversationId?: string;
}>();

const emit = defineEmits<{
  (e: "browse-history"): void;
}>();

// Router
const route = useRoute();
const router = useRouter();

// Stores
const executionContextStore = useExecutionContextStore();
const rbacStore = useRbacStore();
const chatUiStore = useChatUiStore();
const userPreferencesStore = useUserPreferencesStore();
const llmStore = useLLMPreferencesStore();
const agentsStore = useAgentsStore();

// Refs
const responseAreaRef = ref<HTMLElement | null>(null);

// State
const isLoading = ref(false);
const isLoadingExisting = ref(false); // Separate state for loading existing analysis
const isProcessing = ref(false);
const error = ref<string | null>(null);
const currentRequest = ref<ConversationRequest | null>(null);
const routingDecision = ref<RoutingDecision | undefined>(undefined);
const specialistStates = ref<Record<SpecialistType, SpecialistState>>(
  {} as Record<SpecialistType, SpecialistState>,
);
const analysisPhase = ref<AnalysisPhase>("initializing");
const analysisProgress = ref({ current: 0, total: 100, percentage: 0 });
const currentStep = ref<string | undefined>();
const analysisResults = ref<AnalysisResults | null>(null);
const hitlActionTaken = ref(false);
// Local conversationId owned by this component — immune to external store overwrites
const ownConversationId = ref<string>("");

// Computed
const hasActiveRequest = computed(() => !!currentRequest.value);

const hasSpecialistOutputs = computed(() => {
  if (!analysisResults.value?.specialistOutputs) return false;
  return Object.keys(analysisResults.value.specialistOutputs).length > 0;
});

const isTextOnlyResponse = computed(() => {
  const result = analysisResults.value;
  if (!result) return false;

  // Check if explicitly marked as text-only
  const resultWithFlag = result as AnalysisResults & {
    isTextOnlyResponse?: boolean;
  };
  if (resultWithFlag.isTextOnlyResponse === true) return true;

  // Infer text-only if no specialist outputs, no routing, and no findings
  return (
    !hasSpecialistOutputs.value &&
    !routingDecision.value &&
    result.findings.length === 0
  );
});

const inputPlaceholder = computed(() => {
  if (isProcessing.value) return "Analysis in progress...";
  if (analysisResults.value) return "Ask a follow-up question...";
  return "Ask a legal question or describe the document to analyze...";
});

// Contextual thinking message based on mode and analysis phase
const thinkingMessage = computed(() => {
  const mode = (chatUiStore.chatMode || "converse").toLowerCase();
  const phase = analysisPhase.value;

  // Phase-specific messages
  if (phase === "uploading") return "Reviewing your document...";
  if (phase === "extracting") return "Extracting key information...";
  if (phase === "analyzing") return "Analyzing legal content...";
  if (phase === "identifying_risks") return "Identifying potential risks...";
  if (phase === "generating_recommendations")
    return "Preparing recommendations...";

  // Mode-specific fallbacks
  if (mode === "converse") return "Reviewing your question...";
  if (mode === "plan") return "Drafting a legal strategy...";
  if (mode === "build") return "Preparing your deliverable...";

  return "Processing your request...";
});

const currentConversationId = computed(() => {
  return executionContextStore.conversationId || "";
});

// Lifecycle
onMounted(async () => {
  await initializeConversation();
});

onUnmounted(() => {
  // Cleanup SSE connection when component unmounts
  legalDepartmentService.disconnectSSEStream();
  // Reset agent local model requirement when component unmounts
  llmStore.setAgentRequiresLocalModel(false);
});

// Watch for route query changes to handle new conversation requests
watch(
  () => route.query.conversationId,
  async (newConversationId, oldConversationId) => {
    if (newConversationId && newConversationId !== oldConversationId) {
      console.log("[LegalDepartment] Route conversationId changed:", {
        old: oldConversationId,
        new: newConversationId,
      });
      resetState();
      await initializeConversation();
    }
  },
);

// Watch for prop-based conversationId changes (when embedded in ConversationView custom UI)
watch(
  () => props.conversationId,
  async (newId, oldId) => {
    if (newId && newId !== oldId) {
      console.log("[LegalDepartment] Prop conversationId changed:", {
        old: oldId,
        new: newId,
      });
      legalDepartmentService.disconnectSSEStream();
      resetState();
      await initializeConversation();
    }
  },
);

// Watch for model preference changes to update execution context
watch(
  () => [
    userPreferencesStore.preferredProvider,
    userPreferencesStore.preferredModel,
  ],
  ([newProvider, newModel]) => {
    if (newProvider && newModel && executionContextStore.isInitialized) {
      executionContextStore.setLLM(newProvider, newModel);
      console.log("[LegalDepartment] Model preference changed:", {
        provider: newProvider,
        model: newModel,
      });
    }
  },
);

// Watch for agent data to set local model requirement
watch(
  () => agentsStore.availableAgents,
  () => {
    const legalAgent = agentsStore.availableAgents.find(
      (a) => a.slug === "legal-department" || a.name === "legal-department",
    );
    const requireLocalModel = legalAgent?.requireLocalModel ?? false;
    if (requireLocalModel) {
      console.log(
        "[LegalDepartment] Agent requires local model - enforcing sovereign mode",
      );
      llmStore.setAgentRequiresLocalModel(true);
    }
  },
  { immediate: true },
);

// Methods
function resetState() {
  // Reset all state for a fresh conversation
  isProcessing.value = false;
  error.value = null;
  currentRequest.value = null;
  routingDecision.value = undefined;
  specialistStates.value = {} as Record<SpecialistType, SpecialistState>;
  analysisPhase.value = "initializing";
  analysisProgress.value = { current: 0, total: 100, percentage: 0 };
  currentStep.value = undefined;
  analysisResults.value = null;
  hitlActionTaken.value = false;
  ownConversationId.value = "";
  console.log("[LegalDepartment] State reset for new conversation");
}

/**
 * Save analysis results as a deliverable for persistence
 */
async function saveAnalysisDeliverable() {
  if (!analysisResults.value || !currentConversationId.value) {
    console.log("[LegalDepartment] No results or conversation ID to save");
    return;
  }

  try {
    // Build the state to persist
    const persistedState = {
      analysisResults: analysisResults.value,
      routingDecision: routingDecision.value,
      currentRequest: currentRequest.value,
      specialistStates: specialistStates.value,
    };

    // Create a title from the request
    const title = currentRequest.value?.attachedDocument?.name
      ? `Legal Analysis - ${currentRequest.value.attachedDocument.name}`
      : `Legal Analysis - ${new Date().toLocaleDateString()}`;

    await getDeliverablesService().createDeliverable({
      title,
      description:
        analysisResults.value.summary || "Legal Department AI analysis",
      type: DeliverableType.ANALYSIS,
      conversationId: currentConversationId.value,
      agentName: "legal-department",
      initialContent: JSON.stringify(persistedState),
      initialFormat: DeliverableFormat.JSON,
    });

    console.log("[LegalDepartment] Analysis saved as deliverable");
  } catch (err) {
    // Don't fail the whole flow if save fails - just log it
    console.error("[LegalDepartment] Failed to save deliverable:", err);
  }
}

/**
 * Load existing analysis from deliverables for this conversation
 */
async function loadExistingAnalysis(conversationId: string): Promise<boolean> {
  isLoadingExisting.value = true;
  console.log(
    "[LegalDepartment] Loading existing analysis for conversation:",
    conversationId,
  );

  try {
    const deliverables =
      await getDeliverablesService().getConversationDeliverables(conversationId);
    console.log(
      "[LegalDepartment] Got deliverables:",
      deliverables.length,
      deliverables.map((d) => ({
        id: d.id,
        type: d.type,
        hasVersion: !!d.currentVersion,
      })),
    );

    // Find the most recent analysis deliverable
    const analysisDeliverable = deliverables
      .filter((d) => d.type === DeliverableType.ANALYSIS)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];

    if (!analysisDeliverable) {
      // No previous analysis - this is expected for new conversations
      // Just return false to show the welcome state (no error needed)
      console.log(
        "[LegalDepartment] No analysis deliverable found - showing welcome state",
      );
      return false;
    }

    console.log("[LegalDepartment] Found analysis deliverable:", {
      id: analysisDeliverable.id,
      type: analysisDeliverable.type,
      hasCurrentVersion: !!analysisDeliverable.currentVersion,
      hasContent: !!analysisDeliverable.currentVersion?.content,
      contentLength: analysisDeliverable.currentVersion?.content?.length || 0,
    });

    if (!analysisDeliverable.currentVersion?.content) {
      console.log("[LegalDepartment] Analysis deliverable has no content");
      error.value = "Previous analysis found but has no content.";
      return false;
    }

    // Parse and restore the state
    const persistedState = JSON.parse(
      analysisDeliverable.currentVersion.content,
    );
    console.log(
      "[LegalDepartment] Parsed persisted state keys:",
      Object.keys(persistedState),
    );

    if (persistedState.analysisResults) {
      analysisResults.value = persistedState.analysisResults;
      console.log("[LegalDepartment] Restored analysisResults");
    }
    if (persistedState.routingDecision) {
      routingDecision.value = persistedState.routingDecision;
      updateSpecialistStates(persistedState.routingDecision);
      console.log("[LegalDepartment] Restored routingDecision");
    }
    if (persistedState.currentRequest) {
      currentRequest.value = persistedState.currentRequest;
      console.log("[LegalDepartment] Restored currentRequest");
    }
    if (persistedState.specialistStates) {
      specialistStates.value = persistedState.specialistStates;
      console.log("[LegalDepartment] Restored specialistStates");
    }

    // Mark as completed since we're loading existing results
    analysisPhase.value = "completed";
    error.value = null; // Clear any previous errors

    console.log(
      "[LegalDepartment] Successfully restored analysis from deliverable",
    );
    return true;
  } catch (err) {
    console.error("[LegalDepartment] Failed to load existing analysis:", err);
    error.value = `Failed to load previous analysis: ${err instanceof Error ? err.message : "Unknown error"}`;
    return false;
  } finally {
    isLoadingExisting.value = false;
  }
}

async function waitForUser(timeoutMs = 5000): Promise<void> {
  if (rbacStore.user?.id) return;
  const start = Date.now();
  while (!rbacStore.user?.id && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function initializeConversation() {
  isLoading.value = true;
  error.value = null;

  try {
    // Wait for rbacStore.user to be populated (async fetchCurrentUser on store init)
    await waitForUser();

    // Ensure agents are loaded so we can resolve the agent's registered org
    if (!agentsStore.availableAgents || agentsStore.availableAgents.length === 0) {
      const agents = await agentsService.getAvailableAgents();
      agentsStore.setAvailableAgents(agents);
    }

    // Use the agent's registered org slug — not the user's current org selection
    const legalAgentRecord = agentsStore.availableAgents.find(
      (a) => a.name === "legal-department",
    );
    const orgSlug = legalAgentRecord?.organizationSlug || "legal";
    const userId = rbacStore.user?.id;
    if (!userId) {
      throw new Error("User not authenticated. Please log in and try again.");
    }

    // Check route query first, then props, then create new
    let conversationIdToUse =
      (route.query.conversationId as string) || props.conversationId;
    const isExistingConversation = !!conversationIdToUse;

    if (!conversationIdToUse) {
      conversationIdToUse = crypto.randomUUID();
      await agent2AgentConversationsService.createConversation({
        agentName: "legal-department",
        agentType: "api",
        organizationSlug: orgSlug,
        conversationId: conversationIdToUse,
        metadata: {
          source: "legal-department-ui",
          contentType: "legal-analysis",
        },
      });
    }

    // Check if legal-department agent requires local model (sovereign mode)
    const legalAgent = agentsStore.availableAgents.find(
      (a) => a.slug === "legal-department" || a.name === "legal-department",
    );
    const requireLocalModel = legalAgent?.requireLocalModel ?? false;

    if (requireLocalModel) {
      console.log(
        "[LegalDepartment] Agent requires local model - enforcing sovereign mode",
      );
      llmStore.setAgentRequiresLocalModel(true);
    } else {
      llmStore.setAgentRequiresLocalModel(false);
    }

    executionContextStore.initialize({
      orgSlug,
      userId,
      conversationId: conversationIdToUse,
      agentSlug: "legal-department",
      agentType: "api",
      provider: userPreferencesStore.preferredProvider || "anthropic",
      model: userPreferencesStore.preferredModel || "claude-sonnet-4-20250514",
    });

    // Capture conversationId locally so SSE always uses the legal-department's
    // own conversation, even if the shared executionContextStore is overwritten
    // by ConversationView or other components later.
    ownConversationId.value = conversationIdToUse;

    console.log(
      "[LegalDepartment] Initialized:",
      executionContextStore.current,
    );

    // If this is an existing conversation, try to load previous analysis
    if (isExistingConversation) {
      await loadExistingAnalysis(conversationIdToUse);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to initialize";
    console.error("[LegalDepartment] Initialization failed:", err);
  } finally {
    isLoading.value = false;
  }
}

async function handleRequestSubmit(data: {
  message: string;
  file?: File;
  options: {
    extractKeyTerms: boolean;
    identifyRisks: boolean;
    generateRecommendations: boolean;
  };
}) {
  console.log("[LegalDepartment] Submit request");
  error.value = null;
  isProcessing.value = true;
  hitlActionTaken.value = false;
  analysisResults.value = null;

  // Create request object
  currentRequest.value = {
    id: crypto.randomUUID(),
    message: data.message,
    attachedDocument: data.file
      ? {
          file: data.file,
          name: data.file.name,
          size: data.file.size,
          type: data.file.type,
        }
      : undefined,
    timestamp: new Date().toISOString(),
  };

  // Scroll to show response area
  await nextTick();
  scrollToBottom();

  try {
    if (data.file) {
      // Document analysis flow
      await processDocumentAnalysis(data.file, data.options);
    } else {
      // Text-only query flow (future: route to appropriate specialist)
      await processTextQuery(data.message);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Analysis failed";
    console.error("[LegalDepartment] Request failed:", err);
  } finally {
    isProcessing.value = false;
    scrollToBottom();

    // Save results as deliverable if analysis completed successfully
    if (analysisResults.value && !error.value) {
      await saveAnalysisDeliverable();
    }
  }
}

async function processDocumentAnalysis(
  file: File,
  options: {
    extractKeyTerms: boolean;
    identifyRisks: boolean;
    generateRecommendations: boolean;
  },
) {
  // Set initial phase
  analysisPhase.value = "uploading";
  currentStep.value = "Connecting to analysis service...";
  analysisProgress.value = { current: 0, total: 100, percentage: 0 };

  // Use the local conversationId (immune to shared store overwrites by ConversationView)
  const conversationId = ownConversationId.value || currentConversationId.value;
  if (conversationId) {
    // Connect to SSE stream for real-time progress updates BEFORE starting analysis
    // Completion callback receives results when the async background execution finishes
    legalDepartmentService.connectToSSEStream(
      conversationId,
      handleProgressEvent,
      handleCompletionEvent,
    );
    console.log("[LegalDepartment] SSE connected for progress tracking, conversationId:", conversationId);
  }

  try {
    // Update to show upload starting
    analysisPhase.value = "uploading";
    currentStep.value = "Uploading document...";
    analysisProgress.value = { current: 5, total: 100, percentage: 5 };

    // POST to async endpoint — returns immediately with taskId
    // Background execution runs on the server; results arrive via SSE completion
    const result = await legalDepartmentService.uploadAndAnalyze(file, options);
    console.log("[LegalDepartment] Async task accepted:", result.taskId);

    // Wait for completion via SSE (handleCompletionEvent will set analysisResults.value)
    await waitForAnalysisCompletion();
  } finally {
    // Disconnect SSE stream when analysis completes or fails
    legalDepartmentService.disconnectSSEStream();
  }
}

/**
 * Handle progress events from SSE stream
 */
function handleProgressEvent(event: ProgressEvent) {
  console.log("[LegalDepartment] Progress update:", event);

  // Update progress bar
  if (event.progress !== undefined) {
    analysisProgress.value = {
      current: event.progress,
      total: 100,
      percentage: event.progress,
    };
  }

  // Update step description
  if (event.step) {
    currentStep.value = formatStepDescription(event.step, event.message);
  }

  // Update analysis phase based on step
  const phase = mapStepToPhase(event.step);
  if (phase) {
    analysisPhase.value = phase;
  }

  // Handle metadata for specialist state updates
  if (event.metadata) {
    const specialist = event.metadata.specialist;
    const status = event.metadata.status;
    if (typeof specialist === "string" && typeof status === "string") {
      const specialistType = specialist as SpecialistType;
      if (specialistStates.value[specialistType]) {
        const specialistStatus = status as SpecialistStatus;
        specialistStates.value[specialistType] = {
          ...specialistStates.value[specialistType],
          status: specialistStatus,
        };
      }
    }
  }
}

/**
 * Handle async task completion from SSE stream.
 * Called when the background execution finishes and results are fetched.
 */
function handleCompletionEvent(result: {
  taskId: string;
  analysisResults?: AnalysisResults;
  error?: string;
}) {
  console.log("[LegalDepartment] Completion event received:", {
    taskId: result.taskId,
    hasResults: !!result.analysisResults,
    error: result.error,
  });

  if (result.error) {
    error.value = result.error;
    analysisPhase.value = "failed" as AnalysisPhase;
    return;
  }

  if (result.analysisResults) {
    // Set the results — this unblocks waitForAnalysisCompletion()
    analysisResults.value = result.analysisResults;

    // Clear any warning messages (e.g. "taking longer than expected") now that we have results
    error.value = null;

    // Infer routing from specialist outputs
    inferRoutingFromResults(result.analysisResults);

    // Final completion update
    analysisPhase.value = "completed";
    currentStep.value = "Analysis complete";
    analysisProgress.value = { current: 100, total: 100, percentage: 100 };

    // Mark all specialists as completed
    if (routingDecision.value) {
      markSpecialistsCompleted();
    }
  }
}

/**
 * Map SSE step names to analysis phases
 */
function mapStepToPhase(step: string): AnalysisPhase | null {
  const stepLower = step.toLowerCase();
  if (stepLower.includes("upload") || stepLower.includes("extract"))
    return "extracting";
  if (stepLower.includes("rout") || stepLower.includes("clo"))
    return "analyzing";
  if (stepLower.includes("specialist") || stepLower.includes("analy"))
    return "analyzing";
  if (stepLower.includes("risk")) return "identifying_risks";
  if (stepLower.includes("recommend") || stepLower.includes("synth"))
    return "generating_recommendations";
  if (stepLower.includes("complet") || stepLower.includes("final"))
    return "completed";
  return null;
}

/**
 * Format step description for display
 */
function formatStepDescription(step: string, message?: string): string {
  // If we have a message, use it
  if (message) return message;

  // Format step name into readable description
  const stepMappings: Record<string, string> = {
    upload: "Uploading document...",
    extract: "Extracting text content...",
    extraction: "Extracting text content...",
    clo: "Routing to specialists...",
    routing: "Routing to specialists...",
    specialist: "Running specialist analysis...",
    contract: "Analyzing contract terms...",
    compliance: "Checking compliance requirements...",
    ip: "Reviewing intellectual property...",
    privacy: "Analyzing privacy implications...",
    employment: "Reviewing employment terms...",
    synthesis: "Synthesizing results...",
    final: "Finalizing analysis...",
    complete: "Analysis complete",
  };

  const stepLower = step.toLowerCase();
  for (const [key, desc] of Object.entries(stepMappings)) {
    if (stepLower.includes(key)) return desc;
  }

  // Default: capitalize the step name
  return (
    step.charAt(0).toUpperCase() + step.slice(1).replace(/_/g, " ") + "..."
  );
}

/**
 * Get timeout based on model - slower models get more time
 */
function getModelAwareTimeout(): {
  timeout: number;
  progressWarningThreshold: number;
} {
  const model = executionContextStore.contextOrNull?.model?.toLowerCase() || "";
  const provider =
    executionContextStore.contextOrNull?.provider?.toLowerCase() || "";

  // Slow models: Opus, o1, large reasoning models - 5 minutes
  if (
    model.includes("opus") ||
    model.includes("o1-") ||
    model.includes("o3-")
  ) {
    return { timeout: 300000, progressWarningThreshold: 120000 };
  }

  // Local models (Ollama): variable performance - 4 minutes
  if (provider.includes("ollama")) {
    return { timeout: 240000, progressWarningThreshold: 90000 };
  }

  // Medium models: GPT-4o, Claude 3.5/4 Sonnet - 3 minutes
  if (
    model.includes("gpt-4o") ||
    model.includes("sonnet") ||
    model.includes("gemini-1.5-pro")
  ) {
    return { timeout: 180000, progressWarningThreshold: 60000 };
  }

  // Fast models: Flash, Haiku, mini - 2 minutes (default)
  return { timeout: 120000, progressWarningThreshold: 60000 };
}

/**
 * Wait for analysis completion via SSE or timeout
 */
async function waitForAnalysisCompletion(): Promise<void> {
  // Get model-aware timeout settings
  const { timeout, progressWarningThreshold } = getModelAwareTimeout();
  const checkInterval = 1000;
  let elapsed = 0;

  console.log(
    `[LegalDepartment] Using model-aware timeout: ${timeout / 1000}s for model: ${executionContextStore.contextOrNull?.model}`,
  );

  while (
    elapsed < timeout &&
    analysisPhase.value !== "completed" &&
    !analysisResults.value
  ) {
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
    elapsed += checkInterval;

    // If we've been waiting too long without progress, show warning (but don't break)
    if (
      elapsed > progressWarningThreshold &&
      analysisProgress.value.percentage < 20
    ) {
      error.value =
        "Analysis is taking longer than expected. The backend may still be processing.";
      // Don't break - let it continue until full timeout
    }
  }

  // If we reach here without results, show error
  if (!analysisResults.value && analysisPhase.value !== "completed") {
    error.value =
      "Analysis completed but no results were returned from the backend.";
  }
}

async function processTextQuery(message: string) {
  // For text-only queries without documents
  analysisPhase.value = "analyzing";
  currentStep.value = "Processing your legal question...";
  analysisProgress.value = { current: 0, total: 100, percentage: 0 };

  // Use the local conversationId (immune to shared store overwrites by ConversationView)
  const conversationId = ownConversationId.value || currentConversationId.value;
  if (conversationId) {
    legalDepartmentService.connectToSSEStream(
      conversationId,
      handleProgressEvent,
      handleCompletionEvent,
    );
    console.log("[LegalDepartment] SSE connected for text query progress, conversationId:", conversationId);
  }

  try {
    // POST to async endpoint — returns immediately with taskId
    // Background execution runs on the server; results arrive via SSE completion
    const result = await legalDepartmentService.sendTextQuery(message);
    console.log("[LegalDepartment] Async text query accepted:", result.taskId);

    // Wait for completion via SSE (handleCompletionEvent will set analysisResults.value)
    await waitForAnalysisCompletion();
  } catch (err) {
    console.error("[LegalDepartment] Text query failed:", err);
    error.value =
      err instanceof Error
        ? err.message
        : "Failed to process your question. Please try again.";
    analysisPhase.value = "failed" as AnalysisPhase;
    currentRequest.value = null;
  } finally {
    // Disconnect SSE stream when query completes or fails
    legalDepartmentService.disconnectSSEStream();
  }
}


function inferRoutingFromResults(results: AnalysisResults) {
  if (!results.specialistOutputs) return;

  const specialists = Object.keys(
    results.specialistOutputs,
  ) as SpecialistType[];
  if (specialists.length === 0) return;

  routingDecision.value = {
    specialist: specialists[0],
    specialists: specialists.length > 1 ? specialists : undefined,
    confidence: 0.85,
    reasoning: `Routed to ${specialists.join(", ")} based on document content.`,
    categories: ["inferred"],
    multiAgent: specialists.length > 1,
  };

  updateSpecialistStates(routingDecision.value);
}

function updateSpecialistStates(routing: RoutingDecision) {
  const states: Record<SpecialistType, SpecialistState> = {} as Record<
    SpecialistType,
    SpecialistState
  >;
  const names: Record<SpecialistType, string> = {
    contract: "Contract",
    compliance: "Compliance",
    ip: "IP",
    privacy: "Privacy",
    employment: "Employment",
    corporate: "Corporate",
    litigation: "Litigation",
    real_estate: "Real Estate",
    unknown: "Unknown",
  };

  const activeSpecialists =
    routing.multiAgent && routing.specialists
      ? routing.specialists
      : [routing.specialist];

  for (const slug of activeSpecialists) {
    states[slug] = {
      slug,
      name: names[slug] || slug,
      status: "running",
    };
  }

  specialistStates.value = states;
}

function markSpecialistsCompleted() {
  for (const slug of Object.keys(specialistStates.value) as SpecialistType[]) {
    specialistStates.value[slug] = {
      ...specialistStates.value[slug],
      status: "completed",
    };
  }
}

function getSpecialistStatuses(): Record<string, SpecialistStatus> {
  const statuses: Record<string, SpecialistStatus> = {};
  for (const [slug, state] of Object.entries(specialistStates.value)) {
    statuses[slug] = state.status;
  }
  return statuses;
}

// simulateAnalysisProgress and getPhaseDescription removed - using real SSE-based progress tracking
// Mock data removed - all results come from backend

function handleSpecialistClick(specialist: SpecialistType) {
  console.log("[LegalDepartment] Specialist clicked:", specialist);
  // Could scroll to specialist tab or highlight it
}

async function handleHITLAction(action: HITLAction, comment?: string) {
  console.log("[LegalDepartment] HITL action:", action, comment);

  // Immediately mark as taken to disable buttons
  hitlActionTaken.value = true;

  // Record the decision to the backend
  try {
    const taskId = analysisResults.value?.taskId || "unknown";
    const result = await legalDepartmentService.recordHITLDecision(
      taskId,
      action,
      comment,
    );
    console.log("[LegalDepartment] HITL decision recorded:", result);

    // Show toast notification based on action
    await showHITLToast(action);
  } catch (err) {
    console.error("[LegalDepartment] Error recording HITL decision:", err);
    // Still show success toast - the UI action was confirmed even if backend sync failed
    await showHITLToast(action);
  }
}

/**
 * Show toast notification for HITL action
 */
async function showHITLToast(action: HITLAction) {
  const toastConfig: Record<HITLAction, { message: string; color: string }> = {
    approve: {
      message: "Decision recorded: Approved",
      color: "success",
    },
    reject: {
      message: "Decision recorded: Rejected",
      color: "danger",
    },
    request_reanalysis: {
      message: "Re-analysis requested",
      color: "warning",
    },
  };

  const config = toastConfig[action] || {
    message: "Decision recorded",
    color: "primary",
  };

  console.log("[LegalDepartment] Creating toast:", config);

  try {
    const toast = await toastController.create({
      message: config.message,
      duration: 3000,
      position: "bottom",
      color: config.color,
    });

    console.log("[LegalDepartment] Toast created, presenting...");
    await toast.present();
    console.log("[LegalDepartment] Toast presented");
  } catch (err) {
    console.error("[LegalDepartment] Toast error:", err);
  }
}

function handleExport(format: "json" | "pdf") {
  if (!analysisResults.value) return;

  if (format === "json") {
    const data = JSON.stringify(analysisResults.value, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legal-analysis-${analysisResults.value.taskId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    // Generate printable HTML for PDF export
    exportToPdf();
  }
}

function exportToPdf() {
  if (!analysisResults.value) return;

  const results = analysisResults.value;
  const routing = routingDecision.value;
  const timestamp = new Date().toLocaleString();
  const specialists = results.specialistOutputs
    ? Object.keys(results.specialistOutputs)
    : [];
  const hasMultipleSpecialists = specialists.length > 1;

  // Calculate overall risk level
  const overallRiskLevel = calculateOverallRiskLevel(results.risks || []);

  // Build HTML content for PDF - Option D: Executive Summary + Appendices
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Legal Analysis Report - ${results.documentName || "Analysis"}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; color: #333; }
        h1 { color: #333; border-bottom: 3px solid #8B4513; padding-bottom: 10px; margin-bottom: 20px; }
        h2 { color: #8B4513; margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
        h3 { color: #555; margin-top: 20px; }
        h4 { color: #666; margin-top: 15px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
        .header-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; margin-left: 10px; }
        .badge-critical { background: #dc3545; color: white; }
        .badge-high { background: #fd7e14; color: white; }
        .badge-medium { background: #6c757d; color: white; }
        .badge-low { background: #28a745; color: white; }
        .summary-box { background: #f8f5f0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8B4513; }
        .summary-box h1, .summary-box h2, .summary-box h3 { color: #8B4513; border: none; margin-top: 15px; }
        .summary-box p { margin: 10px 0; line-height: 1.6; }
        .summary-box ul, .summary-box ol { margin: 10px 0; padding-left: 25px; }
        .summary-box li { margin: 5px 0; }
        .summary-box table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .summary-box th, .summary-box td { padding: 8px; border: 1px solid #ddd; text-align: left; }
        .summary-box th { background: #8B4513; color: white; }
        .routing-box { background: #f5f5f5; padding: 15px 20px; border-radius: 8px; margin: 20px 0; }
        .routing-specialists { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
        .specialist-badge { background: #8B4513; color: white; padding: 6px 14px; border-radius: 6px; font-size: 13px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
        .metric-box { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .metric-value { font-size: 32px; font-weight: bold; color: #8B4513; }
        .metric-label { font-size: 12px; color: #666; margin-top: 5px; }
        .risk-breakdown { margin: 20px 0; }
        .risk-bar { display: flex; align-items: center; margin: 8px 0; }
        .risk-bar-label { width: 80px; font-size: 13px; font-weight: 500; }
        .risk-bar-track { flex: 1; height: 12px; background: #e9ecef; border-radius: 6px; overflow: hidden; margin: 0 10px; }
        .risk-bar-fill { height: 100%; border-radius: 6px; }
        .risk-bar-fill.critical { background: #dc3545; }
        .risk-bar-fill.high { background: #fd7e14; }
        .risk-bar-fill.medium { background: #6c757d; }
        .risk-bar-fill.low { background: #28a745; }
        .risk-bar-count { width: 30px; font-size: 13px; font-weight: 500; }
        .key-issues { margin: 20px 0; }
        .key-issue { display: flex; align-items: flex-start; gap: 10px; padding: 10px; background: #fff3cd; border-radius: 6px; margin: 8px 0; }
        .key-issue-icon { color: #856404; font-size: 18px; }
        .risk { padding: 12px 15px; margin: 8px 0; border-left: 4px solid; border-radius: 4px; page-break-inside: avoid; background: #fafafa; }
        .risk-critical { border-color: #dc3545; background: rgba(220, 53, 69, 0.12); }
        .risk-high { border-color: #fd7e14; background: rgba(253, 126, 20, 0.12); }
        .risk-medium { border-color: #6c757d; background: rgba(108, 117, 125, 0.10); }
        .risk-low { border-color: #28a745; background: rgba(40, 167, 69, 0.10); }
        .finding, .recommendation { padding: 12px 15px; margin: 8px 0; background: #f8f9fa; border-radius: 6px; page-break-inside: avoid; }
        .clause-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 15px 0; }
        .clause-item { background: #f8f9fa; padding: 12px; border-radius: 6px; }
        .clause-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px; }
        .clause-value { font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 10px 12px; border: 1px solid #ddd; text-align: left; }
        th { background: #8B4513; color: white; }
        .toc { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .toc-title { font-weight: bold; margin-bottom: 15px; color: #8B4513; }
        .toc-item { padding: 5px 0; }
        .toc-item a { color: #333; text-decoration: none; }
        .toc-item a:hover { color: #8B4513; }
        .appendix { page-break-before: always; }
        .appendix-header { background: linear-gradient(135deg, #8B4513, #A0522D); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .appendix-header h2 { color: white; border: none; margin: 0; }
        .appendix-header .confidence { font-size: 14px; opacity: 0.9; margin-top: 5px; }
        .policy-check { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 6px; margin: 8px 0; }
        .policy-status { padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 500; }
        .policy-compliant { background: #d4edda; color: #155724; }
        .policy-non-compliant { background: #f8d7da; color: #721c24; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #8B4513; text-align: center; color: #666; font-size: 12px; }
        @media print {
          body { margin: 0; padding: 15px; }
          .appendix { page-break-before: always; }
          .risk, .finding, .recommendation { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
  `;

  // ========== PART 1: EXECUTIVE OVERVIEW ==========
  html += `
    <h1>Legal Analysis Report
      <span class="header-badge badge-${overallRiskLevel.toLowerCase()}">${overallRiskLevel.toUpperCase()} RISK</span>
    </h1>
    <div class="meta">
      <p><strong>Document:</strong> ${results.documentName || "N/A"}</p>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Task ID:</strong> ${results.taskId}</p>
    </div>
  `;

  // CLO Routing Summary
  if (routing) {
    const routingSpecialists =
      routing.multiAgent && routing.specialists
        ? routing.specialists
        : [routing.specialist];
    html += `
      <div class="routing-box">
        <strong>CLO Routing</strong> (${Math.round(routing.confidence * 100)}% confidence)
        <div class="routing-specialists">
          ${routingSpecialists.map((s) => `<span class="specialist-badge">${formatSpecialistName(s)}</span>`).join("")}
        </div>
        ${routing.reasoning ? `<p style="margin-top: 10px; font-size: 13px; color: #666;">${routing.reasoning}</p>` : ""}
      </div>
    `;
  }

  // Aggregated Metrics
  const totalFindings = results.findings?.length || 0;
  const totalRisks = results.risks?.length || 0;
  const totalRecs = results.recommendations?.length || 0;
  const specialistCount = specialists.length || 1;

  html += `
    <h2>Analysis Metrics</h2>
    <div class="metrics-grid">
      <div class="metric-box">
        <div class="metric-value">${totalFindings}</div>
        <div class="metric-label">Findings</div>
      </div>
      <div class="metric-box">
        <div class="metric-value">${totalRisks}</div>
        <div class="metric-label">Risks</div>
      </div>
      <div class="metric-box">
        <div class="metric-value">${totalRecs}</div>
        <div class="metric-label">Recommendations</div>
      </div>
      <div class="metric-box">
        <div class="metric-value">${specialistCount}</div>
        <div class="metric-label">Specialists</div>
      </div>
    </div>
  `;

  // Risk Breakdown
  if (results.risks && results.risks.length > 0) {
    const riskCounts = countRisksBySeverity(results.risks);
    html += `
      <h2>Risk Breakdown</h2>
      <div class="risk-breakdown">
        ${["Critical", "High", "Medium", "Low"]
          .map((severity) => {
            const count = riskCounts[severity.toLowerCase()] || 0;
            const percentage = totalRisks > 0 ? (count / totalRisks) * 100 : 0;
            return `
            <div class="risk-bar">
              <div class="risk-bar-label">${severity}</div>
              <div class="risk-bar-track">
                <div class="risk-bar-fill ${severity.toLowerCase()}" style="width: ${percentage}%"></div>
              </div>
              <div class="risk-bar-count">${count}</div>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }

  // Key Issues (top 5 critical/high risks)
  const keyIssues = (results.risks || [])
    .filter((r) => r.severity === "critical" || r.severity === "high")
    .slice(0, 5);
  if (keyIssues.length > 0) {
    html += `
      <h2>Key Issues</h2>
      <div class="key-issues">
        ${keyIssues
          .map(
            (issue) => `
          <div class="key-issue">
            <span class="key-issue-icon">⚠️</span>
            <div>
              <strong>${issue.title || "Issue"}</strong>
              <p style="margin: 5px 0 0 0; font-size: 13px; color: #666;">${issue.description || ""}</p>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  }

  // Executive Summary (rendered markdown)
  if (results.summary) {
    const renderedSummary = marked(results.summary);
    html += `
      <h2>Executive Summary</h2>
      <div class="summary-box">${renderedSummary}</div>
    `;
  }

  // ========== TABLE OF CONTENTS (for multi-specialist) ==========
  if (hasMultipleSpecialists) {
    html += `
      <div class="toc">
        <div class="toc-title">Specialist Appendices</div>
        ${specialists
          .map(
            (s, i) => `
          <div class="toc-item">
            <a href="#appendix-${s}">Appendix ${String.fromCharCode(65 + i)}: ${formatSpecialistName(s)} Analysis</a>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  }

  // ========== PART 2: SPECIALIST APPENDICES ==========
  if (results.specialistOutputs) {
    specialists.forEach((specialistKey, index) => {
      const output =
        results.specialistOutputs![
          specialistKey as keyof typeof results.specialistOutputs
        ];
      if (!output) return;

      const appendixLetter = String.fromCharCode(65 + index);
      const specialistName = formatSpecialistName(specialistKey);

      html += `
        <div class="appendix" id="appendix-${specialistKey}">
          <div class="appendix-header">
            <h2>Appendix ${appendixLetter}: ${specialistName} Analysis</h2>
            <div class="confidence">${output.confidence ? `${Math.round(output.confidence * 100)}% Confidence` : ""}</div>
          </div>
      `;

      // Overview/Summary
      const overview =
        (output as Record<string, unknown>).overview ||
        (output as Record<string, unknown>).summary ||
        (output as Record<string, unknown>).description;
      if (overview) {
        html += `
          <h3>Overview</h3>
          <p>${overview}</p>
        `;
      }

      // Contract-specific: Key Clauses
      const keyClauses = (output as Record<string, unknown>).keyClauses;
      if (
        specialistKey === "contract" &&
        keyClauses &&
        typeof keyClauses === "object" &&
        !Array.isArray(keyClauses)
      ) {
        const clauses = keyClauses as Record<string, unknown>;
        const clauseEntries = Object.entries(clauses);
        if (clauseEntries.length > 0) {
          html += `
            <h3>Key Clauses</h3>
            <div class="clause-grid">
              ${clauseEntries
                .map(
                  ([key, value]) => `
                <div class="clause-item">
                  <div class="clause-label">${formatClauseLabel(key)}</div>
                  <div class="clause-value">${value || "Not specified"}</div>
                </div>
              `,
                )
                .join("")}
            </div>
          `;
        }
      }

      // Compliance-specific: Policy Checks
      const policyChecks = (output as Record<string, unknown>).policyChecks;
      if (
        specialistKey === "compliance" &&
        policyChecks &&
        Array.isArray(policyChecks) &&
        policyChecks.length > 0
      ) {
        const checks = policyChecks as Array<{
          name: string;
          status: string;
          details?: string;
        }>;
        html += `
          <h3>Policy Compliance Checks</h3>
          ${checks
            .map(
              (check) => `
            <div class="policy-check">
              <div>
                <strong>${check.name || "Policy Check"}</strong>
                ${check.details ? `<p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">${check.details}</p>` : ""}
              </div>
              <span class="policy-status ${check.status === "compliant" ? "policy-compliant" : "policy-non-compliant"}">
                ${check.status === "compliant" ? "✓ Compliant" : "✗ Non-Compliant"}
              </span>
            </div>
          `,
            )
            .join("")}
        `;
      }

      // Risk Flags
      const riskFlagsRaw = (output as Record<string, unknown>).riskFlags;
      const riskFlags = Array.isArray(riskFlagsRaw)
        ? (riskFlagsRaw as Array<{
            severity: string;
            title?: string;
            description?: string;
            recommendation?: string;
          }>)
        : undefined;
      if (riskFlags && riskFlags.length > 0) {
        html += `
          <h3>Risk Flags</h3>
          ${riskFlags
            .map(
              (risk) => `
            <div class="risk risk-${(risk.severity || "medium").toLowerCase()}">
              <strong>${risk.title || "Risk"}</strong>
              <span style="font-size: 12px; text-transform: uppercase;">(${risk.severity || "medium"})</span>
              <p>${risk.description || ""}</p>
              ${risk.recommendation ? `<p style="font-size: 13px; color: #666;"><em>Recommendation: ${risk.recommendation}</em></p>` : ""}
            </div>
          `,
            )
            .join("")}
        `;
      }

      // Recommendations
      const recsRaw = (output as Record<string, unknown>).recommendations;
      const recs = Array.isArray(recsRaw)
        ? (recsRaw as Array<{ title?: string; description?: string }>)
        : undefined;
      if (recs && recs.length > 0) {
        html += `
          <h3>Recommendations</h3>
          ${recs
            .map(
              (rec) => `
            <div class="recommendation">
              <strong>${rec.title || "Recommendation"}</strong>
              <p>${rec.description || ""}</p>
            </div>
          `,
            )
            .join("")}
        `;
      }

      html += "</div>"; // Close appendix
    });
  }

  // Footer
  html += `
    <div class="footer">
      <p><strong>Generated by Legal Department AI</strong></p>
      <p>Orchestrator AI • ${timestamp}</p>
      <p style="font-size: 10px; margin-top: 10px;">This analysis is provided for informational purposes and should not be considered legal advice.</p>
    </div>
    </body>
    </html>
  `;

  // Open print window
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  } else {
    console.error("[LegalDepartment] Failed to open print window");
    alert("Please allow popups to export PDF");
  }
}

// Helper functions for PDF export
function calculateOverallRiskLevel(risks: Array<{ severity: string }>): string {
  if (risks.some((r) => r.severity === "critical")) return "critical";
  if (risks.some((r) => r.severity === "high")) return "high";
  if (risks.some((r) => r.severity === "medium")) return "medium";
  return "low";
}

function countRisksBySeverity(
  risks: Array<{ severity: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const risk of risks) {
    const severity = (risk.severity || "medium").toLowerCase();
    if (severity in counts) counts[severity]++;
  }
  return counts;
}

function formatSpecialistName(key: string): string {
  const names: Record<string, string> = {
    contract: "Contract",
    compliance: "Compliance",
    ip: "IP",
    privacy: "Privacy",
    employment: "Employment",
    corporate: "Corporate",
    litigation: "Litigation",
    real_estate: "Real Estate",
    realEstate: "Real Estate",
  };
  return names[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function formatClauseLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

async function handleRetry() {
  error.value = null;

  // If we have a conversation ID, try to reload existing analysis
  const conversationIdToUse =
    (route.query.conversationId as string) ||
    props.conversationId ||
    currentConversationId.value;
  if (conversationIdToUse) {
    await loadExistingAnalysis(conversationIdToUse);
  }
}

function startNewAnalysis() {
  // Clear error and state to start fresh
  error.value = null;
  currentRequest.value = null;
  routingDecision.value = undefined;
  analysisResults.value = null;
}

function navigateToNewAnalysis() {
  router.push({ path: "/app/agents/legal-department" });
}

function scrollToBottom() {
  nextTick(() => {
    if (responseAreaRef.value) {
      responseAreaRef.value.scrollTop = responseAreaRef.value.scrollHeight;
    }
  });
}

// TTS: Check if response is too long for speech
function isResponseTooLong(text: string): boolean {
  if (text.length > 500) return true;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length > 5) return true;
  return false;
}

// TTS: Handle text-to-speech conversion
async function handleTextToSpeech(text: string) {
  try {
    console.log("[LegalDepartment] TTS: Synthesizing response");

    // Use fallback message if response is too long
    const textToSpeak = isResponseTooLong(text)
      ? "I completed your request, but the response is quite lengthy. Please check the analysis for full details."
      : text;

    const synthesizedAudio = await apiService.synthesizeText(
      textToSpeak,
      "EXAVITQu4vr4xnSDxMaL", // Default voice ID
      0.5, // Speaking rate/stability
    );

    // Play the audio
    await playAudio(synthesizedAudio.audioData);
    console.log("[LegalDepartment] TTS: Playback complete");
  } catch (err) {
    console.error("[LegalDepartment] TTS failed:", err);
  } finally {
    chatUiStore.setLastMessageWasSpeech(false);
  }
}

// Play audio from base64 or data URL
function playAudio(audioData: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.onended = () => resolve();
    audio.onerror = (err) => reject(err);

    if (audioData.startsWith("data:")) {
      audio.src = audioData;
    } else {
      audio.src = `data:audio/mpeg;base64,${audioData}`;
    }

    audio.play().catch(reject);
  });
}

// Watch for analysis results and trigger TTS if voice input was used
watch(analysisResults, (newResults) => {
  if (newResults && chatUiStore.lastMessageWasSpeech) {
    // Get text to speak
    let textToSpeak = newResults.summary || "";

    // For text-only responses, use the summary
    // For document analysis, provide a brief summary
    if (!textToSpeak && newResults.findings?.length > 0) {
      textToSpeak = `Analysis complete. Found ${newResults.findings.length} key findings and ${newResults.risks?.length || 0} risks.`;
    }

    if (textToSpeak) {
      handleTextToSpeech(textToSpeak);
    } else {
      chatUiStore.setLastMessageWasSpeech(false);
    }
  }
});
</script>

<style scoped>
.legal-department-conversation {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
}

.response-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* Welcome State */
.welcome-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.welcome-content {
  text-align: center;
  max-width: 500px;
}

.welcome-icon {
  font-size: 64px;
  color: var(--ion-color-primary);
  margin-bottom: 16px;
}

.welcome-content h2 {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 600;
}

.welcome-content p {
  margin: 0 0 24px 0;
}

.capabilities {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.capability {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--ion-text-color);
}

.capability ion-icon {
  font-size: 20px;
  color: var(--ion-color-primary);
}

.model-selector {
  margin-top: 24px;
  max-width: 400px;
  text-align: left;
}

.history-button {
  margin-top: 16px;
}

/* Request Display */
.request-display {
  background: rgba(var(--ion-color-primary-rgb), 0.2);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.request-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 500;
  font-size: 14px;
  color: white;
  opacity: 0.9;
}

.request-header ion-icon {
  font-size: 20px;
  color: white;
}

.request-message {
  margin: 0;
  line-height: 1.5;
  color: white;
}

.request-attachment {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  font-size: 13px;
  color: white;
}

.request-attachment ion-icon {
  font-size: 18px;
  color: white;
}

/* Processing Indicator with Thinking Animation */
.processing-indicator {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: var(--ion-card-background, var(--ion-background-color));
  border-radius: 12px;
  margin-bottom: 16px;
  border: 1px solid var(--ion-color-light-shade);
}

.thinking-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.thinking-avatar {
  width: 40px;
  height: 40px;
  background-color: var(--ion-color-primary-tint);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.thinking-bubble {
  background: var(--ion-color-light-shade);
  padding: 12px 16px;
  border-radius: 16px;
  border-top-left-radius: 4px;
  flex: 1;
  max-width: 300px;
}

.thinking-text {
  margin-bottom: 8px;
}

.agent-thinking-name {
  font-size: 0.8em;
  font-weight: bold;
  color: var(--ion-color-primary);
  margin-bottom: 2px;
}

.thinking-message {
  font-size: 0.9em;
  color: var(--ion-color-medium);
  font-style: italic;
}

.thinking-dots {
  display: flex;
  gap: 4px;
  justify-content: flex-start;
}

.thinking-dots .dot {
  width: 6px;
  height: 6px;
  background-color: var(--ion-color-primary);
  border-radius: 50%;
  animation: thinking-pulse 1.4s infinite ease-in-out;
}

.thinking-dots .dot:nth-child(1) {
  animation-delay: -0.32s;
}
.thinking-dots .dot:nth-child(2) {
  animation-delay: -0.16s;
}
.thinking-dots .dot:nth-child(3) {
  animation-delay: 0s;
}

@keyframes thinking-pulse {
  0%,
  80%,
  100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.progress-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.progress-step {
  margin: 0;
  font-size: 0.85em;
  color: var(--ion-color-medium);
}

.progress-section ion-progress-bar {
  width: 100%;
  max-width: 300px;
}

/* Error Display */
.error-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  background: rgba(var(--ion-color-danger-rgb), 0.08);
  border-radius: 12px;
  margin-bottom: 16px;
}

.error-display ion-icon {
  font-size: 48px;
}

.error-display p {
  margin: 0;
  text-align: center;
  color: var(--ion-color-danger-shade);
}

.error-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* Text Response Panel */
.text-response-panel {
  background: var(--ion-card-background, var(--ion-background-color));
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid var(--ion-color-light-shade);
}

.response-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-weight: 600;
  color: var(--ion-color-primary);
}

.response-header ion-icon {
  font-size: 20px;
}

.response-content {
  line-height: 1.7;
  color: var(--ion-color-dark);
}

/* Markdown content styling */
.response-content.markdown-content {
  white-space: normal;
}

.response-content.markdown-content :deep(h1),
.response-content.markdown-content :deep(h2),
.response-content.markdown-content :deep(h3),
.response-content.markdown-content :deep(h4) {
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 600;
  color: var(--ion-color-dark);
}

.response-content.markdown-content :deep(h1) {
  font-size: 1.5em;
}
.response-content.markdown-content :deep(h2) {
  font-size: 1.3em;
}
.response-content.markdown-content :deep(h3) {
  font-size: 1.15em;
}
.response-content.markdown-content :deep(h4) {
  font-size: 1em;
}

.response-content.markdown-content :deep(p) {
  margin-bottom: 1em;
}

.response-content.markdown-content :deep(ul),
.response-content.markdown-content :deep(ol) {
  margin-bottom: 1em;
  padding-left: 1.5em;
}

.response-content.markdown-content :deep(li) {
  margin-bottom: 0.5em;
}

.response-content.markdown-content :deep(strong) {
  font-weight: 600;
}

.response-content.markdown-content :deep(code) {
  background: var(--ion-color-step-100, rgba(255, 255, 255, 0.1));
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9em;
}

.response-content.markdown-content :deep(blockquote) {
  border-left: 3px solid var(--ion-color-primary);
  margin: 1em 0;
  padding-left: 1em;
  color: var(--ion-color-medium-shade);
}

.response-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px;
  background: rgba(var(--ion-color-primary-rgb), 0.15);
  border-radius: 8px;
  font-size: 13px;
  color: var(--ion-color-primary);
}

.response-hint ion-icon {
  font-size: 18px;
}

.new-analysis-action {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

@media (max-width: 600px) {
  .capabilities {
    grid-template-columns: 1fr;
  }

  .response-area {
    padding: 16px;
  }
}
</style>
