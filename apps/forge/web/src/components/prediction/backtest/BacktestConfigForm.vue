<template>
  <div class="backtest-config-form">
    <div class="form-header">
      <h3>Configure Backtest Parameters</h3>
      <p class="help-text">
        Run a backtest to evaluate a learning's impact on historical predictions.
      </p>
    </div>

    <div class="form-content">
      <!-- Learning Selection -->
      <div class="form-group">
        <label for="learning-select" class="form-label">
          Select Learning <span class="required">*</span>
        </label>
        <select
          id="learning-select"
          v-model="localConfig.learningId"
          class="form-select"
          :disabled="isLoading || candidates.length === 0"
        >
          <option value="">-- Select a test learning --</option>
          <option
            v-for="candidate in candidates"
            :key="candidate.id"
            :value="candidate.id"
          >
            {{ candidate.title }}
          </option>
        </select>
        <p v-if="candidates.length === 0" class="help-text error">
          No test learnings available
        </p>
      </div>

      <!-- Window Days -->
      <div class="form-group">
        <label for="window-days" class="form-label">
          Window Period (Days)
          <span class="help-text">How far back to test (7-365 days)</span>
        </label>
        <div class="slider-group">
          <input
            id="window-days"
            v-model.number="localConfig.windowDays"
            type="range"
            min="7"
            max="365"
            step="1"
            class="form-slider"
            :disabled="isLoading"
          />
          <input
            v-model.number="localConfig.windowDays"
            type="number"
            min="7"
            max="365"
            class="form-input-number"
            :disabled="isLoading"
          />
        </div>
      </div>

      <!-- Target Symbols (Optional) -->
      <div class="form-group">
        <label for="target-symbols" class="form-label">
          Target Symbols (Optional)
          <span class="help-text">Comma-separated list (e.g., AAPL, MSFT)</span>
        </label>
        <input
          id="target-symbols"
          v-model="localConfig.targetSymbols"
          type="text"
          class="form-input"
          placeholder="Leave empty to test all symbols"
          :disabled="isLoading"
        />
      </div>

      <!-- Domain Filter (Optional) -->
      <div class="form-group">
        <label for="domain-filter" class="form-label">
          Domain Filter (Optional)
          <span class="help-text">Limit to specific domain</span>
        </label>
        <select
          id="domain-filter"
          v-model="localConfig.domain"
          class="form-select"
          :disabled="isLoading"
        >
          <option value="">-- All Domains --</option>
          <option value="stocks">Stocks</option>
          <option value="crypto">Crypto</option>
          <option value="elections">Elections</option>
          <option value="polymarket">Polymarket</option>
        </select>
      </div>

      <!-- Action Buttons -->
      <div class="form-actions">
        <button
          class="btn btn-secondary"
          @click="handleClear"
          :disabled="isLoading"
        >
          Clear
        </button>
        <button
          class="btn btn-primary"
          @click="handleRun"
          :disabled="!isValid || isLoading"
        >
          <span v-if="isLoading" class="spinner-small"></span>
          <span v-else>Run Backtest</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { PromotionCandidate } from '@/services/learningPromotionService';

// ============================================================================
// PROPS & EMITS
// ============================================================================

interface Props {
  candidates: PromotionCandidate[];
  isLoading?: boolean;
  selectedLearningId?: string;
}

interface BacktestConfig {
  learningId: string;
  windowDays: number;
  targetSymbols: string;
  domain: string;
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  selectedLearningId: '',
});

const emit = defineEmits<{
  run: [config: BacktestConfig];
  clear: [];
}>();

// ============================================================================
// STATE
// ============================================================================

const localConfig = ref<BacktestConfig>({
  learningId: props.selectedLearningId || '',
  windowDays: 30,
  targetSymbols: '',
  domain: '',
});

// ============================================================================
// COMPUTED
// ============================================================================

const isValid = computed(() => {
  return !!localConfig.value.learningId;
});

// ============================================================================
// WATCHERS
// ============================================================================

watch(() => props.selectedLearningId, (newVal) => {
  if (newVal) {
    localConfig.value.learningId = newVal;
  }
});

// ============================================================================
// METHODS
// ============================================================================

function handleRun() {
  if (!isValid.value) return;
  emit('run', { ...localConfig.value });
}

function handleClear() {
  localConfig.value = {
    learningId: '',
    windowDays: 30,
    targetSymbols: '',
    domain: '',
  };
  emit('clear');
}
</script>

<style scoped>
.backtest-config-form {
  background: var(--ion-card-background, #ffffff);
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

.form-header {
  padding: 1.5rem;
  background: var(--ion-color-light, #f3f4f6);
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
}

.form-header h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.form-content {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ion-text-color, #111827);
}

.form-label .required {
  color: var(--ion-color-danger, #ef4444);
}

.form-select,
.form-input {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  background: var(--ion-background-color, #ffffff);
  color: var(--ion-text-color, #111827);
  transition: border-color 0.2s;
}

.form-select:focus,
.form-input:focus {
  outline: none;
  border-color: var(--ion-color-secondary, #15803d);
}

.form-select:disabled,
.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.slider-group {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
  align-items: center;
}

.form-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--ion-color-light, #f3f4f6);
  outline: none;
  -webkit-appearance: none;
}

.form-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ion-color-secondary, #15803d);
  cursor: pointer;
}

.form-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ion-color-secondary, #15803d);
  cursor: pointer;
  border: none;
}

.form-slider:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-input-number {
  width: 80px;
  padding: 0.625rem;
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  text-align: center;
  background: var(--ion-background-color, #ffffff);
  color: var(--ion-text-color, #111827);
}

.form-input-number:focus {
  outline: none;
  border-color: var(--ion-color-secondary, #15803d);
}

.help-text {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
  margin: 0.25rem 0 0 0;
}

.help-text.error {
  color: var(--ion-color-danger, #ef4444);
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--ion-border-color, #e5e7eb);
}

.btn {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.875rem;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn-primary {
  flex: 1;
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
