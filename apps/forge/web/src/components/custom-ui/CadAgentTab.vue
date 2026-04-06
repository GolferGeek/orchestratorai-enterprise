<template>
  <div class="cad-agent-tab">
    <!-- Header with Tab Navigation -->
    <div class="cad-header" v-if="hasTaskData">
      <div class="header-top">
        <div class="header-actions" v-if="hasTaskData">
          <ion-button fill="clear" size="small" @click="handleRestart">
            <ion-icon :icon="refreshOutline" slot="start" />
            Start Over
          </ion-button>
        </div>
      </div>

      <!-- Tab Navigation - Only show when there's task data -->
      <div v-if="hasTaskData" class="tab-navigation">
        <ion-segment :value="currentView" @ionChange="handleTabChange">
          <ion-segment-button value="config">
            <ion-label>Config</ion-label>
          </ion-segment-button>
          <ion-segment-button value="progress" :disabled="!hasProgressData">
            <ion-label>Progress</ion-label>
            <ion-badge v-if="isGenerating" color="secondary" class="status-badge">Live</ion-badge>
          </ion-segment-button>
          <ion-segment-button value="deliverables" :disabled="!hasDeliverables">
            <ion-label>Deliverables</ion-label>
            <ion-badge v-if="hasDeliverables && !isGenerating" color="success" class="status-badge">Done</ion-badge>
          </ion-segment-button>
        </ion-segment>
      </div>
    </div>

    <!-- Content Area -->
    <div class="cad-content">
      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner name="crescent" />
        <p>Loading configuration...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error && !isGenerating" class="error-container">
        <ion-icon :icon="alertCircleOutline" color="danger" />
        <p>{{ error }}</p>
        <ion-button @click="handleRestart">Retry</ion-button>
      </div>

      <!-- Config Panel -->
      <CadConfigPanel
        v-else-if="currentView === 'config'"
        @generate="handleGenerate"
      />

      <!-- Progress Panel -->
      <CadProgressPanel
        v-else-if="currentView === 'progress'"
      />

      <!-- Deliverables Panel -->
      <CadDeliverablePanel
        v-else-if="currentView === 'deliverables'"
        @restart="handleRestart"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, watch } from 'vue';
import {
  IonButton,
  IonSpinner,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonBadge,
} from '@ionic/vue';
import { refreshOutline, alertCircleOutline } from 'ionicons/icons';
import { useCadAgentStore } from '@/stores/cadAgentStore';
import { useRbacStore } from '@/stores/rbacStore';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { cadAgentService } from '@/services/cadAgentService';
import agent2AgentConversationsService from '@/services/agent2AgentConversationsService';
import CadConfigPanel from '@/views/agents/cad-agent/CadConfigPanel.vue';
import CadProgressPanel from '@/views/agents/cad-agent/CadProgressPanel.vue';
import CadDeliverablePanel from '@/views/agents/cad-agent/CadDeliverablePanel.vue';
import type { AgentConversation } from '@/types/conversation';
import type { CadConstraints } from '@/stores/cadAgentStore';

interface Props {
  conversation: AgentConversation | null;
}

const props = defineProps<Props>();

const store = useCadAgentStore();
const rbacStore = useRbacStore();
const executionContextStore = useExecutionContextStore();

// Computed properties from store
const currentView = computed(() => store.currentView);
const isLoading = computed(() => store.isLoading);
const isGenerating = computed(() => store.isGenerating);
const error = computed(() => store.error);
const hasTaskData = computed(() => store.hasTaskData);
const hasProgressData = computed(() => store.hasProgressData);
const hasDeliverables = computed(() => store.hasDeliverables);

// Get org slug from conversation or context
const orgSlug = computed((): string => {
  return props.conversation?.organizationSlug || rbacStore.currentOrganization || '';
});

const userId = computed(() => {
  return rbacStore.user?.id || '';
});

// Handle tab change
function handleTabChange(event: CustomEvent) {
  const newView = event.detail.value as 'config' | 'progress' | 'deliverables';
  store.setUIView(newView);
}

// Handle generate from config panel
async function handleGenerate(data: {
  prompt: string;
  projectId?: string;
  newProjectName?: string;
  constraints: CadConstraints;
  outputFormats: string[];
  llmProvider: string;
  llmModel: string;
}) {
  try {
    console.log('[CadAgentTab] Starting generation:', data);

    // Use provider/model from UI selection (user's choice)
    const provider = data.llmProvider;
    const model = data.llmModel;
    let conversationId = props.conversation?.id;

    // If no existing conversationId, create one in the DB first (same pattern as marketing-swarm / legal-department)
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      await agent2AgentConversationsService.createConversation({
        agentName: 'cad-agent',
        agentType: 'api',
        organizationSlug: orgSlug.value,
        conversationId,
        metadata: {
          source: 'cad-agent-ui',
          contentType: 'cad-model',
        },
      });
    }

    // Always update ExecutionContext to use the user-selected model
    if (!executionContextStore.isInitialized) {
      executionContextStore.initialize({
        orgSlug: orgSlug.value,
        userId: userId.value,
        conversationId,
        agentSlug: 'cad-agent',
        agentType: 'api',
        provider,
        model,
      });
    } else {
      // Context already initialized - update with user's model selection
      executionContextStore.setAgent('cad-agent', 'api');
      executionContextStore.setConversation(conversationId);
      executionContextStore.setLLM(provider, model);
    }

    // Connect to SSE stream BEFORE starting generation
    // This ensures we receive all progress events
    const activeConversationId = executionContextStore.current.conversationId;
    cadAgentService.connectToSSEStream(activeConversationId);
    console.log('[CadAgentTab] Connected to SSE stream for conversationId:', activeConversationId);

    // Call the CAD agent service (uses A2A orchestrator)
    const result = await cadAgentService.generateCad({
      prompt: data.prompt,
      projectId: data.projectId,
      newProjectName: data.newProjectName,
      constraints: data.constraints,
      outputFormats: data.outputFormats,
    });

    console.log('[CadAgentTab] Generation started:', result);

    // If completed synchronously, switch to deliverables
    if (result.status === 'completed') {
      store.setUIView('deliverables');
    }
    // Otherwise, SSE events will handle the transition

  } catch (err) {
    console.error('[CadAgentTab] Generation failed:', err);
    store.setGenerating(false);
    store.setError(err instanceof Error ? err.message : 'Generation failed');
  }
}

// Handle restart - go back to config
function handleRestart() {
  store.resetTaskState();
  store.setUIView('welcome');
}

// Load configuration on mount
onMounted(async () => {
  console.log('[CadAgentTab] Mounted with conversation:', props.conversation?.id);

  // Load existing task state from conversation (restore deliverables, progress, etc.)
  if (props.conversation?.id) {
    await cadAgentService.loadConversationState(props.conversation.id);
  }
});

// Cleanup on unmount
onUnmounted(() => {
  console.log('[CadAgentTab] Unmounting');
  // Disconnect SSE stream when component unmounts
  cadAgentService.disconnectSSEStream();
});

// Watch for conversation changes - restore state for the new conversation
watch(() => props.conversation?.id, async (newId) => {
  if (newId) {
    console.log('[CadAgentTab] Conversation changed:', newId);
    // loadConversationState calls resetTaskState internally before loading
    await cadAgentService.loadConversationState(newId);
  }
});
</script>

<style scoped>
.cad-agent-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
}

.cad-header {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--ion-color-light);
  background: white;
}

.header-top {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 12px 16px;
}

.header-info h2 {
  margin: 0;
  font-size: 1.2em;
  font-weight: 600;
  color: var(--ion-color-dark);
}

.conversation-title {
  font-size: 0.9em;
  color: var(--ion-color-medium);
  margin-left: 8px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

/* Tab Navigation */
.tab-navigation {
  padding: 0 16px 12px;
}

.tab-navigation ion-segment {
  --background: #f4f5f8;
  border-radius: 8px;
}

.tab-navigation ion-segment-button {
  --indicator-color: #ffffff;
  --color: #666666;
  --color-checked: #000000;
  --ripple-color: rgba(0, 0, 0, 0.1);
  font-size: 0.85em;
  min-height: 36px;
  position: relative;
}

.tab-navigation ion-segment-button ion-label {
  font-weight: 500;
}

.tab-navigation .status-badge {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 0.6em;
  padding: 2px 4px;
  min-width: unset;
  border-radius: 4px;
}

.cad-content {
  flex: 1;
  overflow-y: auto;
}

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
