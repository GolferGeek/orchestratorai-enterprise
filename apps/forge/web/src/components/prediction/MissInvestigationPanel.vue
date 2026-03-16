<template>
  <div class="miss-investigation-panel">
    <h3 class="panel-title">Investigation Results</h3>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading investigation...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
    </div>

    <!-- Investigation Content -->
    <div v-else-if="investigation" class="investigation-content">
      <!-- Summary Section -->
      <section class="summary-section">
        <div class="miss-type-badge" :class="investigation.missType">
          {{ formatMissType(investigation.missType) }}
        </div>
        <div class="prediction-comparison">
          <div class="comparison-item">
            <span class="comparison-label">Predicted</span>
            <span class="direction-badge" :class="investigation.predicted.direction">
              {{ investigation.predicted.direction.toUpperCase() }}
            </span>
            <span class="confidence-text">{{ Math.round(investigation.predicted.confidence * 100) }}%</span>
          </div>
          <span class="comparison-arrow">vs</span>
          <div class="comparison-item">
            <span class="comparison-label">Actual</span>
            <span class="direction-badge" :class="investigation.actual.direction">
              {{ investigation.actual.direction.toUpperCase() }}
            </span>
            <span class="magnitude-text">{{ formatPercent(investigation.actual.magnitude) }}%</span>
          </div>
        </div>
        <div class="investigation-level">
          <span class="level-label">Investigation Level:</span>
          <span class="level-badge" :class="investigation.investigationLevel">
            {{ formatLevel(investigation.investigationLevel) }}
          </span>
        </div>
      </section>

      <!-- Level 1: Unused Predictors -->
      <section v-if="investigation.unusedPredictors.length > 0" class="tree-section">
        <div class="section-header" @click="toggleSection('predictors')">
          <span class="section-icon predictor-icon">Pr</span>
          <h4>Unused Predictors ({{ investigation.unusedPredictors.length }})</h4>
          <span class="toggle-icon">{{ expandedSections.predictors ? '-' : '+' }}</span>
        </div>
        <p class="section-description">
          Predictors that existed but weren't used in a prediction
        </p>

        <div v-if="expandedSections.predictors" class="tree-children">
          <div
            v-for="unused in investigation.unusedPredictors"
            :key="unused.predictor.id"
            class="tree-node predictor"
          >
            <div class="node-header" :class="unused.predictor.direction">
              <span class="node-icon predictor-icon">Pr</span>
              <span class="node-title">
                <span class="direction-badge" :class="unused.predictor.direction">
                  {{ unused.predictor.direction.toUpperCase() }}
                </span>
                <span class="analyst-name">{{ unused.predictor.analyst_slug }}</span>
              </span>
              <span class="reason-badge" :class="unused.reason">
                {{ formatReason(unused.reason) }}
              </span>
            </div>
            <div class="node-details">
              <div class="detail-row">
                <span class="detail-label">Confidence:</span>
                <span class="detail-value">{{ Math.round(unused.predictor.confidence * 100) }}%</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Strength:</span>
                <span class="detail-value">{{ unused.predictor.strength }}/10</span>
              </div>
              <div v-if="unused.suggestedThreshold" class="detail-row suggested">
                <span class="detail-label">Suggested Threshold:</span>
                <span class="detail-value">{{ Math.round(unused.suggestedThreshold * 100) }}%</span>
              </div>
            </div>

            <!-- Linked Signal -->
            <div v-if="unused.predictor.signal" class="tree-children">
              <div class="tree-node signal">
                <div class="node-header" :class="unused.predictor.signal.direction">
                  <span class="node-icon signal-icon">S</span>
                  <span class="node-title">Signal</span>
                  <span class="direction-badge small" :class="unused.predictor.signal.direction">
                    {{ unused.predictor.signal.direction.toUpperCase() }}
                  </span>
                </div>
                <div class="node-details">
                  <p class="signal-content">{{ truncate(unused.predictor.signal.content, 150) }}</p>
                  <div v-if="unused.predictor.signal.source" class="source-info">
                    <span class="source-label">Source:</span>
                    <span class="source-name">{{ unused.predictor.signal.source.name }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Level 2: Misread Signals -->
      <section v-if="investigation.misreadSignals.length > 0" class="tree-section">
        <div class="section-header" @click="toggleSection('signals')">
          <span class="section-icon signal-icon">S</span>
          <h4>Misread Signals ({{ investigation.misreadSignals.length }})</h4>
          <span class="toggle-icon">{{ expandedSections.signals ? '-' : '+' }}</span>
        </div>
        <p class="section-description">
          Signals that were evaluated incorrectly or rejected
        </p>

        <div v-if="expandedSections.signals" class="tree-children">
          <div
            v-for="misread in investigation.misreadSignals"
            :key="misread.signal.id"
            class="tree-node signal misread"
          >
            <div class="node-header" :class="misread.signal.direction">
              <span class="node-icon signal-icon">S</span>
              <span class="node-title">
                <span class="direction-badge" :class="misread.signal.direction">
                  {{ misread.signalDirection.toUpperCase() }}
                </span>
                <span class="arrow-indicator">should have been</span>
                <span class="direction-badge" :class="misread.actualDirection">
                  {{ misread.actualDirection.toUpperCase() }}
                </span>
              </span>
              <span class="issue-badge" :class="misread.possibleIssue">
                {{ formatIssue(misread.possibleIssue) }}
              </span>
            </div>
            <div class="node-details">
              <p class="signal-content">{{ truncate(misread.signal.content, 150) }}</p>
              <div class="detail-row">
                <span class="detail-label">Disposition:</span>
                <span class="detail-value disposition" :class="misread.originalDisposition">
                  {{ misread.originalDisposition }}
                </span>
              </div>
              <div v-if="misread.signal.source" class="source-info">
                <span class="source-label">Source:</span>
                <span class="source-name">{{ misread.signal.source.name }}</span>
                <span class="source-type">({{ misread.signal.source.source_type }})</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Level 3: Source Research -->
      <section v-if="investigation.sourceResearch" class="tree-section research">
        <div class="section-header" @click="toggleSection('research')">
          <span class="section-icon research-icon">R</span>
          <h4>Source Research</h4>
          <span class="predictability-badge" :class="investigation.sourceResearch.predictability">
            {{ investigation.sourceResearch.predictability }}
          </span>
          <span class="toggle-icon">{{ expandedSections.research ? '-' : '+' }}</span>
        </div>
        <p class="section-description">
          AI research into what caused this move and what sources could have predicted it
        </p>

        <div v-if="expandedSections.research" class="research-content">
          <!-- Discovered Drivers -->
          <div v-if="investigation.sourceResearch.discoveredDrivers.length > 0" class="research-subsection">
            <h5>Discovered Drivers</h5>
            <ul class="drivers-list">
              <li v-for="(driver, idx) in investigation.sourceResearch.discoveredDrivers" :key="idx">
                {{ driver }}
              </li>
            </ul>
          </div>

          <!-- Signal Types Needed -->
          <div v-if="investigation.sourceResearch.signalTypesNeeded.length > 0" class="research-subsection">
            <h5>Signal Types Needed</h5>
            <div class="tags-container">
              <span
                v-for="type in investigation.sourceResearch.signalTypesNeeded"
                :key="type"
                class="signal-type-tag"
              >
                {{ type }}
              </span>
            </div>
          </div>

          <!-- Suggested Sources -->
          <div v-if="investigation.sourceResearch.suggestedSources.length > 0" class="research-subsection">
            <h5>Suggested Sources</h5>
            <div class="sources-grid">
              <div
                v-for="source in investigation.sourceResearch.suggestedSources"
                :key="source.name"
                class="source-card"
              >
                <div class="source-header">
                  <span class="source-name">{{ source.name }}</span>
                  <span class="source-type-badge">{{ source.type }}</span>
                </div>
                <p class="source-description">{{ source.description }}</p>
                <a
                  v-if="source.url"
                  :href="source.url"
                  target="_blank"
                  class="source-link"
                >
                  Visit Source
                </a>
              </div>
            </div>
          </div>

          <!-- AI Reasoning -->
          <div class="research-subsection reasoning">
            <h5>AI Reasoning</h5>
            <p class="reasoning-text">{{ investigation.sourceResearch.reasoning }}</p>
          </div>
        </div>
      </section>

      <!-- Suggested Learning -->
      <section v-if="investigation.suggestedLearning" class="learning-section">
        <div class="section-header learning">
          <span class="section-icon learning-icon">L</span>
          <h4>Suggested Learning</h4>
        </div>
        <div class="learning-card">
          <div class="learning-header">
            <span class="learning-type-badge">{{ investigation.suggestedLearning.type }}</span>
            <span class="learning-scope">{{ investigation.suggestedLearning.scope }}</span>
          </div>
          <h5 class="learning-title">{{ investigation.suggestedLearning.title }}</h5>
          <p class="learning-description">{{ investigation.suggestedLearning.description }}</p>
          <div class="learning-evidence">
            <span class="evidence-label">Evidence:</span>
            <ul>
              <li v-for="(finding, idx) in investigation.suggestedLearning.evidence.keyFindings" :key="idx">
                {{ finding }}
              </li>
            </ul>
          </div>
          <div class="learning-actions">
            <button class="btn btn-primary" @click="approveLearningSuggestion">
              Approve Learning
            </button>
            <button class="btn btn-secondary" @click="createCustomLearning">
              Create Custom Learning
            </button>
          </div>
        </div>
      </section>

      <!-- No Investigation Data -->
      <div v-if="!hasInvestigationData" class="empty-investigation">
        <p>No investigation data available yet.</p>
        <button class="btn btn-primary" @click="triggerInvestigation">
          Run Investigation
        </button>
      </div>
    </div>

    <!-- No Investigation -->
    <div v-else class="empty-state">
      <span class="empty-icon">?</span>
      <p>No investigation loaded</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';

// Types matching the backend interfaces
interface SourceInfo {
  id: string;
  name: string;
  source_type: string;
  url: string | null;
}

interface SignalWithSource {
  id: string;
  content: string;
  direction: string;
  source?: SourceInfo;
}

interface PredictorWithSignal {
  id: string;
  direction: string;
  confidence: number;
  strength: number;
  analyst_slug: string;
  signal?: SignalWithSource;
}

interface UnusedPredictorAnalysis {
  predictor: PredictorWithSignal;
  reason: string;
  suggestedThreshold?: number;
}

interface MisreadSignalAnalysis {
  signal: SignalWithSource;
  originalDisposition: string;
  signalDirection: string;
  actualDirection: string;
  possibleIssue: string;
}

interface SuggestedSource {
  name: string;
  type: string;
  url?: string;
  description: string;
}

interface SourceResearchResult {
  discoveredDrivers: string[];
  signalsWeHad: string[];
  signalTypesNeeded: string[];
  suggestedSources: SuggestedSource[];
  predictability: string;
  reasoning: string;
}

interface SuggestedLearning {
  type: string;
  scope: string;
  title: string;
  description: string;
  config: Record<string, unknown>;
  evidence: {
    missType: string;
    investigationLevel: string;
    keyFindings: string[];
  };
}

interface MissInvestigation {
  id: string;
  missType: string;
  predicted: {
    direction: string;
    magnitude: string | null;
    confidence: number;
  };
  actual: {
    direction: string;
    magnitude: number;
  };
  investigationLevel: string;
  unusedPredictors: UnusedPredictorAnalysis[];
  misreadSignals: MisreadSignalAnalysis[];
  sourceResearch?: SourceResearchResult;
  suggestedLearning?: SuggestedLearning;
}

interface Props {
  investigation?: MissInvestigation | null;
  isLoading?: boolean;
  error?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  investigation: null,
  isLoading: false,
  error: null,
});

const emit = defineEmits<{
  (e: 'approve-learning', learning: SuggestedLearning): void;
  (e: 'create-learning', investigation: MissInvestigation): void;
  (e: 'trigger-investigation'): void;
}>();

const expandedSections = reactive({
  predictors: true,
  signals: true,
  research: true,
});

const hasInvestigationData = computed(() => {
  if (!props.investigation) return false;
  return (
    props.investigation.unusedPredictors.length > 0 ||
    props.investigation.misreadSignals.length > 0 ||
    props.investigation.sourceResearch !== undefined
  );
});

function toggleSection(section: 'predictors' | 'signals' | 'research') {
  expandedSections[section] = !expandedSections[section];
}

function formatMissType(type: string): string {
  const labels: Record<string, string> = {
    missed_opportunity: 'Missed Opportunity',
    direction_wrong: 'Direction Wrong',
    magnitude_wrong: 'Magnitude Underestimated',
    false_positive: 'False Positive',
  };
  return labels[type] || type;
}

function formatLevel(level: string): string {
  const labels: Record<string, string> = {
    predictor: 'Level 1: Predictor Issue',
    signal: 'Level 2: Signal Issue',
    source: 'Level 3: Missing Sources',
    unpredictable: 'Unpredictable Event',
  };
  return labels[level] || level;
}

function formatReason(reason: string): string {
  const labels: Record<string, string> = {
    below_threshold: 'Below Threshold',
    insufficient_count: 'Not Enough Predictors',
    conflicting: 'Conflicting Signals',
    expired: 'Expired',
    wrong_timeframe: 'Wrong Timeframe',
  };
  return labels[reason] || reason;
}

function formatIssue(issue: string): string {
  const labels: Record<string, string> = {
    rejected_incorrectly: 'Rejected Incorrectly',
    wrong_direction: 'Wrong Direction',
    underweighted: 'Underweighted',
    missed_urgency: 'Missed Urgency',
  };
  return labels[issue] || issue;
}

function formatPercent(value: number): string {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function truncate(text: string, maxLength: number): string {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

function approveLearningSuggestion() {
  if (props.investigation?.suggestedLearning) {
    emit('approve-learning', props.investigation.suggestedLearning);
  }
}

function createCustomLearning() {
  if (props.investigation) {
    emit('create-learning', props.investigation);
  }
}

function triggerInvestigation() {
  emit('trigger-investigation');
}
</script>

<style scoped>
.miss-investigation-panel {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
}

.panel-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: var(--text-primary, #111827);
}

/* Loading & Error States */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color, #e5e7eb);
  border-top-color: var(--ion-color-secondary, #15803d);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state {
  color: #dc2626;
}

.error-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fef2f2;
  color: #dc2626;
  border-radius: 50%;
  font-weight: bold;
  font-size: 0.75rem;
}

/* Summary Section */
.summary-section {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  background: var(--summary-bg, #f9fafb);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.miss-type-badge {
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.miss-type-badge.missed_opportunity {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.miss-type-badge.direction_wrong {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.miss-type-badge.magnitude_wrong {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
}

.miss-type-badge.false_positive {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.prediction-comparison {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.comparison-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.comparison-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.comparison-arrow {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
}

.confidence-text,
.magnitude-text {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.investigation-level {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.level-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.level-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.625rem;
  font-weight: 600;
}

.level-badge.predictor {
  background: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.level-badge.signal {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.level-badge.source {
  background: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.level-badge.unpredictable {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

/* Direction Badges */
.direction-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-size: 0.625rem;
  font-weight: 600;
}

.direction-badge.up {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.direction-badge.down {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.direction-badge.flat {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.direction-badge.bullish {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.direction-badge.bearish {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.direction-badge.neutral {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.direction-badge.small {
  font-size: 0.5rem;
  padding: 0.0625rem 0.25rem;
}

/* Tree Structure */
.tree-section {
  margin-bottom: 1rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--section-header-bg, #f9fafb);
  cursor: pointer;
  user-select: none;
}

.section-header:hover {
  background: var(--section-header-hover, #f3f4f6);
}

.section-header h4 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  flex: 1;
}

.section-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 0.625rem;
  font-weight: 700;
  color: white;
}

.predictor-icon { background: #8b5cf6; }
.signal-icon { background: #f59e0b; }
.research-icon { background: #15803d; }
.learning-icon { background: #10b981; }

.toggle-icon {
  font-size: 1rem;
  font-weight: bold;
  color: var(--text-secondary, #6b7280);
}

.section-description {
  margin: 0;
  padding: 0 1rem 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.tree-children {
  padding: 0.5rem 1rem 1rem;
}

.tree-node {
  margin-bottom: 0.75rem;
}

.tree-node:last-child {
  margin-bottom: 0;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--node-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  border-left: 3px solid var(--node-accent, #6b7280);
}

.node-header.bullish,
.node-header.up {
  --node-accent: #22c55e;
}

.node-header.bearish,
.node-header.down {
  --node-accent: #ef4444;
}

.node-header.neutral,
.node-header.flat {
  --node-accent: #6b7280;
}

.node-icon {
  width: 20px;
  height: 20px;
  font-size: 0.5rem;
}

.node-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
}

.analyst-name {
  color: var(--text-secondary, #6b7280);
  font-size: 0.75rem;
}

.arrow-indicator {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
}

.reason-badge,
.issue-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-size: 0.625rem;
  font-weight: 500;
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.reason-badge.below_threshold,
.reason-badge.insufficient_count {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.reason-badge.expired {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.issue-badge.rejected_incorrectly {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.issue-badge.wrong_direction {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
}

.node-details {
  padding: 0.5rem 0.5rem 0.5rem 2rem;
  font-size: 0.75rem;
}

.detail-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.detail-row.suggested {
  color: #16a34a;
  font-weight: 500;
}

.detail-label {
  color: var(--text-secondary, #6b7280);
  min-width: 100px;
}

.detail-value {
  color: var(--text-primary, #111827);
}

.detail-value.disposition {
  padding: 0.0625rem 0.25rem;
  border-radius: 2px;
  font-size: 0.625rem;
  text-transform: uppercase;
}

.detail-value.disposition.rejected {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.detail-value.disposition.expired {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.signal-content {
  margin: 0 0 0.5rem;
  font-style: italic;
  line-height: 1.4;
  color: var(--text-primary, #111827);
}

.source-info {
  display: flex;
  gap: 0.375rem;
  align-items: center;
}

.source-label {
  color: var(--text-secondary, #6b7280);
}

.source-name {
  font-weight: 500;
}

.source-type {
  color: var(--text-secondary, #6b7280);
  font-size: 0.625rem;
}

/* Research Section */
.research-content {
  padding: 1rem;
}

.research-subsection {
  margin-bottom: 1rem;
}

.research-subsection:last-child {
  margin-bottom: 0;
}

.research-subsection h5 {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.drivers-list {
  margin: 0;
  padding-left: 1.25rem;
}

.drivers-list li {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.signal-type-tag {
  padding: 0.25rem 0.5rem;
  background: rgba(21, 128, 61, 0.1);
  color: #15803d;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
}

.source-card {
  padding: 0.75rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.source-card .source-name {
  font-size: 0.875rem;
  font-weight: 600;
}

.source-type-badge {
  padding: 0.125rem 0.25rem;
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
  border-radius: 3px;
  font-size: 0.5rem;
  font-weight: 600;
  text-transform: uppercase;
}

.source-description {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  line-height: 1.4;
}

.source-link {
  font-size: 0.75rem;
  color: #15803d;
  text-decoration: none;
}

.source-link:hover {
  text-decoration: underline;
}

.reasoning-text {
  margin: 0;
  padding: 0.75rem;
  background: var(--reasoning-bg, rgba(21, 128, 61, 0.06));
  border-radius: 6px;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--text-primary, #111827);
}

.predictability-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
}

.predictability-badge.predictable {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.predictability-badge.difficult {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.predictability-badge.unpredictable {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

/* Learning Section */
.learning-section {
  margin-top: 1rem;
}

.section-header.learning {
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 8px 8px 0 0;
  cursor: default;
}

.learning-card {
  padding: 1rem;
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-top: none;
  border-radius: 0 0 8px 8px;
}

.learning-header {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.learning-type-badge {
  padding: 0.125rem 0.375rem;
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  border-radius: 3px;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
}

.learning-scope {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.learning-title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.learning-description {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  line-height: 1.5;
}

.learning-evidence {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--evidence-bg, #f9fafb);
  border-radius: 6px;
}

.evidence-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  display: block;
  margin-bottom: 0.5rem;
}

.learning-evidence ul {
  margin: 0;
  padding-left: 1.25rem;
}

.learning-evidence li {
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-primary, #111827);
}

.learning-actions {
  display: flex;
  gap: 0.75rem;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background-color: var(--ion-color-secondary, #15803d);
  color: white;
}

.btn-primary:hover {
  background-color: var(--ion-color-secondary-shade, #166534);
}

.btn-secondary {
  background-color: var(--btn-secondary-bg, #f3f4f6);
  color: var(--btn-secondary-text, #374151);
}

.btn-secondary:hover {
  background-color: var(--btn-secondary-hover, #e5e7eb);
}

/* Empty Investigation */
.empty-investigation {
  text-align: center;
  padding: 2rem;
}

.empty-investigation p {
  margin: 0 0 1rem;
  color: var(--text-secondary, #6b7280);
}

.empty-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

/* Dark Mode */
html.ion-palette-dark .miss-investigation-panel,
html[data-theme="dark"] .miss-investigation-panel {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --summary-bg: rgba(255, 255, 255, 0.05);
  --section-header-bg: rgba(255, 255, 255, 0.05);
  --section-header-hover: rgba(255, 255, 255, 0.1);
  --node-bg: #1f2937;
  --reasoning-bg: rgba(21, 128, 61, 0.15);
  --evidence-bg: rgba(255, 255, 255, 0.05);
  --btn-secondary-bg: #374151;
  --btn-secondary-text: #f9fafb;
  --btn-secondary-hover: #4b5563;
}
</style>
