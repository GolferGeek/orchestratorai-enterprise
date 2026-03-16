<template>
  <div class="current-state">
    <div class="state-header">
      <h3>Current State</h3>
      <div v-if="activePredictions.length > 0" class="last-updated">
        {{ activePredictions.length }} active predictions
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading current state...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <span class="error-icon">&#9888;</span>
      <span>{{ error }}</span>
    </div>

    <div v-else-if="activePredictions.length === 0" class="empty-state">
      <span>No active predictions. Run the pipeline to generate predictions.</span>
    </div>

    <div v-else class="state-content">
      <!-- Active Predictions -->
      <div class="section">
        <h4>Active Predictions ({{ activePredictions.length }})</h4>
        <div class="predictions-list">
          <div
            v-for="prediction in activePredictions"
            :key="prediction.id"
            class="prediction-card"
            :class="[`direction-${prediction.direction}`]"
          >
            <div class="prediction-header">
              <span class="target-symbol">{{ prediction.targetSymbol || prediction.targetName || 'Unknown' }}</span>
              <span class="direction-badge" :class="prediction.direction">
                {{ prediction.direction.toUpperCase() }}
              </span>
            </div>
            <div class="prediction-details">
              <div class="detail">
                <span class="label">Confidence:</span>
                <span class="value">{{ (Number(prediction.confidence) * 100).toFixed(0) }}%</span>
              </div>
              <div v-if="prediction.magnitude != null" class="detail">
                <span class="label">Magnitude:</span>
                <span class="value">{{ Number(prediction.magnitude).toFixed(1) }}%</span>
              </div>
              <div v-if="prediction.timeframe" class="detail">
                <span class="label">Timeframe:</span>
                <span class="value">{{ prediction.timeframe }}</span>
              </div>
            </div>
            <div class="prediction-meta">
              <span>Generated: {{ formatDate(prediction.generatedAt) }}</span>
              <span v-if="prediction.expiresAt">Expires: {{ formatDate(prediction.expiresAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- LLM Agreement Stats -->
      <div v-if="llmAgreementStats.fullAgreement > 0 || llmAgreementStats.partialAgreement > 0" class="section">
        <h4>LLM Agreement</h4>
        <div class="agreement-stats">
          <div class="stat-item">
            <div class="stat-value success">{{ llmAgreementStats.fullAgreement }}</div>
            <div class="stat-label">Full Agreement</div>
          </div>
          <div class="stat-item">
            <div class="stat-value warning">{{ llmAgreementStats.partialAgreement }}</div>
            <div class="stat-label">Partial Agreement</div>
          </div>
          <div class="stat-item">
            <div class="stat-value error">{{ llmAgreementStats.noAgreement }}</div>
            <div class="stat-label">No Agreement</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { usePredictionStore } from '@/stores/predictionStore';

const store = usePredictionStore();

const activePredictions = computed(() => store.activePredictions);
const llmAgreementStats = computed(() => store.llmAgreementStats);
const isLoading = computed(() => store.isLoading);
const error = computed(() => store.error);

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleString();
}
</script>

<style scoped>
.current-state {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.state-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e5e7eb;
}

.state-header h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.last-updated {
  font-size: 0.875rem;
  color: #6b7280;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #6b7280;
}

.spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 3px solid #e5e7eb;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-state {
  background-color: #fef2f2;
  color: #991b1b;
}

.error-icon {
  font-size: 1.5rem;
}

.state-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section h4 {
  margin: 0 0 1rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #374151;
}

.predictions-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.prediction-card {
  padding: 1rem;
  background-color: #ffffff;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  transition: box-shadow 0.2s;
}

.prediction-card:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.prediction-card.direction-up {
  border-left: 4px solid #10b981;
}

.prediction-card.direction-down {
  border-left: 4px solid #ef4444;
}

.prediction-card.direction-flat {
  border-left: 4px solid #6b7280;
}

.prediction-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.target-symbol {
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
}

.direction-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.direction-badge.up {
  background-color: #d1fae5;
  color: #065f46;
}

.direction-badge.down {
  background-color: #fee2e2;
  color: #991b1b;
}

.direction-badge.flat {
  background-color: #f3f4f6;
  color: #374151;
}

.prediction-details {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.detail {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.detail .label {
  font-size: 0.75rem;
  color: #6b7280;
}

.detail .value {
  font-size: 0.875rem;
  font-weight: 600;
  color: #111827;
}

.prediction-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.agreement-stats {
  display: flex;
  gap: 2rem;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.stat-value.success {
  color: #10b981;
}

.stat-value.warning {
  color: #f59e0b;
}

.stat-value.error {
  color: #ef4444;
}

.stat-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
}
</style>
