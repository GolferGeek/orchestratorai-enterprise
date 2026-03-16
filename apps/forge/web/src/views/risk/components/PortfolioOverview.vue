<template>
  <div class="portfolio-overview">
    <!-- Main Score Gauge -->
    <div class="main-score-section">
      <div class="score-gauge">
        <svg viewBox="0 0 120 70" class="gauge-svg">
          <!-- Background arc -->
          <path
            :d="gaugeBackgroundPath"
            fill="none"
            stroke="#e5e7eb"
            stroke-width="12"
            stroke-linecap="round"
          />
          <!-- Score arc -->
          <path
            :d="gaugeScorePath"
            fill="none"
            :stroke="scoreColor"
            stroke-width="12"
            stroke-linecap="round"
            class="score-arc"
          />
        </svg>
        <div class="score-display">
          <span class="score-value" :style="{ color: scoreColor }">
            {{ formatScore(aggregateData?.avgScore || 0) }}
          </span>
          <span class="score-label">Portfolio Risk</span>
        </div>
      </div>
    </div>

    <!-- Statistics Grid -->
    <div class="stats-grid">
      <div class="stat-item">
        <span class="stat-value">{{ aggregateData?.subjectCount || 0 }}</span>
        <span class="stat-label">Subjects</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ formatScore(aggregateData?.maxScore || 0) }}</span>
        <span class="stat-label">Max Risk</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ formatScore(aggregateData?.minScore || 0) }}</span>
        <span class="stat-label">Min Risk</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ (aggregateData?.avgConfidence || 0).toFixed(0) }}%</span>
        <span class="stat-label">Avg Confidence</span>
      </div>
    </div>

    <!-- Risk Distribution -->
    <div v-if="distributionData && distributionData.length > 0" class="distribution-section">
      <h4>Risk Distribution</h4>
      <div class="distribution-chart">
        <div
          v-for="item in distributionData"
          :key="item.riskLevel"
          class="distribution-bar"
          :style="{ width: `${item.percentage}%`, backgroundColor: item.color }"
          :title="`${item.riskLevel}: ${item.count} (${item.percentage}%)`"
        >
          <span v-if="item.percentage >= 15" class="bar-label">{{ item.count }}</span>
        </div>
      </div>
      <div class="distribution-legend">
        <div v-for="item in distributionData" :key="item.riskLevel" class="legend-item">
          <span class="legend-dot" :style="{ backgroundColor: item.color }"></span>
          <span class="legend-text">{{ capitalize(item.riskLevel) }}: {{ item.count }}</span>
        </div>
      </div>
    </div>

    <!-- Dimension Contribution -->
    <div v-if="contributionsData && contributionsData.length > 0" class="contributions-section">
      <h4>Dimension Contributions</h4>
      <div class="contributions-list">
        <div
          v-for="contrib in sortedContributions"
          :key="contrib.dimensionId"
          class="contribution-item"
        >
          <div class="contribution-header">
            <span class="contrib-name">{{ contrib.dimensionName }}</span>
            <span class="contrib-score">{{ formatScore(contrib.avgScore) }}</span>
          </div>
          <div class="contribution-bar-container">
            <div
              class="contribution-bar"
              :style="{
                width: `${Math.min(contrib.weightedContribution, 100)}%`,
                backgroundColor: contrib.color || getContributionColor(contrib.avgScore)
              }"
            ></div>
          </div>
          <div class="contribution-meta">
            <span>Weight: {{ contrib.weight.toFixed(1) }}</span>
            <span>{{ contrib.assessmentCount }} assessments</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Trend Summary -->
    <div v-if="showTrend" class="trend-section">
      <h4>Trend</h4>
      <div class="trend-indicators">
        <div class="trend-item" v-if="trend7d !== null">
          <span class="trend-period">7 Days</span>
          <span :class="['trend-value', getTrendClass(trend7d)]">
            {{ formatTrend(trend7d) }}
          </span>
        </div>
        <div class="trend-item" v-if="trend30d !== null">
          <span class="trend-period">30 Days</span>
          <span :class="['trend-value', getTrendClass(trend30d)]">
            {{ formatTrend(trend30d) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { PortfolioAggregate, RiskDistribution, DimensionContribution } from '@/types/risk-agent';
import { riskDashboardService } from '@/services/riskDashboardService';

interface Props {
  scopeId?: string | null;
  aggregate?: PortfolioAggregate | null;
  distribution?: RiskDistribution[];
  contributions?: DimensionContribution[];
  trend7d?: number | null;
  trend30d?: number | null;
  showTrend?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  scopeId: null,
  aggregate: null,
  distribution: () => [],
  contributions: () => [],
  trend7d: null,
  trend30d: null,
  showTrend: true,
});

const emit = defineEmits<{
  'error': [error: string];
}>();

// Internal state for data fetching
const internalAggregate = ref<PortfolioAggregate | null>(null);
const internalDistribution = ref<RiskDistribution[]>([]);
const internalContributions = ref<DimensionContribution[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);

// Use either provided data or internally fetched data
const aggregateData = computed(() => props.aggregate || internalAggregate.value);
const distributionData = computed(() => props.distribution?.length ? props.distribution : internalDistribution.value);
const contributionsData = computed(() => props.contributions?.length ? props.contributions : internalContributions.value);

// Fetch data when scopeId changes
async function fetchPortfolioData() {
  if (!props.scopeId) return;

  isLoading.value = true;
  error.value = null;

  try {
    // Fetch aggregate data
    const aggResponse = await riskDashboardService.getPortfolioAggregate(props.scopeId);
    if (aggResponse.success && aggResponse.content) {
      internalAggregate.value = aggResponse.content;
    }

    // Fetch distribution data
    const distResponse = await riskDashboardService.getRiskDistribution(props.scopeId);
    if (distResponse.success && distResponse.content) {
      internalDistribution.value = distResponse.content;
    }

    // Fetch contributions data
    const contribResponse = await riskDashboardService.getDimensionContributions(props.scopeId);
    if (contribResponse.success && contribResponse.content) {
      internalContributions.value = contribResponse.content;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load portfolio data';
    emit('error', error.value);
  } finally {
    isLoading.value = false;
  }
}

// Watch for scopeId changes
watch(() => props.scopeId, (newScopeId) => {
  if (newScopeId) {
    fetchPortfolioData();
  }
}, { immediate: true });

onMounted(() => {
  if (props.scopeId && !props.aggregate) {
    fetchPortfolioData();
  }
});

// Score color based on risk level
const scoreColor = computed(() => {
  const score = aggregateData.value?.avgScore || 0;
  if (score >= 70) return '#dc2626';
  if (score >= 50) return '#f97316';
  if (score >= 30) return '#eab308';
  return '#22c55e';
});

// SVG gauge paths
const gaugeBackgroundPath = computed(() => {
  return describeArc(60, 60, 45, -150, 150);
});

const gaugeScorePath = computed(() => {
  const score = aggregateData.value?.avgScore || 0;
  const angle = -150 + (score / 100) * 300;
  return describeArc(60, 60, 45, -150, angle);
});

// Sort contributions by weighted contribution
const sortedContributions = computed(() => {
  if (!contributionsData.value?.length) return [];
  return [...contributionsData.value].sort((a, b) => b.weightedContribution - a.weightedContribution);
});

// Helper functions
function formatScore(score: number): string {
  return `${Math.round(score)}%`;
}

function formatTrend(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function getTrendClass(value: number): string {
  if (value > 5) return 'up-bad';
  if (value > 0) return 'up-slight';
  if (value < -5) return 'down-good';
  if (value < 0) return 'down-slight';
  return 'neutral';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getContributionColor(score: number): string {
  if (score >= 70) return '#dc2626';
  if (score >= 50) return '#f97316';
  if (score >= 30) return '#eab308';
  return '#22c55e';
}

// SVG arc helper
function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle - 90) * Math.PI / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}
</script>

<style scoped>
.portfolio-overview {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Main Score Section */
.main-score-section {
  display: flex;
  justify-content: center;
}

.score-gauge {
  position: relative;
  width: 200px;
  height: 120px;
}

.gauge-svg {
  width: 100%;
  height: auto;
}

.score-arc {
  transition: stroke-dashoffset 0.5s ease;
}

.score-display {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
}

.score-value {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
}

.score-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin-top: 0.25rem;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 6px;
}

.stat-item .stat-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.stat-item .stat-label {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  margin-top: 0.125rem;
}

/* Distribution Section */
.distribution-section h4,
.contributions-section h4,
.trend-section h4 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 0.5rem 0;
}

.distribution-chart {
  display: flex;
  height: 24px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-secondary, #f9fafb);
}

.distribution-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.3s ease;
  min-width: 2px;
}

.bar-label {
  font-size: 0.625rem;
  font-weight: 600;
  color: white;
}

.distribution-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

/* Contributions Section */
.contributions-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.contribution-item {
  padding: 0.5rem;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 4px;
}

.contribution-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.contrib-name {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.contrib-score {
  font-size: 0.75rem;
  font-weight: 600;
}

.contribution-bar-container {
  height: 6px;
  background: var(--bg-tertiary, #e5e7eb);
  border-radius: 3px;
  overflow: hidden;
}

.contribution-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.contribution-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 0.25rem;
  font-size: 0.625rem;
  color: var(--text-tertiary, #9ca3af);
}

/* Trend Section */
.trend-indicators {
  display: flex;
  gap: 1rem;
}

.trend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 4px;
}

.trend-period {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.trend-value {
  font-size: 0.875rem;
  font-weight: 600;
}

.trend-value.up-bad {
  color: #dc2626;
}

.trend-value.up-slight {
  color: #f97316;
}

.trend-value.down-good {
  color: #16a34a;
}

.trend-value.down-slight {
  color: #22c55e;
}

.trend-value.neutral {
  color: #6b7280;
}

/* Responsive */
@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .score-label {
    color: #9ca3af;
  }

  .stat-item {
    background: #374151;
  }

  .stat-item .stat-value {
    color: #f9fafb;
  }

  .stat-item .stat-label {
    color: #9ca3af;
  }

  .distribution-section h4,
  .contributions-section h4,
  .trend-section h4 {
    color: #f9fafb;
  }

  .distribution-chart {
    background: #374151;
  }

  .legend-item {
    color: #9ca3af;
  }

  .contribution-item {
    background: #374151;
  }

  .contrib-name {
    color: #f9fafb;
  }

  .contribution-bar-container {
    background: #4b5563;
  }

  .contribution-meta {
    color: #6b7280;
  }

  .trend-item {
    background: #374151;
  }

  .trend-period {
    color: #9ca3af;
  }
}
</style>
