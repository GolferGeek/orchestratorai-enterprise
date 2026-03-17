<template>
  <div class="risk-detail-view">
    <!-- Subject Header -->
    <div class="detail-header">
      <div class="subject-info">
        <h3>{{ subject.identifier }}</h3>
        <p>{{ subject.name }}</p>
      </div>
    </div>

    <!-- Composite Score Card -->
    <div v-if="compositeScore" class="score-card">
      <div class="score-main">
        <RiskScoreBadge :score="getCompositeScoreValue(compositeScore)" />
        <span class="confidence">
          Confidence: {{ formatPercent(getConfidenceValue(compositeScore)) }}
        </span>
      </div>
      <div class="score-meta">
        <span>Last analyzed: {{ formatDate(getCreatedAt(compositeScore)) }}</span>
        <span v-if="getDebateAdjustment(compositeScore)">
          Debate adjustment: {{ formatAdjustment(getDebateAdjustment(compositeScore)) }}
        </span>
      </div>
    </div>

    <!-- Radar Chart -->
    <div class="radar-section" v-if="(assessments?.length ?? 0) > 0">
      <h4>Risk Radar</h4>
      <RiskRadarChart :assessments="assessments" />
    </div>

    <!-- Dimension Assessments -->
    <div class="assessments-section">
      <h4>Dimension Assessments</h4>
      <div class="assessments-grid">
        <RiskDimensionCard
          v-for="assessment in assessments"
          :key="assessment.id"
          :assessment="assessment"
        />
      </div>
    </div>

    <!-- Debate Summary -->
    <div v-if="debate" class="debate-section">
      <h4>Red Team / Blue Team Debate</h4>
      <RiskDebateSummary :debate="debate" />
    </div>

    <!-- Alerts -->
    <div v-if="(alerts?.length ?? 0) > 0" class="alerts-section">
      <h4>Active Alerts</h4>
      <div class="alerts-list">
        <div
          v-for="alert in alerts"
          :key="alert.id"
          class="alert-item clickable"
          :class="alert.severity"
          @click="selectAlert(alert)"
        >
          <span class="alert-severity">{{ alert.severity }}</span>
          <span class="alert-message">{{ alert.message }}</span>
          <span class="alert-time">{{ formatDate(getAlertCreatedAt(alert)) }}</span>
        </div>
      </div>
    </div>

    <!-- Analysis Actions -->
    <div class="actions-section">
      <h4>Analysis Actions</h4>
      <div class="action-grid">
        <!-- Re-analyze (Risk Radar) -->
        <button
          class="action-btn action-primary"
          :disabled="isAnalyzing"
          @click="$emit('analyze', subject.id)"
        >
          <span class="action-icon">📊</span>
          <span class="action-label">
            <span v-if="isAnalyzing" class="spinner-small"></span>
            {{ isAnalyzing ? 'Analyzing...' : 'Re-analyze' }}
          </span>
          <span class="action-desc">Run Risk Radar on all dimensions</span>
        </button>

        <!-- Trigger Debate -->
        <button
          class="action-btn action-debate"
          :disabled="isDebating || !hasCompositeScore"
          @click="$emit('trigger-debate', subject.id)"
        >
          <span class="action-icon">⚔️</span>
          <span class="action-label">
            <span v-if="isDebating" class="spinner-small"></span>
            {{ isDebating ? 'Debating...' : 'Red vs Blue' }}
          </span>
          <span class="action-desc">Adversarial debate analysis</span>
        </button>

        <!-- Score History -->
        <button
          class="action-btn action-history"
          @click="$emit('view-history', subject.id)"
        >
          <span class="action-icon">📈</span>
          <span class="action-label">History</span>
          <span class="action-desc">Score trends over time</span>
        </button>

        <!-- Compare -->
        <button
          class="action-btn action-compare"
          @click="$emit('add-to-compare', subject.id)"
        >
          <span class="action-icon">⚖️</span>
          <span class="action-label">Compare</span>
          <span class="action-desc">Add to comparison</span>
        </button>
      </div>
    </div>

    <!-- Alert Detail Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="selectedAlert" class="modal-overlay" @click.self="closeAlertModal">
          <div class="modal-content">
            <div class="modal-header" :class="`severity-${selectedAlert.severity}`">
              <h3>{{ getSeverityLabel(selectedAlert.severity) }} Alert</h3>
              <button class="modal-close" @click="closeAlertModal">&times;</button>
            </div>
            <div class="modal-body">
              <div class="alert-message-full">
                {{ selectedAlert.message }}
              </div>

              <div class="detail-row">
                <span class="detail-label">Created:</span>
                <span class="detail-value">{{ formatDate(getAlertCreatedAt(selectedAlert)) }}</span>
              </div>

              <div v-if="getAlertDetails(selectedAlert).triggerScore !== undefined" class="detail-row">
                <span class="detail-label">Trigger Score:</span>
                <span class="detail-value" :class="getScoreClass(getAlertDetails(selectedAlert).triggerScore)">
                  {{ formatPercent(getAlertDetails(selectedAlert).triggerScore ?? 0) }}
                </span>
              </div>

              <div v-if="getAlertDetails(selectedAlert).threshold !== undefined" class="detail-row">
                <span class="detail-label">Threshold:</span>
                <span class="detail-value">{{ formatPercent(getAlertDetails(selectedAlert).threshold ?? 0) }}</span>
              </div>

              <div v-if="getAlertDetails(selectedAlert).previousScore !== undefined" class="detail-row">
                <span class="detail-label">Previous Score:</span>
                <span class="detail-value">{{ formatPercent(getAlertDetails(selectedAlert).previousScore ?? 0) }}</span>
              </div>

              <div v-if="getAlertDetails(selectedAlert).changePercent !== undefined" class="detail-row">
                <span class="detail-label">Change:</span>
                <span class="detail-value" :class="(getAlertDetails(selectedAlert).changePercent ?? 0) > 0 ? 'increase' : 'decrease'">
                  {{ (getAlertDetails(selectedAlert).changePercent ?? 0) > 0 ? '+' : '' }}{{ (getAlertDetails(selectedAlert).changePercent ?? 0).toFixed(1) }}%
                </span>
              </div>

              <div v-if="getAlertDetails(selectedAlert).dimensions && (getAlertDetails(selectedAlert).dimensions?.length ?? 0) > 0" class="detail-section">
                <span class="detail-label">Affected Dimensions:</span>
                <ul class="dimensions-list">
                  <li v-for="dim in getAlertDetails(selectedAlert).dimensions" :key="dim">
                    {{ formatDimensionName(dim) }}
                  </li>
                </ul>
              </div>

              <div v-if="getAlertAcknowledgedAt(selectedAlert)" class="detail-section acknowledged">
                <span class="detail-label">Acknowledged:</span>
                <p>{{ formatDate(getAlertAcknowledgedAt(selectedAlert)) }}</p>
                <p v-if="getAlertAcknowledgedBy(selectedAlert)">
                  By: {{ getAlertAcknowledgedBy(selectedAlert) }}
                </p>
              </div>

              <!-- Alert Context Section - Why did this happen? -->
              <div class="context-section">
                <h4>Why did this happen?</h4>

                <div v-if="alertContextLoading" class="context-loading">
                  Loading analysis context...
                </div>

                <div v-else-if="alertContextError" class="context-error">
                  {{ alertContextError }}
                </div>

                <div v-else-if="alertContext?.assessment" class="context-content">
                  <div class="context-dimension">
                    <span class="context-label">Primary Driver:</span>
                    <span class="context-value">{{ alertContext.assessment.dimension_name || formatDimensionName(alertContext.assessment.dimension_slug) }}</span>
                    <span class="context-score" :class="getScoreClass(alertContext.assessment.score)">
                      {{ formatPercent(alertContext.assessment.score) }}
                    </span>
                  </div>

                  <div v-if="alertContext.assessment.reasoning" class="context-reasoning">
                    <span class="context-label">Analysis Reasoning:</span>
                    <!-- eslint-disable-next-line vue/no-v-html -- Intentional: Rendering sanitized markdown/HTML content from trusted source -->
                    <div class="reasoning-content" v-html="formatReasoning(alertContext.assessment.reasoning)"></div>
                  </div>

                  <div v-if="alertContext.assessment.signals && alertContext.assessment.signals.length > 0" class="context-signals">
                    <span class="context-label">Key Signals:</span>
                    <ul class="signals-list">
                      <li
                        v-for="(signal, idx) in alertContext.assessment.signals"
                        :key="idx"
                        :class="`signal-${signal.impact || 'neutral'}`"
                        class="signal-item"
                        @click="showSignalDetail(signal)"
                      >
                        <strong>{{ signal.name ?? 'Signal' }}</strong>: {{ signal.value ?? signal.description }}
                        <span v-if="signal.weight" class="signal-weight">({{ ((signal.weight ?? 0) * 100).toFixed(0) }}%)</span>
                      </li>
                    </ul>
                  </div>

                  <div v-if="alertContext.previousAssessment" class="context-comparison">
                    <span class="context-label">Previous Assessment:</span>
                    <div class="comparison-row">
                      <span>Score: {{ formatPercent(alertContext.previousAssessment.score) }}</span>
                      <span class="score-change" :class="alertContext.assessment.score > alertContext.previousAssessment.score ? 'increase' : 'decrease'">
                        {{ alertContext.assessment.score > alertContext.previousAssessment.score ? '+' : '' }}{{ ((alertContext.assessment.score - alertContext.previousAssessment.score)).toFixed(0) }} points
                      </span>
                    </div>
                    <!-- eslint-disable-next-line vue/no-v-html -- Intentional: Rendering sanitized markdown/HTML content from trusted source -->
                    <div v-if="alertContext.previousAssessment.reasoning" class="previous-reasoning" v-html="formatReasoning(alertContext.previousAssessment.reasoning)"></div>
                  </div>
                </div>

                <div v-else class="context-empty">
                  No additional context available for this alert.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Signal Detail Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="selectedSignal" class="modal-overlay signal-modal-overlay" @click.self="closeSignalModal">
          <div class="modal-content signal-modal">
            <div class="modal-header signal-modal-header">
              <h3>Signal Details</h3>
              <button class="modal-close" @click="closeSignalModal">&times;</button>
            </div>
            <div class="modal-body">
              <div class="signal-detail-row">
                <span class="detail-label">Signal:</span>
                <span class="detail-value">{{ selectedSignal.name || 'Unknown' }}</span>
              </div>

              <div v-if="selectedSignal.value !== undefined && selectedSignal.value !== null" class="signal-detail-row">
                <span class="detail-label">Value:</span>
                <span class="detail-value signal-value-text">{{ selectedSignal.value }}</span>
              </div>

              <div class="signal-detail-row">
                <span class="detail-label">Impact:</span>
                <span class="detail-value" :class="`impact-${selectedSignal.impact || 'neutral'}`">
                  {{ (selectedSignal.impact || 'neutral').charAt(0).toUpperCase() + (selectedSignal.impact || 'neutral').slice(1) }}
                </span>
              </div>

              <div v-if="selectedSignal.weight" class="signal-detail-row">
                <span class="detail-label">Weight:</span>
                <span class="detail-value">{{ (selectedSignal.weight * 100).toFixed(0) }}%</span>
              </div>

              <div v-if="selectedSignal.source" class="signal-detail-row">
                <span class="detail-label">Source:</span>
                <span class="detail-value">{{ selectedSignal.source }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { RiskSubject, RiskCompositeScore, RiskAssessment, RiskDebate, RiskAlert, AlertDetails } from '@/types/risk-agent';
import RiskScoreBadge from './shared/RiskScoreBadge.vue';
import RiskRadarChart from './RiskRadarChart.vue';
import RiskDimensionCard from './RiskDimensionCard.vue';
import RiskDebateSummary from './RiskDebateSummary.vue';
import { riskDashboardService } from '@/services/riskDashboardService';

// Type for alert context returned by getAlertWithContext
interface AlertContext {
  assessment?: {
    dimension_slug: string;
    dimension_name: string;
    score: number;
    confidence: number;
    reasoning?: string;
    signals?: Array<{
      name?: string;
      description: string;
      impact: string;
      value?: unknown;
      weight?: number;
      source?: string;
    }>;
    evidence?: string;
  };
  previousAssessment?: {
    score: number;
    reasoning?: string;
    signals?: Array<{
      name?: string;
      description: string;
      impact: string;
      value?: unknown;
      weight?: number;
      source?: string;
    }>;
  };
}

interface Props {
  subject: RiskSubject;
  compositeScore: RiskCompositeScore | null;
  assessments: RiskAssessment[];
  debate: RiskDebate | null;
  alerts: RiskAlert[];
  isAnalyzing?: boolean;
  isDebating?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  compositeScore: () => null,
  assessments: () => [],
  debate: () => null,
  alerts: () => [],
  isAnalyzing: false,
  isDebating: false,
});

defineEmits<{
  (e: 'analyze', subjectId: string): void;
  (e: 'trigger-debate', subjectId: string): void;
  (e: 'view-history', subjectId: string): void;
  (e: 'add-to-compare', subjectId: string): void;
}>();

// Computed to check if we have a composite score (debate requires one)
const hasCompositeScore = computed(() => !!props.compositeScore);

// Alert modal state
const selectedAlert = ref<RiskAlert | null>(null);
const alertContext = ref<AlertContext | null>(null);
const alertContextLoading = ref(false);
const alertContextError = ref<string | null>(null);

// Signal detail modal state
interface SignalData {
  name?: string;
  value?: unknown;
  impact?: string;
  weight?: number;
  source?: string;
}
const selectedSignal = ref<SignalData | null>(null);

function showSignalDetail(signal: SignalData) {
  selectedSignal.value = signal;
}

function closeSignalModal() {
  selectedSignal.value = null;
}

async function selectAlert(alert: RiskAlert) {
  selectedAlert.value = alert;
  alertContext.value = null;
  alertContextError.value = null;
  alertContextLoading.value = true;

  console.log('[RiskDetailView] selectAlert called with:', alert.id);

  try {
    const response = await riskDashboardService.getAlertWithContext(alert.id);
    console.log('[RiskDetailView] Alert context response:', JSON.stringify(response, null, 2));

    if (response.success && response.content) {
      alertContext.value = response.content.context;
      console.log('[RiskDetailView] Context set:', JSON.stringify(response.content.context, null, 2));
      console.log('[RiskDetailView] Signals:', JSON.stringify(response.content.context?.assessment?.signals, null, 2));
    } else {
      console.warn('[RiskDetailView] Response not successful or no content:', response);
      alertContextError.value = response.error?.message || 'No context available';
    }
  } catch (err) {
    console.error('[RiskDetailView] Failed to fetch alert context:', err);
    alertContextError.value = err instanceof Error ? err.message : 'Failed to load additional context';
  } finally {
    alertContextLoading.value = false;
  }
}

function closeAlertModal() {
  selectedAlert.value = null;
  alertContext.value = null;
  alertContextError.value = null;
}

// Helper to get alert field handling both snake_case and camelCase
function getAlertCreatedAt(alert: RiskAlert): string {
  const a = alert as unknown as Record<string, unknown>;
  return String(a.createdAt || a.created_at || '');
}

function getAlertAcknowledgedAt(alert: RiskAlert): string {
  const a = alert as unknown as Record<string, unknown>;
  return String(a.acknowledgedAt || a.acknowledged_at || '');
}

function getAlertAcknowledgedBy(alert: RiskAlert): string {
  const a = alert as unknown as Record<string, unknown>;
  return String(a.acknowledgedBy || a.acknowledged_by || '');
}

// Helper to get alert details
function getAlertDetails(alert: RiskAlert): AlertDetails {
  const a = alert as unknown as Record<string, unknown>;
  return (a.details || {}) as AlertDetails;
}

// Get severity label for display
function getSeverityLabel(severity: string): string {
  const labels: Record<string, string> = {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
  };
  return labels[severity] || severity;
}

// Get score class based on value
function getScoreClass(score: number | undefined): string {
  if (score === undefined) return '';
  const normalized = normalizeValue(score);
  if (normalized >= 0.8) return 'critical';
  if (normalized >= 0.6) return 'high';
  if (normalized >= 0.4) return 'medium';
  return 'low';
}

// Format dimension name from slug
function formatDimensionName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeValue(value: number): number {
  return value > 1 ? value / 100 : value;
}

// Helper to get composite score value (handles both snake_case and camelCase)
function getCompositeScoreValue(cs: RiskCompositeScore): number {
  const c = cs as unknown as Record<string, unknown>;
  // Check for overall_score (0-100 from API) first
  if (typeof c.overall_score === 'number') return c.overall_score;
  // Fallback to score (may be 0-1 or 0-100)
  if (typeof c.score === 'number') return c.score;
  return 0;
}

// Helper to get confidence value
function getConfidenceValue(cs: RiskCompositeScore): number {
  const c = cs as unknown as Record<string, unknown>;
  return (c.confidence as number) ?? 0;
}

// Helper to get created_at/createdAt
function getCreatedAt(cs: RiskCompositeScore): string {
  const c = cs as unknown as Record<string, unknown>;
  return String(c.created_at || c.createdAt || '');
}

// Helper to get debate adjustment
function getDebateAdjustment(cs: RiskCompositeScore): number {
  const c = cs as unknown as Record<string, unknown>;
  return (c.debate_adjustment as number) ?? (c.debateAdjustment as number) ?? 0;
}

function formatPercent(value: number): string {
  const normalized = normalizeValue(value);
  return (normalized * 100).toFixed(0) + '%';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAdjustment(adjustment: number): string {
  const sign = adjustment >= 0 ? '+' : '';
  // Adjustment is stored as integer (e.g., 3 for 3%), not decimal
  const displayValue = Math.abs(adjustment) > 1 ? adjustment : adjustment * 100;
  return sign + displayValue.toFixed(1) + '%';
}

/**
 * Format reasoning text - handles JSON objects, markdown-like text, and plain text
 * Converts to nicely formatted HTML for display
 */
function formatReasoning(reasoning: string | unknown): string {
  if (!reasoning) return '';

  // If it's not a string, try to stringify it
  const text = typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2);

  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(text);
    return formatJsonToHtml(parsed);
  } catch {
    // Not JSON, format as text with markdown-like processing
    return formatTextToHtml(text);
  }
}

/**
 * Convert JSON object to formatted HTML
 */
function formatJsonToHtml(obj: unknown, depth = 0): string {
  if (obj === null || obj === undefined) return '';

  // Handle arrays
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '';
    const items = obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        return `<li>${formatJsonToHtml(item, depth + 1)}</li>`;
      }
      return `<li>${escapeHtml(String(item))}</li>`;
    }).join('');
    return `<ul class="reasoning-list">${items}</ul>`;
  }

  // Handle objects
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '';

    const items = entries.map(([key, value]) => {
      const label = formatKeyLabel(key);

      // Handle nested objects/arrays
      if (typeof value === 'object' && value !== null) {
        const nested = formatJsonToHtml(value, depth + 1);
        return `<div class="reasoning-item"><strong class="reasoning-key">${label}:</strong>${nested}</div>`;
      }

      // Handle primitive values
      return `<div class="reasoning-item"><strong class="reasoning-key">${label}:</strong> <span class="reasoning-value">${escapeHtml(String(value))}</span></div>`;
    }).join('');

    return `<div class="reasoning-object">${items}</div>`;
  }

  // Handle primitives
  return `<p>${escapeHtml(String(obj))}</p>`;
}

/**
 * Format snake_case or camelCase key to readable label
 */
function formatKeyLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format plain text with markdown-like features to HTML
 */
function formatTextToHtml(text: string): string {
  let html = escapeHtml(text);

  // Convert markdown-style headers (## Header)
  html = html.replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>');

  // Convert markdown-style bold (**text**)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Convert markdown-style italic (*text*)
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Convert markdown-style bullet points (- item or * item)
  const lines = html.split('\n');
  let inList = false;
  const processedLines: string[] = [];

  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      if (!inList) {
        processedLines.push('<ul class="reasoning-list">');
        inList = true;
      }
      processedLines.push(`<li>${bulletMatch[1]}</li>`);
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      if (line.trim()) {
        processedLines.push(`<p>${line}</p>`);
      }
    }
  }

  if (inList) {
    processedLines.push('</ul>');
  }

  return processedLines.join('');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m] || m);
}
</script>

<style scoped>
.risk-detail-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.subject-info h3 {
  margin: 0;
  font-size: 1.25rem;
}

.subject-info p {
  margin: 0.25rem 0 0;
  color: var(--ion-color-medium, #666);
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 4px;
  background: var(--ion-card-background, #fff);
  cursor: pointer;
  font-size: 0.875rem;
}

.action-btn:hover {
  background: var(--ion-color-light, #f4f5f8);
}

.debate-btn {
  background: var(--ion-color-warning-tint, #fff3cd);
  border-color: var(--ion-color-warning, #ffc409);
}

.score-card {
  background: var(--ion-card-background, #fff);
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.score-main {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.confidence {
  color: var(--ion-color-medium, #666);
  font-size: 0.875rem;
}

.score-meta {
  margin-top: 0.5rem;
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
}

.radar-section,
.assessments-section,
.debate-section,
.alerts-section,
.actions-section {
  background: var(--ion-card-background, #fff);
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.radar-section h4,
.assessments-section h4,
.debate-section h4,
.alerts-section h4,
.actions-section h4 {
  margin: 0 0 1rem;
  font-size: 1rem;
}

.assessments-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 4px;
  background: var(--ion-color-light, #f4f5f8);
}

.alert-item.critical {
  background: var(--ion-color-danger-muted-bg, #f5d5d5);
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.alert-item.warning {
  background: var(--ion-color-warning-muted-bg, #f5e6d5);
  color: var(--ion-color-warning-muted-contrast, #8b6644);
}

.alert-severity {
  font-size: 0.625rem;
  text-transform: uppercase;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.1);
}

.alert-message {
  flex: 1;
  font-size: 0.875rem;
}

.alert-time {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
}

.alert-item.clickable {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.alert-item.clickable:hover {
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--ion-card-background, #fff);
  border-radius: 12px;
  width: 90%;
  max-width: 450px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.modal-header.severity-critical {
  background: var(--ion-color-danger-muted-bg, #f5d5d5);
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.modal-header.severity-warning {
  background: var(--ion-color-warning-muted-bg, #f5e6d5);
  color: var(--ion-color-warning-muted-contrast, #8b6644);
}

.modal-header.severity-info {
  background: var(--ion-color-light, #f4f5f8);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--ion-color-medium, #666);
  padding: 0;
  line-height: 1;
}

.modal-close:hover {
  color: var(--ion-text-color, #333);
}

.modal-body {
  padding: 1.25rem;
}

.alert-message-full {
  font-size: 1rem;
  line-height: 1.5;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.detail-label {
  color: var(--ion-color-medium, #666);
  font-size: 0.875rem;
}

.detail-value {
  font-weight: 600;
  font-size: 0.875rem;
}

.detail-value.critical {
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.detail-value.high {
  color: var(--ion-color-warning-muted-contrast, #8b6644);
}

.detail-value.medium {
  color: var(--ion-color-medium-muted-contrast, #7a7344);
}

.detail-value.low {
  color: var(--ion-color-success-muted-contrast, #447744);
}

.detail-value.increase {
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.detail-value.decrease {
  color: var(--ion-color-success-muted-contrast, #447744);
}

.detail-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
}

.detail-section .detail-label {
  display: block;
  margin-bottom: 0.5rem;
}

.dimensions-list {
  margin: 0;
  padding: 0 0 0 1.25rem;
  font-size: 0.875rem;
}

.dimensions-list li {
  margin-bottom: 0.375rem;
  line-height: 1.4;
}

.acknowledged {
  background: var(--ion-color-light, #f4f5f8);
  padding: 1rem;
  border-radius: 8px;
  margin-top: 1rem;
}

.acknowledged p {
  margin: 0.25rem 0;
  font-size: 0.875rem;
}

/* Modal transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active .modal-content,
.modal-fade-leave-active .modal-content {
  transition: transform 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .modal-content,
.modal-fade-leave-to .modal-content {
  transform: scale(0.95);
}

/* Alert Context Styles */
.context-section {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 2px solid var(--ion-color-primary, #3880ff);
}

.context-section h4 {
  margin: 0 0 1rem;
  font-size: 1rem;
  color: var(--ion-color-primary, #3880ff);
}

.context-loading {
  text-align: center;
  padding: 1rem;
  color: var(--ion-color-medium, #666);
  font-style: italic;
}

.context-error {
  padding: 0.75rem;
  background: var(--ion-color-danger, #eb445a);
  border-radius: 4px;
  color: #fff;
  font-size: 0.875rem;
}

.context-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.context-dimension {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.context-label {
  font-size: 0.875rem;
  color: var(--ion-color-medium, #666);
  font-weight: 500;
}

.context-value {
  font-weight: 600;
  font-size: 0.875rem;
}

.context-score {
  font-weight: 600;
  font-size: 0.875rem;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  background: var(--ion-color-light, #f4f5f8);
}

.context-score.critical {
  background: var(--ion-color-danger-muted-bg, #f5d5d5);
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.context-score.high {
  background: var(--ion-color-warning-muted-bg, #f5e6d5);
  color: var(--ion-color-warning-muted-contrast, #8b6644);
}

.context-score.medium {
  background: var(--ion-color-medium-muted-bg, #f5f0d5);
  color: var(--ion-color-medium-muted-contrast, #7a7344);
}

.context-score.low {
  background: var(--ion-color-success-muted-bg, #d5e8d5);
  color: var(--ion-color-success-muted-contrast, #447744);
}

.context-reasoning {
  background: var(--ion-color-light, #f4f5f8);
  padding: 0.75rem;
  border-radius: 8px;
}

.context-reasoning .context-label {
  display: block;
  margin-bottom: 0.5rem;
}

.reasoning-text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--ion-text-color, #333);
}

/* Formatted reasoning content styles */
.reasoning-content {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ion-text-color, #333);
}

.reasoning-content :deep(p) {
  margin: 0 0 0.5rem;
}

.reasoning-content :deep(p:last-child) {
  margin-bottom: 0;
}

.reasoning-content :deep(.reasoning-object) {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.reasoning-content :deep(.reasoning-item) {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.reasoning-content :deep(.reasoning-key) {
  color: var(--ion-color-primary, #3880ff);
  font-weight: 600;
}

.reasoning-content :deep(.reasoning-value) {
  color: var(--ion-text-color, #333);
}

.reasoning-content :deep(.reasoning-list) {
  margin: 0.25rem 0 0.5rem;
  padding-left: 1.25rem;
  list-style-type: disc;
}

.reasoning-content :deep(.reasoning-list li) {
  margin-bottom: 0.375rem;
  line-height: 1.5;
}

.reasoning-content :deep(.reasoning-list li:last-child) {
  margin-bottom: 0;
}

.reasoning-content :deep(strong) {
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.reasoning-content :deep(em) {
  font-style: italic;
}

.context-signals {
  background: var(--ion-card-background, #fff);
  border: 1px solid var(--ion-border-color, #e0e0e0);
  padding: 0.75rem;
  border-radius: 8px;
}

.context-signals .context-label {
  display: block;
  margin-bottom: 0.5rem;
}

.context-signals .signals-list {
  margin: 0;
  padding: 0 0 0 1.25rem;
  font-size: 0.875rem;
}

.context-signals .signals-list li {
  margin-bottom: 0.375rem;
  line-height: 1.4;
}

.context-signals .signals-list li.signal-positive {
  color: var(--ion-color-success-muted-contrast, #447744);
}

.context-signals .signals-list li.signal-negative {
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.context-signals .signals-list li.signal-neutral {
  color: var(--ion-color-medium, #666);
}

.context-signals .signals-list .signal-item {
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  margin-left: -0.5rem;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.context-signals .signals-list .signal-item:hover {
  background-color: var(--ion-color-light, #f4f5f8);
}

.context-signals .signals-list .signal-weight {
  font-size: 0.75rem;
  opacity: 0.7;
  margin-left: 0.25rem;
}

/* Signal Detail Modal */
.signal-modal-overlay {
  z-index: 1100;
}

.signal-modal {
  max-width: 400px;
}

.signal-modal-header {
  background: var(--ion-color-primary-tint, #e6f0ff);
}

.signal-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.signal-detail-row:last-child {
  border-bottom: none;
}

.signal-detail-row .detail-label {
  color: var(--ion-color-medium, #666);
  font-size: 0.875rem;
  min-width: 80px;
}

.signal-detail-row .detail-value {
  font-weight: 600;
  font-size: 0.875rem;
  text-align: right;
  word-break: break-word;
  max-width: 60%;
}

.signal-detail-row .signal-value-text {
  font-weight: normal;
  font-style: italic;
}

.signal-detail-row .impact-positive {
  color: var(--ion-color-success-muted-contrast, #447744);
}

.signal-detail-row .impact-negative {
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.signal-detail-row .impact-neutral {
  color: var(--ion-color-medium, #666);
}

.context-comparison {
  background: var(--ion-color-light, #f4f5f8);
  padding: 0.75rem;
  border-radius: 8px;
}

.context-comparison .context-label {
  display: block;
  margin-bottom: 0.5rem;
}

.comparison-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}

.score-change {
  font-weight: 600;
}

.score-change.increase {
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.score-change.decrease {
  color: var(--ion-color-success-muted-contrast, #447744);
}

.previous-reasoning {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  font-style: italic;
}

.context-empty {
  text-align: center;
  padding: 1rem;
  color: var(--ion-color-medium, #666);
  font-size: 0.875rem;
}

/* Actions Section */
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.actions-section .action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 0.5rem;
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 8px;
  background: var(--ion-color-light, #f4f5f8);
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.actions-section .action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.actions-section .action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-icon {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}

.actions-section .action-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.action-desc {
  font-size: 0.6875rem;
  color: var(--ion-color-medium, #666);
  margin-top: 0.125rem;
}

/* Action button variants */
.action-primary {
  border-color: var(--ion-color-primary, #3880ff);
  background: rgba(56, 128, 255, 0.1);
}

.action-primary:hover:not(:disabled) {
  border-color: var(--ion-color-primary, #3880ff);
  background: rgba(56, 128, 255, 0.15);
}

.action-debate {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}

.action-debate:hover:not(:disabled) {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.action-summary {
  border-color: #15803d;
  background: rgba(21, 128, 61, 0.05);
}

.action-summary:hover:not(:disabled) {
  border-color: #15803d;
  background: rgba(21, 128, 61, 0.1);
}

.action-scenario {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.05);
}

.action-scenario:hover:not(:disabled) {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
}

.action-history {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.05);
}

.action-history:hover:not(:disabled) {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.action-compare {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.05);
}

.action-compare:hover:not(:disabled) {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

/* Spinner for loading states */
.spinner-small {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================================================
   Dark Mode Overrides
   ============================================================================ */

/* Section cards (score, radar, assessments, debate, alerts, actions) */
html.ion-palette-dark .risk-detail-view .score-card,
html[data-theme="dark"] .risk-detail-view .score-card,
html.ion-palette-dark .risk-detail-view .radar-section,
html[data-theme="dark"] .risk-detail-view .radar-section,
html.ion-palette-dark .risk-detail-view .assessments-section,
html[data-theme="dark"] .risk-detail-view .assessments-section,
html.ion-palette-dark .risk-detail-view .debate-section,
html[data-theme="dark"] .risk-detail-view .debate-section,
html.ion-palette-dark .risk-detail-view .alerts-section,
html[data-theme="dark"] .risk-detail-view .alerts-section,
html.ion-palette-dark .risk-detail-view .actions-section,
html[data-theme="dark"] .risk-detail-view .actions-section {
  background: var(--dark-bg-tertiary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* Alert items (default/non-severity) */
html.ion-palette-dark .risk-detail-view .alert-item,
html[data-theme="dark"] .risk-detail-view .alert-item {
  background: var(--dark-bg-quaternary);
}

/* Action buttons in the grid */
html.ion-palette-dark .risk-detail-view .actions-section .action-btn,
html[data-theme="dark"] .risk-detail-view .actions-section .action-btn {
  background: var(--dark-bg-secondary);
  border-color: var(--dark-border-primary);
}

html.ion-palette-dark .risk-detail-view .actions-section .action-btn:hover:not(:disabled),
html[data-theme="dark"] .risk-detail-view .actions-section .action-btn:hover:not(:disabled) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* Action variant overrides for dark mode - keep tinted backgrounds but darken */
html.ion-palette-dark .risk-detail-view .action-primary,
html[data-theme="dark"] .risk-detail-view .action-primary {
  background: rgba(139, 90, 60, 0.15);
  border-color: var(--dark-accent-primary);
}

html.ion-palette-dark .risk-detail-view .action-primary:hover:not(:disabled),
html[data-theme="dark"] .risk-detail-view .action-primary:hover:not(:disabled) {
  background: rgba(139, 90, 60, 0.25);
}

html.ion-palette-dark .risk-detail-view .action-debate,
html[data-theme="dark"] .risk-detail-view .action-debate {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
}

html.ion-palette-dark .risk-detail-view .action-debate:hover:not(:disabled),
html[data-theme="dark"] .risk-detail-view .action-debate:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
}

html.ion-palette-dark .risk-detail-view .action-history,
html[data-theme="dark"] .risk-detail-view .action-history {
  background: rgba(16, 185, 129, 0.1);
  border-color: #10b981;
}

html.ion-palette-dark .risk-detail-view .action-history:hover:not(:disabled),
html[data-theme="dark"] .risk-detail-view .action-history:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.2);
}

html.ion-palette-dark .risk-detail-view .action-compare,
html[data-theme="dark"] .risk-detail-view .action-compare {
  background: rgba(245, 158, 11, 0.1);
  border-color: #f59e0b;
}

html.ion-palette-dark .risk-detail-view .action-compare:hover:not(:disabled),
html[data-theme="dark"] .risk-detail-view .action-compare:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.2);
}

/* Acknowledged section */
html.ion-palette-dark .risk-detail-view .acknowledged,
html[data-theme="dark"] .risk-detail-view .acknowledged {
  background: var(--dark-bg-quaternary);
}

/* Context score (default, non-severity) */
html.ion-palette-dark .risk-detail-view .context-score,
html[data-theme="dark"] .risk-detail-view .context-score {
  background: var(--dark-bg-quaternary);
}

/* Context reasoning block */
html.ion-palette-dark .risk-detail-view .context-reasoning,
html[data-theme="dark"] .risk-detail-view .context-reasoning {
  background: var(--dark-bg-secondary);
}

/* Context signals block */
html.ion-palette-dark .risk-detail-view .context-signals,
html[data-theme="dark"] .risk-detail-view .context-signals {
  background: var(--dark-bg-secondary);
  border-color: var(--dark-border-primary);
}

/* Signal item hover */
html.ion-palette-dark .risk-detail-view .context-signals .signal-item:hover,
html[data-theme="dark"] .risk-detail-view .context-signals .signal-item:hover {
  background-color: var(--dark-bg-quaternary);
}

/* Context comparison block */
html.ion-palette-dark .risk-detail-view .context-comparison,
html[data-theme="dark"] .risk-detail-view .context-comparison {
  background: var(--dark-bg-secondary);
}

/* Modal content */
html.ion-palette-dark .risk-detail-view .modal-content,
html[data-theme="dark"] .risk-detail-view .modal-content {
  background: var(--dark-bg-tertiary);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

html.ion-palette-dark .risk-detail-view .modal-header,
html[data-theme="dark"] .risk-detail-view .modal-header {
  border-color: var(--dark-border-subtle);
}

html.ion-palette-dark .risk-detail-view .modal-header.severity-info,
html[data-theme="dark"] .risk-detail-view .modal-header.severity-info {
  background: var(--dark-bg-quaternary);
}

/* Signal modal header */
html.ion-palette-dark .risk-detail-view .signal-modal-header,
html[data-theme="dark"] .risk-detail-view .signal-modal-header {
  background: var(--dark-accent-primary-bg);
}

/* Borders in modal */
html.ion-palette-dark .risk-detail-view .alert-message-full,
html[data-theme="dark"] .risk-detail-view .alert-message-full,
html.ion-palette-dark .risk-detail-view .detail-section,
html[data-theme="dark"] .risk-detail-view .detail-section,
html.ion-palette-dark .risk-detail-view .signal-detail-row,
html[data-theme="dark"] .risk-detail-view .signal-detail-row {
  border-color: var(--dark-border-subtle);
}

/* Context section top border */
html.ion-palette-dark .risk-detail-view .context-section,
html[data-theme="dark"] .risk-detail-view .context-section {
  border-top-color: var(--dark-accent-primary);
}
</style>
