<template>
  <div class="executive-summary">
    <div class="summary-header">
      <div class="header-left">
        <h3>Executive Summary</h3>
        <span class="summary-type" v-if="summary">
          {{ formatSummaryType(summary.summaryType) }}
        </span>
      </div>
      <div class="header-right">
        <button
          class="btn btn-secondary"
          @click="onGenerate"
          :disabled="isGenerating"
        >
          <span v-if="isGenerating" class="spinner-small"></span>
          <span v-else class="icon">&#10227;</span>
          {{ isGenerating ? 'Generating...' : 'Generate New' }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading summary...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadLatestSummary">Retry</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="!summary" class="empty-state">
      <span class="empty-icon">📋</span>
      <h4>No Executive Summary</h4>
      <p>Generate an AI-powered executive summary to get insights about your portfolio risk.</p>
      <button class="btn btn-primary" @click="onGenerate" :disabled="isGenerating">
        {{ isGenerating ? 'Generating...' : 'Generate Summary' }}
      </button>
    </div>

    <!-- Summary without content fallback -->
    <div v-else-if="summary && !summary.content" class="empty-state">
      <span class="empty-icon">📋</span>
      <h4>Summary Data Missing</h4>
      <p>The summary was retrieved but contains no content. Try generating a new one.</p>
      <button class="btn btn-primary" @click="onGenerate" :disabled="isGenerating">
        {{ isGenerating ? 'Generating...' : 'Generate Summary' }}
      </button>
    </div>

    <!-- Summary Content -->
    <div v-else-if="summary?.content" class="summary-content">
      <!-- Status Banner -->
      <div :class="['status-banner', `status-${summary.content.status || 'stable'}`]">
        <div class="status-icon">{{ getStatusIcon(summary.content.status) }}</div>
        <div class="status-content">
          <span class="status-label">Portfolio Status</span>
          <span class="status-text">{{ capitalizeFirst(summary.content.status || 'stable') }}</span>
        </div>
      </div>

      <!-- Headline -->
      <div class="headline-section">
        <h4 class="headline">{{ summary.content.headline }}</h4>
        <span class="generated-at">
          Generated {{ formatRelativeTime(summary.generatedAt) }}
        </span>
      </div>

      <!-- Key Findings -->
      <div class="findings-section">
        <h5>Key Findings</h5>
        <ul class="findings-list">
          <li v-for="(finding, idx) in summary.content.keyFindings" :key="idx">
            <span class="finding-bullet">{{ idx + 1 }}</span>
            <span class="finding-text">{{ finding }}</span>
          </li>
        </ul>
      </div>

      <!-- Risk Highlights -->
      <div class="highlights-section" v-if="hasRiskHighlights">
        <h5>Risk Highlights</h5>
        <div class="highlights-grid">
          <!-- Top Risks -->
          <div class="highlight-card" v-if="summary.content.riskHighlights?.topRisks?.length">
            <h6>Highest Risks</h6>
            <ul class="highlight-list">
              <li v-for="(risk, idx) in summary.content.riskHighlights.topRisks.slice(0, 3)" :key="idx">
                <span class="risk-subject">{{ risk.subject }}</span>
                <span class="risk-score" :class="getScoreClass(risk.score)">
                  {{ formatScore(risk.score) }}
                </span>
              </li>
            </ul>
          </div>

          <!-- Recent Changes -->
          <div class="highlight-card" v-if="summary.content.riskHighlights?.recentChanges?.length">
            <h6>Recent Changes</h6>
            <ul class="highlight-list">
              <li v-for="(change, idx) in summary.content.riskHighlights.recentChanges.slice(0, 3)" :key="idx">
                <span class="change-subject">{{ change.subject }}</span>
                <span :class="['change-value', change.direction]">
                  <span class="change-arrow">{{ change.direction === 'up' ? '↑' : '↓' }}</span>
                  {{ formatChange(change.change) }}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Recommendations -->
      <div class="recommendations-section">
        <h5>Recommendations</h5>
        <ul class="recommendations-list">
          <li v-for="(rec, idx) in summary.content.recommendations" :key="idx">
            <span class="rec-icon">💡</span>
            <span class="rec-text">{{ rec }}</span>
          </li>
        </ul>
      </div>

      <!-- Expiry Notice -->
      <div v-if="isExpiringSoon" class="expiry-notice">
        <span class="expiry-icon">⏰</span>
        <span>This summary will expire {{ formatRelativeTime(summary.expiresAt!) }}. Generate a new one to get updated insights.</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { riskDashboardService } from '@/services/riskDashboardService';
import type { ExecutiveSummary, ExecutiveSummaryStatus } from '@/types/risk-agent';

const props = defineProps<{
  scopeId: string;
}>();

const emit = defineEmits<{
  'summary-generated': [summary: ExecutiveSummary];
  'error': [error: string];
}>();

// State
const summary = ref<ExecutiveSummary | null>(null);
const isLoading = ref(false);
const isGenerating = ref(false);
const error = ref<string | null>(null);

// Computed
const hasRiskHighlights = computed(() => {
  if (!summary.value?.content?.riskHighlights) return false;
  return (
    summary.value.content.riskHighlights.topRisks?.length > 0 ||
    summary.value.content.riskHighlights.recentChanges?.length > 0
  );
});

const isExpiringSoon = computed(() => {
  if (!summary.value?.expiresAt) return false;
  const expiry = new Date(summary.value.expiresAt);
  const now = new Date();
  const hoursUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursUntilExpiry > 0 && hoursUntilExpiry < 2;
});

// Methods
async function loadLatestSummary() {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await riskDashboardService.getLatestSummary(props.scopeId);
    if (response.success && response.content) {
      summary.value = response.content;
    } else {
      summary.value = null;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load summary';
    emit('error', error.value);
  } finally {
    isLoading.value = false;
  }
}

async function onGenerate() {
  isGenerating.value = true;
  error.value = null;

  try {
    const response = await riskDashboardService.generateExecutiveSummary({
      scopeId: props.scopeId,
      summaryType: 'ad-hoc',
    });
    if (response.success && response.content) {
      summary.value = response.content;
      emit('summary-generated', response.content);
    } else {
      throw new Error(response.error?.message || 'Failed to generate summary');
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to generate summary';
    emit('error', error.value);
  } finally {
    isGenerating.value = false;
  }
}

function formatSummaryType(type: string): string {
  const types: Record<string, string> = {
    daily: 'Daily Report',
    weekly: 'Weekly Report',
    'ad-hoc': 'On-demand Report',
  };
  return types[type] || type;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 0) {
    // Future date
    const futureMins = Math.abs(diffMins);
    if (futureMins < 60) return `in ${futureMins} minutes`;
    const futureHours = Math.floor(futureMins / 60);
    if (futureHours < 24) return `in ${futureHours} hours`;
    return `in ${Math.floor(futureHours / 24)} days`;
  }

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
}

function getStatusIcon(status: ExecutiveSummaryStatus): string {
  const icons: Record<ExecutiveSummaryStatus, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
    stable: '✓',
  };
  return icons[status] || '⚪';
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatScore(score: number): string {
  // Handle both 0-1 and 0-100 scales
  const normalized = score > 1 ? score : score * 100;
  return normalized.toFixed(0) + '%';
}

function formatChange(change: number): string {
  // Handle both 0-1 and 0-100 scales
  const normalized = Math.abs(change > 1 ? change : change * 100);
  return normalized.toFixed(1) + '%';
}

function getScoreClass(score: number): string {
  // Handle both 0-1 and 0-100 scales
  const normalized = score > 1 ? score / 100 : score;
  if (normalized >= 0.7) return 'high';
  if (normalized >= 0.4) return 'medium';
  return 'low';
}

// Lifecycle
onMounted(() => {
  loadLatestSummary();
});

watch(() => props.scopeId, () => {
  loadLatestSummary();
});

// Expose for parent components
defineExpose({
  refresh: loadLatestSummary,
  generate: onGenerate,
});
</script>

<style scoped>
.executive-summary {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1.5rem;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.summary-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.summary-type {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: var(--badge-bg, #f3f4f6);
  border-radius: 4px;
  color: var(--text-secondary, #6b7280);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-secondary {
  background-color: var(--btn-secondary-bg, #f3f4f6);
  color: var(--btn-secondary-text, #374151);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--btn-secondary-hover, #e5e7eb);
}

.btn-primary {
  background-color: var(--primary-color, #a87c4f);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--primary-color-dark, #8f693f);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.icon {
  font-size: 1rem;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color, #e5e7eb);
  border-top-color: var(--primary-color, #a87c4f);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* States */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e5e7eb);
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
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-radius: 50%;
  font-weight: bold;
}

.empty-icon {
  font-size: 2.5rem;
}

.empty-state h4 {
  margin: 0;
  color: var(--text-primary, #111827);
}

.empty-state p {
  margin: 0;
  text-align: center;
  max-width: 300px;
}

/* Summary Content */
.summary-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Status Banner */
.status-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: 8px;
}

.status-banner.status-critical {
  background: rgba(239, 68, 68, 0.1);
  border-left: 4px solid #ef4444;
}

.status-banner.status-high {
  background: rgba(249, 115, 22, 0.1);
  border-left: 4px solid #f97316;
}

.status-banner.status-medium {
  background: rgba(234, 179, 8, 0.1);
  border-left: 4px solid #eab308;
}

.status-banner.status-low {
  background: rgba(34, 197, 94, 0.1);
  border-left: 4px solid #22c55e;
}

.status-banner.status-stable {
  background: rgba(21, 128, 61, 0.1);
  border-left: 4px solid #15803d;
}

.status-icon {
  font-size: 1.5rem;
}

.status-content {
  display: flex;
  flex-direction: column;
}

.status-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.status-text {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

/* Headline */
.headline-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.headline {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  line-height: 1.4;
}

.generated-at {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

/* Findings */
.findings-section h5,
.highlights-section h5,
.recommendations-section h5 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.findings-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.findings-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.finding-bullet {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-color, #a87c4f);
  color: white;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 600;
}

.finding-text {
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  line-height: 1.4;
}

/* Highlights */
.highlights-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.highlight-card {
  background: var(--highlight-bg, #f9fafb);
  border-radius: 6px;
  padding: 1rem;
}

.highlight-card h6 {
  margin: 0 0 0.75rem 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.highlight-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.highlight-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}

.risk-subject,
.change-subject {
  color: var(--text-primary, #111827);
}

.risk-score {
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.risk-score.high {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.risk-score.medium {
  background: rgba(234, 179, 8, 0.1);
  color: #ca8a04;
}

.risk-score.low {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.change-value {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
}

.change-value.up {
  color: #dc2626;
}

.change-value.down {
  color: #16a34a;
}

.change-arrow {
  font-size: 0.875rem;
}

/* Recommendations */
.recommendations-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.recommendations-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(21, 128, 61, 0.05);
  border-radius: 6px;
}

.rec-icon {
  flex-shrink: 0;
}

.rec-text {
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  line-height: 1.4;
}

/* Expiry Notice */
.expiry-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(234, 179, 8, 0.1);
  border-radius: 6px;
  font-size: 0.75rem;
  color: #ca8a04;
}

.expiry-icon {
  flex-shrink: 0;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .executive-summary {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --btn-secondary-bg: #374151;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #4b5563;
    --badge-bg: #374151;
    --highlight-bg: #374151;
  }
}
</style>
