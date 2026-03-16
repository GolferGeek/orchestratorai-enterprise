<template>
  <div class="risk-heatmap">
    <!-- Header with controls -->
    <div class="heatmap-header">
      <h3 v-if="showTitle">{{ title }}</h3>
      <div class="heatmap-controls">
        <!-- Filter by risk level -->
        <div class="filter-group">
          <label>Filter:</label>
          <select v-model="selectedFilter" class="filter-select">
            <option value="">All Levels</option>
            <option value="critical">Critical Only</option>
            <option value="high">High & Above</option>
            <option value="medium">Medium & Above</option>
          </select>
        </div>
        <!-- Sort control -->
        <div class="filter-group">
          <label>Sort:</label>
          <select v-model="sortBy" class="filter-select">
            <option value="name">Name</option>
            <option value="score-desc">Highest Risk</option>
            <option value="score-asc">Lowest Risk</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="heatmap-loading">
      <div class="spinner"></div>
      <span>Loading heatmap...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="heatmap-error">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="!filteredRows.length" class="heatmap-empty">
      <span class="empty-icon">📊</span>
      <span>No data available for heatmap</span>
    </div>

    <!-- Heatmap Grid -->
    <div v-else class="heatmap-container" ref="heatmapContainer">
      <table class="heatmap-table">
        <thead>
          <tr>
            <th class="subject-header">Subject</th>
            <th
              v-for="dim in dimensions"
              :key="dim.id"
              class="dimension-header"
              :title="dim.description || dim.name"
            >
              <div class="dimension-cell">
                <span
                  v-if="dim.icon"
                  class="dim-icon"
                  :style="{ color: dim.color }"
                >
                  ●
                </span>
                <span class="dim-name">{{ dim.displayName || dim.name }}</span>
              </div>
            </th>
            <th class="overall-header">Overall</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filteredRows"
            :key="row.subjectId"
            class="heatmap-row"
            @click="$emit('select-subject', row.subjectId)"
          >
            <td class="subject-cell">
              <div class="subject-info">
                <span class="subject-name">{{ row.subjectName }}</span>
                <span class="subject-type">{{ row.subjectType }}</span>
              </div>
            </td>
            <td
              v-for="cell in row.dimensions"
              :key="cell.dimensionSlug"
              class="score-cell"
              :style="getCellStyle(cell.score)"
              :title="getCellTooltip(cell)"
            >
              <span v-if="cell.score !== null" class="cell-score">
                {{ formatScore(cell.score) }}
              </span>
              <span v-else class="cell-empty">-</span>
            </td>
            <td class="overall-cell" :style="getCellStyle(getRowOverallScore(row))">
              <span class="cell-score">{{ formatScore(getRowOverallScore(row)) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Legend -->
    <div v-if="showLegend && filteredRows.length" class="heatmap-legend">
      <span class="legend-label">Risk Level:</span>
      <div class="legend-items">
        <div class="legend-item">
          <span class="legend-color" style="background: #22C55E"></span>
          <span>Low (0-29%)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #EAB308"></span>
          <span>Medium (30-49%)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #F97316"></span>
          <span>High (50-69%)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #DC2626"></span>
          <span>Critical (70%+)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { HeatmapData, HeatmapRow, HeatmapCell, RiskDimension } from '@/types/risk-agent';
import { riskDashboardService } from '@/services/riskDashboardService';

interface Props {
  scopeId?: string | null;
  data?: HeatmapData | null;
  title?: string;
  showTitle?: boolean;
  showLegend?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  scopeId: null,
  data: null,
  title: 'Risk Heatmap',
  showTitle: true,
  showLegend: true,
});

const emit = defineEmits<{
  'select-subject': [subjectId: string];
  'filter-change': [filter: string];
  'error': [error: string];
}>();

// Internal state for data fetching
const internalData = ref<HeatmapData | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);

// Use either provided data or internally fetched data
const heatmapData = computed(() => props.data || internalData.value);

// Fetch data when scopeId changes
async function fetchHeatmapData() {
  if (!props.scopeId) return;

  isLoading.value = true;
  error.value = null;

  try {
    const response = await riskDashboardService.getHeatmapData(props.scopeId);
    if (response.success && response.content) {
      internalData.value = response.content;
    } else {
      error.value = response.error?.message || 'Failed to load heatmap data';
      emit('error', error.value);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load heatmap data';
    emit('error', error.value);
  } finally {
    isLoading.value = false;
  }
}

// Watch for scopeId changes
watch(() => props.scopeId, (newScopeId) => {
  if (newScopeId) {
    fetchHeatmapData();
  }
}, { immediate: true });

onMounted(() => {
  if (props.scopeId && !props.data) {
    fetchHeatmapData();
  }
});

const selectedFilter = ref('');
const sortBy = ref('name');
const heatmapContainer = ref<HTMLElement | null>(null);

// Get dimensions from data
const dimensions = computed((): RiskDimension[] => {
  if (!heatmapData.value?.dimensions) return [];
  return [...heatmapData.value.dimensions].sort(
    (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0),
  );
});

// Filter and sort rows
const filteredRows = computed((): HeatmapRow[] => {
  if (!heatmapData.value?.rows) return [];

  let rows = [...heatmapData.value.rows];

  // Apply risk level filter
  if (selectedFilter.value) {
    rows = rows.filter(row => {
      const overall = getRowOverallScore(row);
      switch (selectedFilter.value) {
        case 'critical':
          return overall >= 70;
        case 'high':
          return overall >= 50;
        case 'medium':
          return overall >= 30;
        default:
          return true;
      }
    });
  }

  // Apply sorting
  switch (sortBy.value) {
    case 'score-desc':
      rows.sort((a, b) => getRowOverallScore(b) - getRowOverallScore(a));
      break;
    case 'score-asc':
      rows.sort((a, b) => getRowOverallScore(a) - getRowOverallScore(b));
      break;
    default: // 'name'
      rows.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }

  return rows;
});

// Calculate overall score for a row
function getRowOverallScore(row: HeatmapRow): number {
  const scores = row.dimensions
    .map(d => d.score)
    .filter((s): s is number => s !== null);
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// Get cell background color based on score
function getCellStyle(score: number | null): Record<string, string> {
  if (score === null) {
    return { backgroundColor: '#f3f4f6' };
  }

  const normalized = score > 1 ? score : score * 100;

  if (normalized >= 70) {
    return {
      backgroundColor: `rgba(220, 38, 38, ${0.2 + (normalized - 70) / 100})`,
      color: '#991b1b',
    };
  }
  if (normalized >= 50) {
    return {
      backgroundColor: `rgba(249, 115, 22, ${0.2 + (normalized - 50) / 100})`,
      color: '#c2410c',
    };
  }
  if (normalized >= 30) {
    return {
      backgroundColor: `rgba(234, 179, 8, ${0.15 + (normalized - 30) / 100})`,
      color: '#a16207',
    };
  }
  return {
    backgroundColor: `rgba(34, 197, 94, ${0.15 + normalized / 200})`,
    color: '#166534',
  };
}

// Format score for display
function formatScore(score: number | null): string {
  if (score === null) return '-';
  const normalized = score > 1 ? score : score * 100;
  return `${Math.round(normalized)}%`;
}

// Get tooltip text for a cell
function getCellTooltip(cell: HeatmapCell): string {
  if (cell.score === null) {
    return `${cell.dimensionName}: No data`;
  }
  const lines = [
    `${cell.dimensionName}`,
    `Score: ${formatScore(cell.score)}`,
    `Risk Level: ${cell.riskLevel}`,
  ];
  if (cell.confidence !== null) {
    lines.push(`Confidence: ${(cell.confidence * 100).toFixed(0)}%`);
  }
  return lines.join('\n');
}
</script>

<style scoped>
.risk-heatmap {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Header */
.heatmap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.heatmap-header h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
}

/* Controls */
.heatmap-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.filter-group label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.filter-select {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #111827);
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: var(--primary-color, #a87c4f);
}

/* Heatmap container */
.heatmap-container {
  overflow-x: auto;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
}

/* Table */
.heatmap-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.heatmap-table th,
.heatmap-table td {
  padding: 0.5rem;
  text-align: center;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.heatmap-table th {
  background: var(--bg-secondary, #f9fafb);
  font-weight: 600;
  color: var(--text-primary, #111827);
  position: sticky;
  top: 0;
  z-index: 1;
}

/* Subject header */
.subject-header {
  text-align: left;
  min-width: 150px;
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--bg-secondary, #f9fafb);
}

/* Dimension header */
.dimension-header {
  min-width: 80px;
  max-width: 100px;
}

.dimension-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.dim-icon {
  font-size: 0.625rem;
}

.dim-name {
  font-size: 0.625rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80px;
}

/* Overall header */
.overall-header {
  min-width: 70px;
  background: var(--bg-tertiary, #f3f4f6);
  font-weight: 700;
}

/* Rows */
.heatmap-row {
  cursor: pointer;
  transition: background 0.2s;
}

.heatmap-row:hover {
  background: rgba(168, 124, 79, 0.05);
}

/* Subject cell */
.subject-cell {
  text-align: left;
  position: sticky;
  left: 0;
  background: var(--bg-primary, #ffffff);
  z-index: 1;
}

.heatmap-row:hover .subject-cell {
  background: rgba(168, 124, 79, 0.05);
}

.subject-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.subject-name {
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.subject-type {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
  text-transform: capitalize;
}

/* Score cells */
.score-cell {
  font-weight: 500;
  transition: all 0.2s;
}

.cell-score {
  font-variant-numeric: tabular-nums;
}

.cell-empty {
  color: var(--text-tertiary, #9ca3af);
}

/* Overall cell */
.overall-cell {
  font-weight: 600;
  border-left: 2px solid var(--border-color, #e5e7eb);
}

/* Legend */
.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 6px;
  flex-wrap: wrap;
}

.legend-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
}

.legend-items {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-primary, #111827);
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

/* States */
.heatmap-loading,
.heatmap-error,
.heatmap-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
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
  .heatmap-header h3 {
    color: #f9fafb;
  }

  .filter-select {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }

  .heatmap-container {
    border-color: #4b5563;
  }

  .heatmap-table th {
    background: #374151;
    color: #f9fafb;
  }

  .subject-header,
  .subject-cell {
    background: #1f2937;
  }

  .heatmap-row:hover .subject-cell {
    background: #374151;
  }

  .overall-header {
    background: #4b5563;
  }

  .overall-cell {
    border-left-color: #4b5563;
  }

  .heatmap-legend {
    background: #374151;
  }

  .legend-label {
    color: #9ca3af;
  }

  .legend-item {
    color: #f9fafb;
  }
}
</style>
