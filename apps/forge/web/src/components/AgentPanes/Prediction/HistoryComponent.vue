<template>
  <div class="history-component">
    <div class="history-header">
      <h3>Prediction History</h3>
      <div class="history-stats">
        <span class="stat">Total: {{ historyTotal }}</span>
        <span class="stat success">Correct: {{ correctCount }}</span>
        <span class="stat danger">Incorrect: {{ incorrectCount }}</span>
        <span class="stat">Accuracy: {{ accuracyRate.toFixed(1) }}%</span>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-section">
      <div class="filter-row">
        <select v-model="localFilters.targetId" class="filter-select">
          <option :value="null">All Targets</option>
          <option v-for="target in targets" :key="target.id" :value="target.id">
            {{ target.symbol }}
          </option>
        </select>

        <select v-model="localFilters.outcome" class="filter-select">
          <option :value="null">All Outcomes</option>
          <option value="pending">Pending</option>
          <option value="correct">Correct</option>
          <option value="incorrect">Incorrect</option>
        </select>

        <select v-model="localFilters.status" class="filter-select">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="resolved">Resolved</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <input
          v-model="localFilters.startDate"
          type="date"
          class="filter-input"
          placeholder="Start Date"
        />

        <input
          v-model="localFilters.endDate"
          type="date"
          class="filter-input"
          placeholder="End Date"
        />

        <button class="filter-btn" @click="applyFilters">
          Apply Filters
        </button>

        <button class="clear-btn" @click="clearFilters">
          Clear
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading history...</span>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredHistory.length === 0" class="empty-state">
      No predictions found matching the selected filters.
    </div>

    <!-- History List -->
    <div v-else class="history-list">
      <div
        v-for="prediction in paginatedHistory"
        :key="prediction.id"
        class="history-item"
      >
        <div class="history-item-header">
          <div class="item-title">
            <span class="instrument">{{ getTargetSymbol(prediction.targetId) }}</span>
            <span class="action-badge" :class="getDirectionClass(prediction.direction)">
              {{ prediction.direction.toUpperCase() }}
            </span>
            <OutcomeBadge
              v-if="getOutcomeStatus(prediction)"
              :status="getOutcomeStatus(prediction)!"
            />
          </div>
          <div class="item-date">
            {{ formatDate(prediction.generatedAt) }}
          </div>
        </div>

        <div class="history-item-content">
          <div v-if="prediction.rationale" class="item-rationale">
            {{ prediction.rationale }}
          </div>

          <div class="item-details">
            <div class="detail">
              <span class="detail-label">Confidence:</span>
              <ConfidenceBar :confidence="prediction.confidence * 100" />
            </div>

            <div v-if="prediction.magnitude" class="detail">
              <span class="detail-label">Magnitude:</span>
              <span class="detail-value">{{ prediction.magnitude.toFixed(1) }}%</span>
            </div>

            <div v-if="prediction.timeframe" class="detail">
              <span class="detail-label">Timeframe:</span>
              <span class="detail-value">{{ prediction.timeframe }}</span>
            </div>

            <div v-if="prediction.outcomeValue !== null && prediction.outcomeValue !== undefined" class="detail">
              <span class="detail-label">Actual:</span>
              <span
                class="detail-value"
                :class="prediction.outcomeValue >= 0 ? 'positive' : 'negative'"
              >
                {{ prediction.outcomeValue >= 0 ? '+' : '' }}{{ prediction.outcomeValue.toFixed(2) }}%
              </span>
            </div>
          </div>

          <div v-if="prediction.notes" class="item-notes">
            <strong>Notes:</strong> {{ prediction.notes }}
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="historyPages > 1" class="pagination">
      <button
        class="page-btn"
        :disabled="currentPage === 1"
        @click="goToPage(currentPage - 1)"
      >
        Previous
      </button>

      <div class="page-numbers">
        <button
          v-for="page in visiblePages"
          :key="page"
          class="page-number"
          :class="{ active: page === currentPage }"
          @click="goToPage(page)"
        >
          {{ page }}
        </button>
      </div>

      <button
        class="page-btn"
        :disabled="currentPage === historyPages"
        @click="goToPage(currentPage + 1)"
      >
        Next
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePredictionStore } from '@/stores/predictionStore';
import OutcomeBadge from './shared/OutcomeBadge.vue';
import ConfidenceBar from './shared/ConfidenceBar.vue';
import type { Prediction } from '@/services/predictionDashboardService';

type OutcomeStatus = 'correct' | 'incorrect' | 'pending' | 'expired';

const store = usePredictionStore();

const localFilters = ref({
  targetId: null as string | null,
  outcome: null as 'pending' | 'correct' | 'incorrect' | null,
  status: 'all' as 'all' | 'active' | 'resolved' | 'expired' | 'cancelled',
  startDate: null as string | null,
  endDate: null as string | null,
});

const currentPage = ref(1);

const targets = computed(() => store.targets);
const isLoading = computed(() => store.isLoading);

// Filter predictions based on local filters including date range
const filteredHistory = computed(() => {
  let result = store.filteredPredictions;

  // Apply date filters locally
  if (localFilters.value.startDate) {
    const startDate = new Date(localFilters.value.startDate);
    result = result.filter(p => new Date(p.generatedAt) >= startDate);
  }

  if (localFilters.value.endDate) {
    const endDate = new Date(localFilters.value.endDate);
    endDate.setHours(23, 59, 59, 999); // Include full day
    result = result.filter(p => new Date(p.generatedAt) <= endDate);
  }

  // Sort by date descending (most recent first)
  return [...result].sort((a, b) =>
    new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
});

const historyTotal = computed(() => filteredHistory.value.length);

// Calculate accuracy stats
const correctPredictions = computed(() =>
  filteredHistory.value.filter(p => {
    if (p.outcomeValue === null || p.outcomeValue === undefined) return false;
    const actualDirection = p.outcomeValue > 0 ? 'up' : p.outcomeValue < 0 ? 'down' : 'flat';
    return p.direction === actualDirection;
  })
);

const incorrectPredictions = computed(() =>
  filteredHistory.value.filter(p => {
    if (p.outcomeValue === null || p.outcomeValue === undefined) return false;
    const actualDirection = p.outcomeValue > 0 ? 'up' : p.outcomeValue < 0 ? 'down' : 'flat';
    return p.direction !== actualDirection;
  })
);

const correctCount = computed(() => correctPredictions.value.length);
const incorrectCount = computed(() => incorrectPredictions.value.length);

const accuracyRate = computed(() => {
  const resolved = correctCount.value + incorrectCount.value;
  if (resolved === 0) return 0;
  return (correctCount.value / resolved) * 100;
});

const pageSize = 10;

const historyPages = computed(() => Math.ceil(historyTotal.value / pageSize));

const paginatedHistory = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  const end = start + pageSize;
  return filteredHistory.value.slice(start, end);
});

const visiblePages = computed(() => {
  const total = historyPages.value;
  const current = currentPage.value;
  const pages: number[] = [];

  if (total <= 7) {
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push(-1); // ellipsis
      pages.push(total);
    } else if (current >= total - 3) {
      pages.push(1);
      pages.push(-1);
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push(-1);
      for (let i = current - 1; i <= current + 1; i++) pages.push(i);
      pages.push(-1);
      pages.push(total);
    }
  }

  return pages;
});

watch(localFilters, () => {
  currentPage.value = 1;
}, { deep: true });

function applyFilters() {
  store.setFilters({
    targetId: localFilters.value.targetId,
    status: localFilters.value.status,
    outcome: localFilters.value.outcome,
  });
}

function clearFilters() {
  localFilters.value = {
    targetId: null,
    outcome: null,
    status: 'all',
    startDate: null,
    endDate: null,
  };
  store.clearFilters();
}

function goToPage(page: number) {
  if (page < 1 || page > historyPages.value) return;
  currentPage.value = page;
}

function getTargetSymbol(targetId: string): string {
  const target = targets.value.find(t => t.id === targetId);
  return target?.symbol || 'Unknown';
}

function getOutcomeStatus(prediction: Prediction): OutcomeStatus | null {
  // Check if expired
  if (prediction.status === 'expired') return 'expired';

  // If no outcome value, it's pending
  if (prediction.outcomeValue === null || prediction.outcomeValue === undefined) {
    return prediction.status === 'active' ? 'pending' : null;
  }

  // Determine correctness
  const actualDirection = prediction.outcomeValue > 0 ? 'up' : prediction.outcomeValue < 0 ? 'down' : 'flat';
  return prediction.direction === actualDirection ? 'correct' : 'incorrect';
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function getDirectionClass(direction: string): string {
  const d = direction.toLowerCase();
  if (d === 'up') return 'action-buy';
  if (d === 'down') return 'action-sell';
  return 'action-hold';
}
</script>

<style scoped>
.history-component {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e5e7eb;
}

.history-header h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.history-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.stat {
  color: #6b7280;
}

.stat.success {
  color: #10b981;
}

.stat.danger {
  color: #ef4444;
}

.filters-section {
  padding: 1rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.filter-select,
.filter-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background-color: white;
}

.filter-select {
  min-width: 150px;
}

.filter-input {
  min-width: 140px;
}

.filter-btn,
.clear-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.filter-btn {
  background-color: #15803d;
  color: white;
}

.filter-btn:hover {
  background-color: #166534;
}

.clear-btn {
  background-color: #e5e7eb;
  color: #374151;
}

.clear-btn:hover {
  background-color: #d1d5db;
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #6b7280;
}

.spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 3px solid #e5e7eb;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.history-item {
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1.25rem;
}

.history-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.item-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.instrument {
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
}

.action-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
}

.action-buy {
  background-color: #d1fae5;
  color: #065f46;
}

.action-sell {
  background-color: #fee2e2;
  color: #991b1b;
}

.action-hold {
  background-color: #fef3c7;
  color: #92400e;
}

.item-date {
  font-size: 0.875rem;
  color: #6b7280;
}

.history-item-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.item-rationale {
  color: #374151;
  line-height: 1.6;
}

.item-details {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.75rem;
  background-color: #f9fafb;
  border-radius: 0.375rem;
}

.detail {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.detail-label {
  font-size: 0.875rem;
  color: #6b7280;
  font-weight: 500;
}

.detail-value {
  font-size: 0.875rem;
  color: #111827;
  font-weight: 600;
}

.detail-value.positive {
  color: #10b981;
}

.detail-value.negative {
  color: #ef4444;
}

.item-notes {
  padding: 0.75rem;
  background-color: #fffbeb;
  border-left: 3px solid #f59e0b;
  font-size: 0.875rem;
  color: #78350f;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.page-btn,
.page-number {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  background-color: white;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.page-btn:hover:not(:disabled),
.page-number:hover {
  background-color: #f3f4f6;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-number.active {
  background-color: #15803d;
  color: white;
  border-color: #15803d;
}

.page-numbers {
  display: flex;
  gap: 0.25rem;
}
</style>
