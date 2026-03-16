<template>
  <div class="backtest-comparison-chart">
    <div class="chart-header">
      <h4>Performance Comparison</h4>
      <p class="chart-subtitle">Baseline vs With Learning Applied</p>
    </div>

    <div class="chart-content">
      <!-- Accuracy Comparison -->
      <div class="chart-section">
        <div class="chart-label">
          <span class="label-text">Accuracy</span>
          <span class="label-delta" :class="deltaClass(accuracyDelta)">
            {{ formatDelta(accuracyDelta) }}
          </span>
        </div>
        <div class="bar-group">
          <div class="bar-container">
            <div class="bar-label">Baseline</div>
            <div class="bar-wrapper">
              <div
                class="bar baseline"
                :style="{ width: barWidth(result.metrics.baselineAccuracy) }"
              >
                <span class="bar-value">{{ formatPercentage(result.metrics.baselineAccuracy) }}</span>
              </div>
            </div>
          </div>
          <div class="bar-container">
            <div class="bar-label">With Learning</div>
            <div class="bar-wrapper">
              <div
                class="bar learning"
                :style="{ width: barWidth(result.metrics.withLearningAccuracy) }"
              >
                <span class="bar-value">{{ formatPercentage(result.metrics.withLearningAccuracy) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- False Positive Rate Comparison -->
      <div class="chart-section">
        <div class="chart-label">
          <span class="label-text">False Positive Rate</span>
          <span class="label-delta" :class="deltaClass(-fpDelta)">
            {{ formatDelta(fpDelta) }}
          </span>
        </div>
        <div class="bar-group">
          <div class="bar-container">
            <div class="bar-label">Baseline</div>
            <div class="bar-wrapper">
              <div
                class="bar baseline"
                :style="{ width: barWidth(result.metrics.baselineFalsePositiveRate) }"
              >
                <span class="bar-value">{{ formatPercentage(result.metrics.baselineFalsePositiveRate) }}</span>
              </div>
            </div>
          </div>
          <div class="bar-container">
            <div class="bar-label">With Learning</div>
            <div class="bar-wrapper">
              <div
                class="bar learning"
                :class="{ better: fpDelta < 0, worse: fpDelta > 0 }"
                :style="{ width: barWidth(result.metrics.withLearningFalsePositiveRate) }"
              >
                <span class="bar-value">{{ formatPercentage(result.metrics.withLearningFalsePositiveRate) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Impact Summary -->
      <div class="impact-summary">
        <div class="impact-item improved">
          <div class="impact-icon">↑</div>
          <div class="impact-content">
            <span class="impact-value">{{ result.metrics.predictionsImproved }}</span>
            <span class="impact-label">Improved</span>
          </div>
        </div>
        <div class="impact-item degraded">
          <div class="impact-icon">↓</div>
          <div class="impact-content">
            <span class="impact-value">{{ result.metrics.predictionsDegraded }}</span>
            <span class="impact-label">Degraded</span>
          </div>
        </div>
        <div class="impact-item total">
          <div class="impact-icon">∑</div>
          <div class="impact-content">
            <span class="impact-value">{{ result.metrics.predictionsAffected }}</span>
            <span class="impact-label">Total Affected</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BacktestResult } from '@/services/learningPromotionService';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  result: BacktestResult;
}

const props = defineProps<Props>();

// ============================================================================
// COMPUTED
// ============================================================================

const accuracyDelta = computed(() => props.result.metrics.accuracyLift);
const fpDelta = computed(() => props.result.metrics.falsePositiveDelta);

// ============================================================================
// METHODS
// ============================================================================

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDelta(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function deltaClass(value: number): string {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function barWidth(value: number): string {
  // Scale to percentage (0-100%)
  // Most accuracy/FP rates should be between 0-1
  const percentage = Math.min(value * 100, 100);
  return `${percentage}%`;
}
</script>

<style scoped>
.backtest-comparison-chart {
  background: var(--ion-card-background, #ffffff);
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

.chart-header {
  padding: 1.25rem 1.5rem;
  background: var(--ion-color-light, #f3f4f6);
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
}

.chart-header h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.chart-subtitle {
  margin: 0;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
}

.chart-content {
  padding: 1.5rem;
}

.chart-section {
  margin-bottom: 2rem;
}

.chart-section:last-child {
  margin-bottom: 0;
}

.chart-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.label-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.label-delta {
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.label-delta.positive {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.1));
  color: var(--ion-color-success, #10b981);
}

.label-delta.negative {
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.1));
  color: var(--ion-color-danger, #ef4444);
}

.label-delta.neutral {
  background: var(--ion-color-medium-tint, rgba(107, 114, 128, 0.1));
  color: var(--ion-color-medium, #6b7280);
}

.bar-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bar-container {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 1rem;
  align-items: center;
}

.bar-label {
  font-size: 0.875rem;
  color: var(--ion-color-medium, #6b7280);
  text-align: right;
}

.bar-wrapper {
  background: var(--ion-color-light, #f3f4f6);
  border-radius: 4px;
  overflow: hidden;
  height: 32px;
  position: relative;
}

.bar {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 0.75rem;
  border-radius: 4px;
  transition: width 0.5s ease;
  min-width: 60px;
}

.bar.baseline {
  background: linear-gradient(90deg, #9ca3af 0%, #6b7280 100%);
}

.bar.learning {
  background: linear-gradient(90deg, var(--ion-color-secondary-tint, #22c55e) 0%, var(--ion-color-secondary, #15803d) 100%);
}

.bar.learning.better {
  background: linear-gradient(90deg, #34d399 0%, #10b981 100%);
}

.bar.learning.worse {
  background: linear-gradient(90deg, #f87171 0%, #ef4444 100%);
}

.bar-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Impact Summary */
.impact-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--ion-border-color, #e5e7eb);
}

.impact-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--ion-color-light, #f3f4f6);
  border-radius: 8px;
}

.impact-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 1.5rem;
  font-weight: 700;
}

.impact-item.improved .impact-icon {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.1));
  color: var(--ion-color-success, #10b981);
}

.impact-item.degraded .impact-icon {
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.1));
  color: var(--ion-color-danger, #ef4444);
}

.impact-item.total .impact-icon {
  background: rgba(21, 128, 61, 0.1);
  color: var(--ion-color-secondary, #15803d);
}

.impact-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.impact-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ion-text-color, #111827);
}

.impact-label {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
  text-transform: uppercase;
}

/* Responsive */
@media (max-width: 768px) {
  .bar-container {
    grid-template-columns: 80px 1fr;
    gap: 0.5rem;
  }

  .bar-label {
    font-size: 0.75rem;
  }

  .impact-summary {
    grid-template-columns: 1fr;
  }
}
</style>
