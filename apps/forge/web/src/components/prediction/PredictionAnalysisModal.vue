<template>
  <ion-modal :is-open="isOpen" @willDismiss="onDismiss" class="analysis-modal">
    <ion-header>
      <ion-toolbar>
        <ion-title>Prediction Analysis</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="onDismiss">
            <ion-icon :icon="closeOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <!-- Loading State -->
      <div v-if="isLoading" class="loading-state">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Loading prediction analysis...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <ion-icon :icon="alertCircleOutline" class="error-icon"></ion-icon>
        <p>{{ error }}</p>
        <ion-button @click="loadAnalysis">Try Again</ion-button>
      </div>

      <!-- Analysis Content -->
      <div v-else-if="deepDive" class="analysis-content">
        <!-- Prediction Summary -->
        <ion-card v-if="deepDive.prediction" class="prediction-summary-card">
          <ion-card-header>
            <ion-card-subtitle>Prediction</ion-card-subtitle>
            <ion-card-title>
              <span class="direction-badge" :class="deepDive.prediction.direction || 'unknown'">
                {{ (deepDive.prediction.direction || 'UNKNOWN').toUpperCase() }}
              </span>
              <span class="confidence">{{ Math.round((deepDive.prediction.confidence || 0) * 100) }}% confidence</span>
            </ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <div class="summary-grid">
              <div v-if="deepDive.prediction.magnitude" class="summary-item">
                <span class="label">Magnitude:</span>
                <span class="value">{{ deepDive.prediction.magnitude }}</span>
              </div>
              <div v-if="deepDive.prediction.timeframeHours" class="summary-item">
                <span class="label">Timeframe:</span>
                <span class="value">{{ deepDive.prediction.timeframeHours }}h</span>
              </div>
              <div v-if="deepDive.prediction.status" class="summary-item">
                <span class="label">Status:</span>
                <span class="value status" :class="deepDive.prediction.status">{{ deepDive.prediction.status }}</span>
              </div>
            </div>
            <div v-if="deepDive.prediction.reasoning" class="reasoning-section">
              <h4>Reasoning</h4>
              <p>{{ deepDive.prediction.reasoning }}</p>
            </div>
          </ion-card-content>
        </ion-card>

        <!-- Stats Summary -->
        <ion-card v-if="deepDive.stats" class="stats-card">
          <ion-card-header>
            <ion-card-subtitle>Analysis Statistics</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <div class="stats-grid">
              <div class="stat-item">
                <ion-icon :icon="trendingUpOutline" class="stat-icon"></ion-icon>
                <span class="stat-value">{{ deepDive.stats.predictorCount || 0 }}</span>
                <span class="stat-label">Predictors</span>
              </div>
              <div class="stat-item">
                <ion-icon :icon="pulseOutline" class="stat-icon"></ion-icon>
                <span class="stat-value">{{ deepDive.stats.signalCount || 0 }}</span>
                <span class="stat-label">Signals</span>
              </div>
              <div class="stat-item">
                <ion-icon :icon="peopleOutline" class="stat-icon"></ion-icon>
                <span class="stat-value">{{ deepDive.stats.analystCount || 0 }}</span>
                <span class="stat-label">Analysts</span>
              </div>
            </div>
          </ion-card-content>
        </ion-card>

        <!-- Analyst Assessments -->
        <ion-card v-if="deepDive.lineage?.analystAssessments?.length" class="analysts-card">
          <ion-card-header>
            <ion-card-subtitle>
              <ion-icon :icon="peopleOutline" class="section-icon"></ion-icon>
              Analyst Assessments
            </ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <div
              v-for="analyst in deepDive.lineage.analystAssessments"
              :key="analyst.analystSlug"
              class="analyst-item"
              :class="getDirectionClass(analyst.direction)"
            >
              <div class="analyst-header">
                <span class="analyst-name">{{ analyst.analystSlug }}</span>
                <ion-chip :color="getTierColor(analyst.tier)" outline size="small">
                  <ion-label>{{ analyst.tier }}</ion-label>
                </ion-chip>
                <div class="analyst-direction" :class="getDirectionClass(analyst.direction)">
                  {{ getDirectionIcon(analyst.direction) }} {{ analyst.direction.toUpperCase() }}
                </div>
                <span class="analyst-confidence">{{ Math.round(analyst.confidence * 100) }}%</span>
              </div>
              <p v-if="analyst.reasoning" class="analyst-reasoning">{{ analyst.reasoning }}</p>
            </div>
          </ion-card-content>
        </ion-card>

        <!-- Predictors -->
        <ion-card v-if="deepDive.lineage?.predictors?.length" class="predictors-card">
          <ion-card-header>
            <ion-card-subtitle>
              <ion-icon :icon="trendingUpOutline" class="section-icon"></ion-icon>
              Predictors ({{ deepDive.lineage.predictors.length }})
            </ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-accordion-group>
              <ion-accordion
                v-for="(predictor, index) in deepDive.lineage.predictors"
                :key="predictor.id"
                :value="`predictor-${index}`"
              >
                <ion-item slot="header">
                  <ion-label>
                    <div class="predictor-header">
                      <span class="predictor-title">Predictor {{ index + 1 }}</span>
                      <div class="predictor-badges">
                        <ion-chip :color="getDirectionColor(predictor.direction)" size="small">
                          <ion-label>{{ predictor.direction.toUpperCase() }}</ion-label>
                        </ion-chip>
                        <ion-chip color="medium" size="small">
                          <ion-label>Strength: {{ predictor.strength }}/10</ion-label>
                        </ion-chip>
                      </div>
                    </div>
                  </ion-label>
                </ion-item>
                <div slot="content" class="predictor-content">
                  <div v-if="predictor.analystSlug" class="detail-row">
                    <strong>Analyst:</strong> {{ predictor.analystSlug }}
                  </div>
                  <div class="detail-row">
                    <strong>Confidence:</strong> {{ Math.round(predictor.confidence * 100) }}%
                  </div>
                  <div v-if="predictor.reasoning" class="detail-row reasoning">
                    <strong>Reasoning:</strong>
                    <p>{{ predictor.reasoning }}</p>
                  </div>

                  <!-- Signal Info -->
                  <div v-if="predictor.signal" class="signal-section">
                    <h5>
                      <ion-icon :icon="pulseOutline"></ion-icon>
                      Source Signal
                    </h5>
                    <div class="signal-content">
                      <p class="signal-text">{{ predictor.signal.content }}</p>
                      <div class="signal-meta">
                        <span>{{ formatDate(predictor.signal.detectedAt) }}</span>
                        <a
                          v-if="predictor.signal.url"
                          :href="predictor.signal.url"
                          target="_blank"
                          class="signal-link"
                          @click.stop
                        >
                          <ion-icon :icon="linkOutline"></ion-icon>
                          View Source
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </ion-accordion>
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>

        <!-- Applied Learnings -->
        <ion-card v-if="(deepDive as any).context?.appliedLearnings?.length" class="learnings-card">
          <ion-card-header>
            <ion-card-subtitle>
              <ion-icon :icon="schoolOutline" class="section-icon"></ion-icon>
              Applied Learnings
            </ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <div class="learnings-list">
              <div
                v-for="learning in (deepDive as any).context.appliedLearnings"
                :key="learning.id"
                class="learning-item"
              >
                <div class="learning-header">
                  <strong>{{ learning.title }}</strong>
                  <ion-chip size="small" color="tertiary" outline>
                    <ion-label>{{ learning.learningType }}</ion-label>
                  </ion-chip>
                </div>
                <p>{{ learning.content }}</p>
              </div>
            </div>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCardContent,
  IonChip,
  IonLabel,
  IonSpinner,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
} from '@ionic/vue';
import {
  closeOutline,
  alertCircleOutline,
  peopleOutline,
  trendingUpOutline,
  pulseOutline,
  schoolOutline,
  linkOutline,
} from 'ionicons/icons';
import { ref, watch } from 'vue';
import { predictionDashboardService, type PredictionDeepDive } from '@/services/predictionDashboardService';

interface Props {
  isOpen: boolean;
  predictionId: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  dismiss: [];
}>();

const isLoading = ref(false);
const error = ref<string | null>(null);
const deepDive = ref<PredictionDeepDive | null>(null);

// Load analysis when modal opens and predictionId is provided
watch(
  () => [props.isOpen, props.predictionId],
  ([open, id]) => {
    if (open && id) {
      loadAnalysis();
    } else {
      // Reset when modal closes
      deepDive.value = null;
      error.value = null;
    }
  },
  { immediate: true }
);

async function loadAnalysis() {
  if (!props.predictionId) return;

  isLoading.value = true;
  error.value = null;
  deepDive.value = null;

  try {
    const response = await predictionDashboardService.getPredictionDeepDive({
      id: props.predictionId,
    });

    console.log('[PredictionAnalysisModal] Deep dive response:', response);

    // Extract the actual deep dive data from the response
    deepDive.value = response?.content || response;
  } catch (err: unknown) {
    console.error('[PredictionAnalysisModal] Error loading deep dive:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load prediction analysis';
  } finally {
    isLoading.value = false;
  }
}

function onDismiss() {
  emit('dismiss');
}

function getDirectionClass(direction: string): string {
  const dir = direction.toLowerCase();
  if (dir === 'bullish' || dir === 'up') return 'direction-up';
  if (dir === 'bearish' || dir === 'down') return 'direction-down';
  return 'direction-neutral';
}

function getDirectionIcon(direction: string): string {
  const dir = direction.toLowerCase();
  if (dir === 'bullish' || dir === 'up') return '↑';
  if (dir === 'bearish' || dir === 'down') return '↓';
  return '↔';
}

function getDirectionColor(direction: string): string {
  const dir = direction.toLowerCase();
  if (dir === 'bullish' || dir === 'up') return 'success';
  if (dir === 'bearish' || dir === 'down') return 'danger';
  return 'medium';
}

function getTierColor(tier: string): string {
  switch (tier?.toLowerCase()) {
    case 'gold':
      return 'warning';
    case 'silver':
      return 'medium';
    case 'bronze':
      return 'tertiary';
    default:
      return 'primary';
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<style scoped>
.analysis-modal {
  --height: 90%;
  --border-radius: 16px;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
}

.error-icon {
  font-size: 3rem;
  color: var(--ion-color-danger);
}

.analysis-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.prediction-summary-card .direction-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.9rem;
  margin-right: 0.5rem;
}

.direction-badge.up,
.direction-badge.bullish {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.direction-badge.down,
.direction-badge.bearish {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.direction-badge.flat,
.direction-badge.neutral,
.direction-badge.unknown {
  background: rgba(156, 163, 175, 0.15);
  color: #9ca3af;
}

.confidence {
  font-size: 1.1rem;
  color: var(--ion-color-medium);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-item .label {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

.summary-item .value {
  font-size: 1rem;
  font-weight: 600;
}

.summary-item .value.status {
  text-transform: uppercase;
  font-size: 0.85rem;
}

.summary-item .value.status.active {
  color: var(--ion-color-success);
}

.summary-item .value.status.resolved {
  color: var(--ion-color-primary);
}

.summary-item .value.status.expired {
  color: var(--ion-color-medium);
}

.reasoning-section {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--ion-color-light);
  border-radius: 8px;
  border-left: 4px solid var(--ion-color-primary);
}

.reasoning-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: var(--ion-color-medium);
  text-transform: uppercase;
}

.reasoning-section p {
  margin: 0;
  line-height: 1.6;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--ion-color-light);
  border-radius: 8px;
}

.stat-icon {
  font-size: 2rem;
  color: var(--ion-color-primary);
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ion-color-dark);
}

.stat-label {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  text-transform: uppercase;
}

.section-icon {
  margin-right: 0.5rem;
  vertical-align: middle;
}

.analyst-item {
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 8px;
  border-left: 4px solid var(--ion-color-medium);
  background: var(--ion-color-light);
}

.analyst-item.direction-up {
  border-left-color: var(--ion-color-success);
  background: rgba(34, 197, 94, 0.05);
}

.analyst-item.direction-down {
  border-left-color: var(--ion-color-danger);
  background: rgba(239, 68, 68, 0.05);
}

.analyst-item:last-child {
  margin-bottom: 0;
}

.analyst-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}

.analyst-name {
  font-weight: 600;
  font-size: 1rem;
}

.analyst-direction {
  margin-left: auto;
  padding: 0.25rem 0.75rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.75rem;
}

.analyst-direction.direction-up {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.analyst-direction.direction-down {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.analyst-confidence {
  font-weight: 600;
  color: var(--ion-color-medium);
}

.analyst-reasoning {
  margin: 0.5rem 0 0 0;
  line-height: 1.6;
  font-size: 0.9rem;
  color: var(--ion-color-dark);
}

.predictor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.predictor-title {
  font-weight: 600;
}

.predictor-badges {
  display: flex;
  gap: 0.5rem;
}

.predictor-content {
  padding: 1rem;
}

.detail-row {
  margin-bottom: 0.75rem;
}

.detail-row.reasoning {
  margin-top: 1rem;
  padding: 0.75rem;
  background: var(--ion-color-light);
  border-radius: 6px;
}

.detail-row.reasoning p {
  margin: 0.5rem 0 0 0;
  line-height: 1.6;
}

.signal-section {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(99, 102, 241, 0.05);
  border-radius: 6px;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.signal-section h5 {
  margin: 0 0 0.75rem 0;
  font-size: 0.9rem;
  color: var(--ion-color-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.signal-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.signal-text {
  margin: 0;
  line-height: 1.6;
  font-size: 0.9rem;
}

.signal-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

.signal-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--ion-color-primary);
  text-decoration: none;
}

.learning-item {
  padding: 1rem;
  margin-bottom: 1rem;
  background: var(--ion-color-light);
  border-radius: 6px;
  border-left: 4px solid var(--ion-color-tertiary);
}

.learning-item:last-child {
  margin-bottom: 0;
}

.learning-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.learning-item p {
  margin: 0;
  line-height: 1.6;
  font-size: 0.9rem;
}
</style>
