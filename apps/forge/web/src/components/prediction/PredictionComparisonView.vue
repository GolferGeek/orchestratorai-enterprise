<template>
  <div class="prediction-comparison-view">
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading comparison data...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="retry-btn" @click="fetchComparison">Retry</button>
    </div>

    <template v-else-if="comparisonData">
      <!-- Comparison Summary Header -->
      <div class="comparison-summary">
        <h2>Prediction Comparison</h2>
        <div class="summary-stats">
          <div class="stat">
            <span class="stat-label">Compared</span>
            <span class="stat-value">{{ comparisonData.comparison.totalCompared }}</span>
          </div>
          <div class="stat" :class="{ unanimous: comparisonData.comparison.directionAgreement.unanimous }">
            <span class="stat-label">Direction</span>
            <span class="stat-value">
              {{ comparisonData.comparison.directionAgreement.unanimous ? 'Unanimous' : 'Mixed' }}
            </span>
          </div>
          <div class="stat">
            <span class="stat-label">Confidence Range</span>
            <span class="stat-value">
              {{ formatPercent(comparisonData.comparison.confidenceRange.min) }} -
              {{ formatPercent(comparisonData.comparison.confidenceRange.max) }}
            </span>
          </div>
          <div v-if="comparisonData.comparison.outcomeComparison.resolvedCount > 0 && comparisonData.comparison.outcomeComparison.accuracyPct !== null" class="stat">
            <span class="stat-label">Accuracy</span>
            <span class="stat-value">
              {{ formatPercent(comparisonData.comparison.outcomeComparison.accuracyPct / 100) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Direction Distribution -->
      <div class="direction-distribution">
        <h3>Direction Distribution</h3>
        <div class="direction-bars">
          <div
            v-for="(count, direction) in comparisonData.comparison.directionAgreement.directions"
            :key="direction"
            class="direction-bar"
            :class="direction"
          >
            <span class="direction-label">{{ String(direction).toUpperCase() }}</span>
            <div class="bar-fill" :style="{ width: `${(count / comparisonData.comparison.totalCompared) * 100}%` }"></div>
            <span class="direction-count">{{ count }}</span>
          </div>
        </div>
      </div>

      <!-- Side-by-Side Predictions -->
      <div class="predictions-grid">
        <div
          v-for="item in comparisonData.predictions"
          :key="item.prediction.id"
          class="prediction-comparison-card"
          :class="item.prediction.direction"
        >
          <div class="card-header">
            <span v-if="item.prediction.isTest" class="test-badge">TEST</span>
            <span class="prediction-id">{{ truncateId(item.prediction.id) }}</span>
            <span class="status-badge" :class="`status-${item.prediction.status}`">
              {{ item.prediction.status }}
            </span>
          </div>

          <div class="card-body">
            <div class="direction-section">
              <div class="direction-indicator" :class="item.prediction.direction">
                <span class="direction-icon">{{ getDirectionIcon(item.prediction.direction) }}</span>
                <span class="direction-label">{{ item.prediction.direction.toUpperCase() }}</span>
              </div>
              <div class="confidence-bar">
                <div
                  class="confidence-fill"
                  :style="{ width: `${item.prediction.confidence * 100}%` }"
                ></div>
                <span class="confidence-label">{{ formatPercent(item.prediction.confidence) }}</span>
              </div>
            </div>

            <div class="metrics-grid">
              <div class="metric">
                <span class="metric-label">Magnitude</span>
                <span class="metric-value">{{ item.prediction.magnitude?.toFixed(2) || 'N/A' }}%</span>
              </div>
              <div class="metric">
                <span class="metric-label">Timeframe</span>
                <span class="metric-value">{{ item.prediction.timeframeHours }}h</span>
              </div>
              <div class="metric">
                <span class="metric-label">Predictors</span>
                <span class="metric-value">{{ item.stats.predictorCount }}</span>
              </div>
              <div class="metric">
                <span class="metric-label">Analysts</span>
                <span class="metric-value">{{ item.stats.analystCount }}</span>
              </div>
              <div class="metric">
                <span class="metric-label">Avg Strength</span>
                <span class="metric-value">{{ formatPercent(item.stats.averageStrength) }}</span>
              </div>
              <div class="metric">
                <span class="metric-label">Avg Confidence</span>
                <span class="metric-value">{{ formatPercent(item.stats.averageConfidence) }}</span>
              </div>
            </div>

            <!-- Analyst Assessments -->
            <div v-if="item.analystAssessments.length > 0" class="analyst-section">
              <h4>Analyst Assessments</h4>
              <div class="analyst-list">
                <div
                  v-for="(assessment, idx) in item.analystAssessments"
                  :key="idx"
                  class="analyst-item"
                  :class="assessment.direction"
                >
                  <span class="analyst-slug">{{ assessment.analystSlug }}</span>
                  <span class="analyst-tier">{{ assessment.tier }}</span>
                  <span class="analyst-direction">{{ assessment.direction }}</span>
                  <span class="analyst-confidence">{{ formatPercent(assessment.confidence) }}</span>
                </div>
              </div>
            </div>

            <!-- Outcome (if resolved) -->
            <div v-if="item.prediction.status === 'resolved'" class="outcome-section">
              <h4>Outcome</h4>
              <div class="outcome-value" :class="{ correct: isCorrectPrediction(item) }">
                {{ item.prediction.outcomeValue?.toFixed(2) || 'N/A' }}%
                <span class="outcome-status">
                  {{ isCorrectPrediction(item) ? 'CORRECT' : 'INCORRECT' }}
                </span>
              </div>
            </div>
          </div>

          <div class="card-footer">
            <span class="timestamp">{{ formatDate(item.prediction.predictedAt) }}</span>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="empty-state">
      <span>Select at least 2 predictions to compare</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface AnalystAssessment {
  analystSlug: string;
  tier: string;
  direction: string;
  confidence: number;
}

interface PredictionItem {
  prediction: {
    id: string;
    targetId: string;
    direction: string;
    magnitude: number | null;
    confidence: number;
    timeframeHours: number;
    status: string;
    predictedAt: string;
    expiresAt: string;
    outcomeValue: number | null;
    isTest: boolean;
  };
  stats: {
    predictorCount: number;
    analystCount: number;
    averageStrength: number;
    averageConfidence: number;
  };
  analystAssessments: AnalystAssessment[];
  thresholdsMet: unknown;
}

interface ComparisonData {
  predictions: PredictionItem[];
  comparison: {
    totalCompared: number;
    directionAgreement: {
      unanimous: boolean;
      directions: Record<string, number>;
    };
    confidenceRange: {
      min: number;
      max: number;
      average: number;
      spread: number;
    };
    outcomeComparison: {
      resolvedCount: number;
      correctCount: number;
      accuracyPct: number | null;
    };
    byTarget: Record<string, string[]>;
  };
}

interface Props {
  predictionIds: string[];
  fetchComparisonFn?: (ids: string[]) => Promise<ComparisonData>;
}

const props = withDefaults(defineProps<Props>(), {
  predictionIds: () => [],
  fetchComparisonFn: undefined,
});

const emit = defineEmits<{
  loaded: [data: ComparisonData];
  error: [error: string];
}>();

const loading = ref(false);
const error = ref<string | null>(null);
const comparisonData = ref<ComparisonData | null>(null);

const fetchComparison = async () => {
  if (props.predictionIds.length < 2) {
    comparisonData.value = null;
    return;
  }

  if (!props.fetchComparisonFn) {
    error.value = 'No fetch function provided';
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const data = await props.fetchComparisonFn(props.predictionIds);
    comparisonData.value = data;
    emit('loaded', data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch comparison';
    error.value = message;
    emit('error', message);
  } finally {
    loading.value = false;
  }
};

watch(() => props.predictionIds, fetchComparison, { immediate: true, deep: true });

// Utility functions
const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return `${Math.round(value * 100)}%`;
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const truncateId = (id: string): string => {
  return id.slice(0, 8) + '...';
};

const getDirectionIcon = (direction: string): string => {
  switch (direction) {
    case 'up':
      return '\u2191'; // Arrow up
    case 'down':
      return '\u2193'; // Arrow down
    default:
      return '\u2194'; // Left-right arrow
  }
};

const isCorrectPrediction = (item: PredictionItem): boolean => {
  const outcome = item.prediction.outcomeValue;
  if (outcome === null) return false;
  const actualDirection = outcome > 0 ? 'up' : 'down';
  return item.prediction.direction === actualDirection;
};
</script>

<style scoped>
.prediction-comparison-view {
  padding: 1rem;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
  color: var(--text-secondary, #666);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #ddd);
  border-top-color: var(--ion-color-secondary, #15803d);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-state {
  color: var(--error-color, #ef4444);
}

.error-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--error-color, #ef4444);
  color: white;
  border-radius: 50%;
  font-weight: bold;
}

.retry-btn {
  padding: 0.5rem 1rem;
  background: var(--ion-color-secondary, #15803d);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.comparison-summary {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--card-bg, #f9fafb);
  border-radius: 8px;
}

.comparison-summary h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}

.summary-stats {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #666);
  text-transform: uppercase;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 600;
}

.stat.unanimous .stat-value {
  color: var(--success-color, #22c55e);
}

.direction-distribution {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--card-bg, #f9fafb);
  border-radius: 8px;
}

.direction-distribution h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
}

.direction-bars {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.direction-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.direction-bar.up .bar-fill {
  background: var(--success-color, #22c55e);
}

.direction-bar.down .bar-fill {
  background: var(--error-color, #ef4444);
}

.bar-fill {
  height: 8px;
  border-radius: 4px;
  min-width: 20px;
  transition: width 0.3s ease;
}

.direction-label {
  width: 60px;
  font-size: 0.875rem;
  font-weight: 500;
}

.direction-count {
  font-size: 0.875rem;
  color: var(--text-secondary, #666);
}

.predictions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
}

.prediction-comparison-card {
  background: var(--card-bg, white);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

.prediction-comparison-card.up {
  border-left: 4px solid var(--success-color, #22c55e);
}

.prediction-comparison-card.down {
  border-left: 4px solid var(--error-color, #ef4444);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--card-header-bg, #f3f4f6);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.test-badge {
  padding: 0.125rem 0.375rem;
  background: var(--warning-color, #f59e0b);
  color: white;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: 4px;
}

.prediction-id {
  flex: 1;
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--text-secondary, #666);
}

.status-badge {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 4px;
}

.status-badge.status-active {
  background: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.status-badge.status-resolved {
  background: var(--success-bg, #dcfce7);
  color: var(--success-color, #16a34a);
}

.status-badge.status-expired {
  background: var(--warning-bg, #fef3c7);
  color: var(--warning-color, #d97706);
}

.card-body {
  padding: 1rem;
}

.direction-section {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.direction-indicator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-weight: 600;
}

.direction-indicator.up {
  background: var(--success-bg, #dcfce7);
  color: var(--success-color, #16a34a);
}

.direction-indicator.down {
  background: var(--error-bg, #fee2e2);
  color: var(--error-color, #dc2626);
}

.direction-icon {
  font-size: 1.25rem;
}

.confidence-bar {
  flex: 1;
  position: relative;
  height: 24px;
  background: var(--border-color, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  background: var(--ion-color-secondary, #15803d);
  transition: width 0.3s ease;
}

.confidence-label {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.metric-label {
  font-size: 0.625rem;
  color: var(--text-secondary, #666);
  text-transform: uppercase;
}

.metric-value {
  font-size: 0.875rem;
  font-weight: 500;
}

.analyst-section,
.outcome-section {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.analyst-section h4,
.outcome-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-secondary, #666);
}

.analyst-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.analyst-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: var(--card-bg, #f9fafb);
  border-radius: 4px;
}

.analyst-item.up {
  border-left: 2px solid var(--success-color, #22c55e);
}

.analyst-item.down {
  border-left: 2px solid var(--error-color, #ef4444);
}

.analyst-slug {
  flex: 1;
  font-weight: 500;
}

.analyst-tier {
  padding: 0.125rem 0.25rem;
  background: var(--border-color, #e5e7eb);
  border-radius: 2px;
  font-size: 0.625rem;
  text-transform: uppercase;
}

.analyst-direction {
  text-transform: uppercase;
  font-weight: 500;
}

.analyst-confidence {
  color: var(--text-secondary, #666);
}

.outcome-value {
  font-size: 1.125rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.outcome-value.correct {
  color: var(--success-color, #22c55e);
}

.outcome-status {
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.outcome-value.correct .outcome-status {
  background: var(--success-bg, #dcfce7);
}

.outcome-value:not(.correct) {
  color: var(--error-color, #ef4444);
}

.outcome-value:not(.correct) .outcome-status {
  background: var(--error-bg, #fee2e2);
}

.card-footer {
  padding: 0.5rem 1rem;
  background: var(--card-header-bg, #f3f4f6);
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.timestamp {
  font-size: 0.75rem;
  color: var(--text-secondary, #666);
}
</style>
