<template>
  <div v-if="isVisible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <div class="modal-header">
        <h3>Compare Subjects</h3>
        <button class="close-btn" @click="handleClose">&times;</button>
      </div>

      <div class="modal-body">
        <!-- Subject Selection -->
        <div class="selection-section">
          <h4>Select Subjects to Compare (2-6)</h4>
          <div class="subject-checkboxes">
            <label
              v-for="subject in subjects"
              :key="subject.id"
              class="subject-checkbox"
              :class="{ selected: selectedIds.includes(subject.id) }"
            >
              <input
                type="checkbox"
                :value="subject.id"
                v-model="selectedIds"
                :disabled="!selectedIds.includes(subject.id) && selectedIds.length >= 6"
              />
              <span class="subject-name">{{ subject.name || subject.identifier }}</span>
              <span class="subject-score">{{ formatScore(getSubjectScore(subject.id)) }}</span>
            </label>
          </div>
          <p v-if="selectedIds.length < 2" class="hint">Select at least 2 subjects to compare</p>
          <p v-else-if="selectedIds.length >= 6" class="hint warning">Maximum 6 subjects reached</p>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="loading-state">
          <div class="spinner"></div>
          <span>Comparing subjects...</span>
        </div>

        <!-- Comparison Results -->
        <div v-else-if="comparisonResult" class="results-section">
          <h4>Comparison Results</h4>

          <!-- Overall Rankings -->
          <div class="rankings-section">
            <h5>Overall Rankings (Lower Risk = Better)</h5>
            <div class="rankings-list">
              <div
                v-for="ranking in comparisonResult.rankings"
                :key="ranking.subjectId"
                class="ranking-item"
                :class="getRankClass(ranking.overallRank)"
              >
                <span class="rank-badge">#{{ ranking.overallRank }}</span>
                <span class="rank-name">{{ ranking.subjectName }}</span>
                <span class="rank-score">{{ formatScore(getSubjectScore(ranking.subjectId)) }}</span>
              </div>
            </div>
          </div>

          <!-- Dimension Comparison Table -->
          <div class="dimension-comparison">
            <h5>Dimension Breakdown</h5>
            <div class="comparison-table-wrapper">
              <table class="comparison-table">
                <thead>
                  <tr>
                    <th>Dimension</th>
                    <th
                      v-for="ranking in comparisonResult.rankings"
                      :key="ranking.subjectId"
                      class="subject-header"
                    >
                      {{ truncateName(ranking.subjectName) }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="dim in comparisonResult.dimensionComparisons"
                    :key="dim.dimensionSlug"
                  >
                    <td class="dim-name">{{ dim.dimensionName }}</td>
                    <td
                      v-for="ranking in comparisonResult.rankings"
                      :key="`${dim.dimensionSlug}-${ranking.subjectId}`"
                      class="score-cell"
                      :class="getScoreCellClass(dim, ranking.subjectId)"
                    >
                      {{ formatDimScore(dim, ranking.subjectId) }}
                      <span class="dim-rank">#{{ getDimRank(dim, ranking.subjectId) }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" @click="handleClose">Close</button>
        <button
          class="btn-primary"
          @click="runComparison"
          :disabled="selectedIds.length < 2 || isLoading"
        >
          {{ isLoading ? 'Comparing...' : 'Compare Selected' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { riskDashboardService } from '@/services/riskDashboardService';
import { formatScorePercent, getRiskLevel } from '@/utils/riskScoreUtils';
import type { RiskSubject, RiskCompositeScore, SubjectComparison } from '@/types/risk-agent';
import { useRiskDashboardStore } from '@/stores/riskDashboardStore';

interface Props {
  isVisible: boolean;
  subjects: RiskSubject[];
  compositeScores: RiskCompositeScore[];
}

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();
const store = useRiskDashboardStore();

const selectedIds = ref<string[]>([]);
const comparisonResult = ref<SubjectComparison | null>(null);
const isLoading = ref(false);

// Reset when modal opens
watch(() => props.isVisible, (visible) => {
  if (visible) {
    // Pre-select subjects if there are comparison subjects in store
    const storeIds = store.comparisonSubjectIds || [];
    selectedIds.value = storeIds.filter(id =>
      props.subjects.some(s => s.id === id)
    );
    comparisonResult.value = null;
  }
});

function handleClose() {
  emit('close');
}

function getSubjectScore(subjectId: string): number | null {
  const score = props.compositeScores.find(s => s.subjectId === subjectId);
  return score?.score ?? null;
}

function formatScore(value: number | null): string {
  return formatScorePercent(value);
}

function truncateName(name: string): string {
  return name.length > 12 ? name.substring(0, 10) + '...' : name;
}

function getRankClass(rank: number): string {
  if (rank === 1) return 'rank-first';
  if (rank === 2) return 'rank-second';
  if (rank === 3) return 'rank-third';
  return '';
}

function formatDimScore(dim: SubjectComparison['dimensionComparisons'][0], subjectId: string): string {
  const scoreEntry = dim.scores.find(s => s.subjectId === subjectId);
  if (!scoreEntry) return 'N/A';
  return formatScorePercent(scoreEntry.score);
}

function getDimRank(dim: SubjectComparison['dimensionComparisons'][0], subjectId: string): number {
  const scoreEntry = dim.scores.find(s => s.subjectId === subjectId);
  return scoreEntry?.rank ?? 0;
}

function getScoreCellClass(dim: SubjectComparison['dimensionComparisons'][0], subjectId: string): string {
  const scoreEntry = dim.scores.find(s => s.subjectId === subjectId);
  if (!scoreEntry) return '';

  const level = getRiskLevel(scoreEntry.score);
  return `score-${level}`;
}

async function runComparison() {
  if (selectedIds.value.length < 2) return;

  isLoading.value = true;
  comparisonResult.value = null;
  try {
    const result = await riskDashboardService.compareSubjects(selectedIds.value);
    if (result.success && result.content) {
      comparisonResult.value = result.content;
    } else {
      store.setError(result.error?.message || 'Failed to compare subjects');
    }
  } catch (err) {
    console.error('Compare error:', err);
    store.setError(err instanceof Error ? err.message : 'Failed to compare subjects');
  } finally {
    isLoading.value = false;
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
  max-width: 800px;
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
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.selection-section h4,
.results-section h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
}

.subject-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.subject-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--ion-color-light, #f4f5f8);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.subject-checkbox:hover {
  background: var(--ion-color-light-shade, #d7d8da);
}

.subject-checkbox.selected {
  border-color: var(--ion-color-primary, #3880ff);
  background: rgba(56, 128, 255, 0.1);
}

.subject-checkbox input {
  margin: 0;
}

.subject-name {
  font-weight: 500;
}

.subject-score {
  font-size: 0.8125rem;
  color: var(--ion-color-medium, #666);
}

.hint {
  font-size: 0.8125rem;
  color: var(--ion-color-medium, #666);
  margin: 0;
}

.hint.warning {
  color: var(--ion-color-warning, #ffc409);
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  color: var(--ion-color-medium, #666);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--ion-border-color, #e0e0e0);
  border-top-color: var(--ion-color-primary, #3880ff);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner.small {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.results-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
}

.rankings-section h5,
.dimension-comparison h5 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  color: var(--ion-color-medium, #666);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.rankings-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--ion-color-light, #f4f5f8);
  border-radius: 8px;
  border-left: 4px solid var(--ion-color-medium, #92949c);
}

.ranking-item.rank-first {
  border-left-color: #ffd700;
  background: rgba(255, 215, 0, 0.1);
}

.ranking-item.rank-second {
  border-left-color: #c0c0c0;
}

.ranking-item.rank-third {
  border-left-color: #cd7f32;
}

.rank-badge {
  font-weight: 700;
  font-size: 0.875rem;
}

.rank-name {
  font-weight: 500;
}

.rank-score {
  font-size: 0.8125rem;
  color: var(--ion-color-medium, #666);
}

.comparison-table-wrapper {
  overflow-x: auto;
  margin-bottom: 1.5rem;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.comparison-table th,
.comparison-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.comparison-table th {
  background: var(--ion-color-light, #f4f5f8);
  font-weight: 600;
}

.subject-header {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dim-name {
  font-weight: 500;
}

.score-cell {
  position: relative;
}

.score-cell.score-critical {
  background: rgba(235, 68, 90, 0.15);
  color: #dc2626;
}

.score-cell.score-high {
  background: rgba(255, 196, 9, 0.15);
  color: #d97706;
}

.score-cell.score-medium {
  background: rgba(45, 211, 111, 0.15);
  color: #16a34a;
}

.score-cell.score-low {
  background: rgba(21, 128, 61, 0.1);
  color: #166534;
}

.dim-rank {
  font-size: 0.6875rem;
  color: var(--ion-color-medium, #666);
  margin-left: 0.25rem;
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
html[data-theme="dark"] .modal-footer {
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .subject-checkbox,
html[data-theme="dark"] .subject-checkbox {
  background: var(--dark-bg-tertiary, #2d3748);
}

html.ion-palette-dark .subject-checkbox:hover,
html[data-theme="dark"] .subject-checkbox:hover {
  background: var(--dark-bg-quaternary, #374151);
}

html.ion-palette-dark .subject-checkbox.selected,
html[data-theme="dark"] .subject-checkbox.selected {
  background: rgba(56, 128, 255, 0.15);
}

html.ion-palette-dark .ranking-item,
html[data-theme="dark"] .ranking-item {
  background: var(--dark-bg-tertiary, #2d3748);
}

html.ion-palette-dark .ranking-item.rank-first,
html[data-theme="dark"] .ranking-item.rank-first {
  background: rgba(255, 215, 0, 0.1);
}

html.ion-palette-dark .comparison-table th,
html[data-theme="dark"] .comparison-table th {
  background: var(--dark-bg-tertiary, #2d3748);
}

html.ion-palette-dark .comparison-table th,
html[data-theme="dark"] .comparison-table th,
html.ion-palette-dark .comparison-table td,
html[data-theme="dark"] .comparison-table td {
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .results-section,
html[data-theme="dark"] .results-section {
  border-color: var(--dark-border-subtle, #374151);
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
