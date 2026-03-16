<template>
  <div class="backtest-view">
    <!-- Header -->
    <header class="view-header">
      <div class="header-title">
        <h1>Backtests</h1>
        <span class="test-mode-badge">TEST MODE</span>
      </div>
      <button class="btn btn-secondary" @click="handleRefresh" :disabled="isLoading">
        Refresh
      </button>
    </header>

    <!-- Description -->
    <div class="view-description">
      <p>
        Run backtests to evaluate how a learning would have performed on historical predictions.
        Backtests help validate that a learning improves accuracy without increasing false positives.
      </p>
    </div>

    <!-- Error State -->
    <div v-if="error" class="error-banner">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-sm btn-secondary" @click="clearError">Dismiss</button>
    </div>

    <!-- Loading State (Initial) -->
    <div v-if="isLoading && !backtestResult && candidates.length === 0" class="loading-state">
      <div class="spinner"></div>
      <span>Loading promotion candidates...</span>
    </div>

    <!-- Main Content -->
    <div v-else class="main-content">
      <!-- Section 1: Configure & Run Backtest -->
      <section class="content-section">
        <BacktestConfigForm
          :candidates="candidates"
          :is-loading="isLoading"
          :selected-learning-id="selectedLearningId"
          @run="handleRunBacktest"
          @clear="handleClearBacktest"
        />
      </section>

      <!-- Section 2: Backtest Result -->
      <section v-if="backtestResult" class="content-section">
        <div class="section-header">
          <h2>Backtest Result</h2>
          <div class="section-actions">
            <button
              v-if="backtestResult.passed"
              class="btn btn-primary"
              @click="handleProceedToPromotion"
            >
              Proceed to Promotion
            </button>
            <button
              v-else
              class="btn btn-secondary"
              @click="handleReviewLearning"
            >
              Review Learning
            </button>
          </div>
        </div>

        <BacktestResultCard :result="backtestResult" />
      </section>

      <!-- Section 3: Visual Comparison -->
      <section v-if="backtestResult" class="content-section">
        <BacktestComparisonChart :result="backtestResult" />
      </section>

      <!-- Section 4: Backtest History (Optional) -->
      <section v-if="backtestHistory.length > 0" class="content-section">
        <div class="section-header">
          <h2>Recent Backtests</h2>
        </div>

        <div class="backtest-history-table">
          <table>
            <thead>
              <tr>
                <th>Learning</th>
                <th>Window (Days)</th>
                <th>Pass/Fail</th>
                <th>Accuracy Lift</th>
                <th>Sample Size</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="history in backtestHistory"
                :key="history.backtestId"
                @click="handleSelectHistory(history)"
                class="history-row"
              >
                <td class="learning-title">{{ history.learningTitle }}</td>
                <td>{{ history.windowDays }}</td>
                <td>
                  <span class="status-badge" :class="{ passed: history.passed, failed: !history.passed }">
                    {{ history.passed ? 'Passed' : 'Failed' }}
                  </span>
                </td>
                <td :class="trendClass(history.accuracyLift)">
                  {{ formatTrend(history.accuracyLift) }}
                </td>
                <td>{{ history.sampleSize }}</td>
                <td class="date-cell">{{ formatDate(history.executedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLearningPromotionStore } from '@/stores/learningPromotionStore';
import { learningPromotionService } from '@/services/learningPromotionService';
import BacktestConfigForm from '@/components/prediction/backtest/BacktestConfigForm.vue';
import BacktestResultCard from '@/components/prediction/backtest/BacktestResultCard.vue';
import BacktestComparisonChart from '@/components/prediction/backtest/BacktestComparisonChart.vue';

// ============================================================================
// COMPOSABLES
// ============================================================================

const router = useRouter();
const store = useLearningPromotionStore();

// ============================================================================
// STATE
// ============================================================================

interface BacktestHistory {
  backtestId: string;
  learningId: string;
  learningTitle: string;
  windowDays: number;
  passed: boolean;
  accuracyLift: number;
  sampleSize: number;
  executedAt: string;
}

const selectedLearningId = ref<string>('');
const backtestHistory = ref<BacktestHistory[]>([]);

// ============================================================================
// COMPUTED
// ============================================================================

const candidates = computed(() => store.candidates);
const backtestResult = computed(() => store.backtestResult);
const isLoading = computed(() => store.isLoading);
const error = computed(() => store.error);

// ============================================================================
// METHODS
// ============================================================================

async function loadCandidates() {
  store.setLoading(true);
  store.clearError();
  try {
    const response = await learningPromotionService.getPromotionCandidates();
    if (response.content) {
      store.setCandidates(response.content);
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to load promotion candidates');
  } finally {
    store.setLoading(false);
  }
}

async function handleRunBacktest(config: {
  learningId: string;
  windowDays: number;
  targetSymbols: string;
  domain: string;
}) {
  store.setLoading(true);
  store.clearError();
  selectedLearningId.value = config.learningId;

  try {
    const response = await learningPromotionService.runBacktest(
      config.learningId,
      config.windowDays
    );

    if (response.content) {
      store.setBacktestResult(response.content);

      // Add to history
      const candidate = candidates.value.find((c) => c.id === config.learningId);
      if (candidate) {
        backtestHistory.value.unshift({
          backtestId: response.content.backtestId,
          learningId: config.learningId,
          learningTitle: candidate.title,
          windowDays: config.windowDays,
          passed: response.content.passed,
          accuracyLift: response.content.metrics.accuracyLift,
          sampleSize: response.content.metrics.predictionsAffected,
          executedAt: response.content.executedAt,
        });

        // Keep only last 10 history items
        if (backtestHistory.value.length > 10) {
          backtestHistory.value = backtestHistory.value.slice(0, 10);
        }
      }
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to run backtest');
  } finally {
    store.setLoading(false);
  }
}

function handleClearBacktest() {
  store.setBacktestResult(null);
  selectedLearningId.value = '';
  store.clearError();
}

async function handleRefresh() {
  await loadCandidates();
}

function clearError() {
  store.clearError();
}

function handleProceedToPromotion() {
  // Navigate to promotion view with the selected learning
  if (backtestResult.value) {
    router.push({
      name: 'LearningPromotion',
      query: { learningId: backtestResult.value.learningId },
    });
  }
}

function handleReviewLearning() {
  // Navigate to learnings management
  if (backtestResult.value) {
    router.push({
      name: 'LearningsManagement',
      query: { id: backtestResult.value.learningId },
    });
  }
}

function handleSelectHistory(history: BacktestHistory) {
  // Could reload this backtest result
  console.log('Selected history:', history);
  // For now, just set the learning ID for re-running
  selectedLearningId.value = history.learningId;
}

function formatTrend(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function trendClass(value: number): string {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// LIFECYCLE
// ============================================================================

onMounted(async () => {
  await loadCandidates();
});
</script>

<style scoped>
.backtest-view {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

/* Header */
.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-title h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
  margin: 0;
}

.test-mode-badge {
  padding: 0.375rem 0.75rem;
  background: var(--ion-color-warning-tint, rgba(245, 158, 11, 0.1));
  color: var(--ion-color-warning, #f59e0b);
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.view-description {
  margin-bottom: 1.5rem;
  padding: 1rem 1.25rem;
  background: var(--ion-color-light, #f3f4f6);
  border-left: 4px solid var(--ion-color-primary, #15803d);
  border-radius: 4px;
}

.view-description p {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ion-color-medium, #6b7280);
}

/* Error Banner */
.error-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.1));
  border: 1px solid var(--ion-color-danger, #ef4444);
  border-radius: 6px;
  color: var(--ion-color-danger, #ef4444);
  font-size: 0.875rem;
}

.error-icon {
  font-size: 1.25rem;
  font-weight: 700;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  text-align: center;
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--ion-color-light, #f3f4f6);
  border-top-color: var(--ion-color-primary, #15803d);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Main Content */
.main-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.content-section {
  background: transparent;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
  margin: 0;
}

.section-actions {
  display: flex;
  gap: 0.75rem;
}

/* Backtest History Table */
.backtest-history-table {
  background: var(--ion-card-background, #ffffff);
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: var(--ion-color-light, #f3f4f6);
}

thead th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ion-color-medium, #6b7280);
  text-transform: uppercase;
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
}

tbody tr {
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
  transition: background 0.2s;
}

tbody tr:last-child {
  border-bottom: none;
}

tbody tr.history-row {
  cursor: pointer;
}

tbody tr.history-row:hover {
  background: var(--ion-color-light, #f3f4f6);
}

tbody td {
  padding: 1rem;
  font-size: 0.875rem;
  color: var(--ion-text-color, #111827);
}

.learning-title {
  font-weight: 500;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.passed {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.1));
  color: var(--ion-color-success, #10b981);
}

.status-badge.failed {
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.1));
  color: var(--ion-color-danger, #ef4444);
}

.positive {
  color: var(--ion-color-success, #10b981);
  font-weight: 600;
}

.negative {
  color: var(--ion-color-danger, #ef4444);
  font-weight: 600;
}

.neutral {
  color: var(--ion-color-medium, #6b7280);
}

.date-cell {
  color: var(--ion-color-medium, #6b7280);
  font-size: 0.8125rem;
}

/* Buttons */
.btn {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--ion-color-primary, #15803d);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--ion-color-primary-shade, #166534);
}

.btn-secondary {
  background: var(--ion-color-light, #f3f4f6);
  color: var(--ion-text-color, #111827);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--ion-color-medium-tint, #e5e7eb);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
}

/* Responsive */
@media (max-width: 768px) {
  .backtest-view {
    padding: 1rem;
  }

  .view-header {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .section-header {
    flex-direction: column;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .section-actions {
    width: 100%;
  }

  .section-actions .btn {
    flex: 1;
  }

  .backtest-history-table {
    overflow-x: auto;
  }

  table {
    min-width: 600px;
  }
}
</style>
