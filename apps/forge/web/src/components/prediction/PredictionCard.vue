<template>
  <div
    class="prediction-card"
    :class="[statusClass, { selected: isSelected }]"
    @click="$emit('select', prediction.id)"
  >
    <div class="card-header">
      <div class="target-info">
        <div class="target-header">
          <span v-if="prediction.isTest" class="test-badge">TEST</span>
          <span class="target-symbol">{{ prediction.targetSymbol || 'N/A' }}</span>
          <span v-if="prediction.isArbitrator" class="analyst-badge arbitrator">Consensus</span>
          <span v-else-if="prediction.analystSlug" class="analyst-badge" :class="getAnalystClass(prediction.analystSlug)">
            {{ formatAnalystName(prediction.analystSlug) }}
          </span>
        </div>
        <span class="target-name">{{ prediction.targetName }}</span>
      </div>
      <div class="badges">
        <span
          v-if="outcomeStatus"
          class="outcome-badge"
          :class="outcomeStatus"
        >
          {{ outcomeStatus === 'correct' ? '✓ Correct' : '✗ Wrong' }}
        </span>
        <div class="status-badge" :class="statusClass">
          {{ prediction.status }}
        </div>
      </div>
    </div>

    <div class="card-body">
      <div class="direction-section">
        <div class="direction-indicator" :class="prediction.direction || 'neutral'">
          <span class="direction-icon">{{ directionIcon }}</span>
          <span class="direction-label">{{ (prediction.direction || 'neutral').toUpperCase() }}</span>
        </div>
        <div class="confidence-bar">
          <div
            class="confidence-fill"
            :style="{ width: `${Number(prediction.confidence || 0) * 100}%` }"
          ></div>
          <span class="confidence-label">{{ Math.round(Number(prediction.confidence || 0) * 100) }}%</span>
        </div>
      </div>

      <div class="metrics-row">
        <div v-if="prediction.magnitude != null" class="metric">
          <span class="metric-label">Magnitude</span>
          <span class="metric-value">{{ prediction.magnitude.toString().toUpperCase() }}</span>
        </div>
        <div v-if="prediction.timeframe" class="metric">
          <span class="metric-label">Timeframe</span>
          <span class="metric-value">{{ prediction.timeframe }}</span>
        </div>
        <div v-if="prediction.predictorCount" class="metric">
          <span class="metric-label">Predictors</span>
          <span class="metric-value">{{ prediction.predictorCount }}</span>
        </div>
      </div>

      <div class="llm-section">
        <LLMComparisonBadge
          :llm-ensemble-results="prediction.llmEnsembleResults"
          compact
        />
      </div>

      <!-- Expandable Analyst Opinions Section -->
      <div
        v-if="prediction.isArbitrator && prediction.analystAssessments?.length"
        class="analyst-opinions-section"
      >
        <button
          class="expand-toggle"
          @click.stop="isExpanded = !isExpanded"
        >
          <span class="toggle-icon">{{ isExpanded ? '\u25BC' : '\u25B6' }}</span>
          <span class="toggle-label">
            {{ prediction.analystAssessments.length }} Analyst Opinions
          </span>
          <span class="consensus-badge">
            {{ consensusSummary }}
          </span>
        </button>

        <div v-if="isExpanded" class="analyst-opinions-list">
          <div
            v-for="analyst in prediction.analystAssessments"
            :key="analyst.analystSlug"
            class="analyst-opinion clickable"
            :class="getDirectionClass(analyst.direction)"
            @click.stop="openAnalystModal(analyst as AnalystAssessment)"
          >
            <div class="analyst-header">
              <span class="analyst-name">{{ analyst.analystName }}</span>
              <span class="analyst-direction" :class="getDirectionClass(analyst.direction)">
                {{ getDirectionIcon(analyst.direction) }} {{ analyst.direction.toUpperCase() }}
              </span>
              <span class="analyst-confidence">
                {{ Math.round(analyst.confidence * 100) }}%
              </span>
              <span class="view-details-hint">Click for details</span>
            </div>
            <div v-if="analyst.reasoning" class="analyst-reasoning">
              {{ truncateReasoning(analyst.reasoning) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Analyst Opinion Detail Modal -->
    <AnalystOpinionModal
      :is-open="isAnalystModalOpen"
      :analyst="selectedAnalyst"
      @dismiss="closeAnalystModal"
    />

    <!-- Analyst Assessments Modal -->
    <AnalystAssessmentsModal
      :is-open="isAnalysisModalOpen"
      :prediction-id="prediction.id"
      @dismiss="closeAnalysisModal"
    />

    <div class="card-footer">
      <div class="footer-left">
        <div class="timestamp">
          <span class="label">Generated:</span>
          <span class="value">{{ formatDate(prediction.generatedAt) }}</span>
        </div>
        <div v-if="prediction.expiresAt" class="timestamp">
          <span class="label">Expires:</span>
          <span class="value">{{ formatDate(prediction.expiresAt) }}</span>
        </div>
      </div>
      <div class="footer-actions">
        <button
          class="analysis-btn"
          @click="handleViewAnalysis"
          title="View analyst assessments"
        >
          <span class="btn-icon">&#128101;</span>
          <span class="btn-text">Analysts</span>
        </button>
        <button
          v-if="canTakePosition"
          class="take-position-btn"
          @click="handleTakePosition"
          title="Take position based on this prediction"
        >
          <span class="btn-icon">&#128176;</span>
          <span class="btn-text">Take Position</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Prediction } from '@/services/predictionDashboardService';
import LLMComparisonBadge from './LLMComparisonBadge.vue';
import AnalystOpinionModal from './AnalystOpinionModal.vue';
import AnalystAssessmentsModal from './AnalystAssessmentsModal.vue';

// Fork assessment structure
interface ForkAssessment {
  direction: string;
  confidence: number;
  reasoning?: string;
}

// Type for analyst assessment from the Prediction
interface AnalystAssessment {
  analystSlug: string;
  analystName?: string;
  tier?: string;
  direction: string;
  confidence: number;
  reasoning?: string;
  keyFactors?: string[];
  risks?: string[];
  learningsApplied?: string[];
  // Three-way fork assessments
  userFork?: ForkAssessment;
  aiFork?: ForkAssessment;
  arbitratorFork?: ForkAssessment;
}

interface Props {
  prediction: Prediction;
  isSelected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
});

const emit = defineEmits<{
  select: [id: string];
  takePosition: [prediction: Prediction];
}>();

// Can take position if prediction is active and directional
const canTakePosition = computed(() => {
  const pred = props.prediction;
  return pred.status === 'active' && (pred.direction === 'up' || pred.direction === 'down');
});

function handleTakePosition(event: Event) {
  event.stopPropagation();
  emit('takePosition', props.prediction);
}

// Expandable state for analyst opinions
const isExpanded = ref(false);

// Modal state for detailed analyst view
const selectedAnalyst = ref<AnalystAssessment | null>(null);
const isAnalystModalOpen = ref(false);

function openAnalystModal(analyst: AnalystAssessment) {
  selectedAnalyst.value = analyst;
  isAnalystModalOpen.value = true;
}

function closeAnalystModal() {
  isAnalystModalOpen.value = false;
  selectedAnalyst.value = null;
}

// Analysis modal state
const isAnalysisModalOpen = ref(false);

function handleViewAnalysis(event: Event) {
  event.stopPropagation();
  isAnalysisModalOpen.value = true;
}

function closeAnalysisModal() {
  isAnalysisModalOpen.value = false;
}

const statusClass = computed(() => `status-${props.prediction.status || 'active'}`);

// Compute consensus summary for analyst opinions toggle
const consensusSummary = computed(() => {
  const assessments = props.prediction.analystAssessments;
  if (!assessments || assessments.length === 0) return '';

  const directions = assessments.reduce(
    (acc, a) => {
      const dir = a.direction.toLowerCase();
      if (dir === 'bullish' || dir === 'up') acc.up++;
      else if (dir === 'bearish' || dir === 'down') acc.down++;
      else acc.neutral++;
      return acc;
    },
    { up: 0, down: 0, neutral: 0 },
  );

  const parts: string[] = [];
  if (directions.up > 0) parts.push(`${directions.up} bullish`);
  if (directions.down > 0) parts.push(`${directions.down} bearish`);
  if (directions.neutral > 0) parts.push(`${directions.neutral} neutral`);
  return parts.join(', ');
});

// Helper to get direction class for styling
function getDirectionClass(direction: string): string {
  const dir = direction.toLowerCase();
  if (dir === 'bullish' || dir === 'up') return 'direction-up';
  if (dir === 'bearish' || dir === 'down') return 'direction-down';
  return 'direction-neutral';
}

// Helper to get direction icon
function getDirectionIcon(direction: string): string {
  const dir = direction.toLowerCase();
  if (dir === 'bullish' || dir === 'up') return '\u2191'; // ↑
  if (dir === 'bearish' || dir === 'down') return '\u2193'; // ↓
  return '\u2194'; // ↔
}

// Determine outcome status for resolved predictions
const outcomeStatus = computed((): 'correct' | 'incorrect' | null => {
  const pred = props.prediction;

  // Only show outcome for resolved predictions with outcome data
  if (pred.status !== 'resolved') return null;

  const outcomeValue = pred.outcomeValue;
  if (outcomeValue === null || outcomeValue === undefined) return null;

  // Determine actual direction from outcome value
  const actualDirection = outcomeValue > 0 ? 'up' : outcomeValue < 0 ? 'down' : 'flat';

  // Compare predicted direction with actual
  return pred.direction === actualDirection ? 'correct' : 'incorrect';
});

const directionIcon = computed(() => {
  switch (props.prediction.direction) {
    case 'up':
      return '\u2191'; // ↑
    case 'down':
      return '\u2193'; // ↓
    default:
      return '\u2194'; // ↔
  }
});

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Truncate long reasoning for card view (full version shown in modal)
function truncateReasoning(reasoning: string, maxLength = 120): string {
  if (!reasoning || reasoning.length <= maxLength) return reasoning;
  return reasoning.substring(0, maxLength).trim() + '...';
}

// Format analyst slug to display name (full name shows personality/tone)
function formatAnalystName(slug: string): string {
  const nameMap: Record<string, string> = {
    'fundamental-fred': 'Fundamental Fred',
    'technical-tina': 'Technical Tina',
    'sentiment-sally': 'Sentiment Sally',
    'aggressive-alex': 'Aggressive Alex',
    'cautious-carl': 'Cautious Carl',
    'arbitrator': 'Consensus',
  };
  return nameMap[slug] || slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Get CSS class for analyst badge color
function getAnalystClass(slug: string): string {
  const classMap: Record<string, string> = {
    'fundamental-fred': 'analyst-fred',
    'technical-tina': 'analyst-tina',
    'sentiment-sally': 'analyst-sally',
    'aggressive-alex': 'analyst-alex',
    'cautious-carl': 'analyst-carl',
  };
  return classMap[slug] || '';
}
</script>

<style scoped>
.prediction-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.prediction-card:hover {
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 2px 8px rgba(21, 128, 61, 0.15);
}

.prediction-card.selected {
  border-color: var(--ion-color-secondary, #15803d);
  background: var(--selected-bg, rgba(21, 128, 61, 0.06));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.target-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.target-symbol {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.target-name {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.badges {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.outcome-badge {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.outcome-badge.correct {
  background-color: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.outcome-badge.incorrect {
  background-color: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.status-active {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.status-resolved {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.status-expired {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.status-cancelled {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.direction-section {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.direction-indicator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-weight: 600;
}

.direction-indicator.up {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.direction-indicator.down {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.direction-indicator.flat {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.direction-icon {
  font-size: 1.25rem;
}

.direction-label {
  font-size: 0.875rem;
}

.confidence-bar {
  flex: 1;
  position: relative;
  height: 24px;
  background-color: var(--confidence-bg, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}

.confidence-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, var(--ion-color-secondary, #15803d), var(--ion-color-secondary-tint, #22c55e));
  border-radius: 4px;
  transition: width 0.3s ease;
}

.confidence-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.metrics-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.metric-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  color: var(--text-secondary, #6b7280);
}

.metric-value {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.llm-section {
  display: flex;
  justify-content: flex-start;
}

.card-footer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.footer-left {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.footer-actions {
  display: flex;
  gap: 0.5rem;
}

.analysis-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  color: var(--text-secondary, #6b7280);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.analysis-btn:hover {
  background: rgba(21, 128, 61, 0.08);
  border-color: var(--ion-color-secondary, #15803d);
  color: var(--ion-color-secondary, #15803d);
  transform: translateY(-1px);
}

.analysis-btn .btn-icon {
  font-size: 0.875rem;
}

.analysis-btn .btn-text {
  white-space: nowrap;
}

.take-position-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  color: var(--text-secondary, #6b7280);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.take-position-btn:hover {
  background: rgba(21, 128, 61, 0.08);
  border-color: var(--ion-color-secondary, #15803d);
  color: var(--ion-color-secondary, #15803d);
  transform: translateY(-1px);
}

.take-position-btn .btn-icon {
  font-size: 0.875rem;
}

.take-position-btn .btn-text {
  white-space: nowrap;
}

.timestamp {
  display: flex;
  gap: 0.25rem;
  font-size: 0.75rem;
  white-space: nowrap;
}

.timestamp .label {
  color: var(--text-secondary, #6b7280);
}

.timestamp .value {
  color: var(--text-primary, #111827);
  white-space: nowrap;
}

.target-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.test-badge {
  font-size: 0.5rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  background-color: rgba(139, 92, 246, 0.15);
  color: #7c3aed;
  margin-right: 0.25rem;
}

.analyst-badge {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 10px;
  margin-left: 0.375rem;
}

.analyst-badge.arbitrator {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(21, 128, 61, 0.15));
  color: #7c3aed;
  border: 1px solid rgba(139, 92, 246, 0.3);
}

.analyst-badge.analyst-fred {
  background-color: rgba(21, 128, 61, 0.12);
  color: #15803d;
}

.analyst-badge.analyst-tina {
  background-color: rgba(236, 72, 153, 0.12);
  color: #db2777;
}

.analyst-badge.analyst-sally {
  background-color: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.analyst-badge.analyst-alex {
  background-color: rgba(249, 115, 22, 0.12);
  color: #ea580c;
}

.analyst-badge.analyst-carl {
  background-color: rgba(107, 114, 128, 0.12);
  color: #4b5563;
}

/* Analyst Opinions Expandable Section */
.analyst-opinions-section {
  margin-top: 0.5rem;
  border-top: 1px dashed var(--border-color, #e5e7eb);
  padding-top: 0.5rem;
}

.expand-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.5rem;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.expand-toggle:hover {
  background-color: var(--hover-bg, rgba(0, 0, 0, 0.05));
}

.toggle-icon {
  font-size: 0.625rem;
  width: 0.75rem;
}

.toggle-label {
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.consensus-badge {
  margin-left: auto;
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
}

.analyst-opinions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-left: 0.75rem;
}

.analyst-opinion {
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--opinion-bg, rgba(0, 0, 0, 0.02));
  border-left: 3px solid var(--border-color, #e5e7eb);
}

.analyst-opinion.direction-up {
  border-left-color: #16a34a;
  background: rgba(34, 197, 94, 0.05);
}

.analyst-opinion.direction-down {
  border-left-color: #dc2626;
  background: rgba(239, 68, 68, 0.05);
}

.analyst-opinion.direction-neutral {
  border-left-color: #6b7280;
  background: rgba(107, 114, 128, 0.05);
}

.analyst-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.analyst-name {
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.analyst-direction {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.analyst-direction.direction-up {
  background-color: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.analyst-direction.direction-down {
  background-color: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.analyst-direction.direction-neutral {
  background-color: rgba(107, 114, 128, 0.15);
  color: #6b7280;
}

.analyst-confidence {
  margin-left: auto;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
}

.analyst-reasoning {
  margin-top: 0.375rem;
  font-size: 0.6875rem;
  color: var(--text-secondary, #6b7280);
  line-height: 1.4;
}

.analyst-opinion.clickable {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.analyst-opinion.clickable:hover {
  transform: translateX(2px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.view-details-hint {
  margin-left: auto;
  font-size: 0.5625rem;
  color: var(--text-tertiary, #9ca3af);
  font-style: italic;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.analyst-opinion.clickable:hover .view-details-hint {
  opacity: 1;
}

/* Dark mode */
html.ion-palette-dark .prediction-card,
html[data-theme="dark"] .prediction-card {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --selected-bg: rgba(21, 128, 61, 0.15);
  --confidence-bg: #374151;
  --hover-bg: rgba(255, 255, 255, 0.05);
  --opinion-bg: rgba(255, 255, 255, 0.02);
}

html.ion-palette-dark .analyst-opinion.direction-up,
html[data-theme="dark"] .analyst-opinion.direction-up {
  background: rgba(34, 197, 94, 0.1);
}

html.ion-palette-dark .analyst-opinion.direction-down,
html[data-theme="dark"] .analyst-opinion.direction-down {
  background: rgba(239, 68, 68, 0.1);
}

html.ion-palette-dark .analyst-opinion.direction-neutral,
html[data-theme="dark"] .analyst-opinion.direction-neutral {
  background: rgba(107, 114, 128, 0.1);
}
</style>
