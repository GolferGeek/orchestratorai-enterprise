<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button></ion-menu-button>
        </ion-buttons>
        <ion-title>CAD Agent</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="hasTaskData" @click="handleRestart">
            <ion-icon :icon="refreshOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <!-- Tab Navigation - Only show when there's task data -->
      <ion-toolbar v-if="hasTaskData" class="tab-toolbar">
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
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner name="crescent" />
        <p>Loading...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error && !isGenerating" class="error-container">
        <ion-icon :icon="alertCircleOutline" color="danger" />
        <p>{{ error }}</p>
        <ion-button @click="handleRestart">Retry</ion-button>
      </div>

      <!-- Welcome State -->
      <div v-else-if="currentView === 'welcome'" class="welcome-state">
        <div class="welcome-content">
          <ion-icon :icon="cubeOutline" class="welcome-icon" />
          <h2>CAD Agent</h2>
          <p>Generate 3D CAD models from text descriptions using AI.</p>
          <div class="capabilities">
            <div class="capability">
              <ion-icon :icon="codeSlashOutline" />
              <span>OpenSCAD Generation</span>
            </div>
            <div class="capability">
              <ion-icon :icon="buildOutline" />
              <span>Manufacturing Constraints</span>
            </div>
            <div class="capability">
              <ion-icon :icon="downloadOutline" />
              <span>STEP / STL / GLTF Export</span>
            </div>
            <div class="capability">
              <ion-icon :icon="eyeOutline" />
              <span>3D Preview</span>
            </div>
          </div>
          <div class="welcome-actions">
            <ion-button expand="block" @click="store.setUIView('config')">
              <ion-icon :icon="addOutline" slot="start" />
              New CAD Request
            </ion-button>
            <ion-button
              fill="outline"
              color="medium"
              expand="block"
              @click="showBrowseModal = true"
            >
              <ion-icon :icon="timeOutline" slot="start" />
              Previous CAD Requests
            </ion-button>
          </div>
        </div>
      </div>

      <!-- Config Panel -->
      <CadConfigPanel
        v-else-if="currentView === 'config'"
        @generate="handleGenerate"
        @browse-history="showBrowseModal = true"
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
    </ion-content>

    <!-- Browse Previous CAD Requests Modal -->
    <ConversationsBrowseModal
      :is-open="showBrowseModal"
      agent-name="cad-agent"
      agent-display-name="CAD Request"
      @close="showBrowseModal = false"
      @select="handleBrowseSelect"
    />
  </ion-page>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonButton,
  IonContent,
  IonIcon,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonBadge,
} from '@ionic/vue';
import {
  refreshOutline,
  alertCircleOutline,
  cubeOutline,
  codeSlashOutline,
  buildOutline,
  downloadOutline,
  eyeOutline,
  addOutline,
  timeOutline,
} from 'ionicons/icons';
import { useCadAgentStore } from '@/stores/cadAgentStore';
import { useRbacStore } from '@/stores/rbacStore';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { cadAgentService } from '@/services/cadAgentService';
import agent2AgentConversationsService from '@/services/agent2AgentConversationsService';
import CadConfigPanel from './CadConfigPanel.vue';
import CadProgressPanel from './CadProgressPanel.vue';
import CadDeliverablePanel from './CadDeliverablePanel.vue';
import { ConversationsBrowseModal } from '@/components/AgentDashboard';
import type { ConversationBrowseItem } from '@/components/AgentDashboard/ConversationsBrowseModal.vue';
import type { CadConstraints } from '@/stores/cadAgentStore';

const route = useRoute();
const store = useCadAgentStore();
const rbacStore = useRbacStore();
const executionContextStore = useExecutionContextStore();

const showBrowseModal = ref(false);

// Computed properties from store
const currentView = computed(() => store.currentView);
const isLoading = computed(() => store.isLoading);
const isGenerating = computed(() => store.isGenerating);
const error = computed(() => store.error);
const hasTaskData = computed(() => store.hasTaskData);
const hasProgressData = computed(() => store.hasProgressData);
const hasDeliverables = computed(() => store.hasDeliverables);

// Get conversationId from route query
const conversationId = computed(() => {
  return (route.query.conversationId as string) || undefined;
});

const orgSlug = computed(() => {
  return rbacStore.currentOrganization;
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
  const provider = data.llmProvider;
  const model = data.llmModel;
  let activeConversationId = conversationId.value;

  // If no existing conversationId, create one in the DB first (same pattern as marketing-swarm / legal-department)
  if (!activeConversationId) {
    activeConversationId = crypto.randomUUID();
    await agent2AgentConversationsService.createConversation({
      agentName: 'cad-agent',
      agentType: 'api',
      organizationSlug: orgSlug.value ?? '',
      conversationId: activeConversationId,
      metadata: {
        source: 'cad-agent-ui',
        contentType: 'cad-model',
      },
    });
  }

  if (!executionContextStore.isInitialized) {
    executionContextStore.initialize({
      orgSlug: orgSlug.value ?? '',
      userId: userId.value,
      conversationId: activeConversationId,
      agentSlug: 'cad-agent',
      agentType: 'api',
      provider,
      model,
    });
  } else {
    executionContextStore.setAgent('cad-agent', 'api');
    executionContextStore.setConversation(activeConversationId);
    executionContextStore.setLLM(provider, model);
  }

  // Connect to SSE stream BEFORE starting generation
  cadAgentService.connectToSSEStream(executionContextStore.current.conversationId);

  const result = await cadAgentService.generateCad({
    prompt: data.prompt,
    projectId: data.projectId,
    newProjectName: data.newProjectName,
    constraints: data.constraints,
    outputFormats: data.outputFormats,
  });

  if (result.status === 'completed') {
    store.setUIView('deliverables');
  }
}

// Handle restart - go back to welcome
function handleRestart() {
  store.resetTaskState();
  store.setUIView('welcome');
}

// Handle selecting a previous request from the browse modal
async function handleBrowseSelect(item: ConversationBrowseItem) {
  console.warn('[CadAgentView DEBUG] handleBrowseSelect called:', item.conversationId, item);
  showBrowseModal.value = false;
  await cadAgentService.loadConversationState(item.conversationId);
  console.warn('[CadAgentView DEBUG] loadConversationState finished, currentView:', store.currentView);
}

// Watch for conversationId changes from route query
watch(conversationId, async (newId) => {
  if (newId) {
    await cadAgentService.loadConversationState(newId);
  }
});

// Load existing state on mount if conversationId present
onMounted(async () => {
  if (conversationId.value) {
    await cadAgentService.loadConversationState(conversationId.value);
  }
});

// Cleanup on unmount
onUnmounted(() => {
  cadAgentService.disconnectSSEStream();
});
</script>

<style scoped>
.tab-toolbar {
  --padding-top: 0;
  --padding-bottom: 8px;
}

.tab-toolbar ion-segment {
  --background: var(--ion-color-light);
  border-radius: 8px;
  margin: 0 16px;
}

.tab-toolbar ion-segment-button {
  --indicator-color: var(--ion-color-primary);
  --color: var(--ion-color-medium);
  --color-checked: var(--ion-color-primary-contrast);
  font-size: 0.85em;
  min-height: 36px;
  position: relative;
}

/* Dark mode fixes for tab toolbar */
@media (prefers-color-scheme: dark) {
  .tab-toolbar ion-segment {
    --background: var(--ion-color-step-150);
  }

  .tab-toolbar ion-segment-button {
    --color: var(--ion-color-step-600);
    --color-checked: var(--ion-color-primary-contrast);
  }
}

/* Manual dark theme support */
html[data-theme="dark"] .tab-toolbar ion-segment {
  --background: var(--ion-color-step-150);
}

html[data-theme="dark"] .tab-toolbar ion-segment-button {
  --color: var(--ion-color-step-600);
  --color-checked: var(--ion-color-primary-contrast);
}

.status-badge {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 0.6em;
  padding: 2px 4px;
  min-width: unset;
  border-radius: 4px;
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

/* Welcome State */
.welcome-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 2rem;
}

.welcome-content {
  text-align: center;
  max-width: 480px;
}

.welcome-icon {
  font-size: 64px;
  color: var(--ion-color-primary);
  margin-bottom: 16px;
}

.welcome-content h2 {
  margin: 0 0 8px 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--ion-color-primary);
}

.welcome-content > p {
  margin: 0 0 24px 0;
  font-size: 1rem;
}

.capabilities {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 32px;
}

.capability {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
}

.capability ion-icon {
  font-size: 20px;
  flex-shrink: 0;
  color: var(--ion-color-primary);
}

.capability span {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ion-color-primary);
}

.welcome-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Dark mode only: welcome heading and description (same pattern as html.ion-palette-dark elsewhere) */
:global(html.ion-palette-dark) .welcome-content h2 {
  color: var(--ion-color-tertiary);
}

:global(html.ion-palette-dark) .welcome-content > p {
  color: white;
}
</style>
