<template>
  <div class="analytics-dashboard-view">
    <header class="view-header">
      <div class="header-title">
        <h1>Test vs Production Analytics</h1>
        <span class="test-mode-badge">TEST MODE</span>
      </div>
      <div class="header-actions">
        <select v-model="selectedDateRange" class="date-range-selector" @change="handleDateRangeChange">
          <option value="7">Last 7 Days</option>
          <option value="14">Last 14 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
        </select>
        <button class="btn btn-secondary" @click="refreshData">
          Refresh
        </button>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading && !summary" class="loading-state">
      <div class="spinner"></div>
      <span>Loading analytics...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="refreshData">Try Again</button>
    </div>

    <!-- Main Content -->
    <div v-else class="dashboard-content">
      <!-- Summary Cards Row -->
      <div v-if="summary" class="summary-cards-row">
        <AnalyticsSummaryCard
          title="Test Accuracy"
          :value="summary.accuracy.test.accuracy_pct || 0"
          :subtitle="`${summary.accuracy.test.total_predictions} predictions`"
          format="percentage"
        />
        <AnalyticsSummaryCard
          title="Production Accuracy"
          :value="summary.accuracy.production.accuracy_pct || 0"
          :subtitle="`${summary.accuracy.production.total_predictions} predictions`"
          format="percentage"
        />
        <AnalyticsSummaryCard
          title="Learnings Promoted"
          :value="summary.learning_velocity.learnings_promoted"
          :subtitle="`Avg ${(summary.learning_velocity.avg_days_to_promotion || 0).toFixed(1)}d to promotion`"
        />
        <AnalyticsSummaryCard
          title="Total Scenarios"
          :value="summary.scenario_effectiveness.total_scenarios"
          :subtitle="`${summary.scenario_effectiveness.total_runs} total runs`"
        />
      </div>

      <!-- Charts Grid -->
      <div class="charts-grid">
        <!-- Accuracy Comparison Chart -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>Accuracy Comparison</h3>
            <p class="chart-subtitle">Test vs Production Performance</p>
          </div>
          <div v-if="accuracyData.length > 0" class="chart-content">
            <div class="simple-chart">
              <div v-for="item in groupedAccuracyData" :key="item.period" class="chart-bar-group">
                <div class="chart-label">{{ formatDate(item.period) }}</div>
                <div class="chart-bars">
                  <div class="bar-container">
                    <div class="bar test" :style="{ height: `${(item.test?.accuracy_pct || 0) * 100}%` }">
                      <span class="bar-value">{{ formatPercentage(item.test?.accuracy_pct) }}</span>
                    </div>
                  </div>
                  <div class="bar-container">
                    <div class="bar production" :style="{ height: `${(item.production?.accuracy_pct || 0) * 100}%` }">
                      <span class="bar-value">{{ formatPercentage(item.production?.accuracy_pct) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-color test"></span> Test</span>
              <span class="legend-item"><span class="legend-color production"></span> Production</span>
            </div>
          </div>
          <div v-else class="empty-chart">No accuracy data available</div>
        </div>

        <!-- Learning Velocity Chart -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>Learning Velocity</h3>
            <p class="chart-subtitle">Learning Creation & Promotion</p>
          </div>
          <div v-if="velocityData.length > 0" class="chart-content">
            <div class="metrics-list">
              <div v-for="item in velocityData.slice(-7)" :key="item.period_date" class="metric-row">
                <div class="metric-label">{{ formatDate(item.period_date) }}</div>
                <div class="metric-values">
                  <span class="metric-badge test">{{ item.test_learnings_created }} Created</span>
                  <span class="metric-badge promoted">{{ item.learnings_promoted }} Promoted</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-chart">No velocity data available</div>
        </div>

        <!-- Scenario Effectiveness Table -->
        <div class="chart-card full-width">
          <div class="chart-header">
            <h3>Scenario Effectiveness</h3>
            <p class="chart-subtitle">Test Scenario Performance</p>
          </div>
          <div v-if="scenarioData.length > 0" class="chart-content">
            <table class="effectiveness-table">
              <thead>
                <tr>
                  <th>Scenario Type</th>
                  <th>Total Scenarios</th>
                  <th>Total Runs</th>
                  <th>Success Rate</th>
                  <th>Learnings Generated</th>
                  <th>Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in scenarioData" :key="item.scenario_type">
                  <td>{{ formatScenarioType(item.scenario_type) }}</td>
                  <td>{{ item.total_scenarios }}</td>
                  <td>{{ item.total_runs }}</td>
                  <td>
                    <span class="success-rate" :class="successRateClass(item.success_rate_pct)">
                      {{ formatPercentage(item.success_rate_pct) }}
                    </span>
                  </td>
                  <td>{{ item.learnings_generated }}</td>
                  <td>{{ item.avg_run_duration_minutes?.toFixed(1) || 'N/A' }}m</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="empty-chart">No scenario data available</div>
        </div>

        <!-- Promotion Funnel -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>Promotion Funnel</h3>
            <p class="chart-subtitle">Learning Promotion Pipeline</p>
          </div>
          <div v-if="funnelData.length > 0" class="chart-content">
            <div class="funnel-chart">
              <div v-for="item in funnelData" :key="item.stage" class="funnel-stage">
                <div class="funnel-bar" :style="{ width: `${item.pct_of_total || 0}%` }">
                  <span class="funnel-label">{{ formatStage(item.stage) }}</span>
                  <span class="funnel-count">{{ item.count }}</span>
                </div>
                <span class="funnel-percentage">{{ formatPercentage(item.pct_of_total) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="empty-chart">No funnel data available</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { predictionAnalyticsService } from '@/services/predictionAnalyticsService';
import type {
  AccuracyComparison,
  LearningVelocity,
  ScenarioEffectiveness,
  PromotionFunnel,
  AnalyticsSummary,
} from '@/services/predictionAnalyticsService';
import AnalyticsSummaryCard from '@/components/prediction/analytics/AnalyticsSummaryCard.vue';

// State
const isLoading = ref(false);
const error = ref<string | null>(null);
const selectedDateRange = ref<string>('30');

// Data
const summary = ref<AnalyticsSummary | null>(null);
const accuracyData = ref<AccuracyComparison[]>([]);
const velocityData = ref<LearningVelocity[]>([]);
const scenarioData = ref<ScenarioEffectiveness[]>([]);
const funnelData = ref<PromotionFunnel[]>([]);

// Computed
const dateRange = computed(() => {
  const days = parseInt(selectedDateRange.value);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
});

const groupedAccuracyData = computed(() => {
  const grouped = new Map<string, { period: string; test?: AccuracyComparison; production?: AccuracyComparison }>();

  for (const item of accuracyData.value) {
    const existing = grouped.get(item.period_date) || { period: item.period_date };
    if (item.is_test) {
      existing.test = item;
    } else {
      existing.production = item;
    }
    grouped.set(item.period_date, existing);
  }

  return Array.from(grouped.values()).slice(-7); // Last 7 periods
});

// Methods
async function loadData() {
  isLoading.value = true;
  error.value = null;

  try {
    const [summaryRes, accuracyRes, velocityRes, scenarioRes, funnelRes] = await Promise.all([
      predictionAnalyticsService.getSummary(),
      predictionAnalyticsService.getAccuracyComparison(dateRange.value),
      predictionAnalyticsService.getLearningVelocity(dateRange.value),
      predictionAnalyticsService.getScenarioEffectiveness(),
      predictionAnalyticsService.getPromotionFunnel(),
    ]);

    summary.value = summaryRes.content || null;
    accuracyData.value = accuracyRes.content || [];
    velocityData.value = velocityRes.content || [];
    scenarioData.value = scenarioRes.content || [];
    funnelData.value = funnelRes.content || [];
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load analytics data';
    console.error('Failed to load analytics:', err);
  } finally {
    isLoading.value = false;
  }
}

async function refreshData() {
  await loadData();
}

function handleDateRangeChange() {
  loadData();
}

function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function formatScenarioType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatStage(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function successRateClass(rate: number | null): string {
  if (rate === null) return '';
  if (rate >= 0.8) return 'high';
  if (rate >= 0.5) return 'medium';
  return 'low';
}

// Lifecycle
onMounted(async () => {
  await loadData();
});
</script>

<style scoped>
.analytics-dashboard-view {
  padding: 1.5rem;
  max-width: 1600px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-title h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
  margin: 0;
}

.test-mode-badge {
  padding: 0.375rem 0.75rem;
  background: var(--ion-color-warning-tint, rgba(245, 158, 11, 0.1));
  color: var(--ion-color-warning, #f59e0b);
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.date-range-selector {
  padding: 0.5rem 1rem;
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--ion-card-background, #ffffff);
  color: var(--ion-text-color, #111827);
  font-size: 0.875rem;
  cursor: pointer;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-secondary {
  background: var(--ion-color-light, #f3f4f6);
  color: var(--ion-text-color, #111827);
}

.btn-secondary:hover {
  background: var(--ion-color-medium-tint, #e5e7eb);
}

/* Loading/Error States */
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--ion-color-light, #f3f4f6);
  border-top-color: var(--ion-color-primary, #15803d);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon {
  font-size: 3rem;
  color: var(--ion-color-danger, #ef4444);
}

/* Dashboard Content */
.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.summary-cards-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.chart-card {
  background: var(--ion-card-background, #ffffff);
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

.chart-card.full-width {
  grid-column: 1 / -1;
}

.chart-header {
  padding: 1.25rem 1.5rem;
  background: var(--ion-color-light, #f3f4f6);
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
}

.chart-header h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.chart-subtitle {
  margin: 0;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
}

.chart-content {
  padding: 1.5rem;
}

.empty-chart {
  padding: 3rem;
  text-align: center;
  color: var(--ion-color-medium, #6b7280);
}

/* Simple Chart Styles */
.simple-chart {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  height: 250px;
  padding: 1rem 0;
}

.chart-bar-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
}

.chart-label {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
  text-align: center;
  margin-bottom: auto;
}

.chart-bars {
  display: flex;
  gap: 0.25rem;
  align-items: flex-end;
  flex: 1;
}

.bar-container {
  flex: 1;
  display: flex;
  align-items: flex-end;
  position: relative;
}

.bar {
  width: 100%;
  min-height: 20px;
  border-radius: 4px 4px 0 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 0.25rem;
  transition: height 0.3s ease;
}

.bar.test {
  background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%);
}

.bar.production {
  background: linear-gradient(180deg, #15803d 0%, #22c55e 100%);
}

.bar-value {
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.chart-legend {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ion-border-color, #e5e7eb);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--ion-text-color, #111827);
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 3px;
}

.legend-color.test {
  background: #f59e0b;
}

.legend-color.production {
  background: #15803d;
}

/* Metrics List */
.metrics-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--ion-color-light, #f3f4f6);
  border-radius: 6px;
}

.metric-label {
  font-size: 0.875rem;
  color: var(--ion-color-medium, #6b7280);
  font-weight: 500;
}

.metric-values {
  display: flex;
  gap: 0.5rem;
}

.metric-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.metric-badge.test {
  background: var(--ion-color-warning-tint, rgba(245, 158, 11, 0.1));
  color: var(--ion-color-warning, #f59e0b);
}

.metric-badge.promoted {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.1));
  color: var(--ion-color-success, #10b981);
}

/* Table */
.effectiveness-table {
  width: 100%;
  border-collapse: collapse;
}

.effectiveness-table th,
.effectiveness-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
}

.effectiveness-table th {
  background: var(--ion-color-light, #f3f4f6);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ion-color-medium, #6b7280);
}

.effectiveness-table td {
  font-size: 0.875rem;
}

.success-rate {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-weight: 600;
}

.success-rate.high {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.1));
  color: var(--ion-color-success, #10b981);
}

.success-rate.medium {
  background: var(--ion-color-warning-tint, rgba(245, 158, 11, 0.1));
  color: var(--ion-color-warning, #f59e0b);
}

.success-rate.low {
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.1));
  color: var(--ion-color-danger, #ef4444);
}

/* Funnel Chart */
.funnel-chart {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.funnel-stage {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.funnel-bar {
  flex: 1;
  max-width: 100%;
  min-width: 100px;
  height: 48px;
  background: linear-gradient(90deg, #15803d 0%, #22c55e 100%);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  color: white;
  transition: width 0.3s ease;
}

.funnel-label {
  font-size: 0.875rem;
  font-weight: 600;
}

.funnel-count {
  font-size: 1.125rem;
  font-weight: 700;
}

.funnel-percentage {
  min-width: 60px;
  text-align: right;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ion-color-medium, #6b7280);
}

/* Responsive */
@media (max-width: 1024px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .summary-cards-row {
    grid-template-columns: 1fr;
  }

  .simple-chart {
    height: 200px;
  }

  .bar-value {
    font-size: 0.625rem;
  }
}
</style>
