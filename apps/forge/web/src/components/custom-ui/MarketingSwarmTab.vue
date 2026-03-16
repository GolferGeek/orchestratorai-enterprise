<template>
  <div class="marketing-swarm-tab">
    <!-- Header with Tab Navigation -->
    <div class="swarm-header" v-if="hasTaskData">
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
        <ion-segment :value="uiState.currentView" @ionChange="handleTabChange">
          <ion-segment-button value="config">
            <ion-icon :icon="settingsOutline" />
            <ion-label>Config</ion-label>
          </ion-segment-button>
          <ion-segment-button value="progress" :disabled="!hasProgressData">
            <ion-icon :icon="pulseOutline" />
            <ion-label>Progress</ion-label>
            <ion-badge v-if="isExecuting" color="secondary" class="status-badge">Live</ion-badge>
          </ion-segment-button>
          <ion-segment-button value="results" :disabled="!hasResultsData">
            <ion-icon :icon="trophyOutline" />
            <ion-label>Results</ion-label>
            <ion-badge v-if="hasResultsData && currentPhase === 'completed'" color="success" class="status-badge">Done</ion-badge>
          </ion-segment-button>
        </ion-segment>
      </div>
    </div>

    <!-- Content Area -->
    <div class="swarm-content">
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
      <SwarmProgress
        v-else-if="uiState.currentView === 'progress'"
      />

      <!-- Results View -->
      <SwarmResults
        v-else-if="uiState.currentView === 'results'"
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
import { refreshOutline, alertCircleOutline, settingsOutline, pulseOutline, trophyOutline } from 'ionicons/icons';
import { useMarketingSwarmStore } from '@/stores/marketingSwarmStore';
import { marketingSwarmService } from '@/services/marketingSwarmService';
import { tasksService } from '@/services/tasksService';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useRbacStore } from '@/stores/rbacStore';
import SwarmConfigForm from '@/views/agents/marketing-swarm/components/SwarmConfigForm.vue';
import SwarmProgress from '@/views/agents/marketing-swarm/components/SwarmProgress.vue';
import SwarmResults from '@/views/agents/marketing-swarm/components/SwarmResults.vue';
import type { PromptData, SwarmConfig } from '@/types/marketing-swarm';
import type { AgentConversation } from '@/types/conversation';

interface Props {
  conversation: AgentConversation | null;
}

const props = defineProps<Props>();

const store = useMarketingSwarmStore();
const rbacStore = useRbacStore();
const conversationsStore = useConversationsStore();

const isLoading = computed(() => store.isLoading);
const isExecuting = computed(() => store.isExecuting);
const error = computed(() => store.error);
const uiState = computed(() => store.uiState);
const currentPhase = computed(() => store.currentPhase);
const phase2Outputs = computed(() => store.phase2Outputs);
const finalRankings = computed(() => store.finalRankings);

// Tab navigation computed properties
const hasTaskData = computed(() => {
  // Show tabs if we have any outputs or are executing
  return phase2Outputs.value.length > 0 || isExecuting.value || store.currentTaskId !== null;
});

const hasProgressData = computed(() => {
  // Progress tab is available if there are any outputs (started processing)
  return phase2Outputs.value.length > 0;
});

const hasResultsData = computed(() => {
  // Results tab is available if we have final rankings or completed phase
  return finalRankings.value.length > 0 || currentPhase.value === 'completed';
});

// Handle tab change
function handleTabChange(event: CustomEvent) {
  const newView = event.detail.value as 'config' | 'progress' | 'results';
  store.setUIView(newView);
}

// Get org slug from conversation or context
const orgSlug = computed(() => {
  return props.conversation?.organizationSlug || rbacStore.currentOrganization;
});

const userId = computed(() => {
  return rbacStore.user?.id || '';
});

// Load configuration data on mount
async function loadConfiguration() {
  try {
    await marketingSwarmService.fetchAllConfiguration(orgSlug.value);
  } catch (err) {
    console.error('Failed to load configuration:', err);
  }
}

onMounted(async () => {
  console.log('[MarketingSwarmTab] Mounted with conversation:', props.conversation?.id);
  await loadConfiguration();

  // Check if the initial conversation has a task (completed or in-progress)
  if (props.conversation?.id) {
    await loadConversationState(props.conversation);
  }
});

// Helper to determine the correct view and load state for a conversation
async function loadConversationState(conversation: AgentConversation | null) {
  if (!conversation) {
    store.setUIView('config');
    return;
  }

  console.log('[MarketingSwarmTab] Loading state for conversation:', conversation.id);

  // Step 1: Query API for tasks associated with this conversation (standard A2A flow)
  // This is the authoritative source for task existence
  try {
    const tasksResponse = await tasksService.listTasks({
      conversationId: conversation.id,
      limit: 10,
    });
    console.log('[MarketingSwarmTab] Tasks from API:', tasksResponse.tasks.length);

    if (tasksResponse.tasks.length > 0) {
      // Try each task to find one with actual LangGraph data
      // Prefer completed tasks with outputs over empty ones
      for (const task of tasksResponse.tasks) {
        const taskId = task.id;
        console.log('[MarketingSwarmTab] Trying task:', taskId, 'status:', task.status);

        try {
          const state = await marketingSwarmService.getSwarmState(taskId);
          console.log('[MarketingSwarmTab] Loaded swarm state from LangGraph:', state);

          // Check if this task has actual data
          const hasData = state.outputs && state.outputs.length > 0;

          if (!hasData && tasksResponse.tasks.length > 1) {
            console.log('[MarketingSwarmTab] Task has no data, trying next task...');
            continue; // Try the next task
          }

          // Store the taskId in the store
          store.setCurrentTaskId(taskId);

          // Determine the appropriate view based on state
          if (state.phase === 'completed' || task.status === 'completed') {
            store.setUIView('results');
          } else if (state.phase === 'failed' || task.status === 'failed') {
            store.setUIView('config');
            store.setError('Previous execution failed');
          } else if (hasData) {
            // Has outputs - show progress view
            store.setUIView('progress');
            // Reconnect to SSE if task might still be running
            marketingSwarmService.connectToSSEStream(conversation.id);
          } else {
            // Task exists but no outputs yet - show progress (initializing)
            store.setUIView('progress');
            marketingSwarmService.connectToSSEStream(conversation.id);
          }
          return;
        } catch (langGraphErr) {
          console.log('[MarketingSwarmTab] LangGraph state not available for task:', taskId, langGraphErr);
          // Try next task if available
          if (tasksResponse.tasks.indexOf(task) < tasksResponse.tasks.length - 1) {
            continue;
          }
          // Last task - fall back to API status
          store.setCurrentTaskId(taskId);
          if (task.status === 'completed') {
            store.setUIView('results');
          } else if (task.status === 'failed') {
            store.setUIView('config');
            store.setError('Previous execution failed (state unavailable)');
          } else {
            store.setUIView('progress');
            marketingSwarmService.connectToSSEStream(conversation.id);
          }
          return;
        }
      }
    }
  } catch (apiErr) {
    console.log('[MarketingSwarmTab] API tasks query failed:', apiErr);
  }

  // Fallback: Check message metadata (for completed tasks stored in messages)
  const messages = conversationsStore.messagesByConversation(conversation.id);
  console.log('[MarketingSwarmTab] Checking messages from store:', messages.length);

  const completedMessage = messages.find((msg) =>
    msg.metadata?.marketingSwarmCompleted === true
  );

  if (completedMessage?.metadata?.taskId) {
    const taskId = completedMessage.metadata.taskId as string;
    console.log('[MarketingSwarmTab] Found completed task in messages:', taskId);

    try {
      store.setCurrentTaskId(taskId);
      await marketingSwarmService.getSwarmState(taskId);
      store.setUIView('results');
      return;
    } catch (err) {
      console.error('[MarketingSwarmTab] Failed to load completed task state:', err);
    }
  }

  // No task found - show config for new execution
  console.log('[MarketingSwarmTab] No existing task found, showing config');
  store.setUIView('config');
}

// Cleanup SSE connection when component unmounts
onUnmounted(() => {
  console.log('[MarketingSwarmTab] Unmounting - disconnecting SSE');
  marketingSwarmService.disconnectSSEStream();
});

// Watch for conversation changes
watch(() => props.conversation?.id, async (newId) => {
  if (newId) {
    console.log('[MarketingSwarmTab] Conversation changed:', newId);
    // Disconnect existing SSE connection
    marketingSwarmService.disconnectSSEStream();
    // Reset state when switching to a new conversation
    store.resetTaskState();
    // Load the conversation's state and determine correct view
    await loadConversationState(props.conversation);
  }
});

// Handle execute from config form
async function handleExecute(data: {
  contentTypeSlug: string;
  contentTypeContext: string;
  promptData: PromptData;
  config: SwarmConfig;
}) {
  try {
    // Reset state before starting a new execution to clear any previous outputs
    store.resetTaskState();
    
    // Initialize agent card states
    for (const writer of data.config.writers) {
      store.setAgentCardState(writer.agentSlug, writer.llmConfigId, {
        agentSlug: writer.agentSlug,
        llmConfigId: writer.llmConfigId,
        status: 'idle',
      });
    }
    for (const editor of data.config.editors) {
      store.setAgentCardState(editor.agentSlug, editor.llmConfigId, {
        agentSlug: editor.agentSlug,
        llmConfigId: editor.llmConfigId,
        status: 'idle',
      });
    }
    for (const evaluator of data.config.evaluators) {
      store.setAgentCardState(evaluator.agentSlug, evaluator.llmConfigId, {
        agentSlug: evaluator.agentSlug,
        llmConfigId: evaluator.llmConfigId,
        status: 'idle',
      });
    }

    // Use conversationId from props (created when user clicked on agent in sidebar)
    const currentConversationId = props.conversation?.id;

    if (!currentConversationId) {
      console.error('[MarketingSwarmTab] No conversation ID provided');
      store.setError('No conversation ID. Please try again.');
      return;
    }

    // Initialize ExecutionContext with existing conversation from sidebar
    marketingSwarmService.initializeWithExistingConversation(
      currentConversationId,
      orgSlug.value,
      userId.value,
      data.config
    );
    console.log('[MarketingSwarmTab] Using conversation:', currentConversationId);

    // Connect to SSE stream for real-time updates BEFORE starting execution
    marketingSwarmService.connectToSSEStream(currentConversationId);
    console.log('[MarketingSwarmTab] Connected to SSE stream');

    // Start execution (uses the initialized ExecutionContext)
    const response = await marketingSwarmService.startSwarmExecution(
      data.contentTypeSlug,
      data.contentTypeContext,
      data.promptData,
      data.config
    );

    console.log('Swarm execution completed:', response);
  } catch (err) {
    console.error('Swarm execution failed:', err);
    // Disconnect SSE on error
    marketingSwarmService.disconnectSSEStream();
  }
}

// Handle restart - go back to config
function handleRestart() {
  // Disconnect SSE when restarting
  marketingSwarmService.disconnectSSEStream();
  store.resetTaskState();
  store.setUIView('config');
}
</script>

<style scoped>
.marketing-swarm-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ion-color-step-50);
}

.swarm-header {
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
  --background: var(--ion-color-light);
  border-radius: 8px;
}

.tab-navigation ion-segment-button {
  --indicator-color: transparent;
  --indicator-height: 0;
  --color: var(--ion-color-medium);
  --color-checked: #ffffff;
  --background-checked: var(--ion-color-primary);
  font-size: 0.85em;
  min-height: 36px;
  position: relative;
  border-radius: 6px;
  margin: 2px;
}

.tab-navigation ion-segment-button::part(indicator) {
  display: none;
}

.tab-navigation ion-segment-button.segment-button-checked {
  background: var(--ion-color-primary);
  border-radius: 6px;
}

.tab-navigation ion-segment-button.segment-button-checked ion-icon,
.tab-navigation ion-segment-button.segment-button-checked ion-label {
  color: #ffffff !important;
}

.tab-navigation ion-segment-button ion-icon {
  font-size: 16px;
  margin-right: 4px;
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

.swarm-content {
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

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .marketing-swarm-tab {
    background: #1a1a1a;
  }

  .swarm-header {
    background: #2d3748;
    border-color: #4a5568;
  }

  .header-info h2 {
    color: #f7fafc;
  }

  .conversation-title {
    color: #a0aec0;
  }

  .tab-navigation ion-segment {
    --background: #3d4a5c;
  }
}

html[data-theme="dark"] .marketing-swarm-tab {
  background: #1a1a1a;
}

html[data-theme="dark"] .swarm-header {
  background: #2d3748;
  border-color: #4a5568;
}

html[data-theme="dark"] .header-info h2 {
  color: #f7fafc;
}

html[data-theme="dark"] .conversation-title {
  color: #a0aec0;
}

html[data-theme="dark"] .tab-navigation ion-segment {
  --background: #3d4a5c;
}
</style>
