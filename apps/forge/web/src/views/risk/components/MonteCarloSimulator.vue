<template>
  <div class="monte-carlo-simulator">
    <div class="simulator-header">
      <div class="header-left">
        <h3>Monte Carlo Simulation</h3>
        <span class="subtitle">Run probabilistic risk analysis with Value at Risk calculations</span>
      </div>
      <div class="header-right">
        <button class="btn btn-secondary" @click="showPastSimulations = true">
          <span class="icon">📋</span>
          Past Simulations
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoadingDimensions" class="loading-state">
      <div class="spinner"></div>
      <span>Loading dimensions...</span>
    </div>

    <!-- Main Content -->
    <div v-else class="simulator-content">
      <!-- Configuration Panel -->
      <div class="config-panel">
        <h4>Simulation Configuration</h4>

        <!-- Basic Settings -->
        <div class="config-section">
          <div class="form-group">
            <label>Simulation Name</label>
            <input
              v-model="simulationName"
              type="text"
              placeholder="Enter simulation name"
              class="form-control"
            />
          </div>

          <div class="form-group">
            <label>Iterations</label>
            <div class="iterations-input">
              <input
                v-model.number="iterations"
                type="range"
                min="1000"
                max="50000"
                step="1000"
              />
              <span class="iterations-value">{{ formatNumber(iterations) }}</span>
            </div>
            <span class="help-text">Higher iterations = more accurate results but slower</span>
          </div>
        </div>

        <!-- Distribution Templates -->
        <div class="templates-section">
          <h5>Quick Templates</h5>
          <div class="template-buttons">
            <button
              v-for="template in templateOptions"
              :key="template.id"
              class="template-btn"
              :class="{ active: selectedTemplate === template.id }"
              @click="applyTemplate(template.id)"
              :title="template.description"
            >
              {{ template.label }}
            </button>
          </div>
        </div>

        <!-- Dimension Distributions -->
        <div class="distributions-section">
          <h5>Dimension Distributions</h5>
          <p class="section-description">
            Configure the probability distribution for each risk dimension
          </p>

          <div class="dimension-configs">
            <div
              v-for="dim in dimensions"
              :key="dim.id"
              class="dimension-config"
            >
              <div class="dim-header">
                <span class="dim-name">
                  <span v-if="dim.icon" class="dim-icon">{{ getDimensionIcon(dim.icon) }}</span>
                  {{ dim.displayName || dim.name }}
                </span>
                <select
                  v-model="dimensionDistributions[dim.slug].distribution"
                  class="dist-select"
                >
                  <option value="normal">Normal</option>
                  <option value="uniform">Uniform</option>
                  <option value="beta">Beta</option>
                  <option value="triangular">Triangular</option>
                </select>
              </div>

              <!-- Normal Distribution Params -->
              <div
                v-if="dimensionDistributions[dim.slug].distribution === 'normal'"
                class="dist-params"
              >
                <div class="param-group">
                  <label>Mean</label>
                  <input
                    v-model.number="dimensionDistributions[dim.slug].mean"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                  />
                </div>
                <div class="param-group">
                  <label>Std Dev</label>
                  <input
                    v-model.number="dimensionDistributions[dim.slug].stdDev"
                    type="number"
                    min="0"
                    max="0.5"
                    step="0.01"
                  />
                </div>
              </div>

              <!-- Uniform Distribution Params -->
              <div
                v-if="dimensionDistributions[dim.slug].distribution === 'uniform'"
                class="dist-params"
              >
                <div class="param-group">
                  <label>Min</label>
                  <input
                    v-model.number="dimensionDistributions[dim.slug].min"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                  />
                </div>
                <div class="param-group">
                  <label>Max</label>
                  <input
                    v-model.number="dimensionDistributions[dim.slug].max"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                  />
                </div>
              </div>

              <!-- Beta Distribution Params -->
              <div
                v-if="dimensionDistributions[dim.slug].distribution === 'beta'"
                class="dist-params"
              >
                <div class="param-group">
                  <label>Alpha</label>
                  <input
                    v-model.number="dimensionDistributions[dim.slug].alpha"
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.5"
                  />
                </div>
                <div class="param-group">
                  <label>Beta</label>
                  <input
                    v-model.number="dimensionDistributions[dim.slug].beta"
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.5"
                  />
                </div>
              </div>

              <!-- Triangular Distribution Params -->
              <div
                v-if="dimensionDistributions[dim.slug].distribution === 'triangular'"
                class="dist-params"
              >
                <div class="param-group">
                  <label>Min</label>
                  <input
                    v-model.number="dimensionDistributions[dim.slug].min"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                  />
                </div>
                <div class="param-group">
                  <label>Mode</label>
                  <input
                    v-model.number="dimensionDistributions[dim.slug].mean"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                  />
                </div>
                <div class="param-group">
                  <label>Max</label>
                  <input
                    v-model.number="dimensionDistributions[dim.slug].max"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Run Button -->
        <div class="run-section">
          <button
            class="btn btn-primary btn-large"
            @click="runSimulation"
            :disabled="isRunning || !simulationName"
          >
            <span v-if="isRunning" class="spinner-small"></span>
            <span v-else class="icon">🎲</span>
            {{ isRunning ? 'Running Simulation...' : 'Run Simulation' }}
          </button>
        </div>
      </div>

      <!-- Results Panel -->
      <div v-if="results" class="results-panel">
        <h4>Simulation Results</h4>

        <!-- Summary Stats -->
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Mean</span>
            <span class="stat-value">{{ formatPercent(results.mean) }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Median</span>
            <span class="stat-value">{{ formatPercent(results.median) }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Std Dev</span>
            <span class="stat-value">{{ formatPercent(results.stdDev) }}</span>
          </div>
          <div class="stat-card highlight-danger">
            <span class="stat-label">VaR (95%)</span>
            <span class="stat-value">{{ formatPercent(results.var95) }}</span>
          </div>
        </div>

        <!-- VaR Metrics -->
        <div class="var-section">
          <h5>Value at Risk (VaR) Metrics</h5>
          <div class="var-grid">
            <div class="var-card">
              <div class="var-header">
                <span class="var-label">VaR 95%</span>
                <span :class="['var-badge', getVarClass(results.var95)]">
                  {{ getVarLabel(results.var95) }}
                </span>
              </div>
              <span class="var-value">{{ formatPercent(results.var95) }}</span>
              <span class="var-description">
                95% confidence: risk won't exceed this level
              </span>
            </div>
            <div class="var-card">
              <div class="var-header">
                <span class="var-label">VaR 99%</span>
                <span :class="['var-badge', getVarClass(results.var99)]">
                  {{ getVarLabel(results.var99) }}
                </span>
              </div>
              <span class="var-value">{{ formatPercent(results.var99) }}</span>
              <span class="var-description">
                99% confidence: extreme scenario threshold
              </span>
            </div>
            <div class="var-card">
              <div class="var-header">
                <span class="var-label">CVaR 95%</span>
                <span :class="['var-badge', getVarClass(results.cvar95)]">
                  {{ getVarLabel(results.cvar95) }}
                </span>
              </div>
              <span class="var-value">{{ formatPercent(results.cvar95) }}</span>
              <span class="var-description">
                Expected shortfall beyond VaR 95%
              </span>
            </div>
            <div class="var-card">
              <div class="var-header">
                <span class="var-label">CVaR 99%</span>
                <span :class="['var-badge', getVarClass(results.cvar99)]">
                  {{ getVarLabel(results.cvar99) }}
                </span>
              </div>
              <span class="var-value">{{ formatPercent(results.cvar99) }}</span>
              <span class="var-description">
                Expected shortfall beyond VaR 99%
              </span>
            </div>
          </div>
        </div>

        <!-- Distribution Chart -->
        <div class="distribution-section">
          <h5>Risk Distribution</h5>
          <div class="histogram-chart">
            <div class="histogram-bars">
              <div
                v-for="(bin, idx) in results.distribution"
                :key="idx"
                class="histogram-bar"
                :style="{
                  height: getBarHeight(bin.count) + '%',
                  backgroundColor: getBarColor(bin.bin),
                }"
                :title="`${formatPercent(bin.bin)}: ${bin.count} iterations`"
              ></div>
            </div>
            <div class="histogram-labels">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
            <div class="histogram-markers">
              <div
                class="marker var95"
                :style="{ left: results.var95 * 100 + '%' }"
                title="VaR 95%"
              >
                <span class="marker-label">95%</span>
              </div>
              <div
                class="marker var99"
                :style="{ left: results.var99 * 100 + '%' }"
                title="VaR 99%"
              >
                <span class="marker-label">99%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Percentiles -->
        <div class="percentiles-section">
          <h5>Percentile Distribution</h5>
          <div class="percentile-grid">
            <div class="percentile-item">
              <span class="percentile-label">5th</span>
              <span class="percentile-value">{{ formatPercent(results.percentile5) }}</span>
            </div>
            <div class="percentile-item">
              <span class="percentile-label">25th</span>
              <span class="percentile-value">{{ formatPercent(results.percentile25) }}</span>
            </div>
            <div class="percentile-item highlight">
              <span class="percentile-label">50th</span>
              <span class="percentile-value">{{ formatPercent(results.median) }}</span>
            </div>
            <div class="percentile-item">
              <span class="percentile-label">75th</span>
              <span class="percentile-value">{{ formatPercent(results.percentile75) }}</span>
            </div>
            <div class="percentile-item highlight-danger">
              <span class="percentile-label">95th</span>
              <span class="percentile-value">{{ formatPercent(results.percentile95) }}</span>
            </div>
            <div class="percentile-item highlight-critical">
              <span class="percentile-label">99th</span>
              <span class="percentile-value">{{ formatPercent(results.percentile99) }}</span>
            </div>
          </div>
        </div>

        <!-- Advanced Stats -->
        <div class="advanced-stats">
          <h5>Distribution Shape</h5>
          <div class="shape-stats">
            <div class="shape-stat">
              <span class="shape-label">Skewness</span>
              <span class="shape-value">{{ results.skewness.toFixed(3) }}</span>
              <span class="shape-interpretation">
                {{ getSkewnessInterpretation(results.skewness) }}
              </span>
            </div>
            <div class="shape-stat">
              <span class="shape-label">Kurtosis</span>
              <span class="shape-value">{{ results.kurtosis.toFixed(3) }}</span>
              <span class="shape-interpretation">
                {{ getKurtosisInterpretation(results.kurtosis) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Execution Info -->
        <div class="execution-info">
          <span>{{ formatNumber(iterations) }} iterations completed in {{ results.executionTimeMs }}ms</span>
        </div>
      </div>
    </div>

    <!-- Past Simulations Modal -->
    <div v-if="showPastSimulations" class="modal-overlay" @click.self="showPastSimulations = false">
      <div class="modal-content">
        <div class="modal-header">
          <h4>Past Simulations</h4>
          <button class="modal-close" @click="showPastSimulations = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="isLoadingPastSimulations" class="loading-state">
            <div class="spinner"></div>
            <span>Loading simulations...</span>
          </div>
          <div v-else-if="pastSimulations.length === 0" class="empty-state">
            <span>No past simulations found</span>
          </div>
          <div v-else class="simulation-list">
            <div
              v-for="sim in pastSimulations"
              :key="sim.id"
              class="simulation-item"
              @click="loadSimulation(sim)"
            >
              <div class="sim-header">
                <span class="sim-name">{{ sim.name }}</span>
                <span :class="['sim-status', sim.status]">{{ sim.status }}</span>
              </div>
              <div class="sim-details">
                <span>{{ formatNumber(sim.iterations) }} iterations</span>
                <span class="separator">|</span>
                <span>{{ formatDate(sim.createdAt) }}</span>
              </div>
              <div v-if="sim.results" class="sim-results-preview">
                <span>Mean: {{ formatPercent(sim.results.mean) }}</span>
                <span>VaR95: {{ formatPercent(sim.results.var95) }}</span>
              </div>
              <button
                class="delete-btn"
                @click.stop="deleteSimulation(sim.id)"
                title="Delete simulation"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { riskDashboardService } from '@/services/riskDashboardService';
import type {
  RiskDimension,
  Simulation,
  SimulationResults,
  SimulationParameters,
  DimensionDistribution,
} from '@/types/risk-agent';

const props = defineProps<{
  scopeId: string;
  subjectId?: string;
}>();

const emit = defineEmits<{
  (e: 'simulation-complete', simulation: Simulation): void;
}>();

// State
const dimensions = ref<RiskDimension[]>([]);
const simulationName = ref('');
const iterations = ref(10000);
const selectedTemplate = ref<string>('normal-medium');
const dimensionDistributions = ref<Record<string, DimensionDistribution>>({});
const results = ref<SimulationResults | null>(null);
const isLoadingDimensions = ref(false);
const isRunning = ref(false);
const showPastSimulations = ref(false);
const pastSimulations = ref<Simulation[]>([]);
const isLoadingPastSimulations = ref(false);

// Template options
const templateOptions = [
  { id: 'normal-low', label: 'Low Risk', description: 'Normal distribution, mean 0.3' },
  { id: 'normal-medium', label: 'Medium Risk', description: 'Normal distribution, mean 0.5' },
  { id: 'normal-high', label: 'High Risk', description: 'Normal distribution, mean 0.7' },
  { id: 'uniform-full', label: 'Uniform', description: 'Uniform distribution 0-1' },
  { id: 'beta-skewed', label: 'Beta Skewed', description: 'Beta distribution, right skewed' },
];

// Icon mapping
const iconMap: Record<string, string> = {
  'chart-line': '📈',
  water: '💧',
  'credit-card': '💳',
  scale: '⚖️',
  shield: '🛡️',
  globe: '🌐',
  trending: '📊',
  default: '📊',
};

// Load dimensions
async function loadDimensions() {
  isLoadingDimensions.value = true;
  try {
    const response = await riskDashboardService.listDimensions(props.scopeId);
    if (response.success && response.content) {
      dimensions.value = response.content;
      initializeDistributions();
    }
  } catch (error) {
    console.error('Failed to load dimensions:', error);
  } finally {
    isLoadingDimensions.value = false;
  }
}

// Initialize distribution configs for all dimensions
function initializeDistributions() {
  const configs: Record<string, DimensionDistribution> = {};
  for (const dim of dimensions.value) {
    configs[dim.slug] = {
      distribution: 'normal',
      mean: 0.5,
      stdDev: 0.15,
      min: 0,
      max: 1,
      alpha: 2,
      beta: 5,
    };
  }
  dimensionDistributions.value = configs;
}

// Apply template
function applyTemplate(templateId: string) {
  selectedTemplate.value = templateId;

  const templateConfigs: Record<string, Partial<DimensionDistribution>> = {
    'normal-low': { distribution: 'normal', mean: 0.3, stdDev: 0.1 },
    'normal-medium': { distribution: 'normal', mean: 0.5, stdDev: 0.15 },
    'normal-high': { distribution: 'normal', mean: 0.7, stdDev: 0.1 },
    'uniform-full': { distribution: 'uniform', min: 0, max: 1 },
    'beta-skewed': { distribution: 'beta', alpha: 2, beta: 5 },
  };

  const config = templateConfigs[templateId];
  if (!config) return;

  for (const slug of Object.keys(dimensionDistributions.value)) {
    dimensionDistributions.value[slug] = {
      ...dimensionDistributions.value[slug],
      ...config,
    };
  }
}

// Run simulation
async function runSimulation() {
  if (isRunning.value || !simulationName.value) return;

  isRunning.value = true;
  results.value = null;

  try {
    const parameters: SimulationParameters = {
      dimensionDistributions: dimensionDistributions.value,
    };

    const response = await riskDashboardService.runSimulation({
      scopeId: props.scopeId,
      name: simulationName.value,
      parameters,
      iterations: iterations.value,
      subjectId: props.subjectId,
    });

    if (response.success && response.content) {
      results.value = response.content.results;
      emit('simulation-complete', response.content);
    } else {
      console.error('Simulation failed:', response.error);
    }
  } catch (error) {
    console.error('Failed to run simulation:', error);
  } finally {
    isRunning.value = false;
  }
}

// Load past simulations
async function loadPastSimulations() {
  isLoadingPastSimulations.value = true;
  try {
    const response = await riskDashboardService.listSimulations({
      scopeId: props.scopeId,
      subjectId: props.subjectId,
      limit: 20,
    });
    if (response.success && response.content) {
      pastSimulations.value = response.content;
    }
  } catch (error) {
    console.error('Failed to load past simulations:', error);
  } finally {
    isLoadingPastSimulations.value = false;
  }
}

// Load a past simulation
function loadSimulation(simulation: Simulation) {
  simulationName.value = `${simulation.name} (copy)`;
  iterations.value = simulation.iterations;
  if (simulation.parameters?.dimensionDistributions) {
    dimensionDistributions.value = { ...simulation.parameters.dimensionDistributions };
  }
  if (simulation.results) {
    results.value = simulation.results;
  }
  showPastSimulations.value = false;
}

// Delete a simulation
async function deleteSimulation(id: string) {
  if (!confirm('Are you sure you want to delete this simulation?')) return;

  try {
    const response = await riskDashboardService.deleteSimulation(id);
    if (response.success) {
      pastSimulations.value = pastSimulations.value.filter((s) => s.id !== id);
    }
  } catch (error) {
    console.error('Failed to delete simulation:', error);
  }
}

// Helpers
function getDimensionIcon(icon: string | undefined): string {
  if (!icon) return iconMap.default;
  return iconMap[icon] || iconMap.default;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function getBarHeight(count: number): number {
  if (!results.value) return 0;
  const maxCount = Math.max(...results.value.distribution.map((b) => b.count));
  return (count / maxCount) * 100;
}

function getBarColor(binValue: number): string {
  if (binValue < 0.3) return '#10b981';
  if (binValue < 0.5) return '#15803d';
  if (binValue < 0.7) return '#f59e0b';
  if (binValue < 0.85) return '#ef4444';
  return '#dc2626';
}

function getVarClass(value: number): string {
  if (value < 0.5) return 'low';
  if (value < 0.7) return 'medium';
  if (value < 0.85) return 'high';
  return 'critical';
}

function getVarLabel(value: number): string {
  if (value < 0.5) return 'Low';
  if (value < 0.7) return 'Medium';
  if (value < 0.85) return 'High';
  return 'Critical';
}

function getSkewnessInterpretation(skew: number): string {
  if (Math.abs(skew) < 0.5) return 'Roughly symmetric';
  if (skew > 0.5) return 'Right-skewed (tail toward high risk)';
  return 'Left-skewed (tail toward low risk)';
}

function getKurtosisInterpretation(kurt: number): string {
  if (Math.abs(kurt) < 1) return 'Normal tails';
  if (kurt > 1) return 'Heavy tails (extreme values more likely)';
  return 'Light tails (extreme values less likely)';
}

// Watch for past simulations modal
watch(showPastSimulations, (value) => {
  if (value) {
    loadPastSimulations();
  }
});

// Initialize
onMounted(() => {
  loadDimensions();
});
</script>

<style scoped>
.monte-carlo-simulator {
  background: var(--card-bg, #1e1e1e);
  border-radius: 12px;
  padding: 24px;
}

.simulator-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left h3 {
  margin: 0;
  color: var(--text-primary, #e0e0e0);
  font-size: 20px;
}

.subtitle {
  color: var(--text-secondary, #888);
  font-size: 14px;
}

.header-right {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-secondary {
  background: var(--bg-secondary, #2a2a2a);
  color: var(--text-primary, #e0e0e0);
  border: 1px solid var(--border-color, #3a3a3a);
}

.btn-secondary:hover {
  background: var(--bg-hover, #333);
}

.btn-primary {
  background: var(--accent-color, #a87c4f);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover, #c89660);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-large {
  padding: 12px 24px;
  font-size: 16px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--text-secondary, #888);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color, #3a3a3a);
  border-top-color: var(--accent-color, #a87c4f);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.simulator-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 1200px) {
  .simulator-content {
    grid-template-columns: 1fr;
  }
}

.config-panel,
.results-panel {
  background: var(--bg-secondary, #2a2a2a);
  border-radius: 12px;
  padding: 20px;
}

.config-panel h4,
.results-panel h4 {
  margin: 0 0 16px 0;
  color: var(--text-primary, #e0e0e0);
  font-size: 16px;
}

.config-section {
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary, #888);
  font-size: 13px;
}

.form-control {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary, #1e1e1e);
  border: 1px solid var(--border-color, #3a3a3a);
  border-radius: 8px;
  color: var(--text-primary, #e0e0e0);
  font-size: 14px;
}

.form-control:focus {
  outline: none;
  border-color: var(--accent-color, #a87c4f);
}

.iterations-input {
  display: flex;
  align-items: center;
  gap: 16px;
}

.iterations-input input[type="range"] {
  flex: 1;
}

.iterations-value {
  min-width: 60px;
  text-align: right;
  font-weight: 600;
  color: var(--accent-color, #a87c4f);
}

.help-text {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted, #666);
}

.templates-section,
.distributions-section {
  margin-bottom: 24px;
}

.templates-section h5,
.distributions-section h5,
.var-section h5,
.distribution-section h5,
.percentiles-section h5,
.advanced-stats h5 {
  margin: 0 0 12px 0;
  color: var(--text-primary, #e0e0e0);
  font-size: 14px;
}

.section-description {
  color: var(--text-secondary, #888);
  font-size: 13px;
  margin-bottom: 16px;
}

.template-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.template-btn {
  padding: 8px 12px;
  background: var(--bg-primary, #1e1e1e);
  border: 1px solid var(--border-color, #3a3a3a);
  border-radius: 6px;
  color: var(--text-secondary, #888);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.template-btn:hover {
  border-color: var(--accent-color, #a87c4f);
  color: var(--text-primary, #e0e0e0);
}

.template-btn.active {
  background: var(--accent-color, #a87c4f);
  border-color: var(--accent-color, #a87c4f);
  color: white;
}

.dimension-configs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dimension-config {
  background: var(--bg-primary, #1e1e1e);
  border-radius: 8px;
  padding: 12px;
}

.dim-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.dim-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: var(--text-primary, #e0e0e0);
}

.dim-icon {
  font-size: 14px;
}

.dist-select {
  padding: 4px 8px;
  background: var(--bg-secondary, #2a2a2a);
  border: 1px solid var(--border-color, #3a3a3a);
  border-radius: 4px;
  color: var(--text-primary, #e0e0e0);
  font-size: 12px;
}

.dist-params {
  display: flex;
  gap: 12px;
}

.param-group {
  flex: 1;
}

.param-group label {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #666);
  margin-bottom: 4px;
}

.param-group input {
  width: 100%;
  padding: 4px 8px;
  background: var(--bg-secondary, #2a2a2a);
  border: 1px solid var(--border-color, #3a3a3a);
  border-radius: 4px;
  color: var(--text-primary, #e0e0e0);
  font-size: 13px;
}

.run-section {
  margin-top: 24px;
}

.run-section .btn {
  width: 100%;
  justify-content: center;
}

/* Results Panel */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--bg-primary, #1e1e1e);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #888);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
}

.stat-card.highlight-danger {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.stat-card.highlight-danger .stat-value {
  color: #ef4444;
}

/* VaR Section */
.var-section {
  margin-bottom: 24px;
}

.var-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.var-card {
  background: var(--bg-primary, #1e1e1e);
  border-radius: 8px;
  padding: 12px;
}

.var-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.var-label {
  font-size: 13px;
  color: var(--text-secondary, #888);
}

.var-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.var-badge.low {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.var-badge.medium {
  background: rgba(21, 128, 61, 0.2);
  color: #15803d;
}

.var-badge.high {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.var-badge.critical {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.var-value {
  display: block;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  margin-bottom: 4px;
}

.var-description {
  font-size: 11px;
  color: var(--text-muted, #666);
}

/* Distribution Chart */
.distribution-section {
  margin-bottom: 24px;
}

.histogram-chart {
  position: relative;
  padding-bottom: 24px;
}

.histogram-bars {
  display: flex;
  align-items: flex-end;
  height: 150px;
  gap: 2px;
  padding: 0 4px;
}

.histogram-bar {
  flex: 1;
  min-height: 2px;
  border-radius: 2px 2px 0 0;
  transition: height 0.3s;
}

.histogram-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-muted, #666);
}

.histogram-markers {
  position: absolute;
  bottom: 24px;
  left: 4px;
  right: 4px;
  height: 150px;
  pointer-events: none;
}

.marker {
  position: absolute;
  bottom: 0;
  width: 2px;
  height: 100%;
  transform: translateX(-50%);
}

.marker.var95 {
  background: rgba(245, 158, 11, 0.7);
}

.marker.var99 {
  background: rgba(239, 68, 68, 0.7);
}

.marker-label {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--text-secondary, #888);
}

/* Percentiles */
.percentiles-section {
  margin-bottom: 24px;
}

.percentile-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.percentile-item {
  background: var(--bg-primary, #1e1e1e);
  border-radius: 8px;
  padding: 8px;
  text-align: center;
}

.percentile-label {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #666);
  margin-bottom: 4px;
}

.percentile-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
}

.percentile-item.highlight {
  background: rgba(21, 128, 61, 0.15);
  border: 1px solid rgba(21, 128, 61, 0.3);
}

.percentile-item.highlight-danger {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.percentile-item.highlight-critical {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* Advanced Stats */
.advanced-stats {
  margin-bottom: 16px;
}

.shape-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.shape-stat {
  background: var(--bg-primary, #1e1e1e);
  border-radius: 8px;
  padding: 12px;
}

.shape-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #888);
  margin-bottom: 4px;
}

.shape-value {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  margin-bottom: 4px;
}

.shape-interpretation {
  font-size: 11px;
  color: var(--text-muted, #666);
}

/* Execution Info */
.execution-info {
  text-align: center;
  color: var(--text-muted, #666);
  font-size: 12px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--card-bg, #1e1e1e);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #3a3a3a);
}

.modal-header h4 {
  margin: 0;
  color: var(--text-primary, #e0e0e0);
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-secondary, #888);
  font-size: 24px;
  cursor: pointer;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--text-secondary, #888);
}

.simulation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.simulation-item {
  background: var(--bg-secondary, #2a2a2a);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
}

.simulation-item:hover {
  background: var(--bg-hover, #333);
}

.sim-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.sim-name {
  font-weight: 500;
  color: var(--text-primary, #e0e0e0);
}

.sim-status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.sim-status.completed {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.sim-status.running {
  background: rgba(21, 128, 61, 0.2);
  color: #15803d;
}

.sim-status.failed {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.sim-details {
  font-size: 12px;
  color: var(--text-secondary, #888);
  margin-bottom: 4px;
}

.separator {
  margin: 0 8px;
}

.sim-results-preview {
  font-size: 12px;
  color: var(--text-muted, #666);
  display: flex;
  gap: 16px;
}

.delete-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  opacity: 0;
  transition: opacity 0.2s;
}

.simulation-item:hover .delete-btn {
  opacity: 1;
}
</style>
