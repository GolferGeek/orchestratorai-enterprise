<template>
  <div class="learning-component">
    <div class="learning-header">
      <h3>Learning Loop</h3>
      <div class="header-actions">
        <span v-if="pendingQueueCount > 0" class="pending-count">
          {{ pendingQueueCount }} pending reviews
        </span>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading learning data...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <span class="error-icon">&#9888;</span>
      <span>{{ error }}</span>
    </div>

    <div v-else class="learning-content">
      <!-- Learning Summary Stats -->
      <div class="stats-section">
        <div class="stat-card">
          <div class="stat-value">{{ learnings.length }}</div>
          <div class="stat-label">Total Learnings</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ activeLearningsCount }}</div>
          <div class="stat-label">Active</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ missedOpportunities.length }}</div>
          <div class="stat-label">Missed Opportunities</div>
        </div>
        <div class="stat-card unapplied">
          <div class="stat-value">{{ pendingQueueCount }}</div>
          <div class="stat-label">Pending Queue</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'learnings' }]"
          @click="activeTab = 'learnings'"
        >
          Learnings ({{ learnings.length }})
        </button>
        <button
          :class="['tab', { active: activeTab === 'queue' }]"
          @click="activeTab = 'queue'"
        >
          Review Queue ({{ learningQueue.length }})
        </button>
        <button
          :class="['tab', { active: activeTab === 'missed' }]"
          @click="activeTab = 'missed'"
        >
          Missed Opportunities ({{ missedOpportunities.length }})
        </button>
        <button
          :class="['tab', { active: activeTab === 'analysts' }]"
          @click="activeTab = 'analysts'"
        >
          Analysts ({{ analysts.length }})
        </button>
      </div>

      <!-- Learnings Tab -->
      <div v-if="activeTab === 'learnings'" class="tab-content">
        <div v-if="learnings.length === 0" class="empty-message">
          No learnings yet. Learnings are generated from prediction outcomes and user feedback.
        </div>
        <div v-else class="learnings-list">
          <div
            v-for="learning in learnings"
            :key="learning.id"
            :class="['learning-card', { inactive: learning.status !== 'active' }]"
          >
            <div class="learning-header-row">
              <span class="learning-title">{{ learning.title }}</span>
              <span :class="['learning-type', `type-${learning.learningType}`]">
                {{ learning.learningType.replace(/_/g, ' ') }}
              </span>
              <span v-if="learning.status !== 'active'" class="status-badge">
                {{ learning.status }}
              </span>
            </div>
            <div class="learning-content-text">{{ learning.content }}</div>
            <div class="learning-meta">
              <span class="scope">{{ learning.scopeLevel }}</span>
              <span v-if="learning.domain" class="domain">{{ learning.domain }}</span>
              <span class="source">{{ learning.sourceType.replace(/_/g, ' ') }}</span>
              <span class="date">{{ formatDate(learning.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Queue Tab -->
      <div v-if="activeTab === 'queue'" class="tab-content">
        <div v-if="learningQueue.length === 0" class="empty-message">
          No items in the learning queue. AI-suggested learnings will appear here for review.
        </div>
        <div v-else class="queue-list">
          <div
            v-for="item in learningQueue"
            :key="item.id"
            :class="['queue-card', `status-${item.status}`]"
          >
            <div class="queue-header">
              <span class="queue-title">{{ item.suggestedTitle }}</span>
              <span :class="['queue-status', `status-${item.status}`]">
                {{ item.status }}
              </span>
            </div>
            <div class="queue-content">{{ item.suggestedContent }}</div>
            <div class="queue-meta">
              <span class="confidence">Confidence: {{ (item.confidence * 100).toFixed(0) }}%</span>
              <span class="type">{{ item.suggestedLearningType.replace(/_/g, ' ') }}</span>
              <span class="scope">{{ item.suggestedScopeLevel }}</span>
            </div>
            <div v-if="item.reasoning" class="queue-reasoning">
              <strong>Reasoning:</strong> {{ item.reasoning }}
            </div>
          </div>
        </div>
      </div>

      <!-- Missed Opportunities Tab -->
      <div v-if="activeTab === 'missed'" class="tab-content">
        <div v-if="missedOpportunities.length === 0" class="empty-message">
          No missed opportunities detected yet.
        </div>
        <div v-else class="missed-list">
          <div
            v-for="mo in missedOpportunities"
            :key="mo.id"
            class="missed-card"
          >
            <div class="missed-header">
              <span class="missed-target">{{ mo.targetSymbol }} ({{ mo.targetName }})</span>
              <span :class="['missed-move', mo.direction === 'up' ? 'positive' : 'negative']">
                {{ mo.direction === 'up' ? '+' : '' }}{{ mo.movePercent.toFixed(2) }}%
              </span>
              <span :class="['missed-status', `status-${mo.analysisStatus}`]">
                {{ mo.analysisStatus }}
              </span>
            </div>
            <div class="missed-period">
              {{ formatDate(mo.moveStartAt) }} - {{ formatDate(mo.moveEndAt) }}
            </div>
            <div v-if="mo.discoveredDrivers?.length" class="missed-drivers">
              <strong>Drivers:</strong>
              <ul>
                <li v-for="(driver, idx) in mo.discoveredDrivers" :key="idx">{{ driver }}</li>
              </ul>
            </div>
            <div v-if="mo.sourceGaps?.length" class="missed-gaps">
              <strong>Source Gaps:</strong>
              <ul>
                <li v-for="(gap, idx) in mo.sourceGaps" :key="idx">{{ gap }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Analysts Tab -->
      <div v-if="activeTab === 'analysts'" class="tab-content">
        <div v-if="analysts.length === 0" class="empty-message">
          No analysts configured yet.
        </div>
        <div v-else class="analysts-list">
          <div
            v-for="analyst in analysts"
            :key="analyst.id"
            :class="['analyst-card', { inactive: !analyst.active }]"
          >
            <div class="analyst-header">
              <span class="analyst-name">{{ analyst.name }}</span>
              <span class="analyst-slug">{{ analyst.slug }}</span>
              <span v-if="!analyst.active" class="inactive-badge">Inactive</span>
            </div>
            <div class="analyst-perspective">{{ analyst.perspective }}</div>
            <div class="analyst-meta">
              <span class="scope">{{ analyst.scopeLevel }}</span>
              <span v-if="analyst.domain" class="domain">{{ analyst.domain }}</span>
              <span class="weight">Weight: {{ analyst.defaultWeight }}</span>
            </div>
            <div v-if="analyst.tierInstructions" class="analyst-tiers">
              <div v-if="analyst.tierInstructions.gold" class="tier-instruction">
                <span class="tier-name gold">Gold:</span>
                <span class="tier-text">{{ truncateText(analyst.tierInstructions.gold, 100) }}</span>
              </div>
              <div v-if="analyst.tierInstructions.silver" class="tier-instruction">
                <span class="tier-name silver">Silver:</span>
                <span class="tier-text">{{ truncateText(analyst.tierInstructions.silver, 100) }}</span>
              </div>
              <div v-if="analyst.tierInstructions.bronze" class="tier-instruction">
                <span class="tier-name bronze">Bronze:</span>
                <span class="tier-text">{{ truncateText(analyst.tierInstructions.bronze, 100) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  predictionDashboardService,
  type PredictionLearning,
  type LearningQueueItem,
  type MissedOpportunity,
  type PredictionAnalyst,
} from '@/services/predictionDashboardService';

const activeTab = ref<'learnings' | 'queue' | 'missed' | 'analysts'>('learnings');
const isLoading = ref(false);
const error = ref<string | null>(null);

const learnings = ref<PredictionLearning[]>([]);
const learningQueue = ref<LearningQueueItem[]>([]);
const missedOpportunities = ref<MissedOpportunity[]>([]);
const analysts = ref<PredictionAnalyst[]>([]);

const activeLearningsCount = computed(() =>
  learnings.value.filter((l) => l.status === 'active').length
);

const pendingQueueCount = computed(() =>
  learningQueue.value.filter((q) => q.status === 'pending').length
);

onMounted(async () => {
  await loadLearningData();
});

async function loadLearningData() {
  isLoading.value = true;
  error.value = null;

  try {
    const [learningsRes, queueRes, missedRes, analystsRes] = await Promise.all([
      predictionDashboardService.listLearnings(),
      predictionDashboardService.listLearningQueue(),
      predictionDashboardService.listMissedOpportunities(),
      predictionDashboardService.listAnalysts(),
    ]);

    learnings.value = learningsRes.content || [];
    learningQueue.value = queueRes.content || [];
    missedOpportunities.value = missedRes.content || [];
    analysts.value = analystsRes.content || [];
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load learning data';
  } finally {
    isLoading.value = false;
  }
}


function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
</script>

<style scoped>
.learning-component {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.learning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e5e7eb;
}

.learning-header h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.pending-count {
  padding: 0.25rem 0.75rem;
  background-color: #fef3c7;
  color: #92400e;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
}

.loading-state,
.error-state,
.empty-message {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
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

.error-state {
  background-color: #fef2f2;
  color: #991b1b;
}

.stats-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.stat-card {
  padding: 1rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
  text-align: center;
}

.stat-card.unapplied {
  background-color: #fef3c7;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.stat-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 2px solid #e5e7eb;
  overflow-x: auto;
}

.tab {
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
}

.tab.active {
  color: #15803d;
  border-bottom-color: #15803d;
}

.tab:hover:not(.active) {
  color: #374151;
}

.tab-content {
  min-height: 300px;
}

.learnings-list,
.queue-list,
.missed-list,
.analysts-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.learning-card,
.queue-card,
.missed-card,
.analyst-card {
  padding: 1rem;
  background-color: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}

.learning-card.inactive,
.analyst-card.inactive {
  opacity: 0.7;
  background-color: #f9fafb;
}

.learning-header-row,
.queue-header,
.missed-header,
.analyst-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.learning-title,
.queue-title,
.missed-target,
.analyst-name {
  font-weight: 600;
  color: #111827;
}

.analyst-slug {
  font-size: 0.75rem;
  color: #6b7280;
  font-family: monospace;
}

.learning-type {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
}

.type-rule { background-color: #dcfce7; color: #166534; }
.type-pattern { background-color: #dcfce7; color: #166534; }
.type-weight_adjustment { background-color: #fef3c7; color: #92400e; }
.type-threshold { background-color: #fce7f3; color: #9d174d; }
.type-avoid { background-color: #fee2e2; color: #991b1b; }

.status-badge,
.inactive-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  background-color: #e5e7eb;
  color: #374151;
}

.queue-status,
.missed-status {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
}

.queue-status.status-pending,
.missed-status.status-pending { background-color: #fef3c7; color: #92400e; }
.queue-status.status-approved,
.missed-status.status-analyzed { background-color: #d1fae5; color: #065f46; }
.queue-status.status-rejected { background-color: #fee2e2; color: #991b1b; }
.missed-status.status-actioned { background-color: #dcfce7; color: #166534; }

.learning-content-text,
.queue-content,
.analyst-perspective {
  font-size: 0.875rem;
  color: #374151;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

.learning-meta,
.queue-meta,
.analyst-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.scope,
.domain,
.source,
.date,
.confidence,
.type,
.weight {
  padding: 0.125rem 0.375rem;
  background-color: #f3f4f6;
  border-radius: 0.25rem;
}

.queue-reasoning {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: #f9fafb;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  color: #6b7280;
}

.queue-actions,
.missed-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.approve-btn,
.analyze-btn {
  padding: 0.375rem 0.75rem;
  background-color: #10b981;
  color: white;
  border: none;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
}

.approve-btn:hover,
.analyze-btn:hover {
  background-color: #059669;
}

.reject-btn {
  padding: 0.375rem 0.75rem;
  background-color: #ef4444;
  color: white;
  border: none;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
}

.reject-btn:hover {
  background-color: #dc2626;
}

.missed-move {
  font-weight: 700;
}

.missed-move.positive {
  color: #059669;
}

.missed-move.negative {
  color: #dc2626;
}

.missed-period {
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.missed-drivers ul,
.missed-gaps ul {
  margin: 0.25rem 0 0 1rem;
  padding: 0;
}

.missed-drivers li,
.missed-gaps li {
  font-size: 0.75rem;
  color: #374151;
}

.missed-drivers,
.missed-gaps {
  font-size: 0.75rem;
  margin-top: 0.5rem;
}

.analyst-tiers {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #e5e7eb;
}

.tier-instruction {
  display: flex;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.tier-name {
  font-weight: 600;
  min-width: 50px;
}

.tier-name.gold { color: #92400e; }
.tier-name.silver { color: #6b7280; }
.tier-name.bronze { color: #9d174d; }

.tier-text {
  color: #6b7280;
}
</style>
