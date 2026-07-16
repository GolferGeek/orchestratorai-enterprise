<template>
  <div class="outcomes-tab">

    <!-- Verdict Distribution -->
    <section class="card">
      <h4 class="card-title">Verdict Distribution</h4>
      <div class="verdict-bars">
        <div class="verdict-bar-row">
          <span class="bar-label">Plaintiff wins</span>
          <div class="bar-track">
            <div
              class="bar-fill plaintiff"
              :style="{ width: `${(result.outcomeDistribution.plaintiffWinRate * 100).toFixed(1)}%` }"
            />
          </div>
          <span class="bar-pct">{{ (result.outcomeDistribution.plaintiffWinRate * 100).toFixed(1) }}% ({{ result.outcomeDistribution.plaintiffWins }})</span>
        </div>
        <div class="verdict-bar-row">
          <span class="bar-label">Defense wins</span>
          <div class="bar-track">
            <div
              class="bar-fill defense"
              :style="{ width: `${(result.outcomeDistribution.defenseWinRate * 100).toFixed(1)}%` }"
            />
          </div>
          <span class="bar-pct">{{ (result.outcomeDistribution.defenseWinRate * 100).toFixed(1) }}% ({{ result.outcomeDistribution.defenseWins }})</span>
        </div>
        <div class="verdict-bar-row">
          <span class="bar-label">Mixed</span>
          <div class="bar-track">
            <div
              class="bar-fill mixed"
              :style="{ width: `${(result.outcomeDistribution.mixedRate * 100).toFixed(1)}%` }"
            />
          </div>
          <span class="bar-pct">{{ (result.outcomeDistribution.mixedRate * 100).toFixed(1) }}% ({{ result.outcomeDistribution.mixedVerdict }})</span>
        </div>
      </div>
    </section>

    <!-- Summary Stats -->
    <section class="card">
      <h4 class="card-title">Financial Summary</h4>
      <div class="stat-row">
        <span class="stat-label">Expected value</span>
        <span class="stat-value">{{ formatCurrency(result.expectedValue) }}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Settlement range (p25–p75)</span>
        <span class="stat-value">
          {{ result.settlementRange.high > 0
            ? `${formatCurrency(result.settlementRange.low)} – ${formatCurrency(result.settlementRange.high)}`
            : 'N/A (no plaintiff wins)' }}
        </span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Simulations completed</span>
        <span class="stat-value">
          {{ result.simulationsCompleted }}
          <span v-if="result.simulationsFailed > 0" class="failed-note">
            ({{ result.simulationsFailed }} failed)
          </span>
        </span>
      </div>
    </section>

    <!-- Damages Histogram -->
    <section v-if="result.damagesDistribution.sampleSize > 0" class="card">
      <h4 class="card-title">Damages Distribution (Plaintiff Wins Only)</h4>
      <div class="histogram-wrap">
        <svg
          class="histogram-svg"
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
          preserveAspectRatio="none"
        >
          <g v-for="(bucket, i) in result.damagesDistribution.histogram" :key="i">
            <rect
              :x="barX(i)"
              :y="barY(bucket.count)"
              :width="barWidth - 2"
              :height="barHeight(bucket.count)"
              class="histogram-bar"
            />
          </g>
          <!-- x-axis -->
          <line :x1="0" :y1="svgHeight - 20" :x2="svgWidth" :y2="svgHeight - 20" class="axis-line" />
        </svg>
        <div class="histogram-labels">
          <span
            v-for="(bucket, i) in result.damagesDistribution.histogram"
            :key="i"
            class="bucket-label"
          >{{ bucket.bucket }}</span>
        </div>
      </div>
      <div class="damages-stats">
        <div class="stat-row">
          <span class="stat-label">Mean</span>
          <span class="stat-value">{{ formatCurrency(result.damagesDistribution.mean) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Median</span>
          <span class="stat-value">{{ formatCurrency(result.damagesDistribution.median) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">P10 – P90 range</span>
          <span class="stat-value">
            {{ formatCurrency(result.damagesDistribution.p10) }} – {{ formatCurrency(result.damagesDistribution.p90) }}
          </span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Sample size</span>
          <span class="stat-value">{{ result.damagesDistribution.sampleSize }}</span>
        </div>
      </div>
    </section>
    <div v-else class="no-plaintiff-note">No plaintiff wins in simulation set — damages distribution not available.</div>

    <!-- Strategy Recommendations -->
    <section v-if="result.strategyRecommendations.length > 0" class="card">
      <h4 class="card-title">Strategy Recommendations</h4>
      <ul class="recommendations">
        <li v-for="(rec, i) in result.strategyRecommendations" :key="i">{{ rec }}</li>
      </ul>
    </section>

    <!-- Disclaimer -->
    <div class="disclaimer-box">
      <p class="disclaimer-text">{{ result.disclaimerText }}</p>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MonteCarloTrialSimulatorResult } from '../../../../types/monte-carlo.types';

const props = defineProps<{
  result: MonteCarloTrialSimulatorResult;
}>();

const svgWidth = 460;
const svgHeight = 120;
const paddingBottom = 20;

const maxCount = computed(() =>
  Math.max(1, ...props.result.damagesDistribution.histogram.map((b) => b.count)),
);
const bucketCount = computed(() => props.result.damagesDistribution.histogram.length || 10);
const barWidth = computed(() => svgWidth / bucketCount.value);

function barX(i: number): number {
  return i * barWidth.value + 1;
}
function barHeight(count: number): number {
  return ((count / maxCount.value) * (svgHeight - paddingBottom));
}
function barY(count: number): number {
  return svgHeight - paddingBottom - barHeight(count);
}

function formatCurrency(value: number): string {
  if (value === 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toLocaleString()}`;
}
</script>

<style scoped>
.outcomes-tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  padding: 16px;
}
.card-title {
  margin: 0 0 12px;
  font-size: 0.95rem;
  font-weight: 600;
}
.verdict-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.verdict-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bar-label {
  width: 100px;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  text-align: right;
}
.bar-track {
  flex: 1;
  height: 22px;
  background: var(--ion-color-light);
  border-radius: 4px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 4px;
}
.bar-fill.plaintiff { background: var(--ion-color-success); }
.bar-fill.defense { background: var(--ion-color-danger); }
.bar-fill.mixed { background: var(--ion-color-warning); }
.bar-pct {
  min-width: 110px;
  font-size: 0.85rem;
  font-weight: 600;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid var(--ion-color-light);
}
.stat-row:last-child { border-bottom: none; }
.stat-label { font-size: 0.875rem; color: var(--ion-color-medium); }
.stat-value { font-weight: 500; }
.failed-note { color: var(--ion-color-danger); font-size: 0.8rem; margin-left: 4px; }
.histogram-wrap {
  margin-bottom: 12px;
}
.histogram-svg {
  width: 100%;
  height: 100px;
  display: block;
}
.histogram-bar {
  fill: var(--ion-color-primary);
  opacity: 0.8;
}
.axis-line {
  stroke: var(--ion-color-medium);
  stroke-width: 1;
}
.histogram-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
}
.bucket-label {
  font-size: 0.65rem;
  color: var(--ion-color-medium);
  text-align: center;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.damages-stats { margin-top: 4px; }
.no-plaintiff-note {
  color: var(--ion-color-medium);
  font-size: 0.875rem;
  text-align: center;
  padding: 16px;
}
.recommendations {
  padding-left: 18px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.recommendations li {
  font-size: 0.875rem;
}
.disclaimer-box {
  background: var(--ion-color-light);
  border-left: 4px solid var(--ion-color-warning);
  border-radius: 4px;
  padding: 12px 16px;
}
.disclaimer-text {
  font-size: 0.8rem;
  color: var(--ion-color-medium-shade);
  margin: 0;
  font-style: italic;
  line-height: 1.5;
}
</style>
