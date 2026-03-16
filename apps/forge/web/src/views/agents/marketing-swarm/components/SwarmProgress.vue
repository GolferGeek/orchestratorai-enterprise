<template>
  <div class="swarm-progress">
    <!-- SSE Connection Status -->
    <div class="sse-status" :class="{ connected: sseConnected }">
      <ion-icon :icon="sseConnected ? wifiOutline : cloudOfflineOutline" />
      <span>{{ sseConnected ? 'Live updates' : 'Connecting...' }}</span>
    </div>

    <!-- Phase Indicator (Phase 2: More granular phases) -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>Execution Progress</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <div class="phase-steps">
          <div
            v-for="phase in phases"
            :key="phase.id"
            class="phase-step"
            :class="{
              'active': currentPhase === phase.id,
              'completed': isPhaseCompleted(phase.id),
              'failed': currentPhase === 'failed' && phase.id === failedPhase,
            }"
          >
            <div class="phase-icon">
              <ion-icon
                :icon="isPhaseCompleted(phase.id) ? checkmarkCircle : phase.icon"
              />
            </div>
            <div class="phase-label">{{ phase.label }}</div>
          </div>
        </div>

        <ion-progress-bar
          :value="progressPercentage / 100"
          :color="currentPhase === 'failed' ? 'danger' : 'primary'"
        ></ion-progress-bar>

        <div class="progress-text">
          {{ completedOutputsCount }} / {{ totalOutputsCount }} outputs completed
          ({{ progressPercentage }}%)
        </div>

        <!-- Running Cost Display (clickable for breakdown) -->
        <div
          v-if="totalCost > 0 || totalTokens > 0"
          class="cost-display clickable"
          @click="showCostBreakdown = true"
        >
          <div class="cost-item">
            <ion-icon :icon="pricetagOutline" />
            <span class="cost-label">Cost:</span>
            <span class="cost-value">${{ formatCost(totalCost) }}</span>
          </div>
          <div class="cost-item">
            <ion-icon :icon="chatboxEllipsesOutline" />
            <span class="cost-label">Tokens:</span>
            <span class="cost-value">{{ formatTokens(totalTokens) }}</span>
          </div>
          <ion-icon :icon="chevronForwardOutline" class="cost-chevron" />
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Phase 2: Output Cards Grid (shows writer/editor combinations) -->
    <div class="output-cards-grid">
      <h3>Content Outputs</h3>
      <p class="cards-hint">Click a card to view version history</p>
      <div class="cards-row">
        <div
          v-for="output in phase2Outputs"
          :key="output.id"
          class="output-card"
          :class="getOutputStatusClass(output.status)"
          @click="openVersionModal(output)"
        >
          <div class="card-header">
            <ion-icon :icon="documentTextOutline" />
            <span>{{ output.writerAgent.name || output.writerAgent.slug }}</span>
            <ion-badge v-if="output.writerAgent.isLocal" color="warning" size="small">Local</ion-badge>
            <ion-badge v-else color="tertiary" size="small">Cloud</ion-badge>
          </div>
          <div class="card-llm">
            <ion-icon :icon="documentTextOutline" />
            {{ output.writerAgent.llmModel }}
          </div>
          <div v-if="output.editorAgent" class="card-editor">
            <ion-icon :icon="pencilOutline" />
            {{ output.editorAgent.llmModel }}
            (Cycle {{ output.editCycle }})
          </div>
          <div class="card-status">
            <ion-spinner v-if="isOutputInProgress(output.status)" name="crescent" />
            <ion-icon v-else-if="output.status === 'approved'" :icon="checkmarkCircle" color="success" />
            <ion-icon v-else-if="output.status === 'max_cycles_reached'" :icon="alertCircleOutline" color="warning" />
            <ion-icon v-else-if="output.status === 'failed'" :icon="closeCircle" color="danger" />
            <ion-icon v-else :icon="timeOutline" color="medium" />
            <span>{{ formatOutputStatus(output.status) }}</span>
          </div>
          <div v-if="output.initialAvgScore" class="card-score">
            Score: {{ Number(output.initialAvgScore).toFixed(1) }}/10
            <span v-if="output.isFinalist" class="finalist-badge">Finalist</span>
          </div>
          <div v-if="output.content" class="card-preview">
            {{ output.content.slice(0, 80) }}{{ output.content.length > 80 ? '...' : '' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Output Version Modal -->
    <OutputVersionModal
      :is-open="isVersionModalOpen"
      :output-id="selectedOutputId"
      :output="selectedOutput"
      @close="closeVersionModal"
    />

    <!-- Phase 2: Initial Rankings -->
    <ion-card v-if="initialRankings.length > 0">
      <ion-card-header>
        <ion-card-title>Initial Rankings</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-list>
          <ion-item v-for="ranking in initialRankings" :key="ranking.outputId">
            <ion-badge slot="start" :color="getRankColor(ranking.rank)">#{{ ranking.rank }}</ion-badge>
            <ion-label>
              <h3>{{ ranking.writerAgentSlug }}</h3>
              <p v-if="ranking.editorAgentSlug">+ {{ ranking.editorAgentSlug }}</p>
            </ion-label>
            <ion-badge slot="end">{{ Number(ranking.avgScore ?? 0).toFixed(1) || ranking.totalScore }}/10</ion-badge>
          </ion-item>
        </ion-list>
      </ion-card-content>
    </ion-card>

    <!-- Finalists Section -->
    <ion-card v-if="finalists.length > 0">
      <ion-card-header>
        <ion-card-title>Finalists (Top {{ finalists.length }})</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <div class="finalists-grid">
          <div v-for="finalist in finalists" :key="finalist.id" class="finalist-card">
            <ion-badge :color="getRankColor(finalist.rank)">#{{ finalist.rank }}</ion-badge>
            <span class="finalist-agent">{{ finalist.writerAgentSlug }}</span>
            <span class="finalist-score">{{ Number(finalist.avgScore || 0).toFixed(1) || 'N/A' }}/10</span>
          </div>
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Error Display -->
    <ion-card v-if="error" color="danger">
      <ion-card-header>
        <ion-card-title>Error</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        {{ error }}
      </ion-card-content>
    </ion-card>

    <!-- Cost Breakdown Modal -->
    <ion-modal :is-open="showCostBreakdown" @did-dismiss="showCostBreakdown = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>Cost Breakdown</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="showCostBreakdown = false">Close</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="cost-breakdown-content">
        <div class="cost-summary">
          <div class="summary-row total">
            <span>Total Cost</span>
            <span class="amount">${{ formatCost(totalCost) }}</span>
          </div>
          <div class="summary-row">
            <span>Total Tokens</span>
            <span>{{ formatTokens(totalTokens) }}</span>
          </div>
        </div>

        <h3>Cost by Output</h3>
        <ion-list>
          <ion-item v-for="output in phase2OutputsWithCost" :key="output.id">
            <ion-label>
              <h3>{{ output.writerAgent.name || output.writerAgent.slug }}</h3>
              <p>Writer: {{ output.writerAgent.llmModel }}<span v-if="output.editorAgent"> | Editor: {{ output.editorAgent.llmModel }}</span></p>
              <p v-if="output.llmMetadata?.llmCallCount">
                {{ output.llmMetadata.llmCallCount }} LLM calls
                <span v-if="output.llmMetadata?.evaluationCost">
                  (incl. ${{ formatCost(output.llmMetadata.evaluationCost) }} eval)
                </span>
              </p>
            </ion-label>
            <ion-note slot="end" class="output-cost">
              ${{ formatCost(output.llmMetadata?.cost ?? 0) }}
            </ion-note>
          </ion-item>
        </ion-list>

        <h3 v-if="phase2EvaluationsWithCost.length > 0">Cost by Evaluation</h3>
        <ion-list v-if="phase2EvaluationsWithCost.length > 0">
          <ion-item v-for="evaluation in phase2EvaluationsWithCost" :key="evaluation.id">
            <ion-label>
              <h3>{{ evaluation.evaluatorAgent.name || evaluation.evaluatorAgent.slug }}</h3>
              <p>{{ evaluation.stage }} stage - Score: {{ Number(evaluation.score || 0).toFixed(1) ?? 'N/A' }}</p>
            </ion-label>
            <ion-note slot="end" class="output-cost">
              ${{ formatCost(evaluation.llmMetadata?.cost ?? 0) }}
            </ion-note>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonProgressBar,
  IonSpinner,
  IonIcon,
  IonBadge,
  IonList,
  IonItem,
  IonLabel,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonNote,
} from '@ionic/vue';
import {
  checkmarkCircle,
  closeCircle,
  timeOutline,
  createOutline,
  pencilOutline,
  starOutline,
  documentTextOutline,
  ribbonOutline,
  trophyOutline,
  wifiOutline,
  cloudOfflineOutline,
  layersOutline,
  filterOutline,
  alertCircleOutline,
  pricetagOutline,
  chatboxEllipsesOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { useMarketingSwarmStore } from '@/stores/marketingSwarmStore';
import OutputVersionModal from './OutputVersionModal.vue';
import type { OutputStatusPhase2, SwarmOutputPhase2 } from '@/types/marketing-swarm';

const store = useMarketingSwarmStore();

// Modal state for version history
const isVersionModalOpen = ref(false);
const selectedOutputId = ref<string | null>(null);
const selectedOutput = ref<SwarmOutputPhase2 | null>(null);

// Modal state for cost breakdown
const showCostBreakdown = ref(false);

function openVersionModal(output: SwarmOutputPhase2) {
  selectedOutputId.value = output.id;
  selectedOutput.value = output;
  isVersionModalOpen.value = true;
}

function closeVersionModal() {
  isVersionModalOpen.value = false;
  selectedOutputId.value = null;
  selectedOutput.value = null;
}

// Phase 2: More granular phases
const phases = [
  { id: 'initializing', label: 'Setup', icon: documentTextOutline },
  { id: 'building_queue', label: 'Queue', icon: layersOutline },
  { id: 'writing', label: 'Writing', icon: createOutline },
  { id: 'editing', label: 'Editing', icon: pencilOutline },
  { id: 'evaluating_initial', label: 'Evaluating', icon: starOutline },
  { id: 'selecting_finalists', label: 'Finalists', icon: filterOutline },
  { id: 'evaluating_final', label: 'Final Eval', icon: starOutline },
  { id: 'ranking', label: 'Ranking', icon: ribbonOutline },
  { id: 'completed', label: 'Done', icon: trophyOutline },
];

// Phase 2: Computed properties from store
const currentPhase = computed(() => store.currentPhase);
const error = computed(() => store.error);
const sseConnected = computed(() => store.sseConnected);
const phase2Outputs = computed(() => store.phase2Outputs);
const initialRankings = computed(() => store.initialRankings);
const finalists = computed(() => store.finalists);
const totalOutputsCount = computed(() => store.totalOutputsCount);
const completedOutputsCount = computed(() => store.completedOutputsCount);
const totalCost = computed(() => store.totalCost);
const totalTokens = computed(() => store.totalTokens);

// Debug: Watch phase2Outputs for changes
watch(phase2Outputs, (newOutputs) => {
  console.log('[SwarmProgress] phase2Outputs changed:', newOutputs.length, 'items', newOutputs.map(o => ({ id: o.id, status: o.status, writer: o.writerAgent?.slug })));
}, { deep: true });

watch(sseConnected, (connected) => {
  console.log('[SwarmProgress] SSE connected:', connected);
});

watch(currentPhase, (phase) => {
  console.log('[SwarmProgress] Phase changed to:', phase);
});

// Filtered lists for cost breakdown modal
const phase2OutputsWithCost = computed(() =>
  phase2Outputs.value
    .filter((o) => o.llmMetadata?.cost && o.llmMetadata.cost > 0)
    .sort((a, b) => (b.llmMetadata?.cost ?? 0) - (a.llmMetadata?.cost ?? 0)),
);

const phase2EvaluationsWithCost = computed(() =>
  store.phase2Evaluations
    .filter((e) => e.llmMetadata?.cost && e.llmMetadata.cost > 0)
    .sort((a, b) => (b.llmMetadata?.cost ?? 0) - (a.llmMetadata?.cost ?? 0)),
);

// Helper functions for formatting
function formatCost(cost: number): string {
  if (cost === 0) return '0.00';
  if (cost < 0.01) return cost.toFixed(4);
  return cost.toFixed(2);
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

// Progress calculation for Phase 2
const progressPercentage = computed(() => {
  if (totalOutputsCount.value === 0) return 0;
  return Math.round((completedOutputsCount.value / totalOutputsCount.value) * 100);
});

const failedPhase = computed(() => {
  if (currentPhase.value !== 'failed') return null;
  // Determine which phase failed based on outputs
  const failedOutput = phase2Outputs.value.find((o) => o.status === 'failed');
  if (failedOutput) {
    return 'writing';
  }
  return 'initializing';
});

const phaseOrder = [
  'initializing',
  'building_queue',
  'writing',
  'editing',
  'evaluating_initial',
  'selecting_finalists',
  'evaluating_final',
  'ranking',
  'completed',
];

function isPhaseCompleted(phaseId: string): boolean {
  const currentIndex = phaseOrder.indexOf(currentPhase.value);
  const phaseIndex = phaseOrder.indexOf(phaseId);
  return phaseIndex < currentIndex;
}

// Phase 2: Helper functions
function getOutputStatusClass(status: OutputStatusPhase2): string {
  if (['writing', 'editing', 'rewriting'].includes(status)) {
    return 'processing';
  }
  if (status === 'approved') {
    return 'completed';
  }
  if (status === 'max_cycles_reached') {
    return 'max-cycles';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return 'pending';
}

function isOutputInProgress(status: OutputStatusPhase2): boolean {
  return ['writing', 'editing', 'rewriting', 'pending_write', 'pending_edit', 'pending_rewrite'].includes(status);
}

function formatOutputStatus(status: OutputStatusPhase2): string {
  switch (status) {
    case 'pending_write':
      return 'Waiting to write';
    case 'writing':
      return 'Writing...';
    case 'pending_edit':
      return 'Waiting for edit';
    case 'editing':
      return 'Editing...';
    case 'pending_rewrite':
      return 'Waiting for rewrite';
    case 'rewriting':
      return 'Rewriting...';
    case 'approved':
      return 'Approved';
    case 'max_cycles_reached':
      return 'Max Cycles';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function getRankColor(rank: number): string {
  if (rank === 1) return 'success';
  if (rank === 2) return 'warning';
  if (rank === 3) return 'tertiary';
  return 'medium';
}
</script>

<style scoped>
.swarm-progress {
  padding: 16px;
}

/* SSE Connection Status */
.sse-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--ion-color-light);
  border-radius: 4px;
  margin-bottom: 16px;
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

.sse-status.connected {
  color: var(--ion-color-success);
}

.sse-status ion-icon {
  font-size: 16px;
}

/* Phase Steps */
.phase-steps {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.phase-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0.5;
  transition: opacity 0.3s, transform 0.3s;
  min-width: 60px;
}

.phase-step.active {
  opacity: 1;
  transform: scale(1.1);
}

.phase-step.completed {
  opacity: 1;
}

.phase-step.completed .phase-icon {
  color: var(--ion-color-success);
}

.phase-step.failed .phase-icon {
  color: var(--ion-color-danger);
}

.phase-icon {
  font-size: 20px;
  margin-bottom: 4px;
}

.phase-label {
  font-size: 0.7rem;
  text-align: center;
}

.progress-text {
  text-align: center;
  margin-top: 8px;
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

/* Cost Display */
.cost-display {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 12px;
  padding: 10px 16px;
  background: var(--ion-color-light);
  border-radius: 8px;
}

.cost-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
}

.cost-item ion-icon {
  color: var(--ion-color-primary);
  font-size: 16px;
}

.cost-label {
  color: var(--ion-color-medium);
}

.cost-value {
  font-weight: 600;
  color: var(--ion-color-primary);
}

.cost-display.clickable {
  cursor: pointer;
  transition: background 0.2s;
}

.cost-display.clickable:hover {
  background: var(--ion-color-light-shade);
}

.cost-chevron {
  color: var(--ion-color-medium);
  font-size: 16px;
  margin-left: auto;
}

/* Cost Breakdown Modal */
.cost-breakdown-content {
  padding: 16px;
}

.cost-summary {
  background: var(--ion-color-light);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}

.summary-row.total {
  font-weight: 600;
  font-size: 1.1rem;
  border-bottom: 1px solid var(--ion-color-medium-tint);
  margin-bottom: 8px;
  padding-bottom: 12px;
}

.summary-row .amount {
  color: var(--ion-color-primary);
}

.cost-breakdown-content h3 {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ion-color-medium-shade);
  margin: 16px 0 8px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.output-cost {
  font-weight: 600;
  color: var(--ion-color-primary);
}

/* Output Cards Grid (Phase 2) */
.output-cards-grid {
  margin-top: 24px;
}

.output-cards-grid h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--ion-color-primary);
}

.cards-hint {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin-bottom: 12px;
}

.cards-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.output-card {
  background: var(--ion-card-background, #1e2a3a);
  border-radius: 8px;
  padding: 12px;
  min-width: 200px;
  max-width: 280px;
  flex: 1;
  transition: all 0.3s;
  border: 2px solid rgba(var(--ion-text-color-rgb, 255, 255, 255), 0.08);
  border-left: 4px solid rgba(var(--ion-text-color-rgb, 255, 255, 255), 0.12);
  cursor: pointer;
}

.output-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.output-card.pending {
  border-left-color: #ffc107;
  background-color: rgba(255, 193, 7, 0.06);
}

.output-card.processing {
  border-left-color: #42a5f5;
  background-color: rgba(66, 165, 245, 0.08);
  animation: pulse 1.5s infinite;
}

.output-card.completed {
  border-left-color: #4caf50;
  background-color: rgba(76, 175, 80, 0.12);
}

.output-card.max-cycles {
  border-left-color: #ff9800;
  background-color: rgba(255, 152, 0, 0.08);
}

.output-card.failed {
  border-left-color: #f44336;
  background-color: rgba(244, 67, 54, 0.12);
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(66, 165, 245, 0.3);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(66, 165, 245, 0);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.card-header ion-badge {
  font-size: 0.65rem;
  padding: 2px 6px;
}

.card-llm {
  font-size: 0.7rem;
  color: var(--ion-color-medium);
  margin-bottom: 6px;
}

.card-editor {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--ion-color-medium-shade);
  margin-bottom: 6px;
}

.card-editor ion-icon {
  font-size: 14px;
}

.card-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  margin-bottom: 6px;
}

.card-score {
  font-size: 0.8rem;
  color: var(--ion-color-primary);
  font-weight: 500;
}

.finalist-badge {
  background: var(--ion-color-warning);
  color: var(--ion-color-warning-contrast);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  margin-left: 8px;
}

.card-preview {
  margin-top: 8px;
  font-size: 0.75rem;
  color: var(--ion-color-medium-tint, #a0aec0);
  line-height: 1.4;
  background: rgba(0, 0, 0, 0.2);
  padding: 8px;
  border-radius: 4px;
}

/* Finalists Grid */
.finalists-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.finalist-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--ion-color-light);
  border-radius: 4px;
}

.finalist-agent {
  font-weight: 500;
}

.finalist-score {
  color: var(--ion-color-medium);
  font-size: 0.875rem;
}

/* Cards */
ion-card {
  margin-bottom: 16px;
}
</style>
