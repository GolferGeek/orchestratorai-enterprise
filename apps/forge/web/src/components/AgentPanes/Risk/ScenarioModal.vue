<template>
  <div v-if="isVisible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <div class="modal-header">
        <h3>What-If Scenario Analysis</h3>
        <button class="close-btn" @click="handleClose">&times;</button>
      </div>

      <div class="modal-body">
        <!-- Instructions -->
        <p class="instructions">
          Adjust dimension scores to see how changes would affect the overall risk profile.
          Positive values increase risk, negative values decrease it.
        </p>

        <!-- Dimension Adjustments -->
        <div class="adjustments-section">
          <h4>Dimension Adjustments</h4>
          <div class="dimension-list">
            <div
              v-for="dim in dimensionAdjustments"
              :key="dim.slug"
              class="dimension-row"
            >
              <div class="dimension-info">
                <span class="dimension-name">{{ dim.name }}</span>
                <span class="dimension-weight">(weight: {{ (dim.weight * 100).toFixed(0) }}%)</span>
              </div>
              <div class="adjustment-control">
                <input
                  type="range"
                  v-model.number="dim.adjustment"
                  min="-0.5"
                  max="0.5"
                  step="0.05"
                  class="adjustment-slider"
                />
                <span class="adjustment-value" :class="{ positive: dim.adjustment > 0, negative: dim.adjustment < 0 }">
                  {{ dim.adjustment > 0 ? '+' : '' }}{{ (dim.adjustment * 100).toFixed(0) }}%
                </span>
                <button class="reset-btn" @click="dim.adjustment = 0" title="Reset to 0">↺</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Results Section -->
        <div v-if="scenarioResult" class="results-section">
          <h4>Projected Impact</h4>
          <div class="results-grid">
            <div class="result-card">
              <div class="result-label">Current Avg Score</div>
              <div class="result-value">{{ formatPercent(scenarioResult.portfolioBaseline) }}</div>
            </div>
            <div class="result-card">
              <div class="result-label">Projected Avg Score</div>
              <div class="result-value" :class="getScoreChangeClass(scenarioResult.portfolioChange)">
                {{ formatPercent(scenarioResult.portfolioAdjusted) }}
              </div>
            </div>
            <div class="result-card">
              <div class="result-label">Change</div>
              <div class="result-value" :class="getScoreChangeClass(scenarioResult.portfolioChange)">
                {{ scenarioResult.portfolioChange >= 0 ? '+' : '' }}{{ formatPercent(scenarioResult.portfolioChange) }}
              </div>
            </div>
            <div class="result-card">
              <div class="result-label">Subjects Analyzed</div>
              <div class="result-value">{{ scenarioResult.subjectResults?.length || 0 }}</div>
            </div>
          </div>

          <!-- Subject Details -->
          <div v-if="scenarioResult.subjectResults?.length > 0" class="subject-results">
            <h5>Subject Breakdown</h5>
            <div class="subject-table">
              <div class="table-header">
                <span>Subject</span>
                <span>Current</span>
                <span>Projected</span>
                <span>Change</span>
              </div>
              <div
                v-for="subject in scenarioResult.subjectResults"
                :key="subject.subjectId"
                class="table-row"
              >
                <span class="subject-name">{{ subject.subjectName }}</span>
                <span>{{ formatPercent(subject.baselineScore) }}</span>
                <span :class="getScoreChangeClass(subject.change)">{{ formatPercent(subject.adjustedScore) }}</span>
                <span :class="getScoreChangeClass(subject.change)">
                  {{ subject.change >= 0 ? '+' : '' }}{{ formatPercent(subject.change) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- No Data Message -->
        <div v-else-if="hasRun && !isRunning" class="no-data-message">
          <p>No subjects with composite scores found.</p>
          <p>Please run analysis on subjects first to generate baseline scores.</p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" @click="handleReset">Reset All</button>
        <button
          class="btn-primary"
          @click="handleRunScenario"
          :disabled="isRunning || !hasAdjustments"
        >
          {{ isRunning ? 'Calculating...' : 'Run Scenario' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { riskDashboardService } from '@/services/riskDashboardService';
import { formatScorePercent, getChangeClass } from '@/utils/riskScoreUtils';
import type { RiskDimension, ScenarioResult } from '@/types/risk-agent';

interface Props {
  isVisible: boolean;
  scopeId: string | null;
  dimensions: RiskDimension[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
}>();

interface DimensionAdjustment {
  slug: string;
  name: string;
  weight: number;
  adjustment: number;
}

const dimensionAdjustments = ref<DimensionAdjustment[]>([]);
const scenarioResult = ref<ScenarioResult | null>(null);
const isRunning = ref(false);
const hasRun = ref(false);
const error = ref<string | null>(null);

// Initialize adjustments when dimensions change
watch(() => props.dimensions, (dims) => {
  dimensionAdjustments.value = dims.map(d => ({
    slug: d.slug,
    name: d.displayName || d.name,
    weight: d.weight,
    adjustment: 0,
  }));
}, { immediate: true });

// Reset when modal opens
watch(() => props.isVisible, (visible) => {
  if (visible) {
    scenarioResult.value = null;
    hasRun.value = false;
    error.value = null;
    // Reset adjustments to 0
    dimensionAdjustments.value.forEach(d => d.adjustment = 0);
  }
});

const hasAdjustments = computed(() => {
  return dimensionAdjustments.value.some(d => d.adjustment !== 0);
});

function formatPercent(value: number): string {
  return formatScorePercent(value);
}

function getScoreChangeClass(change: number): string {
  return getChangeClass(change);
}

function handleClose() {
  emit('close');
}

function handleReset() {
  dimensionAdjustments.value.forEach(d => d.adjustment = 0);
  scenarioResult.value = null;
  hasRun.value = false;
}

async function handleRunScenario() {
  if (!props.scopeId) {
    error.value = 'No scope selected';
    return;
  }

  isRunning.value = true;
  error.value = null;

  try {
    const adjustments = dimensionAdjustments.value
      .filter(d => d.adjustment !== 0)
      .map(d => ({
        dimensionSlug: d.slug,
        adjustment: d.adjustment,
      }));

    const result = await riskDashboardService.runScenario({
      scopeId: props.scopeId,
      name: 'What-If Analysis',
      adjustments,
    });

    hasRun.value = true;

    if (result.success && result.content) {
      scenarioResult.value = result.content;
    } else {
      error.value = result.error?.message || 'Failed to run scenario';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to run scenario';
  } finally {
    isRunning.value = false;
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  background: var(--ion-card-background, #fff);
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--ion-color-medium, #666);
  padding: 0.25rem;
  line-height: 1;
}

.close-btn:hover {
  color: var(--ion-text-color, #333);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.instructions {
  margin: 0 0 1.5rem 0;
  color: var(--ion-color-medium, #666);
  font-size: 0.875rem;
}

.adjustments-section h4,
.results-section h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: var(--ion-text-color, #333);
}

.dimension-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dimension-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--ion-color-light, #f4f5f8);
  border-radius: 8px;
}

.dimension-info {
  flex: 1;
  min-width: 0;
}

.dimension-name {
  font-weight: 500;
  margin-right: 0.5rem;
}

.dimension-weight {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
}

.adjustment-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.adjustment-slider {
  width: 120px;
  cursor: pointer;
}

.adjustment-value {
  min-width: 50px;
  text-align: right;
  font-weight: 500;
  font-family: monospace;
}

.adjustment-value.positive {
  color: var(--ion-color-danger, #eb445a);
}

.adjustment-value.negative {
  color: var(--ion-color-success, #2dd36f);
}

.reset-btn {
  background: transparent;
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--ion-color-medium, #666);
}

.reset-btn:hover {
  background: var(--ion-color-light-shade, #d7d8da);
}

.results-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 600px) {
  .results-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.result-card {
  background: var(--ion-color-light, #f4f5f8);
  padding: 0.75rem;
  border-radius: 8px;
  text-align: center;
}

.result-label {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  margin-bottom: 0.25rem;
}

.result-value {
  font-size: 1.125rem;
  font-weight: 600;
}

.result-value.increase {
  color: var(--ion-color-danger, #eb445a);
}

.result-value.decrease {
  color: var(--ion-color-success, #2dd36f);
}

.subject-results h5 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  color: var(--ion-color-medium, #666);
}

.subject-table {
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
}

.table-header,
.table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

.table-header {
  background: var(--ion-color-light, #f4f5f8);
  font-weight: 600;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.table-row {
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.table-row:last-child {
  border-bottom: none;
}

.subject-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.increase {
  color: var(--ion-color-danger, #eb445a);
}

.decrease {
  color: var(--ion-color-success, #2dd36f);
}

.no-data-message {
  text-align: center;
  padding: 2rem;
  color: var(--ion-color-medium, #666);
}

.no-data-message p {
  margin: 0.5rem 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
}

.btn-primary,
.btn-secondary {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--ion-color-primary, #3880ff);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: var(--ion-color-primary-shade, #3171e0);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--ion-border-color, #e0e0e0);
  color: var(--ion-text-color, #333);
}

.btn-secondary:hover {
  background: var(--ion-color-light, #f4f5f8);
}

/* Dark mode */
html.ion-palette-dark .modal-container,
html[data-theme="dark"] .modal-container {
  background: var(--dark-bg-secondary, #1f2937);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

html.ion-palette-dark .modal-header,
html[data-theme="dark"] .modal-header,
html.ion-palette-dark .modal-footer,
html[data-theme="dark"] .modal-footer,
html.ion-palette-dark .results-section,
html[data-theme="dark"] .results-section {
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .dimension-row,
html[data-theme="dark"] .dimension-row,
html.ion-palette-dark .result-card,
html[data-theme="dark"] .result-card {
  background: var(--dark-bg-tertiary, #2d3748);
}

html.ion-palette-dark .table-header,
html[data-theme="dark"] .table-header {
  background: var(--dark-bg-tertiary, #2d3748);
}

html.ion-palette-dark .subject-table,
html[data-theme="dark"] .subject-table,
html.ion-palette-dark .table-header,
html[data-theme="dark"] .table-header,
html.ion-palette-dark .table-row,
html[data-theme="dark"] .table-row {
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .reset-btn,
html[data-theme="dark"] .reset-btn {
  border-color: var(--dark-border-primary, #4a5568);
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .reset-btn:hover,
html[data-theme="dark"] .reset-btn:hover {
  background: var(--dark-bg-quaternary, #374151);
}

html.ion-palette-dark .btn-secondary,
html[data-theme="dark"] .btn-secondary {
  border-color: var(--dark-border-primary, #4a5568);
  color: var(--dark-text-secondary, #e2e8f0);
}

html.ion-palette-dark .btn-secondary:hover,
html[data-theme="dark"] .btn-secondary:hover {
  background: var(--dark-bg-quaternary, #374151);
}
</style>
