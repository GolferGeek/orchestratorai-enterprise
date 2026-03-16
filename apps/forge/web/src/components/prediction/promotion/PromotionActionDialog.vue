<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="handleCancel">
    <div class="modal-content">
      <header class="modal-header">
        <h2>{{ mode === 'promote' ? 'Promote Learning' : 'Reject Learning' }}</h2>
        <button class="close-btn" @click="handleCancel">&times;</button>
      </header>

      <div class="modal-body">
        <p v-if="mode === 'promote'" class="instruction">
          You are about to promote this test learning to production. This will create a new production learning
          based on the test learning's configuration and validation metrics.
        </p>
        <p v-else class="instruction warning">
          You are about to reject this learning candidate. Please provide a reason for rejection.
        </p>

        <div v-if="mode === 'promote'" class="form-group">
          <label for="notes">Reviewer Notes (Optional)</label>
          <textarea
            id="notes"
            v-model="notes"
            placeholder="Add any notes about this promotion..."
            rows="4"
          ></textarea>
        </div>

        <div v-else class="form-group">
          <label for="reason">Reason for Rejection <span class="required">*</span></label>
          <textarea
            id="reason"
            v-model="reason"
            placeholder="Explain why this learning is being rejected..."
            rows="4"
            required
          ></textarea>
          <span v-if="showReasonError" class="error-message">Reason is required</span>
        </div>

        <div v-if="mode === 'promote' && backtestResult" class="backtest-summary">
          <h4>Backtest Result</h4>
          <div class="backtest-status" :class="{ passed: backtestResult.passed, failed: !backtestResult.passed }">
            <span class="status-icon">{{ backtestResult.passed ? '✓' : '✗' }}</span>
            <span class="status-text">{{ backtestResult.passed ? 'Passed' : 'Failed' }}</span>
          </div>
          <div class="backtest-metrics">
            <div class="metric">
              <span class="metric-label">Accuracy Lift</span>
              <span class="metric-value">{{ formatPercentage(backtestResult.metrics.accuracyLift) }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Predictions Improved</span>
              <span class="metric-value">{{ backtestResult.metrics.predictionsImproved }}</span>
            </div>
          </div>
        </div>

        <div v-if="mode === 'promote' && validationResult" class="validation-summary">
          <h4>Validation Summary</h4>
          <div class="validation-status" :class="{ valid: validationResult.isValid, invalid: !validationResult.isValid }">
            <span class="status-icon">{{ validationResult.isValid ? '✓' : '✗' }}</span>
            <span class="status-text">{{ validationResult.isValid ? 'Valid' : 'Invalid' }}</span>
          </div>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn btn-secondary" @click="handleCancel">Cancel</button>
        <button
          v-if="mode === 'promote'"
          class="btn btn-primary"
          @click="handlePromote"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? 'Promoting...' : 'Promote to Production' }}
        </button>
        <button
          v-else
          class="btn btn-danger"
          @click="handleReject"
          :disabled="isSubmitting || !reason.trim()"
        >
          {{ isSubmitting ? 'Rejecting...' : 'Reject Learning' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ValidationResult, BacktestResult } from '@/services/learningPromotionService';

interface Props {
  isOpen: boolean;
  mode: 'promote' | 'reject';
  validationResult?: ValidationResult | null;
  backtestResult?: BacktestResult | null;
}

const props = withDefaults(defineProps<Props>(), {
  validationResult: null,
  backtestResult: null,
});

const emit = defineEmits<{
  close: [];
  promote: [notes: string];
  reject: [reason: string];
}>();

const notes = ref('');
const reason = ref('');
const isSubmitting = ref(false);
const showReasonError = ref(false);

// Reset form when dialog opens/closes or mode changes
watch(() => props.isOpen, (isOpen) => {
  if (!isOpen) {
    notes.value = '';
    reason.value = '';
    isSubmitting.value = false;
    showReasonError.value = false;
  }
});

watch(() => props.mode, () => {
  notes.value = '';
  reason.value = '';
  showReasonError.value = false;
});

function handleCancel() {
  emit('close');
}

function handlePromote() {
  isSubmitting.value = true;
  emit('promote', notes.value);
  // Parent component should handle closing after successful promotion
}

function handleReject() {
  if (!reason.value.trim()) {
    showReasonError.value = true;
    return;
  }
  isSubmitting.value = true;
  emit('reject', reason.value);
  // Parent component should handle closing after successful rejection
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-content {
  background: var(--ion-background-color, #ffffff);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--ion-color-medium, #6b7280);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.close-btn:hover {
  background: var(--ion-color-light, #f3f4f6);
}

.modal-body {
  padding: 1.5rem;
}

.instruction {
  margin: 0 0 1.5rem 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--ion-color-medium, #6b7280);
}

.instruction.warning {
  color: var(--ion-color-danger-shade, #dc2626);
  background: rgba(239, 68, 68, 0.1);
  padding: 0.75rem;
  border-radius: 6px;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--ion-text-color, #111827);
}

.required {
  color: var(--ion-color-danger, #ef4444);
}

.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--ion-background-color, #ffffff);
  color: var(--ion-text-color, #111827);
  font-family: inherit;
  font-size: 0.875rem;
  resize: vertical;
  transition: border-color 0.2s;
}

.form-group textarea:focus {
  outline: none;
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

.error-message {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--ion-color-danger, #ef4444);
}

.backtest-summary,
.validation-summary {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--ion-color-light, #f3f4f6);
  border-radius: 6px;
}

.backtest-summary h4,
.validation-summary h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.backtest-status,
.validation-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.backtest-status.passed .status-icon,
.validation-status.valid .status-icon {
  color: var(--ion-color-success, #10b981);
}

.backtest-status.failed .status-icon,
.validation-status.invalid .status-icon {
  color: var(--ion-color-danger, #ef4444);
}

.status-icon {
  font-size: 1.25rem;
  font-weight: 700;
}

.status-text {
  font-weight: 600;
  font-size: 0.875rem;
}

.backtest-metrics {
  display: flex;
  gap: 1rem;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  padding: 0.5rem;
  background: var(--ion-background-color, #ffffff);
  border-radius: 4px;
}

.metric-label {
  font-size: 0.625rem;
  color: var(--ion-color-medium, #6b7280);
  text-transform: uppercase;
  margin-bottom: 0.25rem;
  text-align: center;
}

.metric-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--ion-text-color, #111827);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--ion-border-color, #e5e7eb);
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--ion-color-secondary, #15803d);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--ion-color-secondary-shade, #166534);
}

.btn-secondary {
  background: var(--ion-color-light, #f3f4f6);
  color: var(--ion-text-color, #111827);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--ion-color-medium-tint, #e5e7eb);
}

.btn-danger {
  background: var(--ion-color-danger, #ef4444);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: var(--ion-color-danger-shade, #dc2626);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
