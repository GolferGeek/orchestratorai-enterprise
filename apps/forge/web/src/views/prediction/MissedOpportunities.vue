<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="missed-opportunities">
    <header class="management-header">
      <div class="header-left">
        <button class="back-button" @click="goBackToDashboard">
          <span class="back-icon">&larr;</span>
          Back to Dashboard
        </button>
        <h1>Missed Opportunities</h1>
        <span class="info-text">System-detected opportunities for learning</span>
      </div>
    </header>

    <!-- Stats Summary -->
    <div v-if="!isLoading && !error" class="stats-summary">
      <div class="stat-card">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ formatPercent(stats.avgMovePercent) }}%</span>
        <span class="stat-label">Avg Move</span>
      </div>
      <div class="stat-card up">
        <span class="stat-value">{{ stats.upMoves }}</span>
        <span class="stat-label">Up Moves</span>
      </div>
      <div class="stat-card down">
        <span class="stat-value">{{ stats.downMoves }}</span>
        <span class="stat-label">Down Moves</span>
      </div>
      <div class="stat-card pending">
        <span class="stat-value">{{ stats.pending }}</span>
        <span class="stat-label">Pending</span>
      </div>
      <div class="stat-card analyzed">
        <span class="stat-value">{{ stats.analyzed }}</span>
        <span class="stat-label">Analyzed</span>
      </div>
      <div class="stat-card actioned">
        <span class="stat-value">{{ stats.actioned }}</span>
        <span class="stat-label">Actioned</span>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-section">
      <div class="filter-tabs">
        <button
          class="filter-tab"
          :class="{ active: currentFilters.analysisStatus === null }"
          @click="setStatusFilter(null)"
        >
          All
        </button>
        <button
          class="filter-tab"
          :class="{ active: currentFilters.analysisStatus === 'pending' }"
          @click="setStatusFilter('pending')"
        >
          Pending
        </button>
        <button
          class="filter-tab"
          :class="{ active: currentFilters.analysisStatus === 'analyzed' }"
          @click="setStatusFilter('analyzed')"
        >
          Analyzed
        </button>
        <button
          class="filter-tab"
          :class="{ active: currentFilters.analysisStatus === 'actioned' }"
          @click="setStatusFilter('actioned')"
        >
          Actioned
        </button>
      </div>

      <div class="filter-controls">
        <div class="filter-group">
          <label for="direction-filter">Direction:</label>
          <select id="direction-filter" v-model="currentFilters.direction" @change="applyFilters">
            <option :value="null">All</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
          </select>
        </div>

        <div class="filter-group">
          <label for="move-filter">Min Move %:</label>
          <input
            id="move-filter"
            v-model.number="currentFilters.minMovePercent"
            type="number"
            step="0.1"
            placeholder="e.g., 5.0"
            @input="applyFilters"
          />
        </div>

        <button v-if="hasActiveFilters" class="btn btn-secondary" @click="clearAllFilters">
          Clear Filters
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading missed opportunities...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadOpportunities">Try Again</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredOpportunities.length === 0" class="empty-state">
      <span class="empty-icon">&#128270;</span>
      <h3>No Missed Opportunities Found</h3>
      <p>
        {{
          hasActiveFilters
            ? 'No opportunities match the selected filters'
            : 'No missed opportunities detected yet'
        }}
      </p>
      <button v-if="hasActiveFilters" class="btn btn-primary" @click="clearAllFilters">
        Clear Filters
      </button>
    </div>

    <!-- Opportunities Grid -->
    <div v-else class="opportunities-grid">
      <MissedOpportunityCard
        v-for="opportunity in filteredOpportunities"
        :key="opportunity.id"
        :opportunity="opportunity"
        @select="onOpportunitySelect"
      />
    </div>

    <!-- Detail Modal -->
    <div v-if="showDetailModal && selectedOpportunity" class="modal-overlay" @click.self="closeDetailModal">
      <div class="modal-content detail-modal">
        <header class="modal-header">
          <div class="modal-title-group">
            <h2>{{ selectedOpportunity.targetName }} ({{ selectedOpportunity.targetSymbol }})</h2>
            <span class="status-badge" :class="selectedOpportunity.analysisStatus">
              {{ selectedOpportunity.analysisStatus }}
            </span>
          </div>
          <button class="close-btn" @click="closeDetailModal">&times;</button>
        </header>

        <div class="modal-body">
          <!-- Opportunity Overview -->
          <section class="detail-section">
            <h3>Opportunity Overview</h3>
            <div class="overview-grid">
              <div class="overview-item">
                <span class="item-label">Direction</span>
                <span class="direction-badge" :class="selectedOpportunity.direction">
                  {{ selectedOpportunity.direction === 'up' ? '↑ Up' : '↓ Down' }}
                </span>
              </div>
              <div class="overview-item">
                <span class="item-label">Move Percent</span>
                <span class="item-value">{{ formatPercent(selectedOpportunity.movePercent) }}%</span>
              </div>
              <div class="overview-item">
                <span class="item-label">Start Value</span>
                <span class="item-value">{{ formatValue(selectedOpportunity.startValue) }}</span>
              </div>
              <div class="overview-item">
                <span class="item-label">End Value</span>
                <span class="item-value">{{ formatValue(selectedOpportunity.endValue) }}</span>
              </div>
              <div class="overview-item">
                <span class="item-label">Move Start</span>
                <span class="item-value">{{ formatTimestamp(selectedOpportunity.moveStartAt) }}</span>
              </div>
              <div class="overview-item">
                <span class="item-label">Move End</span>
                <span class="item-value">{{ formatTimestamp(selectedOpportunity.moveEndAt) }}</span>
              </div>
            </div>
          </section>

          <!-- Discovered Drivers -->
          <section class="detail-section">
            <h3>Discovered Drivers</h3>
            <ul v-if="selectedOpportunity.discoveredDrivers && selectedOpportunity.discoveredDrivers.length > 0" class="drivers-list">
              <li v-for="(driver, idx) in selectedOpportunity.discoveredDrivers" :key="idx">
                {{ driver }}
              </li>
            </ul>
            <p v-else class="empty-text">No drivers discovered</p>
          </section>

          <!-- Signals We Had -->
          <section class="detail-section">
            <h3>Signals We Had</h3>
            <div v-if="selectedOpportunity.signalsWeHad && selectedOpportunity.signalsWeHad.length > 0" class="signals-list">
              <div
                v-for="signal in selectedOpportunity.signalsWeHad"
                :key="signal.id"
                class="signal-card"
              >
                <div class="signal-content">{{ signal.content }}</div>
                <div class="signal-reason">{{ signal.reason }}</div>
              </div>
            </div>
            <p v-else class="empty-text">No signals recorded</p>
          </section>

          <!-- Source Gaps -->
          <section class="detail-section">
            <h3>Source Gaps</h3>
            <ul v-if="selectedOpportunity.sourceGaps && selectedOpportunity.sourceGaps.length > 0" class="gaps-list">
              <li v-for="(gap, idx) in selectedOpportunity.sourceGaps" :key="idx">
                {{ gap }}
              </li>
            </ul>
            <p v-else class="empty-text">No source gaps identified</p>
          </section>

          <!-- Suggested Learnings -->
          <section class="detail-section">
            <h3>Suggested Learnings</h3>
            <ul v-if="selectedOpportunity.suggestedLearnings && selectedOpportunity.suggestedLearnings.length > 0" class="learnings-list">
              <li v-for="(learning, idx) in selectedOpportunity.suggestedLearnings" :key="idx">
                {{ learning }}
              </li>
            </ul>
            <p v-else class="empty-text">No learnings suggested</p>
          </section>

          <!-- Analysis (if analyzed) -->
          <section v-if="currentAnalysis && !isLoadingAnalysis" class="detail-section">
            <h3>Analysis</h3>
            <div class="analysis-content">
              <p class="analysis-summary">{{ currentAnalysis.summary }}</p>

              <div v-if="currentAnalysis.drivers.length > 0" class="analysis-subsection">
                <h4>Drivers Analysis</h4>
                <div class="drivers-analysis">
                  <div
                    v-for="(driver, idx) in currentAnalysis.drivers"
                    :key="idx"
                    class="driver-item"
                  >
                    <div class="driver-header">
                      <span class="driver-name">{{ driver.driver }}</span>
                      <span class="confidence-badge">{{ (driver.confidence * 100).toFixed(0) }}%</span>
                    </div>
                    <div class="driver-sources">
                      Sources: {{ driver.sources.join(', ') }}
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="currentAnalysis.sourceRecommendations.length > 0" class="analysis-subsection">
                <h4>Source Recommendations</h4>
                <div class="recommendations-list">
                  <div
                    v-for="(rec, idx) in currentAnalysis.sourceRecommendations"
                    :key="idx"
                    class="recommendation-item"
                  >
                    <div class="rec-header">
                      <span class="rec-type">{{ rec.sourceType }}</span>
                      <span class="priority-badge" :class="rec.priority">{{ rec.priority }}</span>
                    </div>
                    <p class="rec-description">{{ rec.description }}</p>
                  </div>
                </div>
              </div>

              <div v-if="currentAnalysis.learningRecommendations.length > 0" class="analysis-subsection">
                <h4>Learning Recommendations</h4>
                <div class="learning-recommendations">
                  <div
                    v-for="(rec, idx) in currentAnalysis.learningRecommendations"
                    :key="idx"
                    class="learning-item"
                  >
                    <h5>{{ rec.title }}</h5>
                    <span class="learning-type">{{ rec.learningType }}</span>
                    <p>{{ rec.content }}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Analysis Loading -->
          <section v-if="isLoadingAnalysis" class="detail-section">
            <h3>Analysis</h3>
            <div class="loading-state">
              <div class="spinner"></div>
              <span>Loading analysis...</span>
            </div>
          </section>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeDetailModal">Close</button>
        </div>
      </div>
    </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import { useMissedOpportunityStore } from '@/stores/missedOpportunityStore';
import type { AnalysisStatus, MoveDirection } from '@/stores/missedOpportunityStore';
import {
  predictionDashboardService,
  type MissedOpportunityListParams,
} from '@/services/predictionDashboardService';
import MissedOpportunityCard from '@/components/prediction/MissedOpportunityCard.vue';

const router = useRouter();
const route = useRoute();
const store = useMissedOpportunityStore();

function goBackToDashboard() {
  const agentSlug = route.query.agentSlug as string;
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug ? { agentSlug } : undefined,
  });
}

const isLoading = ref(false);
const error = ref<string | null>(null);
const showDetailModal = ref(false);

const currentFilters = reactive<{
  analysisStatus: AnalysisStatus | null;
  direction: MoveDirection | null;
  minMovePercent: number | null;
}>({
  analysisStatus: null,
  direction: null,
  minMovePercent: null,
});

const stats = computed(() => store.opportunityStats);
const filteredOpportunities = computed(() => store.filteredOpportunities);
const selectedOpportunity = computed(() => store.selectedOpportunity);
const currentAnalysis = computed(() => store.currentAnalysis);
const isLoadingAnalysis = computed(() => store.isLoadingAnalysis);

const hasActiveFilters = computed(() => {
  return (
    currentFilters.analysisStatus !== null ||
    currentFilters.direction !== null ||
    currentFilters.minMovePercent !== null
  );
});

async function loadOpportunities() {
  isLoading.value = true;
  error.value = null;

  try {
    const params: MissedOpportunityListParams = {};

    const response = await predictionDashboardService.listMissedOpportunities(params);
    if (response.content) {
      store.setOpportunities(response.content);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load missed opportunities';
  } finally {
    isLoading.value = false;
  }
}

function setStatusFilter(status: AnalysisStatus | null) {
  currentFilters.analysisStatus = status;
  store.setFilters({ analysisStatus: status });
  loadOpportunities();
}

function applyFilters() {
  store.setFilters({
    direction: currentFilters.direction,
    minMovePercent: currentFilters.minMovePercent,
  });
  loadOpportunities();
}

function clearAllFilters() {
  currentFilters.analysisStatus = null;
  currentFilters.direction = null;
  currentFilters.minMovePercent = null;
  store.clearFilters();
  loadOpportunities();
}

async function onOpportunitySelect(id: string) {
  store.selectOpportunity(id);
  showDetailModal.value = true;

  // Load analysis if analyzed or actioned
  const opportunity = store.getOpportunityById(id);
  if (opportunity && (opportunity.analysisStatus === 'analyzed' || opportunity.analysisStatus === 'actioned')) {
    await loadAnalysis(id);
  }
}

async function loadAnalysis(id: string) {
  store.setLoadingAnalysis(true);
  try {
    const response = await predictionDashboardService.getMissedOpportunityAnalysis({ id });
    if (response.content) {
      store.setCurrentAnalysis(response.content);
    }
  } catch (err) {
    console.error('Failed to load analysis:', err);
  } finally {
    store.setLoadingAnalysis(false);
  }
}

function closeDetailModal() {
  showDetailModal.value = false;
  store.selectOpportunity(null);
}

function formatPercent(value: number): string {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function formatValue(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(() => {
  loadOpportunities();
});
</script>

<style scoped>
.missed-opportunities {
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
  gap: 0.25rem;
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

.info-text {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

/* Stats Summary */
.stats-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-card.up {
  border-left: 3px solid #10b981;
}

.stat-card.down {
  border-left: 3px solid #ef4444;
}

.stat-card.pending {
  border-left: 3px solid #f59e0b;
}

.stat-card.analyzed {
  border-left: 3px solid #15803d;
}

.stat-card.actioned {
  border-left: 3px solid #059669;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

/* Filter Section */
.filter-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.filter-tabs {
  display: flex;
  gap: 0.5rem;
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

.filter-controls {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.filter-group label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
}

.filter-group select,
.filter-group input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  background: var(--input-bg, #ffffff);
  color: var(--text-primary, #111827);
  min-width: 120px;
}

.filter-group select:focus,
.filter-group input:focus {
  outline: none;
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

/* Buttons */
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

/* Opportunities Grid */
.opportunities-grid {
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
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
}

.detail-modal {
  max-width: 900px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  position: sticky;
  top: 0;
  background: var(--card-bg, #ffffff);
  z-index: 1;
}

.modal-title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #111827);
}

.status-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.status-badge.pending {
  background-color: rgba(251, 191, 36, 0.1);
  color: #f59e0b;
}

.status-badge.analyzed {
  background-color: rgba(21, 128, 61, 0.1);
  color: #166534;
}

.status-badge.actioned {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
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

.detail-section {
  margin-bottom: 2rem;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 1rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.detail-section h4 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 0.75rem 0;
}

.detail-section h5 {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 0.375rem 0;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.overview-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.item-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.item-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.direction-badge {
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  width: fit-content;
}

.direction-badge.up {
  background-color: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.direction-badge.down {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.drivers-list,
.gaps-list,
.learnings-list {
  list-style: disc;
  padding-left: 1.5rem;
  margin: 0;
}

.drivers-list li,
.gaps-list li,
.learnings-list li {
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  line-height: 1.5;
}

.signals-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.signal-card {
  padding: 0.75rem;
  background: var(--signal-bg, #f9fafb);
  border-radius: 6px;
  border-left: 3px solid var(--ion-color-secondary, #15803d);
}

.signal-content {
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  margin-bottom: 0.375rem;
}

.signal-reason {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  font-style: italic;
}

.empty-text {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  margin: 0;
}

.analysis-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.analysis-summary {
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  line-height: 1.6;
  margin: 0;
  padding: 0.75rem;
  background: var(--summary-bg, #eff6ff);
  border-radius: 6px;
}

.analysis-subsection {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.drivers-analysis,
.recommendations-list,
.learning-recommendations {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.driver-item,
.recommendation-item,
.learning-item {
  padding: 0.75rem;
  background: var(--item-bg, #f9fafb);
  border-radius: 6px;
}

.driver-header,
.rec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.driver-name,
.rec-type {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.confidence-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  background: rgba(21, 128, 61, 0.1);
  color: #166534;
  border-radius: 3px;
}

.priority-badge {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  text-transform: uppercase;
}

.priority-badge.high {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.priority-badge.medium {
  background-color: rgba(251, 191, 36, 0.1);
  color: #f59e0b;
}

.priority-badge.low {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.driver-sources,
.rec-description {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.rec-description {
  margin: 0;
  line-height: 1.5;
}

.learning-type {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  background: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
  border-radius: 3px;
  text-transform: uppercase;
  display: inline-block;
  margin-bottom: 0.5rem;
}

.learning-item p {
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  line-height: 1.5;
  margin: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
  position: sticky;
  bottom: 0;
  background: var(--card-bg, #ffffff);
}

/* Dark mode */
html.ion-palette-dark .missed-opportunities,
html[data-theme="dark"] .missed-opportunities {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --input-bg: #374151;
    --hover-bg: #374151;
    --btn-secondary-bg: #374151;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #4b5563;
    --signal-bg: #111827;
    --summary-bg: #1e3a5f;
    --item-bg: #111827;
  }
</style>
