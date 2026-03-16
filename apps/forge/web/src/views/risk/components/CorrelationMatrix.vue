<template>
  <div class="correlation-matrix">
    <!-- Header -->
    <div class="matrix-header">
      <h3 v-if="showTitle">{{ title }}</h3>
      <div class="matrix-controls">
        <label class="toggle-label">
          <input type="checkbox" v-model="showSignificantOnly" />
          <span>Significant only (|r| &gt; 0.5)</span>
        </label>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="matrix-loading">
      <div class="spinner"></div>
      <span>Calculating correlations...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="matrix-error">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="!dimensions.length" class="matrix-empty">
      <span class="empty-icon">🔗</span>
      <span>Not enough data to calculate correlations</span>
    </div>

    <!-- Matrix visualization -->
    <div v-else class="matrix-container">
      <table class="matrix-table">
        <thead>
          <tr>
            <th class="corner-cell"></th>
            <th
              v-for="dim in dimensions"
              :key="dim.id"
              class="header-cell"
              :title="dim.displayName || dim.name"
            >
              <span class="header-text">{{ getShortName(dim) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(rowDim, rowIdx) in dimensions" :key="rowDim.id">
            <th class="row-header" :title="rowDim.displayName || rowDim.name">
              <span class="header-text">{{ getShortName(rowDim) }}</span>
            </th>
            <td
              v-for="(colDim, colIdx) in dimensions"
              :key="colDim.id"
              class="matrix-cell"
              :class="{
                'diagonal': rowIdx === colIdx,
                'significant': isSignificant(rowIdx, colIdx),
                'hidden': shouldHide(rowIdx, colIdx)
              }"
              :style="getCellStyle(rowIdx, colIdx)"
              :title="getCellTooltip(rowIdx, colIdx)"
            >
              <span v-if="rowIdx === colIdx" class="cell-value diagonal-value">1.00</span>
              <span v-else-if="!shouldHide(rowIdx, colIdx)" class="cell-value">
                {{ formatCorrelation(getCorrelation(rowIdx, colIdx)) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Legend -->
    <div v-if="showLegend && dimensions.length" class="matrix-legend">
      <span class="legend-label">Correlation:</span>
      <div class="legend-scale">
        <div class="legend-gradient"></div>
        <div class="legend-labels">
          <span>-1.0</span>
          <span>0</span>
          <span>+1.0</span>
        </div>
      </div>
    </div>

    <!-- Significant correlations list -->
    <div v-if="showSignificantList && significantPairs.length" class="significant-list">
      <h4>Significant Correlations</h4>
      <div class="pairs-list">
        <div
          v-for="pair in significantPairs"
          :key="`${pair.dim1}-${pair.dim2}`"
          class="pair-item"
          :class="pair.correlation > 0 ? 'positive' : 'negative'"
        >
          <span class="pair-dims">{{ pair.dim1Name }} ↔ {{ pair.dim2Name }}</span>
          <span class="pair-value">{{ formatCorrelation(pair.correlation) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CorrelationMatrix, RiskDimension } from '@/types/risk-agent';

interface Props {
  data?: CorrelationMatrix | null;
  title?: string;
  showTitle?: boolean;
  showLegend?: boolean;
  showSignificantList?: boolean;
  isLoading?: boolean;
  error?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  data: null,
  title: 'Dimension Correlations',
  showTitle: true,
  showLegend: true,
  showSignificantList: true,
  isLoading: false,
  error: null,
});

const showSignificantOnly = ref(false);

// Get dimensions from data
const dimensions = computed((): RiskDimension[] => {
  return props.data?.dimensions || [];
});

// Build correlation lookup map
const correlationMap = computed((): Map<string, number> => {
  const map = new Map<string, number>();
  if (!props.data?.correlations) return map;

  for (const corr of props.data.correlations) {
    // Store both directions
    map.set(`${corr.dimension1Slug}|${corr.dimension2Slug}`, corr.correlation);
    map.set(`${corr.dimension2Slug}|${corr.dimension1Slug}`, corr.correlation);
  }
  return map;
});

// Get correlation value for two dimensions
function getCorrelation(rowIdx: number, colIdx: number): number {
  if (rowIdx === colIdx) return 1;
  const dim1 = dimensions.value[rowIdx]?.slug;
  const dim2 = dimensions.value[colIdx]?.slug;
  if (!dim1 || !dim2) return 0;
  return correlationMap.value.get(`${dim1}|${dim2}`) || 0;
}

// Check if correlation is significant
function isSignificant(rowIdx: number, colIdx: number): boolean {
  if (rowIdx === colIdx) return false;
  return Math.abs(getCorrelation(rowIdx, colIdx)) >= 0.5;
}

// Check if cell should be hidden (when showing significant only)
function shouldHide(rowIdx: number, colIdx: number): boolean {
  if (rowIdx === colIdx) return false;
  if (!showSignificantOnly.value) return false;
  return !isSignificant(rowIdx, colIdx);
}

// Get cell background style based on correlation value
function getCellStyle(rowIdx: number, colIdx: number): Record<string, string> {
  if (rowIdx === colIdx) {
    return { backgroundColor: '#e5e7eb' };
  }

  const correlation = getCorrelation(rowIdx, colIdx);

  if (shouldHide(rowIdx, colIdx)) {
    return { backgroundColor: '#f9fafb' };
  }

  // Blue for negative, white for zero, red for positive
  if (correlation > 0) {
    const intensity = Math.min(correlation, 1);
    return {
      backgroundColor: `rgba(239, 68, 68, ${intensity * 0.6})`,
      color: intensity > 0.4 ? '#ffffff' : '#991b1b',
    };
  } else if (correlation < 0) {
    const intensity = Math.min(Math.abs(correlation), 1);
    return {
      backgroundColor: `rgba(21, 128, 61, ${intensity * 0.6})`,
      color: intensity > 0.4 ? '#ffffff' : '#166534',
    };
  }
  return { backgroundColor: '#ffffff' };
}

// Format correlation value
function formatCorrelation(value: number): string {
  return value.toFixed(2);
}

// Get short name for dimension (for narrow columns)
function getShortName(dim: RiskDimension): string {
  const name = dim.displayName || dim.name;
  if (name.length <= 8) return name;
  // Try to abbreviate
  return name
    .split(/[\s-]+/)
    .map(word => word.charAt(0).toUpperCase())
    .join('')
    .slice(0, 4);
}

// Get tooltip for cell
function getCellTooltip(rowIdx: number, colIdx: number): string {
  const dim1 = dimensions.value[rowIdx];
  const dim2 = dimensions.value[colIdx];
  if (!dim1 || !dim2) return '';

  if (rowIdx === colIdx) {
    return `${dim1.displayName || dim1.name}: Perfect correlation (1.00)`;
  }

  const correlation = getCorrelation(rowIdx, colIdx);
  const strength = Math.abs(correlation);
  let strengthText = 'weak';
  if (strength >= 0.7) strengthText = 'strong';
  else if (strength >= 0.5) strengthText = 'moderate';

  const direction = correlation > 0 ? 'positive' : 'negative';

  return `${dim1.displayName || dim1.name} ↔ ${dim2.displayName || dim2.name}\nCorrelation: ${formatCorrelation(correlation)} (${strengthText} ${direction})`;
}

// Get list of significant correlation pairs
const significantPairs = computed(() => {
  if (!props.data?.correlations) return [];

  return props.data.correlations
    .filter(corr => Math.abs(corr.correlation) >= 0.5)
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
    .map(corr => ({
      dim1: corr.dimension1Slug,
      dim1Name: corr.dimension1Name,
      dim2: corr.dimension2Slug,
      dim2Name: corr.dimension2Name,
      correlation: corr.correlation,
    }));
});
</script>

<style scoped>
.correlation-matrix {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Header */
.matrix-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.matrix-header h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
}

/* Controls */
.matrix-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
}

.toggle-label input {
  cursor: pointer;
}

/* Matrix container */
.matrix-container {
  overflow-x: auto;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
}

/* Table */
.matrix-table {
  border-collapse: collapse;
  font-size: 0.75rem;
}

.matrix-table th,
.matrix-table td {
  padding: 0.375rem;
  text-align: center;
  border: 1px solid var(--border-color, #e5e7eb);
  min-width: 50px;
}

/* Corner cell */
.corner-cell {
  background: var(--bg-secondary, #f9fafb);
}

/* Header cells */
.header-cell,
.row-header {
  background: var(--bg-secondary, #f9fafb);
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.header-text {
  display: block;
  max-width: 50px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Matrix cells */
.matrix-cell {
  transition: all 0.2s;
  cursor: default;
}

.matrix-cell.diagonal {
  background: var(--bg-tertiary, #e5e7eb) !important;
}

.matrix-cell.significant {
  font-weight: 600;
}

.matrix-cell.hidden .cell-value {
  opacity: 0.3;
}

.cell-value {
  font-variant-numeric: tabular-nums;
}

.diagonal-value {
  color: var(--text-tertiary, #9ca3af);
}

/* Legend */
.matrix-legend {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 6px;
}

.legend-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
}

.legend-scale {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.legend-gradient {
  width: 150px;
  height: 12px;
  border-radius: 3px;
  background: linear-gradient(to right,
    rgba(21, 128, 61, 0.6) 0%,
    #ffffff 50%,
    rgba(239, 68, 68, 0.6) 100%
  );
}

.legend-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.625rem;
  color: var(--text-tertiary, #9ca3af);
}

/* Significant list */
.significant-list {
  padding: 0.75rem;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 6px;
}

.significant-list h4 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 0.5rem 0;
}

.pairs-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.pair-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.pair-item.positive {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.pair-item.negative {
  background: rgba(21, 128, 61, 0.1);
  color: var(--ion-color-secondary-shade, #166534);
}

.pair-dims {
  font-weight: 500;
}

.pair-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* States */
.matrix-loading,
.matrix-error,
.matrix-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  gap: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color, #e5e7eb);
  border-top-color: var(--primary-color, #a87c4f);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-radius: 50%;
  font-weight: bold;
}

.empty-icon {
  font-size: 2rem;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .matrix-header h3 {
    color: #f9fafb;
  }

  .toggle-label {
    color: #9ca3af;
  }

  .matrix-container {
    border-color: #4b5563;
  }

  .matrix-table th,
  .matrix-table td {
    border-color: #4b5563;
  }

  .corner-cell,
  .header-cell,
  .row-header {
    background: #374151;
    color: #f9fafb;
  }

  .matrix-cell.diagonal {
    background: #4b5563 !important;
  }

  .matrix-legend,
  .significant-list {
    background: #374151;
  }

  .legend-label {
    color: #9ca3af;
  }

  .significant-list h4 {
    color: #f9fafb;
  }
}
</style>
