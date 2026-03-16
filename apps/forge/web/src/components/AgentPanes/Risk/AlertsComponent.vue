<template>
  <div class="alerts-component">
    <div v-if="alerts.length === 0" class="empty-state">
      <p>No unacknowledged alerts</p>
    </div>

    <div v-else class="alerts-list">
      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="alert-card clickable"
        :class="getAlertSeverity(alert)"
        @click="selectAlert(alert)"
      >
        <div class="alert-header">
          <span class="severity-badge">{{ getAlertSeverity(alert) }}</span>
          <span class="alert-subject">{{ getAlertSubjectName(alert) }}</span>
          <span class="alert-time">{{ formatDate(getAlertCreatedAt(alert)) }}</span>
        </div>
        <div class="alert-message">{{ getAlertMessage(alert) }}</div>
        <div v-if="getAlertDetails(alert)" class="alert-details">
          <span v-if="getAlertDetails(alert).triggerScore">
            Trigger Score: {{ formatPercent(getAlertDetails(alert).triggerScore as number) }}
          </span>
          <span v-if="getAlertDetails(alert).threshold">
            Threshold: {{ formatPercent(getAlertDetails(alert).threshold as number) }}
          </span>
        </div>
        <div class="alert-actions">
          <button class="ack-btn" @click.stop="$emit('acknowledge', alert.id)">
            Acknowledge
          </button>
        </div>
      </div>
    </div>

    <!-- Alert Detail Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="selectedAlert" class="modal-overlay" @click.self="closeModal">
          <div class="modal-content">
            <div class="modal-header" :class="`severity-${getAlertSeverity(selectedAlert)}`">
              <h3>{{ getSeverityLabel(getAlertSeverity(selectedAlert)) }} Alert</h3>
              <button class="modal-close" @click="closeModal">&times;</button>
            </div>
            <div class="modal-body">
              <div class="alert-message-full">{{ getAlertMessage(selectedAlert) }}</div>

              <div class="detail-row">
                <span class="detail-label">Subject:</span>
                <span class="detail-value">{{ getAlertSubjectName(selectedAlert) }}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Created:</span>
                <span class="detail-value">{{ formatDate(getAlertCreatedAt(selectedAlert)) }}</span>
              </div>

              <div v-if="getAlertDetails(selectedAlert).triggerScore !== undefined" class="detail-row">
                <span class="detail-label">Trigger Score:</span>
                <span class="detail-value" :class="getScoreClass(getAlertDetails(selectedAlert).triggerScore as number)">
                  {{ formatPercent(getAlertDetails(selectedAlert).triggerScore as number) }}
                </span>
              </div>

              <div v-if="getAlertDetails(selectedAlert).threshold !== undefined" class="detail-row">
                <span class="detail-label">Threshold:</span>
                <span class="detail-value">{{ formatPercent(getAlertDetails(selectedAlert).threshold as number) }}</span>
              </div>

              <!-- Alert Context Section -->
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
                        :class="`signal-${getSignalImpact(signal)}`"
                        class="signal-item"
                        @click="showSignalDetail(signal)"
                      >
                        <span class="signal-text">{{ formatSignalDisplay(signal) }}</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div v-else class="context-empty">
                  No additional context available for this alert.
                </div>
              </div>

              <div class="modal-actions">
                <button class="ack-btn primary" @click="acknowledgeAndClose">
                  Acknowledge
                </button>
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
                <span class="detail-value">{{ selectedSignal.name || selectedSignal.description || 'Unknown' }}</span>
              </div>

              <div v-if="selectedSignal.value !== undefined && selectedSignal.value !== null" class="signal-detail-row">
                <span class="detail-label">Value:</span>
                <span class="detail-value">{{ formatSignalValue(selectedSignal.value) }}</span>
              </div>

              <div class="signal-detail-row">
                <span class="detail-label">Impact:</span>
                <span class="detail-value" :class="`impact-${getSignalImpact(selectedSignal)}`">
                  {{ capitalizeImpact(getSignalImpact(selectedSignal)) }}
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
import { ref } from 'vue';
import type { UnacknowledgedAlertView } from '@/types/risk-agent';
import { riskDashboardService } from '@/services/riskDashboardService';

// Signal can come in different formats from API
interface SignalData {
  name?: string;
  description?: string;
  value?: unknown;
  impact?: string;
  weight?: number;
  source?: string;
}

interface AlertContext {
  assessment?: {
    dimension_slug: string;
    dimension_name: string;
    score: number;
    confidence: number;
    reasoning?: string;
    signals?: SignalData[];
  };
}

interface Props {
  alerts: UnacknowledgedAlertView[];
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'acknowledge', alertId: string): void;
}>();

// Modal state
const selectedAlert = ref<UnacknowledgedAlertView | null>(null);
const alertContext = ref<AlertContext | null>(null);
const alertContextLoading = ref(false);
const alertContextError = ref<string | null>(null);

// Helper functions to handle snake_case/camelCase
function getAlertSeverity(alert: UnacknowledgedAlertView): string {
  const a = alert as unknown as Record<string, unknown>;
  return String(a.severity || 'info');
}

function getAlertSubjectName(alert: UnacknowledgedAlertView): string {
  const a = alert as unknown as Record<string, unknown>;
  return String(a.subjectName || a.subject_name || a.subjectIdentifier || a.subject_identifier || 'Unknown');
}

function getAlertMessage(alert: UnacknowledgedAlertView): string {
  const a = alert as unknown as Record<string, unknown>;
  return String(a.message || '');
}

function getAlertCreatedAt(alert: UnacknowledgedAlertView): string {
  const a = alert as unknown as Record<string, unknown>;
  return String(a.createdAt || a.created_at || '');
}

function getAlertDetails(alert: UnacknowledgedAlertView): Record<string, unknown> {
  const a = alert as unknown as Record<string, unknown>;
  return (a.details || {}) as Record<string, unknown>;
}

// Signal detail modal state
const selectedSignal = ref<SignalData | null>(null);

// Helper functions for signals
function _getSignalDescription(signal: SignalData): string {
  console.log('[AlertsComponent] getSignalDescription input:', JSON.stringify(signal));

  // Handle string signal (shouldn't happen but defensive)
  if (typeof signal === 'string') return signal || 'Unknown signal';

  // Handle null/undefined
  if (!signal || typeof signal !== 'object') return 'Unknown signal';

  // Try description first (frontend format)
  if (signal.description && typeof signal.description === 'string') {
    return signal.description;
  }

  // Try text field (compatibility)
  const sig = signal as Record<string, unknown>;
  if (sig.text && typeof sig.text === 'string') {
    return sig.text;
  }

  // Construct from name + value (API format)
  if (signal.name && typeof signal.name === 'string' && signal.name.trim()) {
    const name = signal.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (signal.value !== undefined && signal.value !== null && signal.value !== '') {
      // Format value based on type
      const value = typeof signal.value === 'number'
        ? (signal.value > 1 ? signal.value.toFixed(1) : (signal.value * 100).toFixed(1) + '%')
        : String(signal.value);
      return `${name}: ${value}`;
    }
    return name;
  }

  // If we have a value but no name, show just the value
  if (signal.value !== undefined && signal.value !== null && signal.value !== '') {
    return String(signal.value);
  }

  return 'Unknown signal';
}

function getSignalImpact(signal: SignalData): string {
  return signal.impact || 'neutral';
}

// Format signal for display - handles name, value, weight
function formatSignalDisplay(signal: SignalData): string {
  if (!signal || typeof signal !== 'object') return 'Unknown signal';

  const s = signal as Record<string, unknown>;
  const parts: string[] = [];

  // Get the signal name - try multiple fields
  let name = '';
  if (s.name && typeof s.name === 'string') name = s.name;
  else if (s.description && typeof s.description === 'string') name = s.description;
  else if (s.text && typeof s.text === 'string') name = s.text;

  // Format the name nicely (convert snake_case and capitalize)
  if (name) {
    name = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    parts.push(name);
  }

  // Add value if present
  if (s.value !== undefined && s.value !== null && s.value !== '') {
    const formattedValue = formatSignalValueCompact(s.value);
    if (formattedValue) {
      if (parts.length > 0) {
        parts.push(`: ${formattedValue}`);
      } else {
        parts.push(formattedValue);
      }
    }
  }

  // Add weight if significant
  if (typeof s.weight === 'number' && s.weight > 0) {
    parts.push(` (${(s.weight * 100).toFixed(0)}%)`);
  }

  return parts.join('') || 'Unknown signal';
}

// Compact value formatting
function formatSignalValueCompact(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') {
    if (value > 1) return value.toFixed(1);
    return (value * 100).toFixed(0) + '%';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  return String(value);
}

function showSignalDetail(signal: SignalData) {
  selectedSignal.value = signal;
}

function closeSignalModal() {
  selectedSignal.value = null;
}

function formatSignalValue(value: unknown): string {
  if (value === undefined || value === null) return 'N/A';
  if (typeof value === 'number') {
    // Assume values > 1 are percentages or absolute values, <= 1 are ratios
    if (value > 1) return value.toFixed(2);
    return (value * 100).toFixed(1) + '%';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function capitalizeImpact(impact: string): string {
  return impact.charAt(0).toUpperCase() + impact.slice(1);
}

async function selectAlert(alert: UnacknowledgedAlertView) {
  selectedAlert.value = alert;
  alertContext.value = null;
  alertContextError.value = null;
  alertContextLoading.value = true;

  console.log('[AlertsComponent] selectAlert called with:', alert.id);

  try {
    const response = await riskDashboardService.getAlertWithContext(alert.id);
    console.log('[AlertsComponent] Alert context response:', JSON.stringify(response, null, 2));

    if (response.success && response.content) {
      alertContext.value = response.content.context;
      console.log('[AlertsComponent] Context set:', JSON.stringify(response.content.context, null, 2));
      console.log('[AlertsComponent] Signals:', JSON.stringify(response.content.context?.assessment?.signals, null, 2));
    } else {
      console.warn('[AlertsComponent] Response not successful or no content:', response);
      alertContextError.value = response.error?.message || 'No context available';
    }
  } catch (err) {
    console.error('[AlertsComponent] Failed to fetch alert context:', err);
    alertContextError.value = err instanceof Error ? err.message : 'Failed to load additional context';
  } finally {
    alertContextLoading.value = false;
  }
}

function closeModal() {
  selectedAlert.value = null;
  alertContext.value = null;
  alertContextError.value = null;
}

function acknowledgeAndClose() {
  if (selectedAlert.value) {
    emit('acknowledge', selectedAlert.value.id);
    closeModal();
  }
}

function getSeverityLabel(severity: string): string {
  const labels: Record<string, string> = {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
  };
  return labels[severity] || severity;
}

function getScoreClass(score: number | undefined): string {
  if (score === undefined) return '';
  const normalized = score > 1 ? score / 100 : score;
  if (normalized >= 0.8) return 'critical';
  if (normalized >= 0.6) return 'high';
  if (normalized >= 0.4) return 'medium';
  return 'low';
}

function formatDimensionName(slug: string): string {
  if (!slug) return 'Unknown';
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

function formatPercent(value: number | undefined): string {
  if (value === undefined || value === null || isNaN(value)) return 'N/A';
  const normalized = value > 1 ? value / 100 : value;
  return (normalized * 100).toFixed(0) + '%';
}

function formatReasoning(reasoning: string | unknown): string {
  if (!reasoning) return '';
  const text = typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2);
  try {
    const parsed = JSON.parse(text);
    return formatJsonToHtml(parsed);
  } catch {
    return formatTextToHtml(text);
  }
}

function formatJsonToHtml(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '';
    const items = obj.map(item => `<li>${typeof item === 'object' ? formatJsonToHtml(item) : escapeHtml(String(item))}</li>`).join('');
    return `<ul class="reasoning-list">${items}</ul>`;
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '';
    const items = entries.map(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
      if (typeof value === 'object' && value !== null) {
        return `<div class="reasoning-item"><strong class="reasoning-key">${label}:</strong>${formatJsonToHtml(value)}</div>`;
      }
      return `<div class="reasoning-item"><strong class="reasoning-key">${label}:</strong> <span class="reasoning-value">${escapeHtml(String(value))}</span></div>`;
    }).join('');
    return `<div class="reasoning-object">${items}</div>`;
  }
  return `<p>${escapeHtml(String(obj))}</p>`;
}

function formatTextToHtml(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return html.split('\n').filter(l => l.trim()).map(l => `<p>${l}</p>`).join('');
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m] || m);
}
</script>

<style scoped>
.alerts-component {
  max-width: 800px;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--ion-color-medium, #666);
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.alert-card {
  background: var(--ion-card-background, #fff);
  border-radius: 8px;
  padding: 1rem;
  border-left: 4px solid var(--ion-border-color, #e0e0e0);
}

.alert-card.critical {
  border-left-color: var(--ion-color-danger-muted, #8b4444);
  background: var(--ion-color-danger-muted-bg, #f5d5d5);
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.alert-card.warning {
  border-left-color: var(--ion-color-warning-muted, #8b6644);
  background: var(--ion-color-warning-muted-bg, #f5e6d5);
  color: var(--ion-color-warning-muted-contrast, #8b6644);
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.severity-badge {
  font-size: 0.625rem;
  text-transform: uppercase;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.1);
}

.alert-subject {
  font-weight: 600;
}

.alert-time {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
}

.alert-message {
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}

.alert-details {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  margin-bottom: 0.75rem;
}

.alert-actions {
  display: flex;
  justify-content: flex-end;
}

.ack-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8125rem;
  background: var(--ion-color-light, #f4f5f8);
  color: var(--ion-text-color, #1a1a1a) !important;
}

.ack-btn:hover {
  background: var(--ion-color-light, #f4f5f8);
}

.alert-card.clickable {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.alert-card.clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
  max-width: 500px;
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
  color: var(--ion-color-primary);
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

.detail-value.critical { color: var(--ion-color-danger-muted-contrast, #8b4444); }
.detail-value.high { color: var(--ion-color-warning-muted-contrast, #8b6644); }
.detail-value.medium { color: var(--ion-color-medium-muted-contrast, #7a7344); }
.detail-value.low { color: var(--ion-color-success-muted-contrast, #447744); }

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

.context-loading, .context-empty {
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

.context-score.critical { background: var(--ion-color-danger-muted-bg, #f5d5d5); color: var(--ion-color-danger-muted-contrast, #8b4444); }
.context-score.high { background: var(--ion-color-warning-muted-bg, #f5e6d5); color: var(--ion-color-warning-muted-contrast, #8b6644); }
.context-score.medium { background: var(--ion-color-medium-muted-bg, #f5f0d5); color: var(--ion-color-medium-muted-contrast, #7a7344); }
.context-score.low { background: var(--ion-color-success-muted-bg, #d5e8d5); color: var(--ion-color-success-muted-contrast, #447744); }

.context-reasoning {
  background: var(--ion-color-light, #f4f5f8);
  padding: 0.75rem;
  border-radius: 8px;
}

.context-reasoning .context-label {
  display: block;
  margin-bottom: 0.5rem;
}

.reasoning-content {
  font-size: 0.875rem;
  line-height: 1.6;
}

.reasoning-content :deep(.reasoning-object) { display: flex; flex-direction: column; gap: 0.5rem; }
.reasoning-content :deep(.reasoning-item) { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.reasoning-content :deep(.reasoning-key) { color: var(--ion-color-primary, #3880ff); font-weight: 600; }
.reasoning-content :deep(.reasoning-list) { margin: 0.25rem 0; padding-left: 1.25rem; }
.reasoning-content :deep(p) { margin: 0 0 0.5rem; }

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

.signals-list {
  margin: 0;
  padding: 0 0 0 1.25rem;
  font-size: 0.875rem;
}

.signals-list li { margin-bottom: 0.375rem; }
.signals-list li.signal-positive { color: var(--ion-color-success-muted-contrast, #447744); }
.signals-list li.signal-negative { color: var(--ion-color-danger-muted-contrast, #8b4444); }
.signals-list li.signal-neutral { color: var(--ion-color-medium, #666); }

.signals-list .signal-item {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  transition: background-color 0.15s ease;
  margin-left: -0.25rem;
  padding-left: 0.25rem;
  border-radius: 4px;
}

.signals-list .signal-item:hover {
  background-color: var(--ion-color-light, #f4f5f8);
}

.signals-list .signal-text {
  flex: 1;
}

.signals-list .signal-weight {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  opacity: 0.8;
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

.signal-detail-row .impact-positive { color: var(--ion-color-success-muted-contrast, #447744); }
.signal-detail-row .impact-negative { color: var(--ion-color-danger-muted-contrast, #8b4444); }
.signal-detail-row .impact-neutral { color: var(--ion-color-medium, #666); }

.modal-actions {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
}

.ack-btn.primary {
  background: var(--ion-color-primary, #3880ff);
  color: white;
  border: none;
}

.ack-btn.primary:hover {
  background: var(--ion-color-primary-shade, #3171e0);
}

/* Modal transition */
.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active .modal-content, .modal-fade-leave-active .modal-content {
  transition: transform 0.2s ease;
}

.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .modal-content, .modal-fade-leave-to .modal-content {
  transform: scale(0.95);
}

/* Dark mode */
html.ion-palette-dark .alerts-component .alert-card,
html[data-theme="dark"] .alerts-component .alert-card {
  background: var(--dark-bg-tertiary, #2d3748);
  border-left-color: var(--dark-border-primary, #4a5568);
  color: var(--dark-text-primary, #f7fafc);
}

html.ion-palette-dark .alerts-component .alert-card.critical,
html[data-theme="dark"] .alerts-component .alert-card.critical {
  border-left-color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  color: #fca5a5;
}

html.ion-palette-dark .alerts-component .alert-card.warning,
html[data-theme="dark"] .alerts-component .alert-card.warning {
  border-left-color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
  color: #fde68a;
}

html.ion-palette-dark .alerts-component .alert-time,
html[data-theme="dark"] .alerts-component .alert-time,
html.ion-palette-dark .alerts-component .alert-details,
html[data-theme="dark"] .alerts-component .alert-details,
html.ion-palette-dark .alerts-component .empty-state,
html[data-theme="dark"] .alerts-component .empty-state {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .alerts-component .severity-badge,
html[data-theme="dark"] .alerts-component .severity-badge {
  background: rgba(255, 255, 255, 0.1);
}

html.ion-palette-dark .alerts-component .ack-btn,
html[data-theme="dark"] .alerts-component .ack-btn {
  background: var(--dark-bg-quaternary, #374151);
  border-color: var(--dark-border-primary, #4a5568);
  color: var(--dark-text-secondary, #e2e8f0);
}

html.ion-palette-dark .alerts-component .ack-btn:hover,
html[data-theme="dark"] .alerts-component .ack-btn:hover {
  background: var(--dark-border-primary, #4a5568);
}

/* Alert Detail Modal - Dark mode */
html.ion-palette-dark .alerts-component .modal-content,
html[data-theme="dark"] .alerts-component .modal-content {
  background: var(--dark-bg-secondary, #1f2937);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  color: var(--dark-text-primary, #f7fafc);
}

html.ion-palette-dark .alerts-component .modal-header,
html[data-theme="dark"] .alerts-component .modal-header {
  border-bottom-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .alerts-component .modal-header.severity-critical,
html[data-theme="dark"] .alerts-component .modal-header.severity-critical {
  background: rgba(248, 113, 113, 0.15);
  color: #fca5a5;
}

html.ion-palette-dark .alerts-component .modal-header.severity-warning,
html[data-theme="dark"] .alerts-component .modal-header.severity-warning {
  background: rgba(251, 191, 36, 0.15);
  color: #fde68a;
}

html.ion-palette-dark .alerts-component .modal-header.severity-info,
html[data-theme="dark"] .alerts-component .modal-header.severity-info {
  background: var(--dark-bg-tertiary, #2d3748);
}

html.ion-palette-dark .alerts-component .modal-close,
html[data-theme="dark"] .alerts-component .modal-close {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .alerts-component .alert-message-full,
html[data-theme="dark"] .alerts-component .alert-message-full {
  border-bottom-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .alerts-component .detail-label,
html[data-theme="dark"] .alerts-component .detail-label {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .alerts-component .detail-value,
html[data-theme="dark"] .alerts-component .detail-value {
  color: var(--dark-text-primary, #f7fafc);
}

html.ion-palette-dark .alerts-component .detail-value.critical,
html[data-theme="dark"] .alerts-component .detail-value.critical {
  color: #fca5a5;
}

html.ion-palette-dark .alerts-component .detail-value.high,
html[data-theme="dark"] .alerts-component .detail-value.high {
  color: #fde68a;
}

html.ion-palette-dark .alerts-component .detail-value.medium,
html[data-theme="dark"] .alerts-component .detail-value.medium {
  color: #fef08a;
}

html.ion-palette-dark .alerts-component .detail-value.low,
html[data-theme="dark"] .alerts-component .detail-value.low {
  color: #86efac;
}

html.ion-palette-dark .alerts-component .context-section,
html[data-theme="dark"] .alerts-component .context-section {
  border-top-color: var(--dark-accent-primary, #a16c4a);
}

html.ion-palette-dark .alerts-component .context-label,
html[data-theme="dark"] .alerts-component .context-label {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .alerts-component .context-loading,
html[data-theme="dark"] .alerts-component .context-loading,
html.ion-palette-dark .alerts-component .context-empty,
html[data-theme="dark"] .alerts-component .context-empty {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .alerts-component .context-score,
html[data-theme="dark"] .alerts-component .context-score {
  background: var(--dark-bg-quaternary, #374151);
}

html.ion-palette-dark .alerts-component .context-score.critical,
html[data-theme="dark"] .alerts-component .context-score.critical {
  background: rgba(248, 113, 113, 0.15);
  color: #fca5a5;
}

html.ion-palette-dark .alerts-component .context-score.high,
html[data-theme="dark"] .alerts-component .context-score.high {
  background: rgba(251, 191, 36, 0.15);
  color: #fde68a;
}

html.ion-palette-dark .alerts-component .context-score.medium,
html[data-theme="dark"] .alerts-component .context-score.medium {
  background: rgba(254, 240, 138, 0.15);
  color: #fef08a;
}

html.ion-palette-dark .alerts-component .context-score.low,
html[data-theme="dark"] .alerts-component .context-score.low {
  background: rgba(134, 239, 172, 0.15);
  color: #86efac;
}

html.ion-palette-dark .alerts-component .context-reasoning,
html[data-theme="dark"] .alerts-component .context-reasoning {
  background: var(--dark-bg-tertiary, #2d3748);
}

html.ion-palette-dark .alerts-component .reasoning-content :deep(.reasoning-key),
html[data-theme="dark"] .alerts-component .reasoning-content :deep(.reasoning-key) {
  color: var(--dark-accent-primary, #a16c4a);
}

html.ion-palette-dark .alerts-component .context-signals,
html[data-theme="dark"] .alerts-component .context-signals {
  background: var(--dark-bg-tertiary, #2d3748);
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .alerts-component .signals-list li.signal-positive,
html[data-theme="dark"] .alerts-component .signals-list li.signal-positive {
  color: #86efac;
}

html.ion-palette-dark .alerts-component .signals-list li.signal-negative,
html[data-theme="dark"] .alerts-component .signals-list li.signal-negative {
  color: #fca5a5;
}

html.ion-palette-dark .alerts-component .signals-list li.signal-neutral,
html[data-theme="dark"] .alerts-component .signals-list li.signal-neutral {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .alerts-component .signals-list .signal-item:hover,
html[data-theme="dark"] .alerts-component .signals-list .signal-item:hover {
  background-color: var(--dark-bg-quaternary, #374151);
}

/* Signal Detail Modal - Dark mode */
html.ion-palette-dark .alerts-component .signal-modal-header,
html[data-theme="dark"] .alerts-component .signal-modal-header {
  background: var(--dark-bg-tertiary, #2d3748);
  color: var(--dark-text-primary, #f7fafc);
}

html.ion-palette-dark .alerts-component .signal-detail-row,
html[data-theme="dark"] .alerts-component .signal-detail-row {
  border-bottom-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .alerts-component .signal-detail-row .detail-label,
html[data-theme="dark"] .alerts-component .signal-detail-row .detail-label {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .alerts-component .signal-detail-row .impact-positive,
html[data-theme="dark"] .alerts-component .signal-detail-row .impact-positive {
  color: #86efac;
}

html.ion-palette-dark .alerts-component .signal-detail-row .impact-negative,
html[data-theme="dark"] .alerts-component .signal-detail-row .impact-negative {
  color: #fca5a5;
}

html.ion-palette-dark .alerts-component .signal-detail-row .impact-neutral,
html[data-theme="dark"] .alerts-component .signal-detail-row .impact-neutral {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .alerts-component .context-error,
html[data-theme="dark"] .alerts-component .context-error {
  background: rgba(220, 38, 38, 0.2);
}
</style>
