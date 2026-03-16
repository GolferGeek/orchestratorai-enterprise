<template>
  <div class="llm-cost-widget" :class="{ compact: compact }">
    <div class="widget-header">
      <h3 class="widget-title">
        LLM Cost Summary
        <span v-if="!compact" class="date-range-label">
          (Last {{ selectedDays }} days)
        </span>
      </h3>
      <div v-if="!compact" class="date-range-selector">
        <button
          v-for="option in dateRangeOptions"
          :key="option.value"
          :class="{ active: selectedDays === option.value }"
          @click="selectDateRange(option.value)"
          class="range-button"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading cost data...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <div class="error-icon">!</div>
      <div class="error-message">{{ error }}</div>
      <button class="retry-button" @click="loadData">Retry</button>
    </div>

    <div v-else-if="costData" class="widget-content">
      <!-- Total Cost -->
      <div class="cost-overview">
        <div class="total-cost">
          <span class="label">Total Cost</span>
          <span class="value">${{ formatCurrency(costData.totalCost) }}</span>
        </div>
        <div v-if="!compact" class="token-stats">
          <div class="token-stat">
            <span class="token-label">Input Tokens</span>
            <span class="token-value">{{ formatNumber(costData.totalInputTokens) }}</span>
          </div>
          <div class="token-stat">
            <span class="token-label">Output Tokens</span>
            <span class="token-value">{{ formatNumber(costData.totalOutputTokens) }}</span>
          </div>
        </div>
      </div>

      <!-- Cost by Tier -->
      <div class="tier-breakdown">
        <h4 v-if="!compact" class="section-title">Cost by Tier</h4>
        <div class="tier-bars">
          <div
            v-for="(tier, key) in tierData"
            :key="key"
            class="tier-bar-row"
          >
            <span class="tier-label" :class="key">{{ tier?.label }}</span>
            <div class="tier-bar-container">
              <div
                class="tier-bar-fill"
                :class="key"
                :style="{ width: (tier?.percentage ?? 0) + '%' }"
              ></div>
              <span class="tier-value">${{ formatCurrency(tier?.cost ?? 0) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Cost by Universe (if not compact and has data) -->
      <div v-if="!compact && hasUniverseData" class="universe-breakdown">
        <h4 class="section-title">Cost by Universe</h4>
        <div class="universe-list">
          <div
            v-for="universe in sortedUniverseCosts"
            :key="universe.universeId"
            class="universe-item"
          >
            <span class="universe-name">{{ universe.universeName }}</span>
            <span class="universe-cost">${{ formatCurrency(universe.cost) }}</span>
          </div>
        </div>
      </div>

      <!-- Daily Costs Chart (if not compact and has data) -->
      <div v-if="!compact && hasDailyData" class="daily-costs-chart">
        <h4 class="section-title">Daily Costs</h4>
        <div class="chart-container">
          <canvas ref="chartCanvas" class="chart-canvas"></canvas>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <span>No cost data available for the selected period.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { predictionDashboardService, type LLMCostSummary } from '@/services/predictionDashboardService';

interface Props {
  universeId?: string;
  days?: number;
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  universeId: undefined,
  days: 30,
  compact: false,
});

const loading = ref(false);
const error = ref<string | null>(null);
const costData = ref<LLMCostSummary | null>(null);
const selectedDays = ref(props.days);
const chartCanvas = ref<HTMLCanvasElement | null>(null);

const dateRangeOptions = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

// Computed properties
const tierData = computed(() => {
  if (!costData.value) return {};

  const { gold, silver, bronze } = costData.value.costByTier;
  const total = gold + silver + bronze;

  return {
    gold: {
      label: 'GOLD',
      cost: gold,
      percentage: total > 0 ? (gold / total) * 100 : 0,
    },
    silver: {
      label: 'SILVER',
      cost: silver,
      percentage: total > 0 ? (silver / total) * 100 : 0,
    },
    bronze: {
      label: 'BRONZE',
      cost: bronze,
      percentage: total > 0 ? (bronze / total) * 100 : 0,
    },
  };
});

const hasUniverseData = computed(() => {
  return costData.value?.costByUniverse && costData.value.costByUniverse.length > 0;
});

const sortedUniverseCosts = computed(() => {
  if (!hasUniverseData.value) return [];
  return [...costData.value!.costByUniverse].sort((a, b) => b.cost - a.cost);
});

const hasDailyData = computed(() => {
  return costData.value?.dailyCosts && costData.value.dailyCosts.length > 0;
});

// Methods
function selectDateRange(days: number) {
  selectedDays.value = days;
  loadData();
}

async function loadData() {
  loading.value = true;
  error.value = null;

  try {
    const params = {
      universeId: props.universeId,
      days: selectedDays.value,
    };

    const response = await predictionDashboardService.getLLMCostSummary(params);
    costData.value = response.content || null;

    // Draw chart after data loads
    if (hasDailyData.value && !props.compact) {
      await nextTick();
      drawChart();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load cost data';
    costData.value = null;
  } finally {
    loading.value = false;
  }
}

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return (value / 1000).toFixed(2) + 'k';
  }
  return value.toFixed(2);
}

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(2) + 'M';
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'k';
  }
  return value.toLocaleString();
}

function drawChart() {
  if (!chartCanvas.value || !costData.value?.dailyCosts) return;

  const canvas = chartCanvas.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas size
  const container = canvas.parentElement;
  if (!container) return;

  canvas.width = container.clientWidth;
  canvas.height = 150;

  const data = costData.value.dailyCosts;
  if (data.length === 0) return;

  const padding = 30;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;

  // Find max value for scaling
  const maxCost = Math.max(...data.map((d) => d.cost));
  const minCost = Math.min(...data.map((d) => d.cost));
  const range = maxCost - minCost || 1;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw axes
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, canvas.height - padding);
  ctx.lineTo(canvas.width - padding, canvas.height - padding);
  ctx.stroke();

  // Calculate bar width
  const barWidth = chartWidth / data.length;
  const barSpacing = barWidth * 0.2;
  const actualBarWidth = barWidth - barSpacing;

  // Draw bars
  data.forEach((item, index) => {
    const x = padding + index * barWidth + barSpacing / 2;
    const normalizedValue = (item.cost - minCost) / range;
    const barHeight = normalizedValue * chartHeight;
    const y = canvas.height - padding - barHeight;

    // Draw bar
    ctx.fillStyle = 'rgba(21, 128, 61, 0.7)';
    ctx.fillRect(x, y, actualBarWidth, barHeight);

    // Draw value on hover area
    if (index % Math.ceil(data.length / 5) === 0) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      const dateLabel = new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      ctx.fillText(dateLabel, x + actualBarWidth / 2, canvas.height - padding / 3);
    }
  });

  // Draw max value label
  ctx.fillStyle = '#111827';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`$${formatCurrency(maxCost)}`, padding - 5, padding + 5);

  // Draw min value label if different
  if (minCost !== maxCost) {
    ctx.fillText(`$${formatCurrency(minCost)}`, padding - 5, canvas.height - padding + 5);
  }
}

// Lifecycle
onMounted(() => {
  loadData();
});

watch(
  () => [props.universeId, props.days],
  () => {
    selectedDays.value = props.days;
    loadData();
  }
);
</script>

<style scoped>
.llm-cost-widget {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
}

.llm-cost-widget.compact {
  padding: 0.75rem;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.widget-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #111827);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.date-range-label {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--text-secondary, #6b7280);
}

.date-range-selector {
  display: flex;
  gap: 0.25rem;
  background: var(--selector-bg, #f3f4f6);
  border-radius: 6px;
  padding: 0.25rem;
}

.range-button {
  background: transparent;
  border: none;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.range-button:hover {
  background: var(--hover-bg, #e5e7eb);
}

.range-button.active {
  background: var(--ion-color-secondary, #15803d);
  color: #ffffff;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: var(--ion-color-secondary, #15803d);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Error State */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 0.75rem;
  color: var(--error-color, #dc2626);
}

.error-icon {
  width: 40px;
  height: 40px;
  border: 2px solid currentColor;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
}

.error-message {
  font-size: 0.875rem;
  text-align: center;
}

.retry-button {
  background: var(--ion-color-secondary, #15803d);
  color: #ffffff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
}

.retry-button:hover {
  background: var(--ion-color-secondary-shade, #166534);
}

/* Empty State */
.empty-state {
  display: flex;
  justify-content: center;
  padding: 2rem;
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
  font-style: italic;
}

/* Widget Content */
.widget-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Cost Overview */
.cost-overview {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.total-cost {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(21, 128, 61, 0.1), rgba(21, 128, 61, 0.05));
  border-radius: 6px;
}

.total-cost .label {
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  color: var(--text-secondary, #6b7280);
}

.total-cost .value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--ion-color-secondary, #15803d);
}

.compact .total-cost .value {
  font-size: 1.5rem;
}

.token-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.token-stat {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.75rem;
  background: var(--stat-bg, #f9fafb);
  border-radius: 6px;
}

.token-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  color: var(--text-secondary, #6b7280);
}

.token-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

/* Tier Breakdown */
.tier-breakdown {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #111827);
}

.tier-bars {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tier-bar-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tier-label {
  font-size: 0.625rem;
  font-weight: 600;
  width: 50px;
  text-align: center;
  padding: 0.25rem 0;
  border-radius: 3px;
}

.tier-label.gold {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(184, 134, 11, 0.2));
  color: #b8860b;
}

.tier-label.silver {
  background: linear-gradient(135deg, rgba(192, 192, 192, 0.3), rgba(128, 128, 128, 0.2));
  color: #6b7280;
}

.tier-label.bronze {
  background: linear-gradient(135deg, rgba(205, 127, 50, 0.3), rgba(139, 69, 19, 0.2));
  color: #8b4513;
}

.tier-bar-container {
  flex: 1;
  position: relative;
  height: 28px;
  background: var(--bar-bg, #f3f4f6);
  border-radius: 4px;
  overflow: hidden;
}

.tier-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.tier-bar-fill.gold {
  background: linear-gradient(90deg, rgba(255, 215, 0, 0.6), rgba(255, 215, 0, 0.4));
}

.tier-bar-fill.silver {
  background: linear-gradient(90deg, rgba(192, 192, 192, 0.6), rgba(192, 192, 192, 0.4));
}

.tier-bar-fill.bronze {
  background: linear-gradient(90deg, rgba(205, 127, 50, 0.6), rgba(205, 127, 50, 0.4));
}

.tier-value {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  text-shadow: 0 0 3px rgba(255, 255, 255, 0.8);
}

/* Universe Breakdown */
.universe-breakdown {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.universe-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 150px;
  overflow-y: auto;
}

.universe-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: var(--item-bg, #f9fafb);
  border-radius: 4px;
  font-size: 0.875rem;
}

.universe-name {
  color: var(--text-primary, #111827);
  font-weight: 500;
}

.universe-cost {
  color: var(--text-secondary, #6b7280);
  font-weight: 600;
}

/* Daily Costs Chart */
.daily-costs-chart {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.chart-container {
  width: 100%;
  height: 150px;
  position: relative;
}

.chart-canvas {
  width: 100%;
  height: 100%;
}

/* Dark Mode */
html.ion-palette-dark .llm-cost-widget,
html[data-theme="dark"] .llm-cost-widget {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --selector-bg: #374151;
  --hover-bg: #4b5563;
  --stat-bg: #374151;
  --bar-bg: #374151;
  --item-bg: #374151;
  --error-color: #ef4444;
}

/* Responsive */
@media (max-width: 640px) {
  .widget-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .token-stats {
    grid-template-columns: 1fr;
  }
}
</style>
