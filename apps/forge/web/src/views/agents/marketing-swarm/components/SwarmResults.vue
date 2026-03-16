<template>
  <div class="swarm-results">
    <!-- Summary Card (Phase 2: Enhanced stats) -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>Results Summary</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <div class="summary-stats">
          <div class="stat">
            <div class="stat-value">{{ phase2Outputs.length }}</div>
            <div class="stat-label">Outputs Generated</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ phase2Evaluations.length }}</div>
            <div class="stat-label">Evaluations</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ finalists.length }}</div>
            <div class="stat-label">Finalists</div>
          </div>
          <div class="stat" v-if="winnerOutput">
            <div class="stat-value">{{ winnerOutput.finalRank === 1 ? '#1' : '-' }}</div>
            <div class="stat-label">Winner</div>
          </div>
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Phase 2: Final Rankings (top outputs after final evaluation) -->
    <ion-card v-if="finalRankings.length > 0">
      <ion-card-header>
        <ion-card-title>Final Rankings</ion-card-title>
        <ion-card-subtitle>Ranked by weighted evaluation scores (1st=100, 2nd=60, 3rd=30, 4th=10, 5th=5)</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-list>
          <ion-item
            v-for="ranking in finalRankings"
            :key="ranking.outputId"
            :button="true"
            :detail="true"
            @click="selectOutput(ranking.outputId)"
            :class="{ 'selected': selectedOutputId === ranking.outputId }"
          >
            <ion-badge slot="start" :color="getRankColor(ranking.rank)">
              #{{ ranking.rank }}
            </ion-badge>
            <ion-label>
              <h2>{{ ranking.writerAgentSlug }}</h2>
              <p v-if="ranking.editorAgentSlug">+ {{ ranking.editorAgentSlug }}</p>
              <p class="score-breakdown" v-if="getScoreBreakdown(ranking.outputId).length > 0">
                {{ getScoreBreakdown(ranking.outputId).join(' + ') }} = {{ ranking.totalScore }}
              </p>
            </ion-label>
            <div slot="end" class="score-badges">
              <ion-badge color="secondary">{{ ranking.totalScore }} pts</ion-badge>
            </div>
          </ion-item>
        </ion-list>
      </ion-card-content>
    </ion-card>

    <!-- Fallback: Initial Rankings if no final rankings yet -->
    <ion-card v-else-if="initialRankings.length > 0">
      <ion-card-header>
        <ion-card-title>Initial Rankings</ion-card-title>
        <ion-card-subtitle>Sorted by average evaluation score</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-list>
          <ion-item
            v-for="ranking in initialRankings"
            :key="ranking.outputId"
            :button="true"
            :detail="true"
            @click="selectOutput(ranking.outputId)"
            :class="{ 'selected': selectedOutputId === ranking.outputId }"
          >
            <ion-badge slot="start" :color="getRankColor(ranking.rank)">
              #{{ ranking.rank }}
            </ion-badge>
            <ion-label>
              <h2>{{ ranking.writerAgentSlug }}</h2>
              <p v-if="ranking.editorAgentSlug">+ {{ ranking.editorAgentSlug }}</p>
            </ion-label>
            <ion-badge slot="end" color="secondary">
              {{ safeFixed(ranking.avgScore) || ranking.totalScore }}/10
            </ion-badge>
          </ion-item>
        </ion-list>
      </ion-card-content>
    </ion-card>

    <!-- Phase 2: Selected Output Detail -->
    <ion-card v-if="selectedPhase2Output">
      <ion-card-header>
        <ion-card-title>
          Output Detail
          <ion-button fill="clear" size="small" @click="selectedOutputId = undefined">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-card-title>
        <ion-card-subtitle>
          <div class="output-agents-info">
            <span>{{ selectedPhase2Output.writerAgent.name || selectedPhase2Output.writerAgent.slug }}</span>
            <ion-badge v-if="selectedPhase2Output.writerAgent.isLocal" color="warning" size="small">Local</ion-badge>
            <ion-badge v-else color="tertiary" size="small">Cloud</ion-badge>
            <span v-if="selectedPhase2Output.editorAgent">
              + {{ selectedPhase2Output.editorAgent.name || selectedPhase2Output.editorAgent.slug }}
            </span>
          </div>
        </ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <!-- Ranking Info -->
        <div v-if="selectedPhase2Output.finalRank || selectedPhase2Output.initialRank" class="ranking-info">
          <ion-badge v-if="selectedPhase2Output.finalRank" :color="getRankColor(selectedPhase2Output.finalRank)">
            Final Rank: #{{ selectedPhase2Output.finalRank }}
          </ion-badge>
          <ion-badge v-if="selectedPhase2Output.initialAvgScore" color="secondary">
            Score: {{ safeFixed(selectedPhase2Output.initialAvgScore) }}/10
          </ion-badge>
          <ion-badge v-if="selectedPhase2Output.isFinalist" color="warning">
            Finalist
          </ion-badge>
        </div>

        <!-- Content -->
        <div class="output-content">
          <h4>Content</h4>
          <!-- eslint-disable-next-line vue/no-v-html -- AI-generated content with basic formatting -->
          <div class="content-preview" v-html="formatContent(selectedPhase2Output.content || '')"></div>
        </div>

        <!-- Edit History -->
        <div v-if="selectedPhase2Output.editCycle > 0" class="edit-history">
          <h4>Edit Cycles: {{ selectedPhase2Output.editCycle }}</h4>
          <p v-if="selectedPhase2Output.editorFeedback">
            <strong>Editor Feedback:</strong> {{ selectedPhase2Output.editorFeedback }}
          </p>
          <ion-badge :color="selectedPhase2Output.status === 'approved' ? 'success' : 'warning'">
            {{ selectedPhase2Output.status === 'approved' ? 'Approved' : 'In Progress' }}
          </ion-badge>
        </div>

        <!-- LLM Metadata -->
        <div v-if="selectedPhase2Output.llmMetadata" class="llm-metadata">
          <h4>LLM Usage</h4>
          <p v-if="selectedPhase2Output.llmMetadata.tokensUsed">
            Tokens: {{ selectedPhase2Output.llmMetadata.tokensUsed }}
          </p>
          <p v-if="selectedPhase2Output.llmMetadata.latencyMs">
            Latency: {{ selectedPhase2Output.llmMetadata.latencyMs }}ms
          </p>
        </div>

        <!-- Phase 2: Evaluations for this output -->
        <div class="output-evaluations">
          <h4>Evaluations ({{ selectedOutputEvaluationsPhase2.length }})</h4>
          <div v-for="evaluation in selectedOutputEvaluationsPhase2" :key="evaluation.id" class="evaluation-item">
            <div class="evaluation-header">
              <span class="evaluator-name">
                {{ evaluation.evaluatorAgent.name || evaluation.evaluatorAgent.slug }}
              </span>
              <ion-badge :color="evaluation.stage === 'final' ? 'tertiary' : 'medium'" size="small">
                {{ evaluation.stage }}
              </ion-badge>
              <ion-badge v-if="evaluation.score" :color="getScoreColor(evaluation.score)">
                {{ evaluation.score }}/10
              </ion-badge>
              <ion-badge v-if="evaluation.stage === 'final' && evaluation.rank" color="secondary">
                Rank #{{ evaluation.rank }}
              </ion-badge>
              <ion-badge v-if="evaluation.stage === 'final' && evaluation.weightedScore" color="success">
                +{{ evaluation.weightedScore }} pts
              </ion-badge>
            </div>
            <p v-if="evaluation.reasoning" class="evaluation-reasoning">{{ evaluation.reasoning }}</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="output-actions">
          <ion-button expand="block" @click="copyContent(selectedPhase2Output.content || '')">
            <ion-icon :icon="copyOutline" slot="start" />
            Copy Content
          </ion-button>
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Back to Config -->
    <div class="actions-footer">
      <ion-button fill="outline" @click="$emit('restart')">
        <ion-icon :icon="refreshOutline" slot="start" />
        Start New Swarm
      </ion-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonButton,
  IonIcon,
} from '@ionic/vue';
import {
  closeOutline,
  copyOutline,
  refreshOutline,
} from 'ionicons/icons';
import { useMarketingSwarmStore } from '@/stores/marketingSwarmStore';
import type { SwarmOutputPhase2, SwarmEvaluationPhase2 } from '@/types/marketing-swarm';

defineEmits<{
  (e: 'restart'): void;
}>();

const store = useMarketingSwarmStore();

// Phase 2: Use phase2 computed properties
const phase2Outputs = computed(() => store.phase2Outputs);
const phase2Evaluations = computed(() => store.phase2Evaluations);
const initialRankings = computed(() => store.initialRankings);
const finalRankings = computed(() => store.finalRankings);
const finalists = computed(() => store.finalists);
const winnerOutput = computed(() => store.getWinnerOutput());

const selectedOutputId = ref<string | undefined>(undefined);

// Auto-select the winner or first ranked output when results are loaded
watch(
  [finalRankings, initialRankings],
  ([finalRanks, initialRanks]) => {
    if (!selectedOutputId.value) {
      if (finalRanks.length > 0) {
        selectedOutputId.value = finalRanks[0].outputId;
      } else if (initialRanks.length > 0) {
        selectedOutputId.value = initialRanks[0].outputId;
      }
    }
  },
  { immediate: true }
);

// Phase 2: Get selected output from phase2Outputs
const selectedPhase2Output = computed<SwarmOutputPhase2 | undefined>(() => {
  if (!selectedOutputId.value) return undefined;
  return store.getPhase2OutputById(selectedOutputId.value);
});

// Phase 2: Get evaluations for selected output
const selectedOutputEvaluationsPhase2 = computed<SwarmEvaluationPhase2[]>(() => {
  if (!selectedOutputId.value) return [];
  return store.getPhase2EvaluationsForOutput(selectedOutputId.value);
});

function selectOutput(outputId: string) {
  selectedOutputId.value = outputId;
}

/**
 * Get the score breakdown for an output from final evaluations
 * Returns array like ["100", "60", "30"] representing weighted scores from each evaluator
 */
function getScoreBreakdown(outputId: string): string[] {
  const finalEvaluations = phase2Evaluations.value
    .filter((e) => e.outputId === outputId && e.stage === 'final' && e.weightedScore);

  if (finalEvaluations.length === 0) return [];

  return finalEvaluations
    .sort((a, b) => (b.weightedScore ?? 0) - (a.weightedScore ?? 0))
    .map((e) => String(e.weightedScore));
}

function getRankColor(rank: number): string {
  if (rank === 1) return 'success';
  if (rank === 2) return 'warning';
  if (rank === 3) return 'tertiary';
  return 'medium';
}

function getScoreColor(score: number): string {
  const n = Number(score) || 0;
  if (n >= 8) return 'success';
  if (n >= 6) return 'warning';
  if (n >= 4) return 'tertiary';
  return 'danger';
}

function safeFixed(value: unknown, digits = 1): string {
  const n = Number(value);
  if (isNaN(n)) return '0';
  return n.toFixed(digits);
}

function formatContent(content: string): string {
  // Basic markdown-like formatting
  return content
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

async function copyContent(content: string) {
  try {
    await navigator.clipboard.writeText(content);
    // Could add a toast notification here
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}
</script>

<style scoped>
.swarm-results {
  padding: 16px;
}

.summary-stats {
  display: flex;
  justify-content: space-around;
  text-align: center;
  flex-wrap: wrap;
}

.stat {
  padding: 12px;
  min-width: 80px;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--ion-color-primary);
}

.stat-label {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

ion-item.selected {
  --background: rgba(var(--ion-color-primary-rgb), 0.1);
  border-left: 4px solid var(--ion-color-primary);
}

ion-item.selected ion-label h2,
ion-item.selected ion-label p {
  color: var(--ion-color-dark);
}

.score-badges {
  display: flex;
  gap: 4px;
}

.score-breakdown {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  font-family: monospace;
  margin-top: 4px;
}

/* Output Agents Info */
.output-agents-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.output-agents-info ion-badge {
  font-size: 0.65rem;
  padding: 2px 6px;
}

/* Ranking Info */
.ranking-info {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.output-content {
  margin-bottom: 24px;
}

.output-content h4,
.edit-history h4,
.output-evaluations h4,
.llm-metadata h4 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--ion-color-primary);
}

.content-preview {
  background: var(--ion-color-light);
  padding: 16px;
  border-radius: 8px;
  max-height: 400px;
  overflow-y: auto;
  line-height: 1.6;
}

.edit-history {
  margin-bottom: 24px;
  padding: 12px;
  background: var(--ion-color-light);
  border-radius: 8px;
}

.llm-metadata {
  margin-bottom: 24px;
  padding: 12px;
  background: var(--ion-color-light);
  border-radius: 8px;
}

.llm-metadata p {
  margin: 4px 0;
  font-size: 0.875rem;
}

.output-evaluations {
  margin-bottom: 24px;
}

.evaluation-item {
  background: var(--ion-color-light);
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.evaluation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.evaluator-name {
  font-weight: 600;
}

.evaluation-reasoning {
  font-size: 0.875rem;
  color: var(--ion-color-medium-shade);
  margin: 0;
  line-height: 1.5;
}

.output-actions {
  margin-top: 16px;
}

.actions-footer {
  margin-top: 24px;
  text-align: center;
}

ion-card {
  margin-bottom: 16px;
}

/* Ensure good contrast for list items */
ion-item {
  --color: var(--ion-color-dark);
}

ion-item ion-label h2 {
  color: var(--ion-text-color);
  font-weight: 600;
}

ion-item ion-label p {
  color: var(--ion-color-medium-shade);
}

/* Badge visibility improvements */
ion-item ion-badge {
  font-weight: 600;
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  ion-item.selected {
    --background: rgba(var(--ion-color-primary-rgb), 0.2);
  }

  .content-preview {
    background: var(--ion-color-step-100);
    color: var(--ion-text-color);
  }

  .evaluation-item {
    background: var(--ion-color-step-100);
  }

  .edit-history,
  .llm-metadata {
    background: var(--ion-color-step-100);
  }
}

html[data-theme="dark"] ion-item.selected {
  --background: rgba(var(--ion-color-primary-rgb), 0.2);
}

html[data-theme="dark"] .content-preview,
html[data-theme="dark"] .evaluation-item,
html[data-theme="dark"] .edit-history,
html[data-theme="dark"] .llm-metadata {
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
}
</style>
