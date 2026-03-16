<template>
  <div class="risk-dimension-card" :class="riskLevel">
    <div class="card-header">
      <span class="dimension-name">{{ dimensionDisplayName }}</span>
      <RiskScoreBadge :score="assessment.score" />
    </div>

    <div class="card-body">
      <div class="confidence-row">
        <span class="label">Confidence:</span>
        <span class="value">{{ formatPercent(assessment.confidence) }}</span>
      </div>

      <div v-if="dimensionWeight" class="weight-row">
        <span class="label">Weight:</span>
        <span class="value">{{ formatPercent(dimensionWeight) }}</span>
      </div>

      <!-- Signals -->
      <div v-if="hasSignals" class="signals-section">
        <span class="signals-label">Key Signals:</span>
        <ul class="signals-list">
          <li
            v-for="(signal, index) in displaySignals"
            :key="index"
            :class="signal.impact"
          >
            <a
              href="#"
              class="signal-link"
              @click.prevent="toggleSignalDetail(index)"
            >
              {{ signal.text }}
            </a>
            <div v-if="expandedSignal === index" class="signal-detail">
              <div v-if="signal.value" class="signal-detail-row">
                <span class="detail-label">Value:</span>
                <span class="detail-value">{{ signal.value }}</span>
              </div>
              <div v-if="signal.weight" class="signal-detail-row">
                <span class="detail-label">Weight:</span>
                <span class="detail-value">{{ formatWeight(signal.weight) }}</span>
              </div>
              <div v-if="signal.source" class="signal-detail-row">
                <span class="detail-label">Source:</span>
                <span class="detail-value">{{ signal.source }}</span>
              </div>
              <div class="signal-detail-row">
                <span class="detail-label">Impact:</span>
                <span class="detail-value" :class="signal.impact">{{ signal.impact }}</span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <!-- Expandable reasoning -->
    <div v-if="reasoningText" class="card-footer">
      <button class="expand-btn" @click="showReasoning = !showReasoning">
        {{ showReasoning ? 'Hide Reasoning' : 'Show Reasoning' }}
      </button>
      <div v-if="showReasoning" class="reasoning">
        {{ reasoningText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { RiskAssessment } from '@/types/risk-agent';
import RiskScoreBadge from './shared/RiskScoreBadge.vue';

interface Props {
  assessment: RiskAssessment;
}

const props = defineProps<Props>();

const showReasoning = ref(false);
const expandedSignal = ref<number | null>(null);

function toggleSignalDetail(index: number) {
  expandedSignal.value = expandedSignal.value === index ? null : index;
}

// Get dimension name handling both snake_case and camelCase API responses
const dimensionDisplayName = computed(() => {
  const a = props.assessment as unknown as Record<string, unknown>;
  const name = a.dimensionName || a.dimension_name || '';
  const slug = a.dimensionSlug || a.dimension_slug || '';

  if (name) return String(name);
  if (slug) {
    // Convert slug to display name (e.g., "credit-risk" -> "Credit Risk")
    return String(slug).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return 'Unknown Dimension';
});

// Get dimension weight handling both snake_case and camelCase
const dimensionWeight = computed(() => {
  const a = props.assessment as unknown as Record<string, unknown>;
  return (a.dimensionWeight || a.dimension_weight || 0) as number;
});

// Get reasoning text handling both snake_case and camelCase
const reasoningText = computed(() => {
  const a = props.assessment as unknown as Record<string, unknown>;
  // Check for top-level reasoning first
  if (a.reasoning) return String(a.reasoning);
  // Check for analyst_response or analystResponse
  const analystResponse = (a.analystResponse || a.analyst_response) as Record<string, unknown> | undefined;
  if (analystResponse?.reasoning) return String(analystResponse.reasoning);
  return '';
});

// Check if we have signals to display
const hasSignals = computed(() => {
  const signals = props.assessment.signals;
  if (!signals || !Array.isArray(signals) || signals.length === 0) return false;
  // Check if at least one signal has displayable text
  return signals.some(s => {
    const sig = s as unknown as Record<string, unknown>;
    return sig.description || sig.name || sig.text;
  });
});

// Format signals for display - handles both backend formats
const displaySignals = computed(() => {
  const signals = props.assessment.signals;
  if (!signals || !Array.isArray(signals)) return [];

  return signals
    .slice(0, 3)
    .map(s => {
      const sig = s as unknown as Record<string, unknown>;
      // Backend uses 'name', frontend type uses 'description'
      // Also handle 'text' for flexibility
      const text = sig.description || sig.name || sig.text || '';
      return {
        text: String(text),
        impact: (sig.impact || 'neutral') as string,
        value: sig.value,
        weight: sig.weight as number | undefined,
        source: sig.source as string | undefined
      };
    })
    .filter(s => s.text); // Only include signals with actual text
});

function formatWeight(weight: number | undefined): string {
  if (weight === undefined) return 'N/A';
  return (weight * 100).toFixed(0) + '%';
}

function normalizeValue(value: number): number {
  return value > 1 ? value / 100 : value;
}

const riskLevel = computed(() => {
  const score = normalizeValue(props.assessment.score);
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
});

function formatPercent(value: number): string {
  const normalized = normalizeValue(value);
  return (normalized * 100).toFixed(0) + '%';
}
</script>

<style scoped>
.risk-dimension-card {
  background: var(--ion-card-background, #fff);
  border-radius: 8px;
  border-left: 4px solid var(--ion-border-color, #e0e0e0);
  overflow: hidden;
}

.risk-dimension-card.critical {
  border-left-color: var(--ion-color-danger-muted, #8b4444);
}

.risk-dimension-card.high {
  border-left-color: var(--ion-color-warning-muted, #8b6644);
}

.risk-dimension-card.medium {
  border-left-color: var(--ion-color-medium-muted, #7a7344);
}

.risk-dimension-card.low {
  border-left-color: var(--ion-color-success-muted, #447744);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--ion-color-light, #f4f5f8);
}

.dimension-name {
  font-weight: 600;
  font-size: 0.875rem;
}

.card-body {
  padding: 0.75rem;
}

.confidence-row,
.weight-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  margin-bottom: 0.5rem;
}

.label {
  color: var(--ion-color-medium, #666);
}

.value {
  font-weight: 500;
}

.signals-section {
  margin-top: 0.75rem;
}

.signals-label {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  display: block;
  margin-bottom: 0.25rem;
}

.signals-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.75rem;
}

.signals-list li {
  margin-bottom: 0.25rem;
}

.signals-list li.negative .signal-link {
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.signals-list li.positive .signal-link {
  color: var(--ion-color-success-muted-contrast, #447744);
}

.signal-link {
  color: var(--ion-color-primary, #3880ff);
  text-decoration: none;
  cursor: pointer;
}

.signal-link:hover {
  text-decoration: underline;
}

.signal-detail {
  margin-top: 0.375rem;
  padding: 0.5rem;
  background: var(--ion-color-light, #f4f5f8);
  border-radius: 4px;
  font-size: 0.7rem;
}

.signal-detail-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.signal-detail-row:last-child {
  margin-bottom: 0;
}

.detail-label {
  color: var(--ion-color-medium, #666);
}

.detail-value {
  font-weight: 500;
}

.detail-value.negative {
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.detail-value.positive {
  color: var(--ion-color-success-muted-contrast, #447744);
}

.detail-value.neutral {
  color: var(--ion-color-medium, #666);
}

.card-footer {
  padding: 0.75rem;
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
}

.expand-btn {
  background: none;
  border: none;
  color: var(--ion-color-primary, #3880ff);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
}

.expand-btn:hover {
  text-decoration: underline;
}

.reasoning {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  line-height: 1.4;
}

/* Dark mode overrides */
html.ion-palette-dark .risk-dimension-card,
html[data-theme="dark"] .risk-dimension-card {
  background: var(--dark-bg-tertiary);
}

html.ion-palette-dark .risk-dimension-card .card-header,
html[data-theme="dark"] .risk-dimension-card .card-header {
  background: var(--dark-bg-quaternary);
}

html.ion-palette-dark .risk-dimension-card .signal-detail,
html[data-theme="dark"] .risk-dimension-card .signal-detail {
  background: var(--dark-bg-secondary);
}

html.ion-palette-dark .risk-dimension-card .card-footer,
html[data-theme="dark"] .risk-dimension-card .card-footer {
  border-color: var(--dark-border-subtle);
}
</style>
