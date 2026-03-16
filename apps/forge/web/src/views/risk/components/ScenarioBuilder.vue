<template>
  <div class="scenario-builder">
    <div class="builder-header">
      <div class="header-left">
        <h3>Scenario Analysis</h3>
        <span class="subtitle">Model "what-if" scenarios by adjusting risk dimensions</span>
      </div>
      <div class="header-right">
        <button class="btn btn-secondary" @click="showSavedScenarios = true">
          <span class="icon">📁</span>
          Saved Scenarios
        </button>
        <button class="btn btn-secondary" @click="onReset" :disabled="!hasAdjustments">
          <span class="icon">↺</span>
          Reset
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoadingDimensions" class="loading-state">
      <div class="spinner"></div>
      <span>Loading dimensions...</span>
    </div>

    <!-- Main Content -->
    <div v-else class="builder-content">
      <!-- Adjustments Panel -->
      <div class="adjustments-panel">
        <h4>Dimension Adjustments</h4>
        <p class="panel-description">
          Adjust each dimension to see how changes affect the portfolio risk.
        </p>

        <div class="dimension-sliders">
          <div
            v-for="dim in availableDimensions"
            :key="dim.id"
            class="dimension-slider"
          >
            <div class="slider-header">
              <span class="dim-name">
                <span v-if="dim.icon" class="dim-icon">{{ getDimensionIcon(dim.icon) }}</span>
                {{ dim.displayName || dim.name }}
              </span>
              <span :class="['adjustment-value', getAdjustmentClass(adjustments[dim.slug] || 0)]">
                {{ formatAdjustment(adjustments[dim.slug] || 0) }}
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              step="5"
              :value="(adjustments[dim.slug] || 0) * 100"
              @input="onAdjustmentChange(dim.slug, Number(($event.target as HTMLInputElement).value) / 100)"
              :style="{ '--slider-color': dim.color || '#a87c4f' }"
            />
            <div class="slider-labels">
              <span>-50%</span>
              <span>0</span>
              <span>+50%</span>
            </div>
          </div>
        </div>

        <!-- Quick Presets -->
        <div class="presets-section">
          <h5>Quick Presets</h5>
          <div class="preset-buttons">
            <button
              class="preset-btn"
              @click="applyPreset('optimistic')"
              title="All dimensions -20%"
            >
              Optimistic
            </button>
            <button
              class="preset-btn"
              @click="applyPreset('pessimistic')"
              title="All dimensions +20%"
            >
              Pessimistic
            </button>
            <button
              class="preset-btn"
              @click="applyPreset('market-shock')"
              title="Market dimensions +40%"
            >
              Market Shock
            </button>
            <button
              class="preset-btn"
              @click="applyPreset('regulatory')"
              title="Regulatory dimension +50%"
            >
              Regulatory Crisis
            </button>
          </div>
        </div>

        <!-- Run Scenario Button -->
        <button
          class="btn btn-primary btn-run"
          @click="onRunScenario"
          :disabled="!hasAdjustments || isRunning"
        >
          <span v-if="isRunning" class="spinner-small"></span>
          <span v-else class="icon">▶</span>
          {{ isRunning ? 'Running Scenario...' : 'Run Scenario' }}
        </button>
      </div>

      <!-- Results Panel -->
      <div class="results-panel">
        <h4>Scenario Results</h4>

        <!-- No Results State -->
        <div v-if="!result" class="empty-results">
          <span class="empty-icon">📊</span>
          <p>Adjust dimensions and run the scenario to see results</p>
        </div>

        <!-- Results Display -->
        <div v-else class="results-content">
          <!-- Portfolio Impact -->
          <div class="portfolio-impact">
            <h5>Portfolio Impact</h5>
            <div class="impact-cards">
              <div class="impact-card">
                <span class="impact-label">Baseline</span>
                <span class="impact-value">{{ formatScore(result.portfolioBaseline) }}</span>
              </div>
              <div class="impact-arrow">→</div>
              <div class="impact-card">
                <span class="impact-label">Adjusted</span>
                <span class="impact-value" :class="getScoreClass(result.portfolioAdjusted)">
                  {{ formatScore(result.portfolioAdjusted) }}
                </span>
              </div>
              <div :class="['impact-change', result.portfolioChange > 0 ? 'increase' : 'decrease']">
                <span class="change-arrow">{{ result.portfolioChange > 0 ? '↑' : '↓' }}</span>
                {{ formatChange(result.portfolioChange) }}
              </div>
            </div>
          </div>

          <!-- Risk Distribution Comparison -->
          <div class="distribution-comparison">
            <h5>Risk Distribution</h5>
            <div class="distribution-charts">
              <div class="distribution-chart">
                <span class="chart-label">Before</span>
                <div class="distribution-bars">
                  <div
                    v-for="(count, level) in result.riskDistributionBefore"
                    :key="level"
                    class="dist-bar"
                    :class="level"
                    :style="{ width: getDistributionWidth(count, 'before') + '%' }"
                    :title="`${level}: ${count}`"
                  >
                    {{ count > 0 ? count : '' }}
                  </div>
                </div>
              </div>
              <div class="distribution-chart">
                <span class="chart-label">After</span>
                <div class="distribution-bars">
                  <div
                    v-for="(count, level) in result.riskDistributionAfter"
                    :key="level"
                    class="dist-bar"
                    :class="level"
                    :style="{ width: getDistributionWidth(count, 'after') + '%' }"
                    :title="`${level}: ${count}`"
                  >
                    {{ count > 0 ? count : '' }}
                  </div>
                </div>
              </div>
            </div>
            <div class="distribution-legend">
              <span class="legend-item low">Low</span>
              <span class="legend-item medium">Medium</span>
              <span class="legend-item high">High</span>
              <span class="legend-item critical">Critical</span>
            </div>
          </div>

          <!-- Subject Results -->
          <div class="subject-results">
            <h5>Subject Impact ({{ result.subjectResults.length }} subjects)</h5>
            <div class="subject-list">
              <div
                v-for="subject in result.subjectResults"
                :key="subject.subjectId"
                class="subject-result-card"
              >
                <div class="subject-info">
                  <span class="subject-name">{{ subject.subjectName }}</span>
                  <div class="score-change">
                    <span class="baseline">{{ formatScore(subject.baselineScore) }}</span>
                    <span class="arrow">→</span>
                    <span :class="['adjusted', getScoreClass(subject.adjustedScore)]">
                      {{ formatScore(subject.adjustedScore) }}
                    </span>
                  </div>
                </div>
                <div :class="['change-indicator', subject.change > 0 ? 'increase' : 'decrease']">
                  {{ subject.change > 0 ? '+' : '' }}{{ formatChange(subject.change) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Save Scenario -->
          <div class="save-section">
            <input
              v-model="scenarioName"
              type="text"
              placeholder="Scenario name..."
              class="scenario-name-input"
            />
            <button
              class="btn btn-secondary btn-save"
              @click="onSaveScenario"
              :disabled="!scenarioName.trim() || isSaving"
            >
              <span v-if="isSaving" class="spinner-small"></span>
              <span v-else class="icon">💾</span>
              {{ isSaving ? 'Saving...' : 'Save Scenario' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Saved Scenarios Modal -->
    <div v-if="showSavedScenarios" class="modal-overlay" @click.self="showSavedScenarios = false">
      <div class="modal-content">
        <div class="modal-header">
          <h4>Saved Scenarios</h4>
          <button class="modal-close" @click="showSavedScenarios = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="isLoadingSaved" class="loading-state">
            <div class="spinner"></div>
            <span>Loading scenarios...</span>
          </div>
          <div v-else-if="savedScenarios.length === 0" class="empty-state">
            <span class="empty-icon">📁</span>
            <p>No saved scenarios yet</p>
          </div>
          <div v-else class="scenarios-list">
            <div
              v-for="scenario in savedScenarios"
              :key="scenario.id"
              class="scenario-item"
            >
              <div class="scenario-info">
                <span class="scenario-name">{{ scenario.name }}</span>
                <span class="scenario-date">{{ formatDate(scenario.createdAt) }}</span>
              </div>
              <div class="scenario-actions">
                <button class="btn btn-small" @click="onLoadScenario(scenario)">
                  Load
                </button>
                <button class="btn btn-small btn-danger" @click="onDeleteScenario(scenario.id)">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { riskDashboardService } from '@/services/riskDashboardService';
import type { RiskDimension, ScenarioResult, Scenario } from '@/types/risk-agent';

const props = defineProps<{
  scopeId: string;
  dimensions?: RiskDimension[];
}>();

const emit = defineEmits<{
  'scenario-run': [result: ScenarioResult];
  'scenario-saved': [scenario: Scenario];
  'error': [error: string];
}>();

// State
const availableDimensions = ref<RiskDimension[]>([]);
const adjustments = ref<Record<string, number>>({});
const result = ref<ScenarioResult | null>(null);
const scenarioName = ref('');
const savedScenarios = ref<Scenario[]>([]);
const showSavedScenarios = ref(false);

// Loading states
const isLoadingDimensions = ref(false);
const isRunning = ref(false);
const isSaving = ref(false);
const isLoadingSaved = ref(false);

// Computed
const hasAdjustments = computed(() => {
  return Object.values(adjustments.value).some(v => v !== 0);
});

// Methods
async function loadDimensions() {
  if (props.dimensions?.length) {
    availableDimensions.value = props.dimensions;
    return;
  }

  isLoadingDimensions.value = true;
  try {
    const response = await riskDashboardService.listDimensions(props.scopeId);
    if (response.success && Array.isArray(response.content)) {
      availableDimensions.value = response.content;
    }
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Failed to load dimensions');
  } finally {
    isLoadingDimensions.value = false;
  }
}

async function loadSavedScenarios() {
  isLoadingSaved.value = true;
  try {
    const response = await riskDashboardService.listScenarios({ scopeId: props.scopeId });
    if (response.success && Array.isArray(response.content)) {
      savedScenarios.value = response.content;
    }
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Failed to load scenarios');
  } finally {
    isLoadingSaved.value = false;
  }
}

function onAdjustmentChange(slug: string, value: number) {
  adjustments.value = { ...adjustments.value, [slug]: value };
}

function onReset() {
  adjustments.value = {};
  result.value = null;
  scenarioName.value = '';
}

function applyPreset(preset: string) {
  const newAdjustments: Record<string, number> = {};

  switch (preset) {
    case 'optimistic':
        availableDimensions.value.forEach(d => {
        newAdjustments[d.slug] = -0.2;
      });
      break;
    case 'pessimistic':
        availableDimensions.value.forEach(d => {
        newAdjustments[d.slug] = 0.2;
      });
      break;
    case 'market-shock':
        availableDimensions.value.forEach(d => {
        if (d.slug.includes('market') || d.slug.includes('volatility')) {
          newAdjustments[d.slug] = 0.4;
        }
      });
      break;
    case 'regulatory':
        availableDimensions.value.forEach(d => {
        if (d.slug.includes('regulatory') || d.slug.includes('compliance')) {
          newAdjustments[d.slug] = 0.5;
        }
      });
      break;
  }

  adjustments.value = newAdjustments;
}

async function onRunScenario() {
  isRunning.value = true;
  try {
    const adjustmentsList = Object.entries(adjustments.value)
      .filter(([_, v]) => v !== 0)
      .map(([slug, adjustment]) => ({ dimensionSlug: slug, adjustment }));

    const response = await riskDashboardService.runScenario({
      scopeId: props.scopeId,
      name: scenarioName.value || 'Untitled Scenario',
      adjustments: adjustmentsList
    });

    if (response.success && response.content) {
      result.value = response.content;
      emit('scenario-run', response.content);
    } else {
      throw new Error(response.error?.message || 'Failed to run scenario');
    }
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Failed to run scenario');
  } finally {
    isRunning.value = false;
  }
}

async function onSaveScenario() {
  if (!scenarioName.value.trim()) return;

  isSaving.value = true;
  try {
    const response = await riskDashboardService.saveScenario({
      scopeId: props.scopeId,
      name: scenarioName.value,
      adjustments: Object.entries(adjustments.value)
        .filter(([_, v]) => v !== 0)
        .map(([slug, adjustment]) => ({ dimensionSlug: slug, adjustment })),
      results: result.value || undefined
    });

    if (response.success && response.content) {
      savedScenarios.value = [response.content, ...savedScenarios.value];
      emit('scenario-saved', response.content);
    }
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Failed to save scenario');
  } finally {
    isSaving.value = false;
  }
}

async function onLoadScenario(scenario: Scenario) {
  adjustments.value = { ...scenario.adjustments };
  scenarioName.value = scenario.name;
  result.value = scenario.results || null;
  showSavedScenarios.value = false;
}

async function onDeleteScenario(scenarioId: string) {
  try {
    await riskDashboardService.deleteScenario(scenarioId);
    savedScenarios.value = savedScenarios.value.filter(s => s.id !== scenarioId);
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Failed to delete scenario');
  }
}

// Formatting helpers
function formatAdjustment(value: number): string {
  const percent = value * 100;
  if (percent === 0) return '0%';
  return (percent > 0 ? '+' : '') + percent.toFixed(0) + '%';
}

function getAdjustmentClass(value: number): string {
  if (value > 0) return 'increase';
  if (value < 0) return 'decrease';
  return 'neutral';
}

function formatScore(score: number): string {
  const normalized = score > 1 ? score : score * 100;
  return normalized.toFixed(0) + '%';
}

function formatChange(change: number): string {
  const normalized = Math.abs(change > 1 ? change : change * 100);
  return normalized.toFixed(1) + '%';
}

function getScoreClass(score: number): string {
  const normalized = score > 1 ? score / 100 : score;
  if (normalized >= 0.7) return 'high';
  if (normalized >= 0.4) return 'medium';
  return 'low';
}

function getDistributionWidth(count: number, type: 'before' | 'after'): number {
  const dist = type === 'before' ? result.value?.riskDistributionBefore : result.value?.riskDistributionAfter;
  if (!dist) return 0;
  const total = Object.values(dist).reduce((sum, c) => sum + (c as number), 0);
  return total > 0 ? (count / total) * 100 : 0;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function getDimensionIcon(icon: string | undefined): string {
  if (!icon) return '';
  const iconMap: Record<string, string> = {
    'chart-line': '📈',
    'water': '💧',
    'credit-card': '💳',
    'scale': '⚖️',
    'shield': '🛡️',
    'fire': '🔥',
    'globe': '🌐',
    'lightning': '⚡',
  };
  return iconMap[icon] || '📊';
}

// Lifecycle
onMounted(() => {
  loadDimensions();
});

watch(() => props.scopeId, () => {
  loadDimensions();
  onReset();
});

watch(() => props.dimensions, (newDims) => {
  if (newDims?.length) {
    availableDimensions.value = newDims;
  }
}, { immediate: true });

watch(showSavedScenarios, (show) => {
  if (show) {
    loadSavedScenarios();
  }
});

// Expose for parent components
defineExpose({
  reset: onReset,
  runScenario: onRunScenario,
});
</script>

<style scoped>
.scenario-builder {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1.5rem;
}

.builder-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.header-left h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.subtitle {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

.header-right {
  display: flex;
  gap: 0.5rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-secondary {
  background-color: var(--btn-secondary-bg, #f3f4f6);
  color: var(--btn-secondary-text, #374151);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--btn-secondary-hover, #e5e7eb);
}

.btn-primary {
  background-color: var(--primary-color, #a87c4f);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--primary-color-dark, #8f693f);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn-danger {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.btn-danger:hover {
  background-color: rgba(239, 68, 68, 0.2);
}

.icon {
  font-size: 1rem;
}

.spinner,
.spinner-small {
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: var(--primary-color, #a87c4f);
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color, #e5e7eb);
  border-top-color: currentColor;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Content Layout */
.builder-content {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 1.5rem;
}

@media (max-width: 900px) {
  .builder-content {
    grid-template-columns: 1fr;
  }
}

/* Adjustments Panel */
.adjustments-panel,
.results-panel {
  background: var(--panel-bg, #f9fafb);
  border-radius: 8px;
  padding: 1rem;
}

.adjustments-panel h4,
.results-panel h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.panel-description {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 1rem 0;
}

/* Dimension Sliders */
.dimension-sliders {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dimension-slider {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dim-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.dim-icon {
  font-size: 1rem;
}

.adjustment-value {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.adjustment-value.increase {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.adjustment-value.decrease {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.adjustment-value.neutral {
  background: var(--badge-bg, #e5e7eb);
  color: var(--text-secondary, #6b7280);
}

input[type="range"] {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--slider-track, #e5e7eb);
  outline: none;
  -webkit-appearance: none;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--slider-color, #a87c4f);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.625rem;
  color: var(--text-secondary, #9ca3af);
}

/* Presets */
.presets-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.presets-section h5 {
  margin: 0 0 0.5rem 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.preset-btn {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  background: var(--btn-secondary-bg, #e5e7eb);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-primary, #374151);
  transition: all 0.2s;
}

.preset-btn:hover {
  background: var(--btn-secondary-hover, #d1d5db);
}

.btn-run {
  width: 100%;
  margin-top: 1rem;
  padding: 0.75rem;
}

/* Results Panel */
.empty-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--text-secondary, #6b7280);
  text-align: center;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.results-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Portfolio Impact */
.portfolio-impact h5,
.distribution-comparison h5,
.subject-results h5 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.impact-cards {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.impact-card {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 1rem;
  background: white;
  border-radius: 6px;
  border: 1px solid var(--border-color, #e5e7eb);
}

.impact-label {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.impact-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
}

.impact-value.high { color: #dc2626; }
.impact-value.medium { color: #ca8a04; }
.impact-value.low { color: #16a34a; }

.impact-arrow {
  font-size: 1.25rem;
  color: var(--text-secondary, #6b7280);
}

.impact-change {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.875rem;
}

.impact-change.increase {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.impact-change.decrease {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

/* Distribution Comparison */
.distribution-charts {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.distribution-chart {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.chart-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  width: 40px;
  flex-shrink: 0;
}

.distribution-bars {
  display: flex;
  flex: 1;
  height: 24px;
  background: var(--bar-bg, #f3f4f6);
  border-radius: 4px;
  overflow: hidden;
}

.dist-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 600;
  color: white;
  transition: width 0.3s ease;
}

.dist-bar.low { background: #22c55e; }
.dist-bar.medium { background: #eab308; }
.dist-bar.high { background: #f97316; }
.dist-bar.critical { background: #ef4444; }

.distribution-legend {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
}

.legend-item::before {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.legend-item.low::before { background: #22c55e; }
.legend-item.medium::before { background: #eab308; }
.legend-item.high::before { background: #f97316; }
.legend-item.critical::before { background: #ef4444; }

/* Subject Results */
.subject-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
}

.subject-result-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: white;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
}

.subject-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.subject-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.score-change {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
}

.baseline {
  color: var(--text-secondary, #6b7280);
}

.arrow {
  color: var(--text-secondary, #9ca3af);
}

.adjusted {
  font-weight: 600;
}

.adjusted.high { color: #dc2626; }
.adjusted.medium { color: #ca8a04; }
.adjusted.low { color: #16a34a; }

.change-indicator {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.change-indicator.increase {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.change-indicator.decrease {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

/* Save Section */
.save-section {
  display: flex;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.scenario-name-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
}

.btn-save {
  flex-shrink: 0;
}

/* Modal */
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
}

.modal-content {
  background: var(--card-bg, #ffffff);
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.modal-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
}

.modal-body {
  padding: 1rem;
  overflow-y: auto;
}

.scenarios-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.scenario-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--panel-bg, #f9fafb);
  border-radius: 6px;
}

.scenario-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.scenario-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.scenario-date {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.scenario-actions {
  display: flex;
  gap: 0.5rem;
}

/* Loading/Empty States */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .scenario-builder {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --panel-bg: #374151;
    --btn-secondary-bg: #4b5563;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #6b7280;
    --badge-bg: #4b5563;
    --slider-track: #4b5563;
    --bar-bg: #4b5563;
  }

  .impact-card,
  .subject-result-card {
    background: var(--card-bg, #1f2937);
  }
}
</style>
