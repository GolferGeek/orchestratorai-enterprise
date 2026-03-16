<template>
  <div v-if="isVisible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <div class="modal-header">
        <h3>Score History: {{ subjectName }}</h3>
        <button class="close-btn" @click="handleClose">&times;</button>
      </div>

      <div class="modal-body">
        <div v-if="isLoading" class="loading-state">
          <div class="spinner"></div>
          <span>Loading history...</span>
        </div>

        <div v-else-if="history.length === 0" class="empty-state">
          <p>No score history available for this subject.</p>
          <p class="hint">Run an analysis to generate the first score.</p>
        </div>

        <div v-else class="history-timeline">
          <div
            v-for="(entry, idx) in history"
            :key="entry.id"
            class="history-entry"
            :class="{ expanded: expandedId === entry.id }"
          >
            <div class="entry-header" @click="toggleExpand(entry.id)">
              <div class="entry-date">
                <span class="date">{{ formatDate(entry.created_at || entry.createdAt) }}</span>
                <span class="time">{{ formatTime(entry.created_at || entry.createdAt) }}</span>
              </div>
              <div class="entry-score">
                <span class="score-value">{{ formatScore(entry.overall_score ?? entry.overallScore) }}</span>
                <span
                  v-if="getChange(entry, idx)"
                  class="score-change"
                  :class="getChangeClass(entry, idx)"
                >
                  {{ getChange(entry, idx) }}
                </span>
              </div>
              <div class="entry-trigger">
                <span class="trigger-badge" :class="getTriggerType(entry)">
                  {{ getTriggerLabel(entry) }}
                </span>
              </div>
              <span class="expand-icon">{{ expandedId === entry.id ? '▼' : '▶' }}</span>
            </div>

            <div v-if="expandedId === entry.id" class="entry-details">
              <!-- Dimension Breakdown -->
              <div v-if="getDimensionScores(entry)" class="dimension-breakdown">
                <h5>Dimension Scores</h5>
                <div class="dimension-grid">
                  <div
                    v-for="(dimScore, dimSlug) in getDimensionScores(entry)"
                    :key="dimSlug"
                    class="dimension-item"
                  >
                    <span class="dim-name">{{ formatDimensionName(dimSlug as string) }}</span>
                    <span class="dim-score">{{ formatDimScore(dimScore) }}</span>
                  </div>
                </div>
              </div>

              <!-- Metadata -->
              <div class="entry-metadata">
                <div v-if="entry.confidence" class="meta-item">
                  <span class="meta-label">Confidence:</span>
                  <span class="meta-value">{{ formatScore(entry.confidence) }}</span>
                </div>
                <div v-if="hasDebateAdjustment(entry)" class="meta-item debate-info">
                  <span class="meta-label">Debate Result:</span>
                  <span class="meta-value" :class="getDebateAdjustment(entry) > 0 ? 'increase' : 'decrease'">
                    {{ formatChange(getDebateAdjustment(entry)) }}
                  </span>
                  <span v-if="entry.pre_debate_score || entry.preDebateScore" class="pre-debate">
                    (pre-debate: {{ formatScore(entry.pre_debate_score || entry.preDebateScore) }})
                  </span>
                </div>
                <div v-if="entry.debate_id || entry.debateId" class="meta-item">
                  <span class="debate-badge">Adjusted by Red/Blue Debate</span>
                </div>
              </div>

              <!-- Trigger Info -->
              <div class="trigger-info">
                <span v-if="hasDebateAdjustment(entry)" class="trigger-detail">
                  This score was adjusted after a Red/Blue debate reviewed the initial assessment.
                </span>
                <span v-else class="trigger-detail">
                  Score generated from dimension analysis.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" @click="handleClose">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { riskDashboardService } from '@/services/riskDashboardService';
import { formatScorePercent, formatScoreChange, extractDimensionScore } from '@/utils/riskScoreUtils';

interface Props {
  isVisible: boolean;
  subjectId: string | null;
  subjectName: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
}>();

interface HistoryEntry {
  id: string;
  overall_score?: number;
  overallScore?: number;
  dimension_scores?: Record<string, unknown>;
  dimensionScores?: Record<string, unknown>;
  confidence?: number;
  previous_score?: number | null;
  previousScore?: number | null;
  score_change?: number;
  scoreChange?: number;
  debate_adjustment?: number;
  debateAdjustment?: number;
  debate_id?: string;
  debateId?: string;
  pre_debate_score?: number;
  preDebateScore?: number;
  created_at?: string;
  createdAt?: string;
}

const history = ref<HistoryEntry[]>([]);
const isLoading = ref(false);
const expandedId = ref<string | null>(null);

watch(() => props.isVisible, async (visible) => {
  if (visible && props.subjectId) {
    await loadHistory();
  } else {
    history.value = [];
    expandedId.value = null;
  }
});

async function loadHistory() {
  if (!props.subjectId) return;

  isLoading.value = true;
  try {
    const result = await riskDashboardService.getScoreHistory(props.subjectId, 90, 50);
    if (result.success && result.content) {
      history.value = result.content as HistoryEntry[];
    }
  } catch (err) {
    console.error('Failed to load history:', err);
  } finally {
    isLoading.value = false;
  }
}

function handleClose() {
  emit('close');
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString();
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatScore(value?: number): string {
  return formatScorePercent(value);
}

function formatChange(value?: number): string {
  return formatScoreChange(value);
}

function formatDimScore(dimScore: unknown): string {
  const score = extractDimensionScore(dimScore);
  return score !== null ? score.toFixed(1) + '%' : 'N/A';
}

function getChange(entry: HistoryEntry, idx: number): string | null {
  const scoreChange = entry.score_change ?? entry.scoreChange;
  if (typeof scoreChange === 'number' && scoreChange !== 0) {
    const normalized = Math.abs(scoreChange) > 1 ? scoreChange : scoreChange * 100;
    return (normalized >= 0 ? '+' : '') + normalized.toFixed(1) + '%';
  }

  // Calculate from previous entry if available
  if (idx < history.value.length - 1) {
    const current = entry.overall_score ?? entry.overallScore ?? 0;
    const prev = history.value[idx + 1].overall_score ?? history.value[idx + 1].overallScore ?? 0;
    if (current !== prev) {
      const change = current - prev;
      const normalized = Math.abs(change) > 1 ? change : change * 100;
      return (normalized >= 0 ? '+' : '') + normalized.toFixed(1) + '%';
    }
  }

  return null;
}

function getChangeClass(entry: HistoryEntry, idx: number): string {
  const changeStr = getChange(entry, idx);
  if (!changeStr) return '';
  return changeStr.startsWith('+') ? 'increase' : 'decrease';
}

function getTriggerType(entry: HistoryEntry): string {
  if (entry.debate_adjustment || entry.debateAdjustment) {
    return 'debate';
  }
  return 'analysis';
}

function getTriggerLabel(entry: HistoryEntry): string {
  if (hasDebateAdjustment(entry)) {
    return 'Debate';
  }
  return 'Analysis';
}

function hasDebateAdjustment(entry: HistoryEntry): boolean {
  const adj = entry.debate_adjustment ?? entry.debateAdjustment;
  return adj !== undefined && adj !== null && adj !== 0;
}

function getDebateAdjustment(entry: HistoryEntry): number {
  return entry.debate_adjustment ?? entry.debateAdjustment ?? 0;
}

function getDimensionScores(entry: HistoryEntry): Record<string, unknown> | null {
  const scores = entry.dimension_scores ?? entry.dimensionScores;
  if (scores && typeof scores === 'object' && Object.keys(scores).length > 0) {
    return scores as Record<string, unknown>;
  }
  return null;
}

function formatDimensionName(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
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
  max-width: 600px;
  max-height: 80vh;
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
  font-size: 1.125rem;
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
  padding: 1rem;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--ion-color-medium, #666);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--ion-border-color, #e0e0e0);
  border-top-color: var(--ion-color-primary, #3880ff);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.hint {
  font-size: 0.875rem;
  opacity: 0.7;
}

.history-timeline {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.history-entry {
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
}

.entry-header {
  display: grid;
  grid-template-columns: 1fr 1fr 80px 24px;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.entry-header:hover {
  background: var(--ion-color-light, #f4f5f8);
}

.entry-date {
  display: flex;
  flex-direction: column;
}

.date {
  font-weight: 500;
  font-size: 0.875rem;
}

.time {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
}

.entry-score {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.score-value {
  font-weight: 600;
  font-size: 1rem;
}

.score-change {
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.score-change.increase {
  background: #fee2e2;
  color: #dc2626;
}

.score-change.decrease {
  background: #dcfce7;
  color: #16a34a;
}

.trigger-badge {
  font-size: 0.6875rem;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  text-transform: uppercase;
  font-weight: 600;
}

.trigger-badge.analysis {
  background: rgba(21, 128, 61, 0.15);
  color: #166534;
}

.trigger-badge.debate {
  background: #fef3c7;
  color: #d97706;
}

.expand-icon {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  text-align: center;
}

.entry-details {
  padding: 1rem;
  background: var(--ion-color-light, #f4f5f8);
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
}

.dimension-breakdown h5 {
  margin: 0 0 0.75rem 0;
  font-size: 0.8125rem;
  color: var(--ion-color-medium, #666);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dimension-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.dimension-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem;
  background: var(--ion-card-background, #fff);
  border-radius: 4px;
  font-size: 0.8125rem;
}

.dim-name {
  color: var(--ion-color-medium, #666);
}

.dim-score {
  font-weight: 500;
}

.entry-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.meta-item {
  font-size: 0.8125rem;
}

.meta-label {
  color: var(--ion-color-medium, #666);
  margin-right: 0.25rem;
}

.meta-value {
  font-weight: 500;
}

.meta-value.increase {
  color: #dc2626;
}

.meta-value.decrease {
  color: #16a34a;
}

.debate-info {
  flex-wrap: wrap;
}

.pre-debate {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  margin-left: 0.5rem;
}

.debate-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  background: rgba(255, 196, 9, 0.2);
  color: #d97706;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.trigger-info {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--ion-border-color, #e0e0e0);
}

.trigger-detail {
  font-size: 0.8125rem;
  color: var(--ion-color-medium, #666);
  font-style: italic;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
}

.btn-secondary {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
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

html.ion-palette-dark .history-entry,
html[data-theme="dark"] .history-entry {
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .entry-header:hover,
html[data-theme="dark"] .entry-header:hover {
  background: var(--dark-bg-tertiary, #2d3748);
}

html.ion-palette-dark .entry-details,
html[data-theme="dark"] .entry-details {
  background: var(--dark-bg-tertiary, #2d3748);
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .dimension-item,
html[data-theme="dark"] .dimension-item {
  background: var(--dark-bg-secondary, #1f2937);
}

html.ion-palette-dark .score-change.increase,
html[data-theme="dark"] .score-change.increase {
  background: rgba(220, 38, 38, 0.15);
  color: #f87171;
}

html.ion-palette-dark .score-change.decrease,
html[data-theme="dark"] .score-change.decrease {
  background: rgba(22, 163, 74, 0.15);
  color: #4ade80;
}

html.ion-palette-dark .trigger-badge.analysis,
html[data-theme="dark"] .trigger-badge.analysis {
  background: rgba(21, 128, 61, 0.2);
  color: #22c55e;
}

html.ion-palette-dark .trigger-badge.debate,
html[data-theme="dark"] .trigger-badge.debate {
  background: rgba(217, 119, 6, 0.2);
  color: #fbbf24;
}

html.ion-palette-dark .debate-badge,
html[data-theme="dark"] .debate-badge {
  background: rgba(217, 119, 6, 0.15);
}

html.ion-palette-dark .trigger-info,
html[data-theme="dark"] .trigger-info {
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
