<script setup lang="ts">
/**
 * CreateScenarioFromSourceModal Component
 *
 * Modal for creating test scenarios from real-world events:
 * - Missed opportunities (moves we didn't catch)
 * - Learnings (patterns we've identified)
 *
 * Generates scenario with articles and price data to replay the event.
 */

import { ref, computed, watch } from 'vue';
import TestSymbolBadge from './TestSymbolBadge.vue';
import { predictionDashboardService } from '@/services/predictionDashboardService';
import type {
  MissedOpportunity,
  PredictionLearning,
  TestScenario,
  TestArticle,
  TestPriceData,
} from '@/services/predictionDashboardService';

interface Props {
  modelValue: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  created: [scenarioId: string];
}>();

// Tab state
type SourceType = 'missed' | 'learning';
const sourceType = ref<SourceType>('missed');

// Source selection
const selectedSourceId = ref('');
const searchQuery = ref('');

// Options
const options = ref({
  includeVariations: false,
  variationCount: 3,
  articleCount: 5,
  additionalContext: '',
});

// Data
const missedOpportunities = ref<MissedOpportunity[]>([]);
const learnings = ref<PredictionLearning[]>([]);
const isLoadingSources = ref(false);
const sourcesError = ref<string | null>(null);

// Generation state
const isGenerating = ref(false);
const generatedScenario = ref<{
  scenario: TestScenario;
  articles: TestArticle[];
  priceData: TestPriceData[];
  sourceType: string;
  sourceId: string;
  realTargetSymbol: string;
  testTargetSymbol: string;
} | null>(null);
const error = ref<string | null>(null);

// Load sources when modal opens or tab changes
watch([() => props.modelValue, sourceType], async ([isOpen]) => {
  if (isOpen) {
    await loadSources();
  }
});

// Filtered sources based on search
const filteredMissedOpportunities = computed(() => {
  if (!searchQuery.value.trim()) return missedOpportunities.value;
  const query = searchQuery.value.toLowerCase();
  return missedOpportunities.value.filter((mo) =>
    mo.targetSymbol?.toLowerCase().includes(query) ||
    mo.targetName?.toLowerCase().includes(query) ||
    mo.id.toLowerCase().includes(query)
  );
});

const filteredLearnings = computed(() => {
  if (!searchQuery.value.trim()) return learnings.value;
  const query = searchQuery.value.toLowerCase();
  return learnings.value.filter((l) =>
    l.title.toLowerCase().includes(query) ||
    l.content.toLowerCase().includes(query) ||
    l.id.toLowerCase().includes(query)
  );
});

// Selected source details (for future use in preview)
const _selectedSource = computed(() => {
  if (sourceType.value === 'missed') {
    return missedOpportunities.value.find((mo) => mo.id === selectedSourceId.value);
  } else {
    return learnings.value.find((l) => l.id === selectedSourceId.value);
  }
});

// Form validation
const isFormValid = computed(() => {
  if (!selectedSourceId.value) return false;
  if (options.value.includeVariations && options.value.variationCount < 1) return false;
  if (options.value.articleCount < 1) return false;
  return true;
});

// Load sources
async function loadSources() {
  isLoadingSources.value = true;
  sourcesError.value = null;

  try {
    if (sourceType.value === 'missed') {
      const result = await predictionDashboardService.listMissedOpportunities({});
      if (result.content) {
        missedOpportunities.value = result.content;
      }
    } else {
      const result = await predictionDashboardService.listLearnings({});
      if (result.content) {
        learnings.value = result.content;
      }
    }
  } catch (err) {
    sourcesError.value = err instanceof Error ? err.message : 'Failed to load sources';
  } finally {
    isLoadingSources.value = false;
  }
}

// Select source
function selectSource(id: string) {
  selectedSourceId.value = id;
}

// Generate scenario
async function generateScenario() {
  if (!isFormValid.value) return;

  isGenerating.value = true;
  error.value = null;
  generatedScenario.value = null;

  try {
    let result;

    if (sourceType.value === 'missed') {
      result = await predictionDashboardService.generateScenarioFromMissed({
        missedOpportunityId: selectedSourceId.value,
        options: {
          includeVariations: options.value.includeVariations,
          variationCount: options.value.variationCount,
          articleCount: options.value.articleCount,
          additionalContext: options.value.additionalContext || undefined,
        },
      });
    } else {
      result = await predictionDashboardService.generateScenarioFromLearning({
        learningId: selectedSourceId.value,
        options: {
          includeVariations: options.value.includeVariations,
          variationCount: options.value.variationCount,
          articleCount: options.value.articleCount,
          additionalContext: options.value.additionalContext || undefined,
        },
      });
    }

    if (result.content) {
      generatedScenario.value = result.content;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to generate scenario';
  } finally {
    isGenerating.value = false;
  }
}

// Confirm and navigate
function confirmScenario() {
  if (generatedScenario.value) {
    emit('created', generatedScenario.value.scenario.id);
    closeModal();
  }
}

// Close modal
function closeModal() {
  emit('update:modelValue', false);

  // Reset after animation
  setTimeout(() => {
    sourceType.value = 'missed';
    selectedSourceId.value = '';
    searchQuery.value = '';
    options.value = {
      includeVariations: false,
      variationCount: 3,
      articleCount: 5,
      additionalContext: '',
    };
    generatedScenario.value = null;
    error.value = null;
  }, 300);
}

// Format date
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Format percentage
function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}
</script>

<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="closeModal">
    <div class="modal modal--lg">
      <div class="modal__header">
        <h2>Create Scenario from Real Event</h2>
        <button class="modal__close" @click="closeModal">&times;</button>
      </div>

      <div class="modal__body">
        <!-- Source Type Tabs -->
        <div v-if="!generatedScenario" class="tabs">
          <button
            :class="['tab', { 'tab--active': sourceType === 'missed' }]"
            @click="sourceType = 'missed'; selectedSourceId = ''; searchQuery = ''"
          >
            From Missed Opportunity
          </button>
          <button
            :class="['tab', { 'tab--active': sourceType === 'learning' }]"
            @click="sourceType = 'learning'; selectedSourceId = ''; searchQuery = ''"
          >
            From Learning
          </button>
        </div>

        <!-- Preview Generated Scenario -->
        <div v-if="generatedScenario" class="preview-section">
          <div class="preview-header">
            <h3>Scenario Generated Successfully</h3>
            <span class="preview-badge">Ready to Test</span>
          </div>

          <div class="preview-grid">
            <!-- Scenario Info -->
            <div class="preview-card">
              <h4>Scenario Details</h4>
              <dl class="preview-list">
                <dt>Name</dt>
                <dd>{{ generatedScenario.scenario.name }}</dd>
                <dt>Description</dt>
                <dd>{{ generatedScenario.scenario.description || '(none)' }}</dd>
                <dt>Source</dt>
                <dd>{{ generatedScenario.sourceType === 'missed' ? 'Missed Opportunity' : 'Learning' }}</dd>
              </dl>
            </div>

            <!-- Target Mapping -->
            <div class="preview-card">
              <h4>Target Mapping</h4>
              <div class="target-mapping">
                <div class="target-mapping__item">
                  <span class="target-mapping__label">Real Target</span>
                  <code class="target-mapping__symbol">{{ generatedScenario.realTargetSymbol }}</code>
                </div>
                <div class="target-mapping__arrow">→</div>
                <div class="target-mapping__item">
                  <span class="target-mapping__label">Test Target</span>
                  <TestSymbolBadge :test-symbol="generatedScenario.testTargetSymbol" size="md" />
                </div>
              </div>
            </div>

            <!-- Generated Data -->
            <div class="preview-card preview-card--full">
              <h4>Generated Test Data</h4>
              <div class="data-stats">
                <div class="data-stat">
                  <span class="data-stat__value">{{ generatedScenario.articles.length }}</span>
                  <span class="data-stat__label">Articles</span>
                </div>
                <div class="data-stat">
                  <span class="data-stat__value">{{ generatedScenario.priceData.length }}</span>
                  <span class="data-stat__label">Price Points</span>
                </div>
                <div class="data-stat">
                  <span class="data-stat__value">{{ generatedScenario.scenario.injection_points.length }}</span>
                  <span class="data-stat__label">Injection Points</span>
                </div>
              </div>
            </div>
          </div>

          <div class="preview-note">
            <strong>Next Steps:</strong> Navigate to the Test Lab to run this scenario through
            the prediction pipeline and validate the learning or missed opportunity fix.
          </div>
        </div>

        <!-- Source Selection & Options -->
        <div v-else>
          <!-- Search -->
          <div class="form-group">
            <label class="form-label">Search</label>
            <input
              v-model="searchQuery"
              type="text"
              class="form-input"
              :placeholder="`Search ${sourceType === 'missed' ? 'missed opportunities' : 'learnings'}...`"
            />
          </div>

          <!-- Loading State -->
          <div v-if="isLoadingSources" class="loading-state">
            <div class="spinner" />
            <p>Loading sources...</p>
          </div>

          <!-- Sources Error -->
          <div v-else-if="sourcesError" class="error-message">
            <p>{{ sourcesError }}</p>
            <button @click="loadSources">Retry</button>
          </div>

          <!-- Source List -->
          <div v-else class="source-list">
            <!-- Missed Opportunities -->
            <div v-if="sourceType === 'missed'" class="source-items">
              <div
                v-for="mo in filteredMissedOpportunities"
                :key="mo.id"
                :class="['source-item', { 'source-item--selected': selectedSourceId === mo.id }]"
                @click="selectSource(mo.id)"
              >
                <div class="source-item__header">
                  <div>
                    <span class="source-item__title">{{ mo.targetName }}</span>
                    <code class="source-item__symbol">{{ mo.targetSymbol }}</code>
                  </div>
                  <span
                    class="source-item__direction"
                    :class="`direction--${mo.direction}`"
                  >
                    {{ mo.direction === 'up' ? '↑' : '↓' }} {{ formatPercent(mo.movePercent) }}
                  </span>
                </div>
                <p class="source-item__meta">
                  {{ formatDate(mo.moveStartAt) }} → {{ formatDate(mo.moveEndAt) }}
                </p>
                <p v-if="mo.discoveredDrivers && mo.discoveredDrivers.length" class="source-item__drivers">
                  Drivers: {{ mo.discoveredDrivers.join(', ') }}
                </p>
              </div>

              <div v-if="filteredMissedOpportunities.length === 0" class="empty-state">
                No missed opportunities found.
              </div>
            </div>

            <!-- Learnings -->
            <div v-if="sourceType === 'learning'" class="source-items">
              <div
                v-for="learning in filteredLearnings"
                :key="learning.id"
                :class="['source-item', { 'source-item--selected': selectedSourceId === learning.id }]"
                @click="selectSource(learning.id)"
              >
                <div class="source-item__header">
                  <span class="source-item__title">{{ learning.title }}</span>
                  <span class="source-item__type">{{ learning.learningType }}</span>
                </div>
                <p class="source-item__content">{{ learning.content }}</p>
                <p class="source-item__meta">
                  {{ learning.scopeLevel }} · {{ formatDate(learning.createdAt) }}
                </p>
              </div>

              <div v-if="filteredLearnings.length === 0" class="empty-state">
                No learnings found.
              </div>
            </div>
          </div>

          <!-- Options Panel -->
          <div v-if="selectedSourceId" class="options-panel">
            <h3>Generation Options</h3>

            <div class="form-group">
              <label class="checkbox-label">
                <input
                  v-model="options.includeVariations"
                  type="checkbox"
                />
                Include variations of this scenario
              </label>
              <span class="form-hint">Generate multiple scenarios with different conditions</span>
            </div>

            <div v-if="options.includeVariations" class="form-group">
              <label class="form-label">Variation Count</label>
              <input
                v-model.number="options.variationCount"
                type="number"
                min="1"
                max="10"
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Article Count</label>
              <input
                v-model.number="options.articleCount"
                type="number"
                min="1"
                max="20"
                class="form-input"
              />
              <span class="form-hint">Number of synthetic articles to generate</span>
            </div>

            <div class="form-group">
              <label class="form-label">Additional Context (Optional)</label>
              <textarea
                v-model="options.additionalContext"
                class="form-textarea"
                rows="3"
                placeholder="Add any specific requirements or context for scenario generation..."
              />
            </div>
          </div>

          <!-- Error Display -->
          <div v-if="error" class="error-message">
            <p>{{ error }}</p>
            <button @click="error = null">Dismiss</button>
          </div>
        </div>
      </div>

      <div class="modal__actions">
        <button class="btn btn--secondary" @click="closeModal">
          {{ generatedScenario ? 'Close' : 'Cancel' }}
        </button>
        <button
          v-if="generatedScenario"
          class="btn btn--primary"
          @click="confirmScenario"
        >
          Go to Test Lab
        </button>
        <button
          v-else
          class="btn btn--primary"
          :disabled="!isFormValid || isGenerating"
          @click="generateScenario"
        >
          {{ isGenerating ? 'Generating...' : 'Generate Scenario' }}
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
  max-width: 700px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal--lg {
  max-width: 900px;
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

/* Tabs */
.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #e5e7eb;
}

.tab {
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab:hover {
  color: #111827;
}

.tab--active {
  color: var(--ion-color-secondary-shade, #166534);
  border-bottom-color: var(--ion-color-secondary-shade, #166534);
}

/* Form Elements */
.form-group {
  margin-bottom: 1.25rem;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.form-input:focus,
.form-textarea:focus {
  border-color: var(--ion-color-secondary-shade, #166534);
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.form-hint {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
}

/* Source List */
.source-list {
  margin-bottom: 1.5rem;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}

.source-items {
  display: flex;
  flex-direction: column;
}

.source-item {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  transition: background 0.15s ease;
}

.source-item:last-child {
  border-bottom: none;
}

.source-item:hover {
  background: #f9fafb;
}

.source-item--selected {
  background: rgba(21, 128, 61, 0.06);
  border-left: 3px solid var(--ion-color-secondary-shade, #166534);
}

.source-item__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.source-item__title {
  font-weight: 600;
  color: #111827;
  margin-right: 0.5rem;
}

.source-item__symbol {
  font-size: 0.75rem;
  background: #f3f4f6;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  margin-left: 0.5rem;
}

.source-item__direction {
  font-weight: 600;
  font-size: 0.875rem;
}

.direction--up {
  color: #10b981;
}

.direction--down {
  color: #ef4444;
}

.source-item__type {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: #f3f4f6;
  border-radius: 0.25rem;
  color: #6b7280;
}

.source-item__meta {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0.25rem 0 0;
}

.source-item__content {
  font-size: 0.875rem;
  color: #4b5563;
  margin: 0.5rem 0;
  line-height: 1.5;
}

.source-item__drivers {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0.25rem 0 0;
  font-style: italic;
}

/* Options Panel */
.options-panel {
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.options-panel h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
}

/* Preview Section */
.preview-section {
  padding: 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.5rem;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.preview-header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  color: #166534;
}

.preview-badge {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: white;
  background: #16a34a;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}

.preview-card {
  padding: 1rem;
  background: white;
  border-radius: 0.375rem;
  border: 1px solid #e5e7eb;
}

.preview-card--full {
  grid-column: 1 / -1;
}

.preview-card h4 {
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  margin: 0 0 0.75rem;
}

.preview-list {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 0.5rem;
}

.preview-list dt {
  font-weight: 500;
  color: #6b7280;
  font-size: 0.875rem;
}

.preview-list dd {
  margin: 0;
  color: #111827;
  font-size: 0.875rem;
}

/* Target Mapping */
.target-mapping {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.target-mapping__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.target-mapping__label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  font-weight: 500;
}

.target-mapping__symbol {
  font-size: 0.875rem;
  background: #f3f4f6;
  padding: 0.375rem 0.75rem;
  border-radius: 0.25rem;
}

.target-mapping__arrow {
  font-size: 1.5rem;
  color: #9ca3af;
  flex-shrink: 0;
}

/* Data Stats */
.data-stats {
  display: flex;
  gap: 2rem;
}

.data-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.data-stat__value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--ion-color-secondary-shade, #166534);
  line-height: 1;
}

.data-stat__label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  margin-top: 0.25rem;
}

.preview-note {
  padding: 0.75rem;
  background: white;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: #4b5563;
  border: 1px solid #e5e7eb;
}

/* Loading & Error States */
.loading-state {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  justify-content: center;
  color: #6b7280;
}

.spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid #e5e7eb;
  border-top-color: var(--ion-color-secondary-shade, #166534);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  padding: 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
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

.empty-state {
  padding: 2rem;
  text-align: center;
  color: #9ca3af;
  font-size: 0.875rem;
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

  .tabs {
    border-bottom-color: #4b5563;
  }

  .tab {
    color: #9ca3af;
  }

  .tab:hover {
    color: #e5e7eb;
  }

  .tab--active {
    color: #22c55e;
    border-bottom-color: #22c55e;
  }

  .form-label {
    color: #e5e7eb;
  }

  .form-input,
  .form-textarea {
    background: #374151;
    border-color: #4b5563;
    color: #e5e7eb;
  }

  .source-list {
    border-color: #4b5563;
  }

  .source-item {
    border-bottom-color: #4b5563;
  }

  .source-item:hover {
    background: #374151;
  }

  .source-item--selected {
    background: rgba(21, 128, 61, 0.2);
    border-left-color: #15803d;
  }

  .source-item__title {
    color: #f9fafb;
  }

  .source-item__content {
    color: #d1d5db;
  }

  .options-panel {
    background: #374151;
  }

  .preview-section {
    background: #065f46;
    border-color: #059669;
  }

  .preview-header h3 {
    color: #d1fae5;
  }

  .preview-card {
    background: #1f2937;
    border-color: #4b5563;
  }

  .preview-list dd {
    color: #e5e7eb;
  }

  .preview-note {
    background: #374151;
    border-color: #4b5563;
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
