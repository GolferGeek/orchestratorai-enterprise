<template>
  <div class="risk-radar-chart">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <!-- Grid circles -->
      <circle
        v-for="i in 5"
        :key="`grid-${i}`"
        :cx="center"
        :cy="center"
        :r="(radius / 5) * i"
        fill="none"
        stroke="var(--ion-border-color, #e0e0e0)"
        stroke-width="1"
      />

      <!-- Axis lines -->
      <line
        v-for="(point, index) in axisPoints"
        :key="`axis-${index}`"
        :x1="center"
        :y1="center"
        :x2="point.x"
        :y2="point.y"
        stroke="var(--ion-border-color, #e0e0e0)"
        stroke-width="1"
      />

      <!-- Data polygon -->
      <polygon
        :points="dataPolygon"
        fill="var(--ion-color-primary, #3880ff)"
        fill-opacity="0.3"
        stroke="var(--ion-color-primary, #3880ff)"
        stroke-width="2"
      />

      <!-- Data points -->
      <circle
        v-for="(point, index) in dataPoints"
        :key="`point-${index}`"
        :cx="point.x"
        :cy="point.y"
        r="4"
        fill="var(--ion-color-primary, #3880ff)"
      />

      <!-- Labels -->
      <text
        v-for="(label, index) in labelPoints"
        :key="`label-${index}`"
        :x="label.x"
        :y="label.y"
        text-anchor="middle"
        dominant-baseline="middle"
        class="dimension-label"
      >
        {{ label.text }}
      </text>
    </svg>

    <!-- Legend -->
    <div class="legend">
      <div
        v-for="assessment in assessments"
        :key="assessment.id"
        class="legend-item"
        @click="selectAssessment(assessment)"
      >
        <span class="legend-color" :style="{ background: getScoreColor(assessment.score) }"></span>
        <span class="legend-name">{{ getAssessmentName(assessment) }}</span>
        <span class="legend-score">{{ formatPercent(assessment.score) }}</span>
      </div>
    </div>

    <!-- Assessment Detail Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="selectedAssessment" class="modal-overlay" @click.self="closeModal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>{{ getAssessmentName(selectedAssessment) }}</h3>
              <button class="modal-close" @click="closeModal">&times;</button>
            </div>
            <div class="modal-body">
              <div class="detail-row">
                <span class="detail-label">Risk Score:</span>
                <span class="detail-value" :class="getScoreClass(selectedAssessment.score)">
                  {{ formatPercent(selectedAssessment.score) }}
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Confidence:</span>
                <span class="detail-value">{{ formatPercent(selectedAssessment.confidence) }}</span>
              </div>
              <div v-if="selectedAssessment.dimensionWeight" class="detail-row">
                <span class="detail-label">Weight:</span>
                <span class="detail-value">{{ formatPercent(selectedAssessment.dimensionWeight) }}</span>
              </div>
              <div v-if="getReasoning(selectedAssessment)" class="detail-section">
                <span class="detail-label">Reasoning:</span>
                <p class="reasoning-text">{{ getReasoning(selectedAssessment) }}</p>
              </div>
              <div v-if="getSignals(selectedAssessment).length > 0" class="detail-section">
                <span class="detail-label">Signals:</span>
                <ul class="signals-list">
                  <li v-for="(signal, idx) in getSignals(selectedAssessment)" :key="idx" :class="`signal-${signal.impact}`">
                    {{ signal.description || signal.name }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RiskAssessment } from '@/types/risk-agent';

interface Props {
  assessments: RiskAssessment[];
  size?: number;
}

const props = withDefaults(defineProps<Props>(), {
  size: 300,
});

// Modal state
const selectedAssessment = ref<RiskAssessment | null>(null);

function selectAssessment(assessment: RiskAssessment) {
  selectedAssessment.value = assessment;
}

function closeModal() {
  selectedAssessment.value = null;
}

// Helper to get assessment name handling both snake_case and camelCase
function getAssessmentName(assessment: RiskAssessment): string {
  const a = assessment as unknown as Record<string, unknown>;
  return String(a.dimensionName || a.dimension_name || a.dimensionSlug || a.dimension_slug || 'Unknown');
}

// Helper to get reasoning from assessment
function getReasoning(assessment: RiskAssessment): string {
  const a = assessment as unknown as Record<string, unknown>;
  const analystResponse = (a.analystResponse || a.analyst_response) as Record<string, unknown> | undefined;
  return String(a.reasoning || analystResponse?.reasoning || '');
}

// Helper to get signals from assessment
function getSignals(assessment: RiskAssessment): Array<{ description?: string; name?: string; impact?: string }> {
  const a = assessment as unknown as Record<string, unknown>;
  const signals = a.signals as Array<Record<string, unknown>> | undefined;
  if (!signals || !Array.isArray(signals)) return [];
  return signals.map(s => ({
    description: String(s.description || ''),
    name: String(s.name || ''),
    impact: String(s.impact || 'neutral'),
  }));
}

// Helper to get score class
function getScoreClass(score: number): string {
  const normalized = normalizeScore(score);
  if (normalized >= 0.8) return 'critical';
  if (normalized >= 0.6) return 'high';
  if (normalized >= 0.4) return 'medium';
  return 'low';
}

const center = computed(() => props.size / 2);
const radius = computed(() => (props.size / 2) - 40);

// Calculate axis endpoint positions
const axisPoints = computed(() => {
  const count = props.assessments.length;
  if (count === 0) return [];

  return props.assessments.map((_, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    return {
      x: center.value + Math.cos(angle) * radius.value,
      y: center.value + Math.sin(angle) * radius.value,
    };
  });
});

// Normalize score to 0-1 range
// Handles multiple scales: 0-1 (already normalized), 1-10 (dimension scores), 0-100 (percentages)
function normalizeScore(score: number): number {
  // Guard against undefined, null, or NaN
  if (score === undefined || score === null || Number.isNaN(score)) return 0;
  if (score <= 1) return score; // Already 0-1 scale
  if (score <= 10) return score / 10; // 1-10 scale (dimension assessments)
  return score / 100; // 0-100 scale (percentages)
}

// Calculate data point positions based on scores
const dataPoints = computed(() => {
  const count = props.assessments.length;
  if (count === 0) return [];

  return props.assessments.map((assessment, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const normalizedScore = normalizeScore(assessment.score);
    const r = radius.value * normalizedScore;
    return {
      x: center.value + Math.cos(angle) * r,
      y: center.value + Math.sin(angle) * r,
    };
  });
});

// Create polygon points string
const dataPolygon = computed(() => {
  return dataPoints.value.map((p) => `${p.x},${p.y}`).join(' ');
});

// Get full label for dimension
function getDimensionLabel(assessment: RiskAssessment, index: number): string {
  // Handle both camelCase and snake_case from API
  const assessmentRecord = assessment as unknown as Record<string, unknown>;

  // Try to get the display name or slug
  const name = String(
    assessmentRecord.dimensionName ||
    assessmentRecord.dimension_name ||
    ''
  );

  const slug = String(
    assessmentRecord.dimensionSlug ||
    assessmentRecord.dimension_slug ||
    ''
  );

  if (!name && !slug) return `D${index + 1}`;

  // Map dimension slugs to full readable names
  const fullLabels: Record<string, string> = {
    'credit': 'Credit',
    'credit-risk': 'Credit Risk',
    'market-risk': 'Market Risk',
    'market-volatility': 'Volatility',
    'liquidity': 'Liquidity',
    'liquidity-risk': 'Liquidity',
    'regulatory': 'Regulatory',
    'regulatory-risk': 'Regulatory',
    'operational-risk': 'Operational',
    'concentration-risk': 'Concentration',
    'sector-concentration': 'Sector',
    'geopolitical': 'Geopolitical',
    'financial-health': 'Financial',
    'growth-sustainability': 'Growth',
    'valuation': 'Valuation',
    'sentiment': 'Sentiment',
    'correlation': 'Correlation',
    'momentum': 'Momentum',
  };

  // Check if we have a mapped label
  const slugLower = slug.toLowerCase();
  if (fullLabels[slugLower]) {
    return fullLabels[slugLower];
  }

  // If name exists, format it nicely (capitalize first letters, remove dashes)
  if (name) {
    return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Format slug as fallback
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Calculate label positions (slightly outside the chart)
const labelPoints = computed(() => {
  const count = props.assessments.length;
  if (count === 0) return [];

  return props.assessments.map((assessment, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const r = radius.value + 25;
    return {
      x: center.value + Math.cos(angle) * r,
      y: center.value + Math.sin(angle) * r,
      text: getDimensionLabel(assessment, i),
    };
  });
});

function formatPercent(value: number): string {
  const normalized = normalizeScore(value);
  return (normalized * 100).toFixed(0) + '%';
}

function getScoreColor(score: number): string {
  const normalized = normalizeScore(score);
  if (normalized >= 0.8) return 'var(--ion-color-danger-muted, #8b4444)';
  if (normalized >= 0.6) return 'var(--ion-color-warning-muted, #8b6644)';
  if (normalized >= 0.4) return 'var(--ion-color-medium-muted, #7a7344)';
  return 'var(--ion-color-success-muted, #447744)';
}
</script>

<style scoped>
.risk-radar-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.dimension-label {
  font-size: 0.625rem;
  fill: var(--ion-text-color, #333);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.legend-item:hover {
  background: var(--ion-color-light, #f4f5f8);
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-name {
  color: var(--ion-color-medium, #666);
}

.legend-score {
  font-weight: 600;
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
  max-width: 400px;
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

.detail-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
}

.detail-section .detail-label {
  display: block;
  margin-bottom: 0.5rem;
}

.reasoning-text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--ion-text-color, #333);
}

.signals-list {
  margin: 0;
  padding: 0 0 0 1.25rem;
  font-size: 0.875rem;
}

.signals-list li {
  margin-bottom: 0.375rem;
  line-height: 1.4;
}

.signals-list li.signal-positive {
  color: var(--ion-color-success-muted-contrast, #447744);
}

.signals-list li.signal-negative {
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.signals-list li.signal-neutral {
  color: var(--ion-color-medium, #666);
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

/* Dark mode overrides */
html.ion-palette-dark .risk-radar-chart .legend-item:hover,
html[data-theme="dark"] .risk-radar-chart .legend-item:hover {
  background: var(--dark-bg-quaternary);
}

html.ion-palette-dark .risk-radar-chart .modal-content,
html[data-theme="dark"] .risk-radar-chart .modal-content {
  background: var(--dark-bg-tertiary);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

html.ion-palette-dark .risk-radar-chart .modal-header,
html[data-theme="dark"] .risk-radar-chart .modal-header {
  border-color: var(--dark-border-subtle);
}

html.ion-palette-dark .risk-radar-chart .detail-section,
html[data-theme="dark"] .risk-radar-chart .detail-section {
  border-color: var(--dark-border-subtle);
}
</style>
