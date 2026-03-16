<template>
  <div class="validation-result-panel">
    <div class="panel-header">
      <h3>Validation Result</h3>
      <span
        class="validation-status"
        :class="{ valid: result.isValid, invalid: !result.isValid }"
      >
        {{ result.isValid ? 'Valid' : 'Invalid' }}
      </span>
    </div>

    <div class="checks-section">
      <h4>Validation Checks</h4>
      <div class="check-list">
        <div class="check-item" :class="{ pass: result.checks.isTestLearning, fail: !result.checks.isTestLearning }">
          <span class="check-icon">{{ result.checks.isTestLearning ? '✓' : '✗' }}</span>
          <span class="check-label">Is Test Learning</span>
        </div>
        <div class="check-item" :class="{ pass: result.checks.isActive, fail: !result.checks.isActive }">
          <span class="check-icon">{{ result.checks.isActive ? '✓' : '✗' }}</span>
          <span class="check-label">Is Active</span>
        </div>
        <div class="check-item" :class="{ pass: result.checks.notAlreadyPromoted, fail: !result.checks.notAlreadyPromoted }">
          <span class="check-icon">{{ result.checks.notAlreadyPromoted ? '✓' : '✗' }}</span>
          <span class="check-label">Not Already Promoted</span>
        </div>
        <div class="check-item" :class="{ pass: result.checks.hasValidationMetrics, fail: !result.checks.hasValidationMetrics }">
          <span class="check-icon">{{ result.checks.hasValidationMetrics ? '✓' : '✗' }}</span>
          <span class="check-label">Has Validation Metrics</span>
        </div>
        <div
          v-if="result.checks.meetsMinApplications !== undefined"
          class="check-item"
          :class="{ pass: result.checks.meetsMinApplications, fail: !result.checks.meetsMinApplications }"
        >
          <span class="check-icon">{{ result.checks.meetsMinApplications ? '✓' : '✗' }}</span>
          <span class="check-label">Meets Minimum Applications</span>
        </div>
        <div
          v-if="result.checks.meetsMinSuccessRate !== undefined"
          class="check-item"
          :class="{ pass: result.checks.meetsMinSuccessRate, fail: !result.checks.meetsMinSuccessRate }"
        >
          <span class="check-icon">{{ result.checks.meetsMinSuccessRate ? '✓' : '✗' }}</span>
          <span class="check-label">Meets Minimum Success Rate</span>
        </div>
      </div>
    </div>

    <div v-if="result.validationMetrics" class="metrics-section">
      <h4>Validation Metrics</h4>
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="metric-label">Times Applied</span>
          <span class="metric-value">{{ result.validationMetrics.timesApplied }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Times Helpful</span>
          <span class="metric-value">{{ result.validationMetrics.timesHelpful }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Success Rate</span>
          <span class="metric-value success">{{ formatSuccessRate(result.validationMetrics.successRate) }}</span>
        </div>
      </div>
    </div>

    <div v-if="result.errors.length > 0" class="errors-section">
      <h4>Errors</h4>
      <div class="error-list">
        <div v-for="(error, index) in result.errors" :key="index" class="error-item">
          <span class="error-icon">!</span>
          <span class="error-message">{{ error }}</span>
        </div>
      </div>
    </div>

    <div v-if="result.warnings && result.warnings.length > 0" class="warnings-section">
      <h4>Warnings</h4>
      <div class="warning-list">
        <div v-for="(warning, index) in result.warnings" :key="index" class="warning-item">
          <span class="warning-icon">⚠</span>
          <span class="warning-message">{{ warning }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ValidationResult } from '@/services/learningPromotionService';

interface Props {
  result: ValidationResult;
}

defineProps<Props>();

function formatSuccessRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
</script>

<style scoped>
.validation-result-panel {
  background: var(--ion-card-background, #ffffff);
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1.5rem;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.panel-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.validation-status {
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.validation-status.valid {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.1));
  color: var(--ion-color-success, #10b981);
}

.validation-status.invalid {
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.1));
  color: var(--ion-color-danger, #ef4444);
}

.checks-section,
.metrics-section,
.errors-section,
.warnings-section {
  margin-bottom: 1.5rem;
}

.checks-section:last-child,
.metrics-section:last-child,
.errors-section:last-child,
.warnings-section:last-child {
  margin-bottom: 0;
}

.checks-section h4,
.metrics-section h4,
.errors-section h4,
.warnings-section h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ion-color-medium, #6b7280);
  text-transform: uppercase;
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 6px;
  background: var(--ion-color-light, #f3f4f6);
}

.check-item.pass {
  background: rgba(16, 185, 129, 0.1);
}

.check-item.fail {
  background: rgba(239, 68, 68, 0.1);
}

.check-icon {
  font-size: 1rem;
  font-weight: 700;
  width: 20px;
  text-align: center;
}

.check-item.pass .check-icon {
  color: var(--ion-color-success, #10b981);
}

.check-item.fail .check-icon {
  color: var(--ion-color-danger, #ef4444);
}

.check-label {
  font-size: 0.875rem;
  color: var(--ion-text-color, #111827);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
}

.metric-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  background: var(--ion-color-light, #f3f4f6);
  border-radius: 6px;
}

.metric-label {
  font-size: 0.625rem;
  color: var(--ion-color-medium, #6b7280);
  text-transform: uppercase;
  margin-bottom: 0.25rem;
  text-align: center;
}

.metric-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ion-text-color, #111827);
}

.metric-value.success {
  color: var(--ion-color-success, #10b981);
}

.error-list,
.warning-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.error-item,
.warning-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 6px;
}

.error-item {
  background: rgba(239, 68, 68, 0.1);
}

.warning-item {
  background: rgba(245, 158, 11, 0.1);
}

.error-icon,
.warning-icon {
  font-size: 1rem;
  font-weight: 700;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.error-icon {
  color: var(--ion-color-danger, #ef4444);
}

.warning-icon {
  color: var(--ion-color-warning, #f59e0b);
}

.error-message,
.warning-message {
  font-size: 0.875rem;
  line-height: 1.5;
}

.error-message {
  color: var(--ion-color-danger-shade, #dc2626);
}

.warning-message {
  color: var(--ion-color-warning-shade, #d97706);
}
</style>
