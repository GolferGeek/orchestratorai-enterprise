<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="learning-queue">
    <header class="management-header">
      <div class="header-left">
        <button class="back-button" @click="goBackToDashboard">
          <span class="back-icon">&larr;</span>
          Back to Dashboard
        </button>
        <div class="header-title-row">
          <h1>Learning Queue</h1>
          <span v-if="pendingCount > 0" class="pending-count">
            {{ pendingCount }} pending review
          </span>
          <span v-if="unacknowledgedActivityCount > 0" class="activity-count">
            {{ unacknowledgedActivityCount }} agent updates
          </span>
        </div>
      </div>
    </header>

    <!-- Main View Tabs (Learning Queue vs Agent Activity) -->
    <div class="main-tabs">
      <button
        class="main-tab"
        :class="{ active: activeView === 'queue' }"
        @click="activeView = 'queue'"
      >
        Learning Queue
        <span v-if="pendingCount > 0" class="tab-badge">{{ pendingCount }}</span>
      </button>
      <button
        class="main-tab"
        :class="{ active: activeView === 'activity' }"
        @click="activeView = 'activity'"
      >
        Agent Activity
        <span v-if="unacknowledgedActivityCount > 0" class="tab-badge activity">{{ unacknowledgedActivityCount }}</span>
      </button>
    </div>

    <!-- Learning Queue View -->
    <div v-show="activeView === 'queue'">
      <!-- Status Filter Tabs -->
      <div class="status-tabs">
        <button
          class="status-tab"
          :class="{ active: selectedStatus === null }"
          @click="selectedStatus = null"
        >
          All
        </button>
        <button
          v-for="status in statuses"
          :key="status"
          class="status-tab"
          :class="{ active: selectedStatus === status }"
          @click="selectedStatus = status as 'pending' | 'approved' | 'rejected' | 'modified'"
        >
          {{ status }}
        </button>
      </div>

      <!-- Portfolio/Target Filters -->
      <div v-if="universes.length > 0" class="filters">
        <div class="filter-group">
          <label for="universe-filter">Portfolio</label>
          <select id="universe-filter" v-model="selectedUniverseId">
            <option :value="null">All portfolios</option>
            <option v-for="universe in universes" :key="universe.id" :value="universe.id">
              {{ universe.name }}
            </option>
          </select>
        </div>
        <div class="filter-group">
          <label for="target-filter">Target</label>
          <select id="target-filter" v-model="selectedTargetId" :disabled="!selectedUniverseId">
            <option :value="null">All targets</option>
            <option v-for="target in filteredTargets" :key="target.id" :value="target.id">
              {{ target.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <span>Loading learning queue...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <span class="error-icon">!</span>
        <span>{{ error }}</span>
        <button class="btn btn-secondary" @click="loadQueue">Try Again</button>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredQueueItems.length === 0" class="empty-state">
        <span class="empty-icon">&#128240;</span>
        <h3>No Queue Items</h3>
        <p>{{ getEmptyStateMessage() }}</p>
      </div>

      <!-- Queue Grid -->
      <div v-else class="queue-grid">
        <LearningQueueCard
          v-for="item in filteredQueueItems"
          :key="item.id"
          :queue-item="item"
          :is-selected="item.id === selectedQueueItemId"
          @select="onQueueItemSelect"
        />
      </div>
    </div>

    <!-- Agent Activity View -->
    <div v-show="activeView === 'activity'" class="agent-activity-view">
      <!-- Loading State -->
      <div v-if="isLoadingActivity" class="loading-state">
        <div class="spinner"></div>
        <span>Loading agent activity...</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="agentActivity.length === 0" class="empty-state">
        <span class="empty-icon">&#129302;</span>
        <h3>No Agent Activity</h3>
        <p>Agent self-modifications will appear here when analysts adapt their own context.</p>
      </div>

      <!-- Activity List -->
      <div v-else class="activity-list">
        <div class="activity-actions">
          <button
            v-if="unacknowledgedActivityCount > 0"
            class="btn btn-secondary"
            @click="acknowledgeAllActivity"
          >
            Acknowledge All ({{ unacknowledgedActivityCount }})
          </button>
        </div>

        <div
          v-for="activity in agentActivity"
          :key="activity.id"
          class="activity-card"
          :class="{ unacknowledged: !activity.acknowledged }"
        >
          <div class="activity-header">
            <div class="activity-analyst">
              <span class="analyst-name">{{ activity.analystName || activity.analystId }}</span>
              <span class="modification-type-badge" :class="activity.modificationType">
                {{ formatModificationType(activity.modificationType) }}
              </span>
            </div>
            <span class="activity-time">{{ formatTimestamp(activity.createdAt) }}</span>
          </div>

          <div class="activity-summary">{{ activity.summary }}</div>

          <div class="activity-reason">
            <strong>Trigger:</strong> {{ activity.triggerReason }}
          </div>

          <div v-if="activity.performanceContext" class="activity-performance">
            <strong>Performance Context:</strong>
            <span v-if="activity.performanceContext.currentBalance !== undefined">
              Balance: ${{ Number(activity.performanceContext.currentBalance).toLocaleString() }}
            </span>
            <span v-if="activity.performanceContext.winRate !== undefined">
              Win Rate: {{ (Number(activity.performanceContext.winRate) * 100).toFixed(1) }}%
            </span>
          </div>

          <div class="activity-actions-row">
            <button
              v-if="!activity.acknowledged"
              class="btn btn-small btn-secondary"
              @click="acknowledgeActivity(activity.id)"
            >
              Acknowledge
            </button>
            <span v-else class="acknowledged-label">
              Acknowledged {{ formatTimestamp(activity.acknowledgedAt) }}
            </span>
          </div>
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
import { useLearningStore } from '@/stores/learningStore';
import { usePredictionStore } from '@/stores/predictionStore';
import {
  predictionDashboardService,
  type LearningQueueItem,
} from '@/services/predictionDashboardService';
import LearningQueueCard from '@/components/prediction/LearningQueueCard.vue';

const router = useRouter();
const route = useRoute();
const learningStore = useLearningStore();
const predictionStore = usePredictionStore();

function goBackToDashboard() {
  const agentSlug = route.query.agentSlug as string;
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug ? { agentSlug } : undefined,
  });
}

// Main view state
const activeView = ref<'queue' | 'activity'>('queue');

const isLoading = ref(false);
const error = ref<string | null>(null);
const selectedStatus = ref<'pending' | 'approved' | 'rejected' | 'modified' | null>(null);
const selectedUniverseId = ref<string | null>(null);
const selectedTargetId = ref<string | null>(null);
const selectedQueueItemId = ref<string | null>(null);

// Agent Activity state
const isLoadingActivity = ref(false);

const statuses = ['pending', 'approved', 'rejected', 'modified'] as const;

const universes = computed(() => predictionStore.universes);
const targets = computed(() => predictionStore.targets);

const filteredTargets = computed(() => {
  if (!selectedUniverseId.value) {
    return [];
  }
  return targets.value.filter((t) => t.universeId === selectedUniverseId.value);
});

const filteredQueueItems = computed((): LearningQueueItem[] => {
  let items = learningStore.learningQueue as unknown as LearningQueueItem[];

  // Filter by status
  if (selectedStatus.value) {
    items = items.filter((item) => item.status === selectedStatus.value);
  }

  // Filter by universe
  if (selectedUniverseId.value) {
    items = items.filter((item) => item.suggestedUniverseId === selectedUniverseId.value);
  }

  // Filter by target
  if (selectedTargetId.value) {
    items = items.filter((item) => item.suggestedTargetId === selectedTargetId.value);
  }

  return items;
});

const pendingCount = computed(() => {
  return learningStore.learningQueue.filter((item) => item.status === 'pending').length;
});

// Agent Activity computed properties
const agentActivity = computed(() => learningStore.agentActivity);
const unacknowledgedActivityCount = computed(() => learningStore.unacknowledgedActivityCount);

async function loadQueue() {
  isLoading.value = true;
  error.value = null;

  try {
    // Load universes and targets for filters
    const dashboardData = await predictionDashboardService.loadDashboardData();
    predictionStore.setUniverses(dashboardData.universes);

    const targetsRes = await predictionDashboardService.listTargets();
    if (targetsRes.content) {
      predictionStore.setTargets(targetsRes.content);
    }

    // Load learning queue
    // Note: API only filters by 'pending' | 'approved' | 'rejected'; 'modified' is filtered client-side
    const apiStatus = selectedStatus.value === 'modified' ? undefined : (selectedStatus.value || undefined);
    const queueRes = await predictionDashboardService.listLearningQueue({
      status: apiStatus,
      universeId: selectedUniverseId.value || undefined,
    });

    if (queueRes.content) {
      learningStore.setLearningQueue(queueRes.content as unknown as import('@/stores/learningStore').LearningQueueItem[]);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load learning queue';
  } finally {
    isLoading.value = false;
  }
}

function onQueueItemSelect(id: string) {
  selectedQueueItemId.value = id;
}

function formatLearningType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function getEmptyStateMessage(): string {
  if (selectedStatus.value) {
    return `No ${selectedStatus.value} items in the learning queue`;
  }
  if (selectedUniverseId.value) {
    return 'No learning queue items for the selected universe';
  }
  return 'The learning queue is empty. AI will suggest learnings based on evaluations and missed opportunities.';
}

// Agent Activity functions
async function loadAgentActivity() {
  isLoadingActivity.value = true;
  try {
    const response = await predictionDashboardService.listAgentActivity();
    if (response.content) {
      learningStore.setAgentActivity(response.content);
    }
  } catch (err) {
    console.error('Failed to load agent activity:', err);
  } finally {
    isLoadingActivity.value = false;
  }
}

async function acknowledgeActivity(activityId: string) {
  try {
    await predictionDashboardService.acknowledgeAgentActivity(activityId);
    learningStore.acknowledgeAgentActivity(activityId);
  } catch (err) {
    console.error('Failed to acknowledge activity:', err);
  }
}

async function acknowledgeAllActivity() {
  try {
    await predictionDashboardService.acknowledgeAllAgentActivity();
    learningStore.acknowledgeAllAgentActivity();
  } catch (err) {
    console.error('Failed to acknowledge all activity:', err);
  }
}

function formatModificationType(type: string): string {
  const typeMap: Record<string, string> = {
    rule_added: 'Rule Added',
    rule_removed: 'Rule Removed',
    weight_changed: 'Weight Changed',
    journal_entry: 'Journal Entry',
    status_change: 'Status Change',
  };
  return typeMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

onMounted(() => {
  loadQueue();
  loadAgentActivity();
});
</script>

<style scoped>
.learning-queue {
  padding: 1.5rem;
  padding-top: calc(env(safe-area-inset-top, 0px) + 3.5rem);
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
  gap: 0.5rem;
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

.header-title-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.management-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
}

.pending-count {
  font-size: 0.875rem;
  font-weight: 600;
  color: #d97706;
  background: rgba(245, 158, 11, 0.1);
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
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

.btn-danger {
  background-color: #ef4444;
  color: white;
}

.btn-danger:hover {
  background-color: #dc2626;
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Status Tabs */
.status-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  padding-bottom: 0.5rem;
}

.status-tab {
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

.status-tab:hover {
  color: var(--text-primary, #111827);
  background: var(--hover-bg, #f3f4f6);
}

.status-tab.active {
  color: var(--ion-color-secondary, #15803d);
  background: rgba(21, 128, 61, 0.1);
}

/* Filters */
.filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--filter-bg, #f9fafb);
  border-radius: 8px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  flex: 1;
}

.filter-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  text-transform: uppercase;
}

.filter-group select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  background: var(--input-bg, #ffffff);
  color: var(--text-primary, #111827);
}

.filter-group select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  max-width: 400px;
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

/* Modal Body */
.modal-body {
  padding: 1.5rem;
}

.info-section {
  margin-bottom: 1.5rem;
}

.info-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 1rem 0;
  text-transform: uppercase;
}

.info-item {
  margin-bottom: 1rem;
}

.info-item label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 0.375rem;
  text-transform: uppercase;
}

.readonly-field {
  padding: 0.5rem 0.75rem;
  background: var(--readonly-bg, #f9fafb);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  line-height: 1.4;
}

.readonly-field.content,
.readonly-field.reasoning {
  white-space: pre-wrap;
  max-height: 150px;
  overflow-y: auto;
}

.readonly-field.badges {
  display: flex;
  gap: 0.5rem;
  background: none;
  padding: 0;
}

.confidence-display {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.confidence-percent {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  min-width: 50px;
}

.progress-track {
  flex: 1;
  height: 8px;
  background: var(--progress-bg, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-fill.high {
  background: linear-gradient(90deg, #10b981, #059669);
}

.progress-fill.medium {
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.progress-fill.low {
  background: linear-gradient(90deg, #ef4444, #dc2626);
}

.modification-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--modification-bg, #fffbeb);
  border-left: 3px solid #f59e0b;
  border-radius: 6px;
}

.modification-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 1rem 0;
  text-transform: uppercase;
}

/* Form */
.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
  margin-bottom: 0.375rem;
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
  min-height: 80px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

/* Badge Styles (for modal) */
.learning-type-badge,
.scope-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  width: fit-content;
}

.learning-type-badge.rule {
  background-color: rgba(21, 128, 61, 0.1);
  color: #166534;
}

.learning-type-badge.pattern {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.learning-type-badge.weight_adjustment {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.learning-type-badge.threshold {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.learning-type-badge.avoid {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.scope-badge.runner {
  background-color: rgba(107, 114, 128, 0.1);
  color: #4b5563;
}

.scope-badge.domain {
  background-color: rgba(21, 128, 61, 0.1);
  color: #166534;
}

.scope-badge.universe {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.scope-badge.target {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

/* Main Tabs */
.main-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--border-color, #e5e7eb);
}

.main-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s;
}

.main-tab:hover {
  color: var(--text-primary, #111827);
}

.main-tab.active {
  color: var(--ion-color-secondary, #15803d);
  border-bottom-color: var(--ion-color-secondary, #15803d);
}

.tab-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 10px;
  background: rgba(21, 128, 61, 0.1);
  color: #166534;
}

.tab-badge.activity {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.activity-count {
  font-size: 0.875rem;
  font-weight: 600;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
}

/* Agent Activity View */
.agent-activity-view {
  padding-top: 1rem;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.activity-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1rem;
}

.activity-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  transition: all 0.2s;
}

.activity-card.unacknowledged {
  border-left: 3px solid #f59e0b;
  background: rgba(245, 158, 11, 0.02);
}

.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.activity-analyst {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.analyst-name {
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.modification-type-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.modification-type-badge.rule_added {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.modification-type-badge.rule_removed {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.modification-type-badge.weight_changed {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.modification-type-badge.journal_entry {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.modification-type-badge.status_change {
  background-color: rgba(21, 128, 61, 0.1);
  color: #166534;
}

.activity-time {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.activity-summary {
  font-size: 0.9rem;
  color: var(--text-primary, #111827);
  margin-bottom: 0.75rem;
  line-height: 1.4;
}

.activity-reason {
  font-size: 0.8rem;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 0.5rem;
}

.activity-performance {
  font-size: 0.8rem;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 0.75rem;
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.activity-actions-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.btn-small {
  padding: 0.375rem 0.75rem;
  font-size: 0.8rem;
}

.acknowledged-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  font-style: italic;
}

/* Dark mode */
html.ion-palette-dark .learning-queue,
html[data-theme="dark"] .learning-queue {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --input-bg: #374151;
    --hover-bg: #374151;
    --filter-bg: #374151;
    --readonly-bg: #374151;
    --modification-bg: #422006;
    --btn-secondary-bg: #374151;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #4b5563;
    --progress-bg: #374151;
  }

html.ion-palette-dark .activity-card.unacknowledged,
html[data-theme="dark"] .activity-card.unacknowledged {
    background: rgba(245, 158, 11, 0.05);
  }
</style>
