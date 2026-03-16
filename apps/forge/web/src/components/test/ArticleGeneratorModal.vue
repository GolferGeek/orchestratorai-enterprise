<script setup lang="ts">
/**
 * ArticleGeneratorModal Component
 *
 * Modal dialog for AI-powered test article generation.
 * Allows users to generate synthetic articles using Claude AI.
 */

import { ref, computed } from 'vue';
import TestSymbolBadge from './TestSymbolBadge.vue';
import { predictionDashboardService } from '@/services/predictionDashboardService';
import type { GenerateTestArticleParams, TestArticle, TestScenario } from '@/services/predictionDashboardService';

interface Props {
  modelValue: boolean;
  availableSymbols: string[];
  scenarios?: TestScenario[];
}

const props = withDefaults(defineProps<Props>(), {
  scenarios: () => [],
});

interface GenerationMetadata {
  model_used: string;
  tokens_used: number;
  generation_time_ms: number;
}

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  generated: [articles: TestArticle[], metadata: GenerationMetadata];
}>();

// Form state
const formData = ref<GenerateTestArticleParams>({
  target_symbols: [],
  scenario_type: 'earnings_beat',
  sentiment: 'bullish',
  strength: 'moderate',
  custom_prompt: '',
  article_count: 1,
  scenario_id: '',
});

// Generation state
const isGenerating = ref(false);
const generatedArticles = ref<TestArticle[]>([]);
const generationMetadata = ref<GenerationMetadata | null>(null);
const error = ref<string | null>(null);

// Symbol selector state
const newSymbol = ref('');

// Scenario type options
const scenarioTypeOptions = [
  { value: 'earnings_beat', label: 'Earnings Beat', description: 'Company exceeds earnings expectations' },
  { value: 'earnings_miss', label: 'Earnings Miss', description: 'Company misses earnings expectations' },
  { value: 'scandal', label: 'Scandal', description: 'Corporate scandal or misconduct' },
  { value: 'regulatory', label: 'Regulatory', description: 'Regulatory action or policy change' },
  { value: 'acquisition', label: 'Acquisition', description: 'M&A announcement' },
  { value: 'macro_shock', label: 'Macro Shock', description: 'Major economic or geopolitical event' },
  { value: 'technical', label: 'Technical', description: 'Technical analysis signal' },
  { value: 'custom', label: 'Custom', description: 'Custom scenario with your own prompt' },
];

// Form validation
const isFormValid = computed(() => {
  if (formData.value.target_symbols.length === 0) return false;
  if (!formData.value.scenario_type) return false;
  if (!formData.value.sentiment) return false;
  if (!formData.value.strength) return false;
  if (formData.value.scenario_type === 'custom' && !formData.value.custom_prompt?.trim()) return false;
  if (!formData.value.article_count || formData.value.article_count < 1 || formData.value.article_count > 10) return false;
  return true;
});

// Symbol management
function addSymbol() {
  let symbol = newSymbol.value.trim().toUpperCase();

  // Auto-add T_ prefix if not present
  if (symbol && !symbol.startsWith('T_')) {
    symbol = `T_${symbol}`;
  }

  if (symbol && !formData.value.target_symbols.includes(symbol)) {
    formData.value.target_symbols.push(symbol);
  }
  newSymbol.value = '';
}

function removeSymbol(symbol: string) {
  formData.value.target_symbols = formData.value.target_symbols.filter((s) => s !== symbol);
}

function selectExistingSymbol(symbol: string) {
  if (!formData.value.target_symbols.includes(symbol)) {
    formData.value.target_symbols.push(symbol);
  }
}

// Available symbols excluding already selected
const availableSymbolsFiltered = computed(() => {
  return props.availableSymbols.filter((s) => !formData.value.target_symbols.includes(s));
});

// Generate articles
async function generateArticles() {
  if (!isFormValid.value) return;

  isGenerating.value = true;
  error.value = null;
  generatedArticles.value = [];
  generationMetadata.value = null;

  try {
    const result = await predictionDashboardService.generateTestArticle(formData.value);

    if (result.content) {
      generatedArticles.value = result.content.articles;
      generationMetadata.value = result.content.generation_metadata;
      emit('generated', result.content.articles, result.content.generation_metadata);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to generate articles';
  } finally {
    isGenerating.value = false;
  }
}

// Close modal
function closeModal() {
  emit('update:modelValue', false);

  // Reset form after a delay to avoid visual glitches
  setTimeout(() => {
    formData.value = {
      target_symbols: [],
      scenario_type: 'earnings_beat',
      sentiment: 'bullish',
      strength: 'moderate',
      custom_prompt: '',
      article_count: 1,
      scenario_id: '',
    };
    generatedArticles.value = [];
    generationMetadata.value = null;
    error.value = null;
  }, 300);
}

// Get sentiment color
function getSentimentColor(sentiment: string): string {
  switch (sentiment) {
    case 'bullish':
      return '#10b981';
    case 'bearish':
      return '#ef4444';
    case 'neutral':
      return '#6b7280';
    case 'mixed':
      return '#8b5cf6';
    default:
      return '#9ca3af';
  }
}
</script>

<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="closeModal">
    <div class="modal modal--lg">
      <div class="modal__header">
        <h2>Generate Test Articles with AI</h2>
        <button class="modal__close" @click="closeModal">&times;</button>
      </div>

      <div class="modal__body">
        <!-- Target Symbols -->
        <div class="form-group">
          <label class="form-label">
            Target Symbols
            <span class="form-required">*</span>
          </label>

          <!-- Selected symbols -->
          <div v-if="formData.target_symbols.length" class="symbol-badges">
            <div
              v-for="symbol in formData.target_symbols"
              :key="symbol"
              class="symbol-badge-wrapper"
            >
              <TestSymbolBadge :test-symbol="symbol" size="sm" />
              <button
                type="button"
                class="symbol-remove"
                @click="removeSymbol(symbol)"
              >
                &times;
              </button>
            </div>
          </div>

          <!-- Add symbol -->
          <div class="symbol-add">
            <input
              v-model="newSymbol"
              type="text"
              class="form-input form-input--symbol"
              placeholder="Add symbol (e.g., AAPL)"
              @keydown.enter.prevent="addSymbol"
            />
            <button
              type="button"
              class="btn btn--sm btn--secondary"
              :disabled="!newSymbol.trim()"
              @click="addSymbol"
            >
              Add
            </button>
          </div>

          <!-- Available symbols -->
          <div v-if="availableSymbolsFiltered.length" class="available-symbols">
            <span class="form-hint">Or select existing:</span>
            <div class="symbol-chips">
              <button
                v-for="symbol in availableSymbolsFiltered"
                :key="symbol"
                type="button"
                class="symbol-chip"
                @click="selectExistingSymbol(symbol)"
              >
                {{ symbol }}
              </button>
            </div>
          </div>
        </div>

        <!-- Scenario Type -->
        <div class="form-group">
          <label class="form-label">
            Scenario Type
            <span class="form-required">*</span>
          </label>
          <select v-model="formData.scenario_type" class="form-select">
            <option
              v-for="option in scenarioTypeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }} - {{ option.description }}
            </option>
          </select>
        </div>

        <!-- Custom Prompt (conditional) -->
        <div v-if="formData.scenario_type === 'custom'" class="form-group">
          <label class="form-label">
            Custom Prompt
            <span class="form-required">*</span>
          </label>
          <textarea
            v-model="formData.custom_prompt"
            class="form-textarea"
            rows="3"
            placeholder="Describe the scenario you want to generate..."
          />
        </div>

        <!-- Sentiment -->
        <div class="form-group">
          <label class="form-label">
            Sentiment
            <span class="form-required">*</span>
          </label>
          <div class="sentiment-options">
            <label
              v-for="sentiment in ['bullish', 'bearish', 'neutral', 'mixed']"
              :key="sentiment"
              class="sentiment-option"
              :class="{ 'sentiment-option--selected': formData.sentiment === sentiment }"
            >
              <input
                type="radio"
                :value="sentiment"
                v-model="formData.sentiment"
                class="sr-only"
              />
              <span
                class="sentiment-dot"
                :style="{ backgroundColor: getSentimentColor(sentiment) }"
              />
              {{ sentiment.charAt(0).toUpperCase() + sentiment.slice(1) }}
            </label>
          </div>
        </div>

        <!-- Strength -->
        <div class="form-group">
          <label class="form-label">
            Strength
            <span class="form-required">*</span>
          </label>
          <div class="strength-options">
            <label
              v-for="strength in ['strong', 'moderate', 'weak']"
              :key="strength"
              class="strength-option"
              :class="{ 'strength-option--selected': formData.strength === strength }"
            >
              <input
                type="radio"
                :value="strength"
                v-model="formData.strength"
                class="sr-only"
              />
              {{ strength.charAt(0).toUpperCase() + strength.slice(1) }}
            </label>
          </div>
        </div>

        <!-- Article Count & Scenario -->
        <div class="form-row">
          <div class="form-group form-group--half">
            <label class="form-label">
              Article Count
              <span class="form-required">*</span>
            </label>
            <input
              v-model.number="formData.article_count"
              type="number"
              min="1"
              max="10"
              class="form-input"
            />
            <span class="form-hint">1-10 articles</span>
          </div>

          <div class="form-group form-group--half">
            <label class="form-label">Associate with Scenario (Optional)</label>
            <select v-model="formData.scenario_id" class="form-select">
              <option value="">None</option>
              <option
                v-for="scenario in scenarios"
                :key="scenario.id"
                :value="scenario.id"
              >
                {{ scenario.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Generation Status -->
        <div v-if="isGenerating" class="generating-status">
          <div class="spinner" />
          <p>Generating articles with AI... This may take a few seconds.</p>
        </div>

        <!-- Preview Generated Articles -->
        <div v-if="generatedArticles.length > 0" class="preview-section">
          <h3>Generated Articles Preview</h3>
          <div class="preview-stats">
            <span>{{ generatedArticles.length }} articles generated</span>
            <span class="stat-divider">|</span>
            <span>Model: {{ generationMetadata?.model_used }}</span>
            <span class="stat-divider">|</span>
            <span>Tokens: {{ generationMetadata?.tokens_used }}</span>
            <span class="stat-divider">|</span>
            <span>Time: {{ generationMetadata?.generation_time_ms }}ms</span>
          </div>

          <div class="preview-articles">
            <div
              v-for="(article, index) in generatedArticles"
              :key="index"
              class="preview-article"
            >
              <div class="preview-article__header">
                <h4>{{ article.title }}</h4>
                <span
                  class="sentiment-badge"
                  :style="{ backgroundColor: getSentimentColor(article.sentiment || 'neutral') }"
                >
                  {{ article.sentiment || 'neutral' }}
                </span>
              </div>
              <p class="preview-article__content">
                {{ article.content.slice(0, 200) }}{{ article.content.length > 200 ? '...' : '' }}
              </p>
              <div class="preview-article__symbols">
                <TestSymbolBadge
                  v-for="symbol in article.target_symbols"
                  :key="symbol"
                  :test-symbol="symbol"
                  size="sm"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Error Display -->
        <div v-if="error" class="error-message">
          <p>{{ error }}</p>
          <button @click="error = null">Dismiss</button>
        </div>
      </div>

      <div class="modal__actions">
        <button class="btn btn--secondary" @click="closeModal">
          {{ generatedArticles.length > 0 ? 'Done' : 'Cancel' }}
        </button>
        <button
          v-if="generatedArticles.length === 0"
          class="btn btn--primary"
          :disabled="!isFormValid || isGenerating"
          @click="generateArticles"
        >
          {{ isGenerating ? 'Generating...' : 'Generate Articles' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 2rem;
}

.modal {
  background: white;
  padding: 0;
  border-radius: 0.5rem;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal--lg {
  max-width: 800px;
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal__header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.modal__close {
  font-size: 1.5rem;
  color: #6b7280;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  transition: all 0.15s ease;
}

.modal__close:hover {
  background: #f3f4f6;
  color: #111827;
}

.modal__body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

/* Form Styles */
.form-group {
  margin-bottom: 1.25rem;
}

.form-group--half {
  flex: 1;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.form-required {
  color: #dc2626;
}

.form-input,
.form-select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.form-input:focus,
.form-select:focus {
  border-color: var(--ion-color-secondary-shade, #166534);
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

.form-input--symbol {
  flex: 1;
}

.form-textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  outline: none;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.form-textarea:focus {
  border-color: var(--ion-color-secondary-shade, #166534);
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

.form-hint {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

/* Symbol Management */
.symbol-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.symbol-badge-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.symbol-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  color: white;
  background: #dc2626;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.symbol-remove:hover {
  background: #b91c1c;
  transform: scale(1.1);
}

.symbol-add {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.available-symbols {
  margin-top: 0.5rem;
}

.symbol-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.375rem;
}

.symbol-chip {
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

.symbol-chip:hover {
  background: #e5e7eb;
}

/* Sentiment & Strength Options */
.sentiment-options,
.strength-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.sentiment-option,
.strength-option {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sentiment-option:hover,
.strength-option:hover {
  background: #f9fafb;
}

.sentiment-option--selected,
.strength-option--selected {
  background: rgba(21, 128, 61, 0.06);
  border-color: var(--ion-color-secondary-shade, #166534);
  font-weight: 500;
}

.sentiment-dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
}

.sentiment-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
}

/* Generation Status */
.generating-status {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  background: rgba(21, 128, 61, 0.06);
  border: 1px solid rgba(21, 128, 61, 0.3);
  border-radius: 0.5rem;
  margin: 1rem 0;
}

.generating-status p {
  margin: 0;
  color: #15803d;
  font-size: 0.875rem;
}

.spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid rgba(21, 128, 61, 0.3);
  border-top-color: var(--ion-color-secondary-shade, #166534);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Preview Section */
.preview-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.preview-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
}

.preview-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 1rem;
}

.stat-divider {
  color: #d1d5db;
}

.preview-articles {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.preview-article {
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.375rem;
  border: 1px solid #e5e7eb;
}

.preview-article__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.preview-article__header h4 {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
  color: #111827;
  flex: 1;
}

.preview-article__content {
  font-size: 0.75rem;
  color: #4b5563;
  line-height: 1.5;
  margin: 0 0 0.5rem;
}

.preview-article__symbols {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

/* Error Message */
.error-message {
  padding: 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.5rem;
  margin-top: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error-message p {
  margin: 0;
  color: #dc2626;
  font-size: 0.875rem;
}

.error-message button {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  color: #dc2626;
  background: white;
  border: 1px solid #fecaca;
  border-radius: 0.25rem;
  cursor: pointer;
}

/* Buttons */
.btn {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn--primary {
  background: var(--ion-color-secondary-shade, #166534);
  color: white;
}

.btn--primary:hover:not(:disabled) {
  background: #15803d;
}

.btn--secondary {
  background: white;
  color: #374151;
  border: 1px solid #e5e7eb;
}

.btn--secondary:hover {
  background: #f9fafb;
}

.btn--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .modal {
    background: #1f2937;
  }

  .modal__header,
  .modal__actions {
    border-color: #4b5563;
  }

  .modal__header h2 {
    color: #f9fafb;
  }

  .form-label {
    color: #e5e7eb;
  }

  .form-input,
  .form-select,
  .form-textarea {
    background: #374151;
    border-color: #4b5563;
    color: #e5e7eb;
  }

  .sentiment-option,
  .strength-option {
    border-color: #4b5563;
    color: #e5e7eb;
  }

  .sentiment-option:hover,
  .strength-option:hover {
    background: #374151;
  }

  .sentiment-option--selected,
  .strength-option--selected {
    background: rgba(21, 128, 61, 0.2);
    border-color: #15803d;
  }

  .preview-article {
    background: #374151;
    border-color: #4b5563;
  }

  .preview-article__header h4 {
    color: #f9fafb;
  }

  .preview-article__content {
    color: #d1d5db;
  }

  .btn--secondary {
    background: #374151;
    color: #e5e7eb;
    border-color: #4b5563;
  }

  .btn--secondary:hover {
    background: #4b5563;
  }
}
</style>
