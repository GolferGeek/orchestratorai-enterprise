<script setup lang="ts">
import { ref, computed, watch } from 'vue';

/**
 * OHLCVInput Component
 *
 * A form component for entering OHLCV (Open, High, Low, Close, Volume) price data.
 * Includes validation to ensure high >= max(open, close) and low <= min(open, close).
 */

interface OHLCVData {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface Props {
  /** Current OHLCV values */
  modelValue: OHLCVData;
  /** Whether inputs are disabled */
  disabled?: boolean;
  /** Whether to show volume input */
  showVolume?: boolean;
  /** Label for the component */
  label?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  showVolume: true,
  label: '',
  size: 'md',
});

const emit = defineEmits<{
  'update:modelValue': [value: OHLCVData];
  valid: [isValid: boolean];
}>();

// Local state for validation
const touched = ref({
  open: false,
  high: false,
  low: false,
  close: false,
  volume: false,
});

// Validation
const validation = computed(() => {
  const { open, high, low, close } = props.modelValue;
  const errors: string[] = [];

  // Required fields check
  if (open === null || open === undefined)
    errors.push('Open price is required');
  if (high === null || high === undefined)
    errors.push('High price is required');
  if (low === null || low === undefined) errors.push('Low price is required');
  if (close === null || close === undefined)
    errors.push('Close price is required');

  // OHLCV logic validation
  if (
    open !== null &&
    high !== null &&
    low !== null &&
    close !== null
  ) {
    // High must be >= max(open, close)
    if (high < Math.max(open, close)) {
      errors.push('High must be >= max(open, close)');
    }

    // Low must be <= min(open, close)
    if (low > Math.min(open, close)) {
      errors.push('Low must be <= min(open, close)');
    }

    // High must be >= Low
    if (high < low) {
      errors.push('High must be >= Low');
    }

    // Positive values
    if (open < 0) errors.push('Open must be positive');
    if (high < 0) errors.push('High must be positive');
    if (low < 0) errors.push('Low must be positive');
    if (close < 0) errors.push('Close must be positive');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
});

// Watch validation and emit
watch(
  () => validation.value.isValid,
  (isValid) => {
    emit('valid', isValid);
  },
  { immediate: true }
);

// Field-level error checking
function getFieldError(field: keyof OHLCVData): string | null {
  if (!touched.value[field]) return null;

  const value = props.modelValue[field];
  if (value === null || value === undefined) {
    return `${field.charAt(0).toUpperCase() + field.slice(1)} is required`;
  }
  if (value < 0) {
    return `${field.charAt(0).toUpperCase() + field.slice(1)} must be positive`;
  }
  return null;
}

// Update handlers
function updateField(field: keyof OHLCVData, value: string) {
  touched.value[field] = true;
  const numValue = value === '' ? null : parseFloat(value);

  emit('update:modelValue', {
    ...props.modelValue,
    [field]: numValue,
  });
}

// Helper to format number for input
function formatValue(value: number | null): string {
  if (value === null || value === undefined) return '';
  return value.toString();
}

// Quick fill helpers
function autofillHigh() {
  const { open, close } = props.modelValue;
  if (open !== null && close !== null) {
    const suggestedHigh = Math.max(open, close) * 1.02; // 2% above max
    emit('update:modelValue', {
      ...props.modelValue,
      high: parseFloat(suggestedHigh.toFixed(2)),
    });
    touched.value.high = true;
  }
}

function autofillLow() {
  const { open, close } = props.modelValue;
  if (open !== null && close !== null) {
    const suggestedLow = Math.min(open, close) * 0.98; // 2% below min
    emit('update:modelValue', {
      ...props.modelValue,
      low: parseFloat(suggestedLow.toFixed(2)),
    });
    touched.value.low = true;
  }
}
</script>

<template>
  <div :class="['ohlcv-input', `ohlcv-input--${size}`]">
    <div v-if="label" class="ohlcv-input__label">{{ label }}</div>

    <div class="ohlcv-input__grid">
      <!-- Open -->
      <div class="ohlcv-input__field">
        <label class="ohlcv-input__field-label">Open</label>
        <input
          type="number"
          step="0.01"
          min="0"
          :value="formatValue(modelValue.open)"
          :disabled="disabled"
          :class="{ 'ohlcv-input__field-input--error': getFieldError('open') }"
          class="ohlcv-input__field-input"
          placeholder="0.00"
          @input="updateField('open', ($event.target as HTMLInputElement).value)"
          @blur="touched.open = true"
        />
        <span v-if="getFieldError('open')" class="ohlcv-input__field-error">
          {{ getFieldError('open') }}
        </span>
      </div>

      <!-- High -->
      <div class="ohlcv-input__field">
        <label class="ohlcv-input__field-label">
          High
          <button
            v-if="!disabled && modelValue.open !== null && modelValue.close !== null"
            type="button"
            class="ohlcv-input__autofill"
            title="Auto-fill (2% above max)"
            @click="autofillHigh"
          >
            Auto
          </button>
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          :value="formatValue(modelValue.high)"
          :disabled="disabled"
          :class="{ 'ohlcv-input__field-input--error': getFieldError('high') }"
          class="ohlcv-input__field-input"
          placeholder="0.00"
          @input="updateField('high', ($event.target as HTMLInputElement).value)"
          @blur="touched.high = true"
        />
        <span v-if="getFieldError('high')" class="ohlcv-input__field-error">
          {{ getFieldError('high') }}
        </span>
      </div>

      <!-- Low -->
      <div class="ohlcv-input__field">
        <label class="ohlcv-input__field-label">
          Low
          <button
            v-if="!disabled && modelValue.open !== null && modelValue.close !== null"
            type="button"
            class="ohlcv-input__autofill"
            title="Auto-fill (2% below min)"
            @click="autofillLow"
          >
            Auto
          </button>
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          :value="formatValue(modelValue.low)"
          :disabled="disabled"
          :class="{ 'ohlcv-input__field-input--error': getFieldError('low') }"
          class="ohlcv-input__field-input"
          placeholder="0.00"
          @input="updateField('low', ($event.target as HTMLInputElement).value)"
          @blur="touched.low = true"
        />
        <span v-if="getFieldError('low')" class="ohlcv-input__field-error">
          {{ getFieldError('low') }}
        </span>
      </div>

      <!-- Close -->
      <div class="ohlcv-input__field">
        <label class="ohlcv-input__field-label">Close</label>
        <input
          type="number"
          step="0.01"
          min="0"
          :value="formatValue(modelValue.close)"
          :disabled="disabled"
          :class="{ 'ohlcv-input__field-input--error': getFieldError('close') }"
          class="ohlcv-input__field-input"
          placeholder="0.00"
          @input="updateField('close', ($event.target as HTMLInputElement).value)"
          @blur="touched.close = true"
        />
        <span v-if="getFieldError('close')" class="ohlcv-input__field-error">
          {{ getFieldError('close') }}
        </span>
      </div>

      <!-- Volume (optional) -->
      <div v-if="showVolume" class="ohlcv-input__field ohlcv-input__field--volume">
        <label class="ohlcv-input__field-label">Volume</label>
        <input
          type="number"
          step="1"
          min="0"
          :value="formatValue(modelValue.volume)"
          :disabled="disabled"
          class="ohlcv-input__field-input"
          placeholder="0"
          @input="updateField('volume', ($event.target as HTMLInputElement).value)"
          @blur="touched.volume = true"
        />
      </div>
    </div>

    <!-- Validation errors -->
    <div
      v-if="!validation.isValid && Object.values(touched).some(Boolean)"
      class="ohlcv-input__errors"
    >
      <div
        v-for="error in validation.errors"
        :key="error"
        class="ohlcv-input__error"
      >
        {{ error }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ohlcv-input {
  width: 100%;
}

.ohlcv-input__label {
  font-weight: 600;
  font-size: 0.875rem;
  color: #374151;
  margin-bottom: 0.5rem;
}

.ohlcv-input__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.ohlcv-input__field--volume {
  grid-column: span 4;
}

.ohlcv-input__field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.ohlcv-input__autofill {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--ion-color-secondary-shade, #166534);
  background: rgba(21, 128, 61, 0.06);
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ohlcv-input__autofill:hover {
  background: rgba(21, 128, 61, 0.15);
}

.ohlcv-input__field-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.ohlcv-input__field-input:focus {
  border-color: var(--ion-color-secondary-shade, #166534);
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

.ohlcv-input__field-input:disabled {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.ohlcv-input__field-input--error {
  border-color: #dc2626;
}

.ohlcv-input__field-input--error:focus {
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}

.ohlcv-input__field-error {
  display: block;
  font-size: 0.75rem;
  color: #dc2626;
  margin-top: 0.25rem;
}

.ohlcv-input__errors {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.375rem;
}

.ohlcv-input__error {
  font-size: 0.75rem;
  color: #dc2626;
}

/* Size variants */
.ohlcv-input--sm .ohlcv-input__field-input {
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
}

.ohlcv-input--lg .ohlcv-input__field-input {
  padding: 0.625rem 1rem;
  font-size: 1rem;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .ohlcv-input__label {
    color: #e5e7eb;
  }

  .ohlcv-input__field-label {
    color: #9ca3af;
  }

  .ohlcv-input__field-input {
    background: #1f2937;
    border-color: #4b5563;
    color: #e5e7eb;
  }

  .ohlcv-input__field-input:focus {
    border-color: #15803d;
    box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.2);
  }

  .ohlcv-input__field-input:disabled {
    background: #111827;
    color: #6b7280;
  }

  .ohlcv-input__autofill {
    background: rgba(21, 128, 61, 0.2);
    color: #22c55e;
  }

  .ohlcv-input__autofill:hover {
    background: rgba(21, 128, 61, 0.3);
  }

  .ohlcv-input__errors {
    background: rgba(220, 38, 38, 0.1);
    border-color: rgba(220, 38, 38, 0.3);
  }
}
</style>
