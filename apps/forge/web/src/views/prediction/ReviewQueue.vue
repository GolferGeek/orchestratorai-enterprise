<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="review-queue">
    <header class="management-header">
      <div class="header-left">
        <button class="back-button" @click="goBackToDashboard">
          <span class="back-icon">&larr;</span>
          Back to Dashboard
        </button>
        <h1>Review Queue</h1>
      </div>
    </header>

    <!-- Stats Banner -->
    <div class="stats-banner">
      <div class="stat-item">
        <span class="stat-value">{{ reviewStats.total }}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-item pending">
        <span class="stat-value">{{ reviewStats.pending }}</span>
        <span class="stat-label">Pending</span>
      </div>
      <div class="stat-item approved">
        <span class="stat-value">{{ reviewStats.approved }}</span>
        <span class="stat-label">Approved</span>
      </div>
      <div class="stat-item rejected">
        <span class="stat-value">{{ reviewStats.rejected }}</span>
        <span class="stat-label">Rejected</span>
      </div>
      <div class="stat-item modified">
        <span class="stat-value">{{ reviewStats.modified }}</span>
        <span class="stat-label">Modified</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ reviewStats.approvalRate.toFixed(1) }}%</span>
        <span class="stat-label">Approval Rate</span>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tabs">
      <button
        class="filter-tab"
        :class="{ active: selectedStatus === null }"
        @click="selectedStatus = null"
      >
        All
      </button>
      <button
        v-for="status in statuses"
        :key="status"
        class="filter-tab"
        :class="{ active: selectedStatus === status }"
        @click="selectedStatus = status"
      >
        {{ status }}
      </button>
    </div>

    <!-- Disposition Filter -->
    <div class="disposition-filters">
      <button
        class="disposition-btn"
        :class="{ active: selectedDisposition === null }"
        @click="selectedDisposition = null"
      >
        All Dispositions
      </button>
      <button
        v-for="disposition in dispositions"
        :key="disposition"
        class="disposition-btn"
        :class="{ active: selectedDisposition === disposition, [disposition]: true }"
        @click="selectedDisposition = disposition"
      >
        {{ disposition }}
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading review queue...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadReviewQueue">Try Again</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="displayedItems.length === 0" class="empty-state">
      <span class="empty-icon">&#128279;</span>
      <h3>No Items Found</h3>
      <p>{{ getEmptyMessage() }}</p>
    </div>

    <!-- Review Queue Grid -->
    <div v-else class="queue-grid">
      <ReviewQueueCard
        v-for="item in displayedItems"
        :key="item.id"
        :item="item"
        @select="onItemSelect"
        @review="openReviewModal"
      />
    </div>

    <!-- Review Modal -->
    <div v-if="showReviewModal" class="modal-overlay" @click.self="closeReviewModal">
      <div class="modal-content">
        <header class="modal-header">
          <h2>Review Signal</h2>
          <button class="close-btn" @click="closeReviewModal">&times;</button>
        </header>

        <div v-if="reviewingItem" class="modal-body">
          <!-- Target Info -->
          <div class="target-info">
            <h3>{{ reviewingItem.targetName }} ({{ reviewingItem.targetSymbol }})</h3>
            <p class="signal-content">{{ reviewingItem.signalContent }}</p>
          </div>

          <!-- AI Analysis -->
          <div class="ai-analysis">
            <h4>AI Analysis</h4>
            <div class="analysis-grid">
              <div class="analysis-item">
                <span class="label">Disposition:</span>
                <span
                  class="value disposition-badge"
                  :class="reviewingItem.aiDisposition"
                >
                  {{ reviewingItem.aiDisposition }}
                </span>
              </div>
              <div class="analysis-item">
                <span class="label">Strength:</span>
                <span class="value">{{ reviewingItem.aiStrength }}%</span>
              </div>
              <div class="analysis-item">
                <span class="label">Confidence:</span>
                <span class="value">{{ reviewingItem.aiConfidence }}%</span>
              </div>
            </div>
            <div class="reasoning">
              <span class="label">Reasoning:</span>
              <p>{{ reviewingItem.aiReasoning }}</p>
            </div>
          </div>

          <!-- Source Info -->
          <div class="source-info">
            <span class="label">Source:</span>
            <span class="value">{{ reviewingItem.sourceName }} ({{ reviewingItem.sourceType }})</span>
          </div>

          <!-- Review Form -->
          <form @submit.prevent="submitReview" class="review-form">
            <div class="decision-buttons">
              <button
                type="button"
                class="decision-btn approve"
                :class="{ active: reviewDecision === 'approve' }"
                @click="reviewDecision = 'approve'"
              >
                &#10003; Approve
              </button>
              <button
                type="button"
                class="decision-btn modify"
                :class="{ active: reviewDecision === 'modify' }"
                @click="reviewDecision = 'modify'"
              >
                &#9998; Modify
              </button>
              <button
                type="button"
                class="decision-btn reject"
                :class="{ active: reviewDecision === 'reject' }"
                @click="reviewDecision = 'reject'"
              >
                &#10005; Reject
              </button>
            </div>

            <!-- Modify Options (shown when modify is selected) -->
            <div v-if="reviewDecision === 'modify'" class="modify-options">
              <div class="form-group">
                <label for="modifiedDisposition">Modified Disposition</label>
                <select id="modifiedDisposition" v-model="modifiedDisposition">
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>

              <div class="form-group">
                <label for="modifiedStrength">Modified Strength (%)</label>
                <input
                  id="modifiedStrength"
                  v-model.number="modifiedStrength"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                />
              </div>
            </div>

            <!-- Reviewer Notes -->
            <div class="form-group">
              <label for="reviewerNotes">Reviewer Notes</label>
              <textarea
                id="reviewerNotes"
                v-model="reviewerNotes"
                rows="3"
                placeholder="Optional notes about your decision"
              ></textarea>
            </div>

            <!-- Learning Note -->
            <div class="form-group">
              <label for="learningNote">Learning Note (Optional)</label>
              <textarea
                id="learningNote"
                v-model="learningNote"
                rows="2"
                placeholder="What should the system learn from this?"
              ></textarea>
            </div>

            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="closeReviewModal">
                Cancel
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                :disabled="!reviewDecision || isSubmitting"
              >
                {{ isSubmitting ? 'Submitting...' : 'Submit Review' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import { useReviewQueueStore } from '@/stores/reviewQueueStore';
import {
  predictionDashboardService,
  type ReviewQueueRespondParams,
} from '@/services/predictionDashboardService';
import ReviewQueueCard from '@/components/prediction/ReviewQueueCard.vue';
import type { ReviewQueueItem, ReviewStatus, SignalDisposition } from '@/stores/reviewQueueStore';

const router = useRouter();
const route = useRoute();
const store = useReviewQueueStore();

const isLoading = ref(false);
const error = ref<string | null>(null);
const selectedStatus = ref<ReviewStatus | null>(null);
const selectedDisposition = ref<SignalDisposition | null>(null);
const showReviewModal = ref(false);
const reviewingItem = ref<ReviewQueueItem | null>(null);
const isSubmitting = ref(false);

// Review form state
const reviewDecision = ref<'approve' | 'reject' | 'modify' | null>(null);
const modifiedDisposition = ref<SignalDisposition>('bullish');
const modifiedStrength = ref<number>(0);
const reviewerNotes = ref('');
const learningNote = ref('');

const statuses: ReviewStatus[] = ['pending', 'approved', 'rejected', 'modified'];
const dispositions: SignalDisposition[] = ['bullish', 'bearish', 'neutral'];

const reviewStats = computed(() => store.reviewStats);

const displayedItems = computed(() => {
  let items = store.items;

  // Filter by status
  if (selectedStatus.value) {
    items = items.filter((i) => i.status === selectedStatus.value);
  }

  // Filter by disposition
  if (selectedDisposition.value) {
    items = items.filter((i) => i.aiDisposition === selectedDisposition.value);
  }

  return items;
});

function getEmptyMessage(): string {
  if (selectedStatus.value && selectedDisposition.value) {
    return `No ${selectedStatus.value} items with ${selectedDisposition.value} disposition`;
  }
  if (selectedStatus.value) {
    return `No ${selectedStatus.value} items in the review queue`;
  }
  if (selectedDisposition.value) {
    return `No items with ${selectedDisposition.value} disposition`;
  }
  return 'The review queue is empty';
}

async function loadReviewQueue() {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await predictionDashboardService.listReviewQueue();
    if (response.content) {
      // Map service ReviewQueueItem to store ReviewQueueItem
      const mappedItems: ReviewQueueItem[] = response.content.map((item) => ({
        id: item.id,
        targetId: item.targetId,
        targetName: item.targetName,
        targetSymbol: item.targetSymbol,
        signalId: item.signalId,
        signalContent: item.signalContent,
        sourceName: item.sourceName,
        sourceType: item.sourceType,
        receivedAt: item.receivedAt,
        aiDisposition: item.aiDisposition,
        aiStrength: item.aiStrength,
        aiReasoning: item.aiReasoning,
        aiConfidence: item.aiConfidence,
        status: item.status,
        reviewedBy: item.reviewedBy ?? null,
        reviewedAt: item.reviewedAt ?? null,
        reviewNotes: item.reviewerNotes ?? null,
        finalDisposition: item.modifiedDisposition ?? null,
        finalStrength: item.modifiedStrength ?? null,
        createdAt: item.createdAt,
      }));
      store.setItems(mappedItems);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load review queue';
  } finally {
    isLoading.value = false;
  }
}

function onItemSelect(id: string) {
  store.selectItem(id);
}

function openReviewModal(item: ReviewQueueItem) {
  reviewingItem.value = item;
  reviewDecision.value = null;
  modifiedDisposition.value = item.aiDisposition;
  modifiedStrength.value = item.aiStrength;
  reviewerNotes.value = '';
  learningNote.value = '';
  showReviewModal.value = true;
}

function closeReviewModal() {
  showReviewModal.value = false;
  reviewingItem.value = null;
  reviewDecision.value = null;
  modifiedDisposition.value = 'bullish';
  modifiedStrength.value = 0;
  reviewerNotes.value = '';
  learningNote.value = '';
}

async function submitReview() {
  if (!reviewingItem.value || !reviewDecision.value) return;

  isSubmitting.value = true;

  try {
    const params: ReviewQueueRespondParams = {
      id: reviewingItem.value.id,
      decision: reviewDecision.value,
      learningNote: learningNote.value || undefined,
    };

    if (reviewDecision.value === 'modify') {
      params.modifiedDirection = modifiedDisposition.value;
      params.modifiedStrength = modifiedStrength.value;
    }

    await predictionDashboardService.respondToReviewQueue(params);

    // Update local store
    const status: ReviewStatus = reviewDecision.value === 'approve' ? 'approved' : reviewDecision.value === 'reject' ? 'rejected' : 'modified';
    store.updateItem(reviewingItem.value.id, {
      status,
      reviewedAt: new Date().toISOString(),
      reviewNotes: reviewerNotes.value || null,
      finalDisposition: reviewDecision.value === 'modify' ? modifiedDisposition.value : reviewingItem.value.aiDisposition,
      finalStrength: reviewDecision.value === 'modify' ? modifiedStrength.value : reviewingItem.value.aiStrength,
    });

    closeReviewModal();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to submit review';
  } finally {
    isSubmitting.value = false;
  }
}

function goBackToDashboard() {
  const agentSlug = route.query.agentSlug as string;
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug ? { agentSlug } : undefined,
  });
}

onMounted(() => {
  loadReviewQueue();
});
</script>

<style scoped>
.review-queue {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.management-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.header-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  background: none;
  border: none;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: color 0.2s;
}

.back-button:hover {
  color: var(--ion-color-secondary, #15803d);
}

.back-icon {
  font-size: 1rem;
}

.management-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
}

/* Stats Banner */
.stats-banner {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  flex: 1;
}

.stat-item.pending {
  background: rgba(251, 191, 36, 0.1);
}

.stat-item.approved {
  background: rgba(34, 197, 94, 0.1);
}

.stat-item.rejected {
  background: rgba(239, 68, 68, 0.1);
}

.stat-item.modified {
  background: rgba(21, 128, 61, 0.1);
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  font-weight: 500;
}

/* Filter Tabs */
.filter-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  padding-bottom: 0.5rem;
}

.filter-tab {
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  text-transform: capitalize;
  transition: all 0.2s;
}

.filter-tab:hover {
  color: var(--text-primary, #111827);
  background: var(--hover-bg, #f3f4f6);
}

.filter-tab.active {
  color: var(--ion-color-secondary, #15803d);
  background: rgba(21, 128, 61, 0.1);
}

/* Disposition Filters */
.disposition-filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.disposition-btn {
  padding: 0.375rem 0.75rem;
  background: var(--btn-secondary-bg, #f3f4f6);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  text-transform: capitalize;
  transition: all 0.2s;
}

.disposition-btn:hover {
  background: var(--btn-secondary-hover, #e5e7eb);
}

.disposition-btn.active {
  border-color: var(--ion-color-secondary, #15803d);
  font-weight: 600;
}

.disposition-btn.bullish.active {
  background: rgba(34, 197, 94, 0.1);
  border-color: #22c55e;
  color: #15803d;
}

.disposition-btn.bearish.active {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #b91c1c;
}

.disposition-btn.neutral.active {
  background: rgba(107, 114, 128, 0.1);
  border-color: #6b7280;
  color: #374151;
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

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: var(--btn-secondary-bg, #f3f4f6);
  color: var(--btn-secondary-text, #374151);
}

.btn-secondary:hover {
  background-color: var(--btn-secondary-hover, #e5e7eb);
}

/* States */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  gap: 1rem;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: var(--ion-color-secondary, #15803d);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-radius: 50%;
  font-weight: bold;
}

.empty-icon {
  font-size: 3rem;
}

.empty-state h3 {
  margin: 0;
  color: var(--text-primary, #111827);
}

.empty-state p {
  margin: 0;
  text-align: center;
}

/* Queue Grid */
.queue-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1rem;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--card-bg, #ffffff);
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #111827);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary, #111827);
}

.modal-body {
  padding: 1.5rem;
}

/* Target Info */
.target-info {
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.target-info h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.signal-content {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  line-height: 1.5;
}

/* AI Analysis */
.ai-analysis {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--analysis-bg, #f9fafb);
  border-radius: 8px;
}

.ai-analysis h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  text-transform: uppercase;
}

.analysis-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.analysis-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.analysis-item .label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
}

.analysis-item .value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.disposition-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  width: fit-content;
}

.disposition-badge.bullish {
  background: rgba(34, 197, 94, 0.1);
  color: #15803d;
}

.disposition-badge.bearish {
  background: rgba(239, 68, 68, 0.1);
  color: #b91c1c;
}

.disposition-badge.neutral {
  background: rgba(107, 114, 128, 0.1);
  color: #374151;
}

.reasoning {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.reasoning .label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
}

.reasoning p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  line-height: 1.5;
}

/* Source Info */
.source-info {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}

.source-info .label {
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
}

.source-info .value {
  color: var(--text-primary, #111827);
}

/* Review Form */
.review-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.decision-buttons {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.decision-btn {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 2px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--card-bg, #ffffff);
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.decision-btn:hover {
  border-color: var(--text-secondary, #6b7280);
}

.decision-btn.active {
  font-weight: 700;
}

.decision-btn.approve.active {
  background: rgba(34, 197, 94, 0.1);
  border-color: #22c55e;
  color: #15803d;
}

.decision-btn.modify.active {
  background: rgba(21, 128, 61, 0.1);
  border-color: #15803d;
  color: #1e40af;
}

.decision-btn.reject.active {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #b91c1c;
}

.modify-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: var(--analysis-bg, #f9fafb);
  border-radius: 8px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  background: var(--input-bg, #ffffff);
  color: var(--text-primary, #111827);
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

.form-group textarea {
  resize: vertical;
  min-height: 60px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

/* Dark mode */
html.ion-palette-dark .review-queue,
html[data-theme="dark"] .review-queue {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --input-bg: #374151;
    --hover-bg: #374151;
    --btn-secondary-bg: #374151;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #4b5563;
    --analysis-bg: #111827;
  }
</style>
