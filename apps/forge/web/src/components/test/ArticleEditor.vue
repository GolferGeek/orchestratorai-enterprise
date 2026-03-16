<script setup lang="ts">
/**
 * ArticleEditor Component
 *
 * A form component for creating/editing synthetic test articles.
 * Includes fields for title, content, target symbols, sentiment, and metadata.
 */

import { ref, computed, watch } from 'vue';
import TestSymbolBadge from './TestSymbolBadge.vue';

interface ArticleData {
  title: string;
  content: string;
  target_symbols: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' | null;
  expected_signal_count: number | null;
  source_name: string;
  source_type: string;
  published_at: string | null;
}

interface Props {
  /** Current article data */
  modelValue: ArticleData;
  /** Whether form is disabled */
  disabled?: boolean;
  /** Available target symbols (T_ prefixed) */
  availableSymbols?: string[];
  /** Whether this is editing an existing article */
  isEdit?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  availableSymbols: () => [],
  isEdit: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: ArticleData];
  valid: [isValid: boolean];
}>();

// Local state
const newSymbol = ref('');
const touched = ref({
  title: false,
  content: false,
  target_symbols: false,
});

// Validation
const validation = computed(() => {
  const { title, content, target_symbols } = props.modelValue;
  const errors: string[] = [];

  if (!title || title.trim().length === 0) {
    errors.push('Title is required');
  }

  if (!content || content.trim().length === 0) {
    errors.push('Content is required');
  }

  if (!target_symbols || target_symbols.length === 0) {
    errors.push('At least one target symbol is required');
  }

  // Validate all symbols have T_ prefix
  for (const symbol of target_symbols || []) {
    if (!symbol.startsWith('T_')) {
      errors.push(`Symbol "${symbol}" must have T_ prefix`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
});

// Watch validation
watch(
  () => validation.value.isValid,
  (isValid) => emit('valid', isValid),
  { immediate: true }
);

// Update handlers
function updateField<K extends keyof ArticleData>(field: K, value: ArticleData[K]) {
  if (field in touched.value) {
    touched.value[field as keyof typeof touched.value] = true;
  }
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  });
}

// Symbol management
function addSymbol() {
  let symbol = newSymbol.value.trim().toUpperCase();

  // Auto-add T_ prefix if not present
  if (symbol && !symbol.startsWith('T_')) {
    symbol = `T_${symbol}`;
  }

  if (symbol && !props.modelValue.target_symbols.includes(symbol)) {
    updateField('target_symbols', [...props.modelValue.target_symbols, symbol]);
  }
  newSymbol.value = '';
  touched.value.target_symbols = true;
}

function removeSymbol(symbol: string) {
  updateField(
    'target_symbols',
    props.modelValue.target_symbols.filter((s) => s !== symbol)
  );
  touched.value.target_symbols = true;
}

function selectExistingSymbol(symbol: string) {
  if (!props.modelValue.target_symbols.includes(symbol)) {
    updateField('target_symbols', [...props.modelValue.target_symbols, symbol]);
  }
  touched.value.target_symbols = true;
}

// Sentiment options
const sentimentOptions = [
  { value: 'bullish', label: 'Bullish', color: '#10b981' },
  { value: 'bearish', label: 'Bearish', color: '#ef4444' },
  { value: 'neutral', label: 'Neutral', color: '#6b7280' },
  { value: 'mixed', label: 'Mixed', color: '#8b5cf6' },
];

// Source type options
const sourceTypeOptions = [
  'web',
  'rss',
  'twitter_search',
  'api',
  'synthetic',
  'manual',
];
</script>

<template>
  <div class="article-editor">
    <!-- Title -->
    <div class="article-editor__field">
      <label class="article-editor__label">
        Title
        <span class="article-editor__required">*</span>
      </label>
      <input
        type="text"
        :value="modelValue.title"
        :disabled="disabled"
        class="article-editor__input"
        :class="{ 'article-editor__input--error': touched.title && !modelValue.title }"
        placeholder="Enter article title..."
        @input="updateField('title', ($event.target as HTMLInputElement).value)"
        @blur="touched.title = true"
      />
    </div>

    <!-- Content -->
    <div class="article-editor__field">
      <label class="article-editor__label">
        Content
        <span class="article-editor__required">*</span>
      </label>
      <textarea
        :value="modelValue.content"
        :disabled="disabled"
        class="article-editor__textarea"
        :class="{ 'article-editor__textarea--error': touched.content && !modelValue.content }"
        placeholder="Enter article content..."
        rows="6"
        @input="updateField('content', ($event.target as HTMLTextAreaElement).value)"
        @blur="touched.content = true"
      />
      <div class="article-editor__hint">
        {{ modelValue.content?.length || 0 }} characters
      </div>
    </div>

    <!-- Target Symbols -->
    <div class="article-editor__field">
      <label class="article-editor__label">
        Target Symbols
        <span class="article-editor__required">*</span>
      </label>

      <!-- Current symbols -->
      <div v-if="modelValue.target_symbols.length" class="article-editor__symbols">
        <TestSymbolBadge
          v-for="symbol in modelValue.target_symbols"
          :key="symbol"
          :test-symbol="symbol"
          size="sm"
        />
        <button
          v-for="symbol in modelValue.target_symbols"
          :key="`remove-${symbol}`"
          type="button"
          class="article-editor__symbol-remove"
          :disabled="disabled"
          @click="removeSymbol(symbol)"
        >
          <span class="sr-only">Remove {{ symbol }}</span>
          &times;
        </button>
      </div>

      <!-- Add new symbol -->
      <div class="article-editor__symbol-add">
        <input
          v-model="newSymbol"
          type="text"
          :disabled="disabled"
          class="article-editor__input article-editor__input--symbol"
          placeholder="Add symbol (e.g., AAPL)"
          @keydown.enter.prevent="addSymbol"
        />
        <button
          type="button"
          :disabled="disabled || !newSymbol.trim()"
          class="article-editor__btn article-editor__btn--secondary"
          @click="addSymbol"
        >
          Add
        </button>
      </div>

      <!-- Available symbols dropdown -->
      <div v-if="availableSymbols.length" class="article-editor__available-symbols">
        <span class="article-editor__hint">Or select existing:</span>
        <div class="article-editor__symbol-chips">
          <button
            v-for="symbol in availableSymbols"
            :key="symbol"
            type="button"
            :disabled="disabled || modelValue.target_symbols.includes(symbol)"
            class="article-editor__symbol-chip"
            @click="selectExistingSymbol(symbol)"
          >
            {{ symbol }}
          </button>
        </div>
      </div>
    </div>

    <!-- Sentiment -->
    <div class="article-editor__field">
      <label class="article-editor__label">Sentiment</label>
      <div class="article-editor__sentiment-options">
        <label
          v-for="option in sentimentOptions"
          :key="option.value"
          class="article-editor__sentiment-option"
          :class="{
            'article-editor__sentiment-option--selected':
              modelValue.sentiment === option.value,
          }"
        >
          <input
            type="radio"
            :value="option.value"
            :checked="modelValue.sentiment === option.value"
            :disabled="disabled"
            class="sr-only"
            @change="updateField('sentiment', option.value as ArticleData['sentiment'])"
          />
          <span
            class="article-editor__sentiment-dot"
            :style="{ backgroundColor: option.color }"
          />
          {{ option.label }}
        </label>
      </div>
    </div>

    <!-- Expected Signal Count -->
    <div class="article-editor__field article-editor__field--half">
      <label class="article-editor__label">Expected Signal Count</label>
      <input
        type="number"
        min="0"
        :value="modelValue.expected_signal_count ?? ''"
        :disabled="disabled"
        class="article-editor__input"
        placeholder="Optional"
        @input="
          updateField(
            'expected_signal_count',
            ($event.target as HTMLInputElement).value
              ? parseInt(($event.target as HTMLInputElement).value)
              : null
          )
        "
      />
    </div>

    <!-- Source Name & Type -->
    <div class="article-editor__row">
      <div class="article-editor__field article-editor__field--half">
        <label class="article-editor__label">Source Name</label>
        <input
          type="text"
          :value="modelValue.source_name"
          :disabled="disabled"
          class="article-editor__input"
          placeholder="e.g., Reuters"
          @input="updateField('source_name', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="article-editor__field article-editor__field--half">
        <label class="article-editor__label">Source Type</label>
        <select
          :value="modelValue.source_type"
          :disabled="disabled"
          class="article-editor__select"
          @change="updateField('source_type', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Select type...</option>
          <option v-for="type in sourceTypeOptions" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
      </div>
    </div>

    <!-- Published At -->
    <div class="article-editor__field article-editor__field--half">
      <label class="article-editor__label">Published At</label>
      <input
        type="datetime-local"
        :value="modelValue.published_at?.slice(0, 16) || ''"
        :disabled="disabled"
        class="article-editor__input"
        @input="
          updateField(
            'published_at',
            ($event.target as HTMLInputElement).value
              ? new Date(($event.target as HTMLInputElement).value).toISOString()
              : null
          )
        "
      />
    </div>

    <!-- Validation Errors -->
    <div
      v-if="!validation.isValid && Object.values(touched).some(Boolean)"
      class="article-editor__errors"
    >
      <div
        v-for="error in validation.errors"
        :key="error"
        class="article-editor__error"
      >
        {{ error }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.article-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.article-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.article-editor__field--half {
  max-width: 50%;
}

.article-editor__row {
  display: flex;
  gap: 1rem;
}

.article-editor__label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.article-editor__required {
  color: #dc2626;
}

.article-editor__input,
.article-editor__select {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.article-editor__input:focus,
.article-editor__select:focus {
  border-color: var(--ion-color-secondary-shade, #166534);
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

.article-editor__input--error,
.article-editor__textarea--error {
  border-color: #dc2626;
}

.article-editor__input--symbol {
  flex: 1;
}

.article-editor__textarea {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  outline: none;
  resize: vertical;
  min-height: 120px;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.article-editor__textarea:focus {
  border-color: var(--ion-color-secondary-shade, #166534);
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

.article-editor__hint {
  font-size: 0.75rem;
  color: #6b7280;
}

.article-editor__symbols {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.article-editor__symbol-remove {
  padding: 0.125rem 0.375rem;
  font-size: 1rem;
  color: #6b7280;
  background: #f3f4f6;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
}

.article-editor__symbol-remove:hover {
  background: #fee2e2;
  color: #dc2626;
}

.article-editor__symbol-add {
  display: flex;
  gap: 0.5rem;
}

.article-editor__btn {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.article-editor__btn--secondary {
  background: #f3f4f6;
  color: #374151;
}

.article-editor__btn--secondary:hover:not(:disabled) {
  background: #e5e7eb;
}

.article-editor__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.article-editor__available-symbols {
  margin-top: 0.5rem;
}

.article-editor__symbol-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.25rem;
}

.article-editor__symbol-chip {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #374151;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.article-editor__symbol-chip:hover:not(:disabled) {
  background: #e5e7eb;
}

.article-editor__symbol-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.article-editor__sentiment-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.article-editor__sentiment-option {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.article-editor__sentiment-option:hover {
  background: #f9fafb;
}

.article-editor__sentiment-option--selected {
  background: rgba(21, 128, 61, 0.06);
  border-color: var(--ion-color-secondary-shade, #166534);
}

.article-editor__sentiment-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.article-editor__errors {
  padding: 0.75rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.375rem;
}

.article-editor__error {
  font-size: 0.875rem;
  color: #dc2626;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .article-editor__label {
    color: #e5e7eb;
  }

  .article-editor__input,
  .article-editor__select,
  .article-editor__textarea {
    background: #1f2937;
    border-color: #4b5563;
    color: #e5e7eb;
  }

  .article-editor__btn--secondary {
    background: #374151;
    color: #e5e7eb;
  }

  .article-editor__btn--secondary:hover:not(:disabled) {
    background: #4b5563;
  }

  .article-editor__symbol-chip {
    background: #374151;
    border-color: #4b5563;
    color: #e5e7eb;
  }

  .article-editor__symbol-chip:hover:not(:disabled) {
    background: #4b5563;
  }

  .article-editor__sentiment-option {
    border-color: #4b5563;
    color: #e5e7eb;
  }

  .article-editor__sentiment-option:hover {
    background: #374151;
  }

  .article-editor__sentiment-option--selected {
    background: rgba(21, 128, 61, 0.2);
    border-color: #15803d;
  }
}
</style>
