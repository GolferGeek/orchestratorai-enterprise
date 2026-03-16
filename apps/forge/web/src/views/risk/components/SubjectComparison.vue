<template>
  <div class="subject-comparison">
    <!-- Header with subject selector -->
    <div class="comparison-header">
      <h3 v-if="showTitle">{{ title }}</h3>
      <div class="subject-selector">
        <span class="selector-label">Select subjects to compare:</span>
        <div class="subject-chips">
          <div
            v-for="subject in availableSubjects"
            :key="subject.id"
            :class="['subject-chip', { selected: selectedIds.has(subject.id) }]"
            @click="toggleSubject(subject.id)"
          >
            <span class="chip-name">{{ subject.name }}</span>
            <span v-if="selectedIds.has(subject.id)" class="chip-remove">×</span>
          </div>
        </div>
        <span v-if="selectedIds.size > 0" class="selection-count">
          {{ selectedIds.size }} selected ({{ minSubjects }}-{{ maxSubjects }} required)
        </span>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="comparison-loading">
      <div class="spinner"></div>
      <span>Loading comparison...</span>
    </div>

    <!-- Not enough subjects -->
    <div v-else-if="selectedIds.size < minSubjects" class="comparison-empty">
      <span class="empty-icon">⚖️</span>
      <span>Select at least {{ minSubjects }} subjects to compare</span>
    </div>

    <!-- Comparison view -->
    <template v-else-if="comparison">
      <!-- Radar Chart Overlay -->
      <div class="radar-section">
        <h4>Risk Profile Comparison</h4>
        <div class="radar-container">
          <canvas ref="radarCanvas"></canvas>
        </div>
        <div class="radar-legend">
          <div
            v-for="(subject, idx) in comparison.subjects"
            :key="subject.id"
            class="legend-item"
            :style="{ color: subjectColors[idx] }"
          >
            <span class="legend-dot" :style="{ backgroundColor: subjectColors[idx] }"></span>
            <span>{{ subject.name }}</span>
          </div>
        </div>
      </div>

      <!-- Side-by-side table -->
      <div class="table-section">
        <h4>Dimension Comparison</h4>
        <table class="comparison-table">
          <thead>
            <tr>
              <th class="dimension-col">Dimension</th>
              <th
                v-for="(subject, idx) in comparison.subjects"
                :key="subject.id"
                class="subject-col"
                :style="{ borderTopColor: subjectColors[idx] }"
              >
                {{ subject.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="dimComp in comparison.dimensionComparisons"
              :key="dimComp.dimensionSlug"
            >
              <td class="dimension-cell">
                <span v-if="dimComp.icon" class="dim-icon" :style="{ color: dimComp.color }">●</span>
                {{ dimComp.dimensionName }}
              </td>
              <td
                v-for="scoreData in dimComp.scores"
                :key="scoreData.subjectId"
                class="score-cell"
                :class="{ 'best': scoreData.rank === 1, 'worst': scoreData.rank === dimComp.scores.length }"
              >
                <span class="score-value">{{ formatScore(scoreData.score) }}</span>
                <span class="rank-badge" :class="`rank-${scoreData.rank}`">#{{ scoreData.rank }}</span>
              </td>
            </tr>
            <!-- Overall row -->
            <tr class="overall-row">
              <td class="dimension-cell">
                <strong>Overall Risk</strong>
              </td>
              <td
                v-for="ranking in comparison.rankings"
                :key="ranking.subjectId"
                class="score-cell overall"
                :class="{ 'best': ranking.overallRank === 1, 'worst': ranking.overallRank === comparison.rankings.length }"
              >
                <span class="score-value">{{ getOverallScore(ranking.subjectId) }}</span>
                <span class="rank-badge" :class="`rank-${ranking.overallRank}`">#{{ ranking.overallRank }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Rankings summary -->
      <div class="rankings-section">
        <h4>Overall Rankings (Lower = Better)</h4>
        <div class="rankings-list">
          <div
            v-for="(ranking, idx) in sortedRankings"
            :key="ranking.subjectId"
            class="ranking-item"
            :class="{ 'first': idx === 0, 'last': idx === sortedRankings.length - 1 }"
          >
            <span class="rank-position">#{{ ranking.overallRank }}</span>
            <span class="rank-name">{{ ranking.subjectName }}</span>
            <span class="rank-score">{{ getOverallScore(ranking.subjectId) }}</span>
          </div>
        </div>
      </div>

      <!-- Save comparison -->
      <div v-if="showSaveOption" class="save-section">
        <input
          v-model="comparisonName"
          type="text"
          placeholder="Name this comparison..."
          class="save-input"
        />
        <button
          class="save-btn"
          :disabled="!comparisonName.trim()"
          @click="$emit('save', { name: comparisonName, subjectIds: Array.from(selectedIds) })"
        >
          Save Comparison
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Chart, registerables } from 'chart.js';
import type { RiskSubject, SubjectComparison as ComparisonType } from '@/types/risk-agent';
import { riskDashboardService } from '@/services/riskDashboardService';

// Register Chart.js
Chart.register(...registerables);

interface Props {
  scopeId?: string | null;
  subjects?: RiskSubject[];
  comparison?: ComparisonType | null;
  title?: string;
  showTitle?: boolean;
  showSaveOption?: boolean;
  minSubjects?: number;
  maxSubjects?: number;
  initialSelected?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  scopeId: null,
  subjects: () => [],
  comparison: null,
  title: 'Subject Comparison',
  showTitle: true,
  showSaveOption: false,
  minSubjects: 2,
  maxSubjects: 6,
  initialSelected: () => [],
});

const emit = defineEmits<{
  'compare': [subjectIds: string[]];
  'save': [data: { name: string; subjectIds: string[] }];
  'error': [error: string];
}>();

// Internal state for data fetching
const internalSubjects = ref<RiskSubject[]>([]);
const isLoading = ref(false);

// Fetch subjects when scopeId changes
async function fetchSubjects() {
  if (!props.scopeId) return;

  isLoading.value = true;
  try {
    const response = await riskDashboardService.listSubjects({ scopeId: props.scopeId });
    if (response.success && response.content) {
      internalSubjects.value = response.content;
    }
  } catch (err) {
    emit('error', err instanceof Error ? err.message : 'Failed to load subjects');
  } finally {
    isLoading.value = false;
  }
}

// Watch for scopeId changes - always fetch subjects to ensure data availability
watch(() => props.scopeId, (newScopeId) => {
  if (newScopeId) {
    fetchSubjects();
  }
}, { immediate: true });

const radarCanvas = ref<HTMLCanvasElement | null>(null);
let radarChart: Chart | null = null;

const selectedIds = ref<Set<string>>(new Set(props.initialSelected));
const comparisonName = ref('');

// Color palette for subjects
const subjectColors = [
  '#a87c4f', // Primary
  '#15803d', // Green/Brown
  '#22c55e', // Green
  '#f97316', // Orange
  '#8b5cf6', // Purple
  '#ec4899', // Pink
];

// Available subjects for selection - prefer fetched data, fall back to props
const availableSubjects = computed(() => {
  // Prefer internally fetched subjects (always up-to-date from API)
  if (internalSubjects.value.length > 0) {
    return internalSubjects.value;
  }
  // Fall back to props if available
  return props.subjects || [];
});

// Sorted rankings (best first)
const sortedRankings = computed(() => {
  if (!props.comparison?.rankings) return [];
  return [...props.comparison.rankings].sort((a, b) => a.overallRank - b.overallRank);
});

// Toggle subject selection
function toggleSubject(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else if (selectedIds.value.size < props.maxSubjects) {
    selectedIds.value.add(id);
  }
  selectedIds.value = new Set(selectedIds.value); // Trigger reactivity

  // Emit compare when we have enough subjects
  if (selectedIds.value.size >= props.minSubjects) {
    emit('compare', Array.from(selectedIds.value));
  }
}

// Format score
function formatScore(score: number): string {
  const normalized = score > 1 ? score : score * 100;
  return `${Math.round(normalized)}%`;
}

// Get overall score for a subject
function getOverallScore(subjectId: string): string {
  const score = props.comparison?.compositeScores.find(s => s.subjectId === subjectId);
  if (!score) return '-';
  const scoreRecord = score as unknown as Record<string, unknown>;
  const value =
    (typeof scoreRecord['overall_score'] === 'number'
      ? scoreRecord['overall_score']
      : undefined) ??
    (typeof scoreRecord['overallScore'] === 'number'
      ? scoreRecord['overallScore']
      : undefined) ??
    score.score ??
    0;
  return formatScore(value);
}

// Create radar chart
function createRadarChart() {
  if (!radarCanvas.value || !props.comparison) return;

  // Destroy existing chart
  if (radarChart) {
    radarChart.destroy();
    radarChart = null;
  }

  const ctx = radarCanvas.value.getContext('2d');
  if (!ctx) return;

  const dimensions = props.comparison.dimensionComparisons.map(d => d.dimensionName);

  const datasets = props.comparison.subjects.map((subject, idx) => {
    const scores = props.comparison!.dimensionComparisons.map(dimComp => {
      const scoreData = dimComp.scores.find(s => s.subjectId === subject.id);
      return scoreData ? (scoreData.score > 1 ? scoreData.score : scoreData.score * 100) : 0;
    });

    return {
      label: subject.name,
      data: scores,
      borderColor: subjectColors[idx],
      backgroundColor: hexToRgba(subjectColors[idx], 0.2),
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: subjectColors[idx],
    };
  });

  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: dimensions,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          callbacks: {
            label: (item) => `${item.dataset.label}: ${item.raw}%`,
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 25,
            font: { size: 10 },
          },
          pointLabels: {
            font: { size: 10 },
          },
        },
      },
    },
  });
}

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(107, 114, 128, ${alpha})`;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
}

// Watch for comparison changes
watch(
  () => props.comparison,
  () => {
    nextTick(() => {
      createRadarChart();
    });
  },
  { deep: true }
);

// Watch initial selected
watch(
  () => props.initialSelected,
  (newVal) => {
    if (newVal && newVal.length > 0) {
      selectedIds.value = new Set(newVal);
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (props.comparison) {
    nextTick(() => {
      createRadarChart();
    });
  }
});

onUnmounted(() => {
  if (radarChart) {
    radarChart.destroy();
    radarChart = null;
  }
});
</script>

<style scoped>
.subject-comparison {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Header */
.comparison-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.comparison-header h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
}

/* Subject selector */
.subject-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.selector-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.subject-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.subject-chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.625rem;
  background: var(--bg-secondary, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 9999px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.subject-chip:hover {
  border-color: var(--primary-color, #a87c4f);
}

.subject-chip.selected {
  background: var(--primary-color, #a87c4f);
  border-color: var(--primary-color, #a87c4f);
  color: white;
}

.chip-remove {
  font-size: 0.875rem;
  margin-left: 0.125rem;
}

.selection-count {
  font-size: 0.625rem;
  color: var(--text-tertiary, #9ca3af);
}

/* Sections */
.radar-section h4,
.table-section h4,
.rankings-section h4 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 0.5rem 0;
}

/* Radar chart */
.radar-container {
  height: 280px;
  margin-bottom: 0.5rem;
}

.radar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
}

.radar-legend .legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

/* Comparison table */
.comparison-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.comparison-table th,
.comparison-table td {
  padding: 0.5rem;
  text-align: center;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.comparison-table th {
  background: var(--bg-secondary, #f9fafb);
  font-weight: 600;
  border-top: 3px solid;
}

.dimension-col {
  text-align: left;
  min-width: 120px;
}

.subject-col {
  min-width: 100px;
}

.dimension-cell {
  text-align: left;
  font-weight: 500;
}

.dim-icon {
  margin-right: 0.25rem;
}

.score-cell {
  position: relative;
}

.score-value {
  font-weight: 600;
}

.rank-badge {
  display: inline-block;
  margin-left: 0.25rem;
  padding: 0.125rem 0.25rem;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: 3px;
  background: var(--bg-tertiary, #e5e7eb);
  color: var(--text-secondary, #6b7280);
}

.rank-badge.rank-1 {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.score-cell.best {
  background: rgba(34, 197, 94, 0.05);
}

.score-cell.worst {
  background: rgba(239, 68, 68, 0.05);
}

.overall-row {
  font-weight: 600;
  background: var(--bg-secondary, #f9fafb);
}

.overall-row .score-cell.overall {
  font-size: 0.875rem;
}

/* Rankings */
.rankings-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 6px;
}

.ranking-item.first {
  background: rgba(34, 197, 94, 0.1);
  border-left: 3px solid #22c55e;
}

.ranking-item.last {
  background: rgba(239, 68, 68, 0.1);
  border-left: 3px solid #ef4444;
}

.rank-position {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-secondary, #6b7280);
  min-width: 30px;
}

.ranking-item.first .rank-position {
  color: #16a34a;
}

.rank-name {
  flex: 1;
  font-weight: 500;
}

.rank-score {
  font-weight: 600;
}

/* Save section */
.save-section {
  display: flex;
  gap: 0.75rem;
}

.save-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
}

.save-input:focus {
  outline: none;
  border-color: var(--primary-color, #a87c4f);
}

.save-btn {
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  font-weight: 500;
  background: var(--primary-color, #a87c4f);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.save-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* States */
.comparison-loading,
.comparison-empty {
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

.empty-icon {
  font-size: 2rem;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .comparison-header h3,
  .radar-section h4,
  .table-section h4,
  .rankings-section h4 {
    color: #f9fafb;
  }

  .selector-label {
    color: #9ca3af;
  }

  .subject-chip {
    background: #374151;
    border-color: #4b5563;
  }

  .subject-chip.selected {
    background: #d4a574;
    border-color: #d4a574;
  }

  .comparison-table th {
    background: #374151;
  }

  .score-cell.best {
    background: rgba(34, 197, 94, 0.1);
  }

  .score-cell.worst {
    background: rgba(239, 68, 68, 0.1);
  }

  .overall-row {
    background: #374151;
  }

  .ranking-item {
    background: #374151;
  }

  .save-input {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }
}
</style>
