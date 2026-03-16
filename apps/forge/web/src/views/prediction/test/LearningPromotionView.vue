<template>
  <div class="learning-promotion-view">
    <header class="view-header">
      <div class="header-title">
        <h1>Learnings: Validation & Promotion</h1>
        <span class="test-mode-badge">TEST MODE</span>
      </div>
      <button class="btn btn-secondary" @click="refreshData">
        Refresh
      </button>
    </header>

    <!-- Stats Summary -->
    <div v-if="stats" class="stats-banner">
      <div class="stat-item">
        <span class="stat-value">{{ stats.totalTestLearnings }}</span>
        <span class="stat-label">Total Test Learnings</span>
      </div>
      <div class="stat-item promoted">
        <span class="stat-value">{{ stats.totalPromoted }}</span>
        <span class="stat-label">Promoted</span>
      </div>
      <div class="stat-item rejected">
        <span class="stat-value">{{ stats.totalRejected }}</span>
        <span class="stat-label">Rejected</span>
      </div>
      <div class="stat-item pending">
        <span class="stat-value">{{ stats.pendingReview }}</span>
        <span class="stat-label">Pending Review</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ formatSuccessRate(stats.avgSuccessRate) }}</span>
        <span class="stat-label">Avg Success Rate</span>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && candidates.length === 0" class="loading-state">
      <div class="spinner"></div>
      <span>Loading promotion candidates...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="refreshData">Try Again</button>
    </div>

    <!-- Main Content - Tabs -->
    <div v-else class="tabs-container">
      <div class="tabs-header">
        <button
          class="tab-button"
          :class="{ active: activeTab === 'candidates' }"
          @click="activeTab = 'candidates'"
        >
          Promotion Candidates
          <span v-if="readyCandidates.length > 0" class="tab-badge">{{ readyCandidates.length }}</span>
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'history' }"
          @click="activeTab = 'history'"
        >
          Promotion History
        </button>
      </div>

      <!-- Tab 1: Promotion Candidates -->
      <div v-if="activeTab === 'candidates'" class="tab-content">
        <div v-if="candidates.length === 0" class="empty-state">
          <span class="empty-icon">📚</span>
          <h3>No Promotion Candidates</h3>
          <p>There are no test learnings ready for promotion yet.</p>
        </div>

        <div v-else class="candidates-layout">
          <div class="candidates-list">
            <PromotionCandidateCard
              v-for="candidate in candidates"
              :key="candidate.id"
              :candidate="candidate"
              :is-selected="selectedCandidate?.id === candidate.id"
              @select="handleSelectCandidate"
              @validate="handleValidate"
              @backtest="handleBacktest"
              @promote="handlePromote"
              @reject="handleReject"
            />
          </div>

          <!-- Detail Panel (when candidate selected) -->
          <div v-if="selectedCandidate" class="detail-panel">
            <div class="panel-header">
              <h3>Learning Details</h3>
              <button class="close-btn" @click="handleCloseDetail">&times;</button>
            </div>

            <div class="panel-content">
              <div class="learning-full-info">
                <h4>{{ selectedCandidate.title }}</h4>
                <p class="description">{{ selectedCandidate.description }}</p>
                <div class="meta-info">
                  <span class="meta-item">
                    <strong>Type:</strong> {{ formatLearningType(selectedCandidate.learning_type) }}
                  </span>
                  <span class="meta-item">
                    <strong>Scope:</strong> {{ selectedCandidate.scope_level }}
                  </span>
                  <span v-if="selectedCandidate.domain" class="meta-item">
                    <strong>Domain:</strong> {{ selectedCandidate.domain }}
                  </span>
                  <span class="meta-item">
                    <strong>Status:</strong> {{ selectedCandidate.status }}
                  </span>
                </div>
              </div>

              <!-- Validation Result -->
              <div v-if="validationResult && validationResult.learningId === selectedCandidate.id" class="section">
                <ValidationResultPanel :result="validationResult" />
              </div>

              <!-- Backtest Result -->
              <div v-if="backtestResult && backtestResult.learningId === selectedCandidate.id" class="section">
                <div class="backtest-result-panel">
                  <div class="panel-header-inline">
                    <h3>Backtest Result</h3>
                    <span
                      class="backtest-status"
                      :class="{ passed: backtestResult.passed, failed: !backtestResult.passed }"
                    >
                      {{ backtestResult.passed ? 'Passed' : 'Failed' }}
                    </span>
                  </div>
                  <div class="backtest-metrics">
                    <div class="metric-row">
                      <span class="metric-label">Accuracy Lift:</span>
                      <span class="metric-value">{{ formatPercentage(backtestResult.metrics.accuracyLift) }}</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Predictions Improved:</span>
                      <span class="metric-value">{{ backtestResult.metrics.predictionsImproved }}</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Predictions Degraded:</span>
                      <span class="metric-value">{{ backtestResult.metrics.predictionsDegraded }}</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">False Positive Delta:</span>
                      <span class="metric-value">{{ formatPercentage(backtestResult.metrics.falsePositiveDelta) }}</span>
                    </div>
                  </div>
                  <div class="backtest-footer">
                    <span class="execution-time">Executed in {{ backtestResult.executionTimeMs }}ms</span>
                  </div>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="panel-actions">
                <button
                  class="btn btn-secondary btn-block"
                  @click="handleValidate(selectedCandidate.id)"
                  :disabled="isLoading"
                >
                  {{ validationResult && validationResult.learningId === selectedCandidate.id ? 'Re-validate' : 'Validate' }}
                </button>
                <button
                  class="btn btn-secondary btn-block"
                  @click="handleBacktest(selectedCandidate.id)"
                  :disabled="isLoading"
                >
                  {{ backtestResult && backtestResult.learningId === selectedCandidate.id ? 'Re-run Backtest' : 'Run Backtest' }}
                </button>
                <button
                  class="btn btn-primary btn-block"
                  @click="handlePromote(selectedCandidate.id)"
                  :disabled="!selectedCandidate.readyForPromotion || isLoading"
                >
                  Promote to Production
                </button>
                <button
                  class="btn btn-danger btn-block"
                  @click="handleReject(selectedCandidate.id)"
                  :disabled="isLoading"
                >
                  Reject Learning
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Promotion History -->
      <div v-if="activeTab === 'history'" class="tab-content">
        <PromotionHistoryTable
          :history="promotionHistory"
          @view-test="handleViewTestLearning"
          @view-prod="handleViewProdLearning"
        />
      </div>
    </div>

    <!-- Promotion/Rejection Dialog -->
    <PromotionActionDialog
      :is-open="showActionDialog"
      :mode="actionMode"
      :validation-result="validationResult"
      :backtest-result="backtestResult"
      @close="handleCloseActionDialog"
      @promote="handleConfirmPromote"
      @reject="handleConfirmReject"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useLearningPromotionStore } from '@/stores/learningPromotionStore';
import { learningPromotionService } from '@/services/learningPromotionService';
import PromotionCandidateCard from '@/components/prediction/promotion/PromotionCandidateCard.vue';
import ValidationResultPanel from '@/components/prediction/promotion/ValidationResultPanel.vue';
import PromotionHistoryTable from '@/components/prediction/promotion/PromotionHistoryTable.vue';
import PromotionActionDialog from '@/components/prediction/promotion/PromotionActionDialog.vue';

const store = useLearningPromotionStore();

// State
const activeTab = ref<'candidates' | 'history'>('candidates');
const showActionDialog = ref(false);
const actionMode = ref<'promote' | 'reject'>('promote');
const actionTargetId = ref<string | null>(null);

// Computed
const candidates = computed(() => store.candidates);
const selectedCandidate = computed(() => store.selectedCandidate);
const validationResult = computed(() => store.validationResult);
const backtestResult = computed(() => store.backtestResult);
const promotionHistory = computed(() => store.promotionHistory);
const stats = computed(() => store.stats);
const isLoading = computed(() => store.isLoading);
const error = computed(() => store.error);
const readyCandidates = computed(() => store.readyCandidates);

// Methods
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

async function loadHistory() {
  try {
    const response = await learningPromotionService.getPromotionHistory();
    if (response.content) {
      store.setPromotionHistory(response.content);
    }
  } catch (err) {
    console.error('Failed to load promotion history:', err);
  }
}

async function loadStats() {
  try {
    const response = await learningPromotionService.getPromotionStats();
    if (response.content) {
      store.setStats(response.content);
    }
  } catch (err) {
    console.error('Failed to load promotion stats:', err);
  }
}

async function refreshData() {
  await Promise.all([loadCandidates(), loadHistory(), loadStats()]);
}

function handleSelectCandidate(id: string) {
  const candidate = store.candidateById(id);
  if (candidate) {
    if (store.selectedCandidate?.id === id) {
      store.clearSelection();
    } else {
      store.setSelectedCandidate(candidate);
    }
  }
}

function handleCloseDetail() {
  store.clearSelection();
}

async function handleValidate(id: string) {
  store.setLoading(true);
  store.clearError();
  try {
    const response = await learningPromotionService.validateLearning(id);
    if (response.content) {
      store.setValidationResult(response.content);

      // If this is for the selected candidate, ensure it's selected
      const candidate = store.candidateById(id);
      if (candidate) {
        store.setSelectedCandidate(candidate);
      }
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to validate learning');
  } finally {
    store.setLoading(false);
  }
}

async function handleBacktest(id: string) {
  store.setLoading(true);
  store.clearError();
  try {
    const response = await learningPromotionService.runBacktest(id);
    if (response.content) {
      store.setBacktestResult(response.content);

      // If this is for the selected candidate, ensure it's selected
      const candidate = store.candidateById(id);
      if (candidate) {
        store.setSelectedCandidate(candidate);
      }
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to run backtest');
  } finally {
    store.setLoading(false);
  }
}

function handlePromote(id: string) {
  actionTargetId.value = id;
  actionMode.value = 'promote';
  showActionDialog.value = true;

  // Select the candidate if not already selected
  const candidate = store.candidateById(id);
  if (candidate) {
    store.setSelectedCandidate(candidate);
  }
}

function handleReject(id: string) {
  actionTargetId.value = id;
  actionMode.value = 'reject';
  showActionDialog.value = true;

  // Select the candidate if not already selected
  const candidate = store.candidateById(id);
  if (candidate) {
    store.setSelectedCandidate(candidate);
  }
}

function handleCloseActionDialog() {
  showActionDialog.value = false;
  actionTargetId.value = null;
}

async function handleConfirmPromote(notes: string) {
  if (!actionTargetId.value) return;

  store.setLoading(true);
  store.clearError();
  try {
    const response = await learningPromotionService.promoteLearning(
      actionTargetId.value,
      notes || undefined,
      backtestResult.value || undefined,
      undefined
    );

    if (response.content) {
      // Remove from candidates list
      store.removeCandidate(actionTargetId.value);

      // Reload history and stats
      await Promise.all([loadHistory(), loadStats()]);

      // Close dialog
      handleCloseActionDialog();
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to promote learning');
  } finally {
    store.setLoading(false);
  }
}

async function handleConfirmReject(reason: string) {
  if (!actionTargetId.value) return;

  store.setLoading(true);
  store.clearError();
  try {
    await learningPromotionService.rejectLearning(actionTargetId.value, reason);

    // Remove from candidates list
    store.removeCandidate(actionTargetId.value);

    // Reload stats
    await loadStats();

    // Close dialog
    handleCloseActionDialog();
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to reject learning');
  } finally {
    store.setLoading(false);
  }
}

function handleViewTestLearning(id: string) {
  console.log('View test learning:', id);
  // TODO: Navigate to learning detail view or open modal
}

function handleViewProdLearning(id: string) {
  console.log('View production learning:', id);
  // TODO: Navigate to learning detail view or open modal
}

function formatLearningType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSuccessRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

// Lifecycle
onMounted(async () => {
  await refreshData();
});
</script>

<style scoped>
.learning-promotion-view {
  padding: 1.5rem;
  max-width: 1600px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
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

/* Stats Banner */
.stats-banner {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--ion-card-background, #ffffff);
  border-radius: 8px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 1rem;
  min-width: 120px;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ion-text-color, #111827);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
  text-transform: uppercase;
  text-align: center;
}

.stat-item.promoted .stat-value { color: var(--ion-color-success, #10b981); }
.stat-item.rejected .stat-value { color: var(--ion-color-danger, #ef4444); }
.stat-item.pending .stat-value { color: var(--ion-color-warning, #f59e0b); }

/* Loading/Error/Empty States */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
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

.error-icon,
.empty-icon {
  font-size: 3rem;
}

.error-state {
  color: var(--ion-color-danger, #ef4444);
}

.empty-state h3 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--ion-text-color, #111827);
}

.empty-state p {
  margin: 0;
  color: var(--ion-color-medium, #6b7280);
}

/* Tabs */
.tabs-container {
  background: var(--ion-card-background, #ffffff);
  border-radius: 8px;
  overflow: hidden;
}

.tabs-header {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--ion-color-light, #f3f4f6);
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
}

.tab-button {
  padding: 0.75rem 1.5rem;
  border: none;
  background: transparent;
  color: var(--ion-color-medium, #6b7280);
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tab-button:hover {
  background: var(--ion-background-color, #ffffff);
}

.tab-button.active {
  background: var(--ion-color-primary, #15803d);
  color: white;
}

.tab-badge {
  padding: 0.125rem 0.5rem;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 700;
}

.tab-button.active .tab-badge {
  background: rgba(255, 255, 255, 0.3);
}

.tab-content {
  padding: 1.5rem;
}

/* Candidates Layout */
.candidates-layout {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 1.5rem;
}

@media (max-width: 1200px) {
  .candidates-layout {
    grid-template-columns: 1fr;
  }
}

.candidates-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Detail Panel */
.detail-panel {
  background: var(--ion-card-background, #ffffff);
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
  position: sticky;
  top: 1rem;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
}

.detail-panel .panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
  background: var(--ion-color-light, #f3f4f6);
}

.detail-panel .panel-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--ion-color-medium, #6b7280);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.close-btn:hover {
  background: var(--ion-color-medium-tint, #e5e7eb);
}

.panel-content {
  padding: 1.5rem;
}

.learning-full-info {
  margin-bottom: 1.5rem;
}

.learning-full-info h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.learning-full-info .description {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--ion-color-medium, #6b7280);
}

.meta-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.meta-item {
  font-size: 0.875rem;
  color: var(--ion-text-color, #111827);
}

.meta-item strong {
  color: var(--ion-color-medium, #6b7280);
}

.section {
  margin-bottom: 1.5rem;
}

/* Backtest Result Panel */
.backtest-result-panel {
  background: var(--ion-card-background, #ffffff);
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1.5rem;
}

.panel-header-inline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.panel-header-inline h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.backtest-status {
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.backtest-status.passed {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.1));
  color: var(--ion-color-success, #10b981);
}

.backtest-status.failed {
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.1));
  color: var(--ion-color-danger, #ef4444);
}

.backtest-metrics {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: var(--ion-color-light, #f3f4f6);
  border-radius: 4px;
}

.metric-label {
  font-size: 0.875rem;
  color: var(--ion-color-medium, #6b7280);
}

.metric-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.backtest-footer {
  padding-top: 0.75rem;
  border-top: 1px solid var(--ion-border-color, #e5e7eb);
}

.execution-time {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
}

/* Panel Actions */
.panel-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

/* Buttons */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-block {
  width: 100%;
  justify-content: center;
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

.btn-danger {
  background: var(--ion-color-danger, #ef4444);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: var(--ion-color-danger-shade, #dc2626);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
