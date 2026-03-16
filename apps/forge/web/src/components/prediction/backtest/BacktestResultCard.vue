<template>
  <div class="backtest-result-card">
    <!-- Pass/Fail Badge (Large) -->
    <div class="result-header">
      <div class="status-badge-large" :class="{ passed: result.passed, failed: !result.passed }">
        <span class="status-icon">{{ result.passed ? '✓' : '✗' }}</span>
        <span class="status-text">{{ result.passed ? 'PASSED' : 'FAILED' }}</span>
      </div>
      <div class="result-meta">
        <span class="meta-label">Executed:</span>
        <span class="meta-value">{{ formatDate(result.executedAt) }}</span>
      </div>
    </div>

    <!-- Metrics Grid -->
    <div class="metrics-grid">
      <!-- Accuracy Comparison -->
      <div class="metric-card highlight">
        <div class="metric-header">
          <span class="metric-label">Accuracy</span>
          <span class="metric-trend" :class="trendClass(result.metrics.accuracyLift)">
            {{ formatTrend(result.metrics.accuracyLift) }}
          </span>
        </div>
        <div class="metric-comparison">
          <div class="metric-value-group">
            <span class="metric-sublabel">Baseline</span>
            <span class="metric-value">{{ formatPercentage(result.metrics.baselineAccuracy) }}</span>
          </div>
          <div class="metric-arrow">→</div>
          <div class="metric-value-group">
            <span class="metric-sublabel">With Learning</span>
            <span class="metric-value primary">{{ formatPercentage(result.metrics.withLearningAccuracy) }}</span>
          </div>
        </div>
      </div>

      <!-- False Positive Rate -->
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">False Positive Rate</span>
          <span class="metric-trend" :class="trendClass(-result.metrics.falsePositiveDelta)">
            {{ formatTrend(result.metrics.falsePositiveDelta) }}
          </span>
        </div>
        <div class="metric-comparison">
          <div class="metric-value-group">
            <span class="metric-sublabel">Baseline</span>
            <span class="metric-value">{{ formatPercentage(result.metrics.baselineFalsePositiveRate) }}</span>
          </div>
          <div class="metric-arrow">→</div>
          <div class="metric-value-group">
            <span class="metric-sublabel">With Learning</span>
            <span class="metric-value">{{ formatPercentage(result.metrics.withLearningFalsePositiveRate) }}</span>
          </div>
        </div>
      </div>

      <!-- Predictions Affected -->
      <div class="metric-card">
        <span class="metric-label">Predictions Affected</span>
        <span class="metric-value-large">{{ result.metrics.predictionsAffected }}</span>
      </div>

      <!-- Predictions Improved -->
      <div class="metric-card success">
        <span class="metric-label">Predictions Improved</span>
        <div class="metric-with-icon">
          <span class="metric-icon">↑</span>
          <span class="metric-value-large">{{ result.metrics.predictionsImproved }}</span>
        </div>
      </div>

      <!-- Predictions Degraded -->
      <div class="metric-card danger">
        <span class="metric-label">Predictions Degraded</span>
        <div class="metric-with-icon">
          <span class="metric-icon">↓</span>
          <span class="metric-value-large">{{ result.metrics.predictionsDegraded }}</span>
        </div>
      </div>

      <!-- Statistical Significance -->
      <div class="metric-card">
        <span class="metric-label">
          Statistical Significance
          <span class="help-icon" title="Confidence level that results are not due to chance">ⓘ</span>
        </span>
        <span class="metric-value-large">{{ formatPercentage(result.metrics.statisticalSignificance) }}</span>
      </div>
    </div>

    <!-- Footer -->
    <div class="result-footer">
      <div class="footer-item">
        <span class="footer-label">Backtest ID:</span>
        <span class="footer-value mono">{{ truncateId(result.backtestId) }}</span>
      </div>
      <div class="footer-item">
        <span class="footer-label">Execution Time:</span>
        <span class="footer-value">{{ formatExecutionTime(result.executionTimeMs) }}</span>
      </div>
    </div>

    <!-- Pass/Fail Explanation -->
    <div v-if="!result.passed" class="failure-explanation">
      <div class="explanation-header">
        <span class="explanation-icon">⚠</span>
        <strong>Why This Failed</strong>
      </div>
      <ul class="failure-reasons">
        <li v-if="result.metrics.accuracyLift < 0.05">
          Accuracy lift ({{ formatPercentage(result.metrics.accuracyLift) }}) is below minimum threshold of 5%
        </li>
        <li v-if="result.metrics.falsePositiveDelta > 0">
          False positive rate increased by {{ formatPercentage(result.metrics.falsePositiveDelta) }}
        </li>
        <li v-if="result.metrics.predictionsDegraded > result.metrics.predictionsImproved">
          More predictions degraded ({{ result.metrics.predictionsDegraded }}) than improved ({{ result.metrics.predictionsImproved }})
        </li>
        <li v-if="result.metrics.statisticalSignificance < 0.95">
          Statistical significance ({{ formatPercentage(result.metrics.statisticalSignificance) }}) is below 95% threshold
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BacktestResult } from '@/services/learningPromotionService';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  result: BacktestResult;
}

defineProps<Props>();

// ============================================================================
// METHODS
// ============================================================================

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatTrend(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function trendClass(value: number): string {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatExecutionTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

function truncateId(id: string): string {
  return id.length > 8 ? `${id.substring(0, 8)}...` : id;
}
</script>

<style scoped>
.backtest-result-card {
  background: var(--ion-card-background, #ffffff);
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

/* Result Header */
.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2rem;
  background: var(--ion-color-light, #f3f4f6);
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
}

.status-badge-large {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 2rem;
  border-radius: 8px;
  font-size: 1.5rem;
  font-weight: 700;
}

.status-badge-large.passed {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.1));
  color: var(--ion-color-success, #10b981);
  border: 2px solid var(--ion-color-success, #10b981);
}

.status-badge-large.failed {
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.1));
  color: var(--ion-color-danger, #ef4444);
  border: 2px solid var(--ion-color-danger, #ef4444);
}

.status-icon {
  font-size: 2rem;
}

.result-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.meta-label {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
  text-transform: uppercase;
}

.meta-value {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ion-text-color, #111827);
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  padding: 1.5rem;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  background: var(--ion-color-light, #f3f4f6);
  border-radius: 8px;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.metric-card.highlight {
  background: rgba(21, 128, 61, 0.05);
  border-color: var(--ion-color-secondary, #15803d);
}

.metric-card.success {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.05));
}

.metric-card.danger {
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.05));
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.metric-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ion-color-medium, #6b7280);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.help-icon {
  font-size: 0.875rem;
  color: var(--ion-color-medium, #9ca3af);
  cursor: help;
}

.metric-trend {
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.metric-trend.positive {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.1));
  color: var(--ion-color-success, #10b981);
}

.metric-trend.negative {
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.1));
  color: var(--ion-color-danger, #ef4444);
}

.metric-trend.neutral {
  background: var(--ion-color-medium-tint, rgba(107, 114, 128, 0.1));
  color: var(--ion-color-medium, #6b7280);
}

.metric-comparison {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.metric-value-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.metric-sublabel {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
}

.metric-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.metric-value.primary {
  color: var(--ion-color-secondary, #15803d);
}

.metric-arrow {
  font-size: 1.25rem;
  color: var(--ion-color-medium, #6b7280);
}

.metric-value-large {
  font-size: 2rem;
  font-weight: 700;
  color: var(--ion-text-color, #111827);
}

.metric-with-icon {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.metric-icon {
  font-size: 1.5rem;
  font-weight: 700;
}

.metric-card.success .metric-icon {
  color: var(--ion-color-success, #10b981);
}

.metric-card.danger .metric-icon {
  color: var(--ion-color-danger, #ef4444);
}

/* Footer */
.result-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: var(--ion-color-light, #f3f4f6);
  border-top: 1px solid var(--ion-border-color, #e5e7eb);
  font-size: 0.75rem;
}

.footer-item {
  display: flex;
  gap: 0.5rem;
}

.footer-label {
  color: var(--ion-color-medium, #6b7280);
}

.footer-value {
  color: var(--ion-text-color, #111827);
  font-weight: 500;
}

.footer-value.mono {
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
}

/* Failure Explanation */
.failure-explanation {
  margin: 1.5rem;
  padding: 1rem;
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.05));
  border: 1px solid var(--ion-color-danger, #ef4444);
  border-radius: 8px;
}

.explanation-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  color: var(--ion-color-danger, #ef4444);
  font-size: 0.875rem;
}

.explanation-icon {
  font-size: 1.25rem;
}

.failure-reasons {
  margin: 0;
  padding-left: 1.5rem;
  color: var(--ion-color-danger-shade, #dc2626);
  font-size: 0.875rem;
  line-height: 1.6;
}

.failure-reasons li {
  margin-bottom: 0.5rem;
}

.failure-reasons li:last-child {
  margin-bottom: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .result-header {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .result-meta {
    align-items: flex-start;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .result-footer {
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-start;
  }
}
</style>
