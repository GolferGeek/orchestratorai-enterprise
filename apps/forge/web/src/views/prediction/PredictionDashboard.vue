<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button :auto-hide="false"></ion-menu-button>
        </ion-buttons>
        <ion-title>Prediction Dashboard</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content ref="contentRef" :fullscreen="true">
      <div class="prediction-dashboard">
        <header class="dashboard-header">
      <div class="header-actions">
        <button class="btn btn-secondary" @click="goToTradingDashboard">
          <span class="icon">&#128200;</span>
          Trading Dashboard
        </button>
        <button class="btn btn-secondary" @click="goToPortfolios">
          <span class="icon">&#128193;</span>
          Manage Portfolios
        </button>
        <button class="btn btn-secondary" @click="goToDailyReport">
          <span class="icon">&#128221;</span>
          Daily Report
        </button>
        <button class="btn btn-secondary" @click="showActivityFeed = !showActivityFeed">
          <span class="icon">&#128202;</span>
          {{ showActivityFeed ? 'Hide Activity' : 'Watch Activity' }}
        </button>
        <div class="header-group">
          <span class="header-group-label">Training</span>
          <button class="btn btn-secondary btn-compact" @click="navigateToTraining('LearningsManagement')">
            Learnings
          </button>
          <button class="btn btn-secondary btn-compact" @click="navigateToTraining('AnalystManagement')">
            Analysts
          </button>
          <button class="btn btn-secondary btn-compact" @click="navigateToTraining('MissedOpportunities')">
            Missed Opp.
          </button>
          <button class="btn btn-secondary btn-compact" @click="navigateToTraining('LearningQueue')">
            Queue
          </button>
          <button class="btn btn-secondary btn-compact" @click="navigateToTraining('TestLab')">
            Test Lab
          </button>
        </div>
      </div>
    </header>

    <!-- Tab Bar -->
    <div class="dashboard-tabs">
      <button
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'predictions' }"
        @click="activeTab = 'predictions'"
      >
        Predictions
      </button>
      <button
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'agents' }"
        @click="activeTab = 'agents'"
      >
        Context Agents
      </button>
    </div>

    <!-- Predictions Tab Content -->
    <div v-show="activeTab === 'predictions'">
      <!-- Activity Feed Panel -->
      <section v-if="showActivityFeed" class="activity-feed-section">
        <PredictionActivityFeed @close="showActivityFeed = false" />
      </section>

      <!-- Price Ticker Strip -->
      <PriceTickerStrip
        :prices="instrumentPrices"
        @select="onTickerSelect"
      />

      <!-- Filters -->
      <section class="group-box">
        <span class="group-box-label">Filters</span>
        <div class="filters-row">
          <div class="filter-group">
            <label for="universe-filter">Portfolio</label>
            <select
              id="universe-filter"
              v-model="selectedUniverse"
              @change="onUniverseChange"
            >
              <option :value="null">All Portfolios</option>
              <option
                v-for="universe in store.universes"
                :key="universe.id"
                :value="universe.id"
              >
                {{ universe.name }} ({{ universe.domain }})
              </option>
            </select>
          </div>

          <div class="filter-group">
            <label for="status-filter">Status</label>
            <select id="status-filter" v-model="statusFilter" @change="onFilterChange">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div class="filter-group">
            <label for="domain-filter">Domain</label>
            <select id="domain-filter" v-model="domainFilter" @change="onFilterChange">
              <option :value="null">All Domains</option>
              <option value="stocks">Stocks</option>
              <option value="crypto">Crypto</option>
              <option value="elections">Elections</option>
              <option value="polymarket">Polymarket</option>
            </select>
          </div>

          <div class="filter-group">
            <label for="outcome-filter">Outcome</label>
            <select id="outcome-filter" v-model="outcomeFilter" @change="onFilterChange">
              <option :value="null">All Outcomes</option>
              <option value="correct">Correct</option>
              <option value="incorrect">Incorrect</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Predictions -->
      <section class="group-box predictions-box">
        <span class="group-box-label">Predictions</span>

        <!-- Loading State -->
        <div v-if="store.isLoading" class="loading-state">
          <div class="spinner"></div>
          <span>Loading predictions...</span>
        </div>

        <!-- Error State -->
        <div v-else-if="store.error" class="error-state">
          <span class="error-icon">!</span>
          <span>{{ store.error }}</span>
          <button class="btn btn-secondary" @click="refreshData">Try Again</button>
        </div>

        <!-- Empty State -->
        <div v-else-if="visibleGroupedPredictions.length === 0" class="empty-state">
          <span class="empty-icon">&#128202;</span>
          <h3>No Predictions Found</h3>
          <p>
            {{ hasFilters ? 'Try adjusting your filters' : 'No predictions have been generated yet' }}
          </p>
        </div>

        <!-- Predictions Grid (Grouped by Target) -->
        <div v-else class="predictions-grid">
          <PredictionGroupCard
            v-for="group in visibleGroupedPredictions"
            :key="group.key"
            :predictions="group.predictions"
            :prices="pricesMap"
            @click="onGroupClick(group)"
            @analyst-click="(slug: string) => onAnalystClick(group, slug)"
            @trade="(dir: 'buy' | 'sell') => onTradeClick(group, dir)"
          />
        </div>

        <!-- Pagination -->
        <div v-if="store.totalPages > 1" class="pagination-row">
          <button
            class="btn btn-secondary"
            :disabled="store.page <= 1"
            @click="goToPage(store.page - 1)"
          >
            Previous
          </button>
          <span class="page-info">
            Page {{ store.page }} of {{ store.totalPages }}
          </span>
          <button
            class="btn btn-secondary"
            :disabled="!store.hasMore"
            @click="goToPage(store.page + 1)"
          >
            Next
          </button>
        </div>
      </section>
    </div>

    <!-- Context Agents Tab Content -->
    <div v-if="activeTab === 'agents'" class="group-box">
      <span class="group-box-label">Context Agents</span>
      <ContextAgentsTab />
    </div>

    <!-- Analyst Cards Modal (Level 2) -->
    <AnalystCardsModal
      :is-open="isAnalystModalOpen"
      :predictions="selectedGroupPredictions"
      @dismiss="closeAnalystModal"
    />

    <!-- Direct Analyst Assessments Modal (skips AnalystCardsModal) -->
    <AnalystAssessmentsModal
      :is-open="isDirectAssessmentsOpen"
      :prediction-id="directAssessmentPredictionId"
      @dismiss="closeDirectAssessments"
    />

    <!-- Take Position Modal -->
    <TakePositionModal
      :is-open="isTakePositionModalOpen"
      :prediction="selectedPredictionForPosition"
      @close="closeTakePositionModal"
      @trade-queued="handleTradeQueued"
    />

    <!-- Price History Modal -->
    <PriceHistoryModal
      :is-open="isPriceHistoryOpen"
      :target="selectedPriceTarget"
      @dismiss="closePriceHistoryModal"
    />
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { IonPage, IonContent, IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle } from '@ionic/vue';
import { usePredictionStore } from '@/stores/predictionStore';
import { useAuthStore } from '@/stores/rbacStore';
import { useAgentsStore } from '@/stores/agentsStore';
import { predictionDashboardService } from '@/services/predictionDashboardService';
import PredictionGroupCard from '@/components/prediction/PredictionGroupCard.vue';
import AnalystCardsModal from '@/components/prediction/AnalystCardsModal.vue';
import AnalystAssessmentsModal from '@/components/prediction/AnalystAssessmentsModal.vue';
import PredictionActivityFeed from '@/components/prediction/PredictionActivityFeed.vue';
import TakePositionModal from '@/components/prediction/TakePositionModal.vue';
import PriceTickerStrip from '@/components/prediction/PriceTickerStrip.vue';
import PriceHistoryModal from '@/components/prediction/PriceHistoryModal.vue';
import ContextAgentsTab from '@/components/prediction/ContextAgentsTab.vue';
import type { Prediction, InstrumentPrice } from '@/services/predictionDashboardService';

const router = useRouter();
const route = useRoute();
const store = usePredictionStore();
const authStore = useAuthStore();
const agentsStore = useAgentsStore();

// Get agentSlug from query parameter (passed when clicking prediction agent in sidebar)
const agentSlug = computed(() => route.query.agentSlug as string | undefined);

// Look up the agent by slug to get its organizationSlug
// Falls back to default prediction agent if no query param
const defaultAgentSlug = 'us-tech-stocks';
const currentAgent = computed(() => {
  const slug = agentSlug.value || defaultAgentSlug;
  return agentsStore.availableAgents.find(a => a.slug === slug || a.name === slug) || null;
});

// Get organization from agent (priority) or fall back to auth store
const effectiveOrg = computed(() => {
  // Priority 1: Agent's organizationSlug
  const agentOrg = currentAgent.value?.organizationSlug;
  if (agentOrg && agentOrg !== '*') {
    return Array.isArray(agentOrg) ? agentOrg[0] : agentOrg;
  }
  // Priority 2: Auth store's current organization (but not if it's '*')
  const authOrg = authStore.currentOrganization;
  if (authOrg && authOrg !== '*') {
    return authOrg;
  }
  // Priority 3: Default org for prediction dashboards
  return 'finance';
});

const activeTab = ref<'predictions' | 'agents'>('predictions');

const selectedUniverse = ref<string | null>(null);
const statusFilter = ref<'all' | 'active' | 'resolved' | 'expired' | 'cancelled'>('all');
const domainFilter = ref<string | null>(null);
const outcomeFilter = ref<'correct' | 'incorrect' | 'pending' | null>(null);
const showActivityFeed = ref(false);

// Instrument Prices
const instrumentPrices = ref<InstrumentPrice[]>([]);
const pricesMap = computed(() => {
  const map = new Map<string, InstrumentPrice>();
  for (const p of instrumentPrices.value) {
    map.set(p.symbol, p);
  }
  return map;
});

// Price History Modal state
const isPriceHistoryOpen = ref(false);
const selectedPriceTarget = ref<InstrumentPrice | null>(null);

// Take Position Modal state
const isTakePositionModalOpen = ref(false);
const selectedPredictionForPosition = ref<{
  id: string;
  symbol: string;
  direction: 'bullish' | 'bearish';
  confidence: number;
  magnitudePercent?: number;
  rationale?: string;
} | null>(null);

// Analyst Cards Modal state (Level 2)
const isAnalystModalOpen = ref(false);
const selectedGroupPredictions = ref<Prediction[]>([]);

// Direct Analyst Assessments Modal state (skip AnalystCardsModal)
const isDirectAssessmentsOpen = ref(false);
const directAssessmentPredictionId = ref<string | null>(null);

// Group predictions by target symbol + timeframe + generatedAt (unique prediction set)
interface PredictionGroup {
  key: string;
  targetSymbol: string;
  targetName: string;
  timeframe: string;
  generatedAt: string;
  predictions: Prediction[];
}

const groupedPredictions = computed<PredictionGroup[]>(() => {
  const groups = new Map<string, PredictionGroup>();

  for (const prediction of store.filteredPredictions) {
    // Create a unique key for each prediction group
    // Use targetSymbol + timeframe + generatedAt (rounded to minute) to group predictions
    const generatedAt = prediction.generatedAt || '';
    const roundedTime = generatedAt ? new Date(generatedAt).toISOString().slice(0, 16) : '';
    const key = `${prediction.targetSymbol || 'unknown'}-${prediction.timeframe || ''}-${roundedTime}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        targetSymbol: prediction.targetSymbol || 'N/A',
        targetName: prediction.targetName || '',
        timeframe: prediction.timeframe || '',
        generatedAt: prediction.generatedAt || '',
        predictions: [],
      });
    }

    groups.get(key)!.predictions.push(prediction);
  }

  // Sort by generatedAt descending (newest first)
  return Array.from(groups.values()).sort((a, b) => {
    const dateA = new Date(a.generatedAt).getTime() || 0;
    const dateB = new Date(b.generatedAt).getTime() || 0;
    return dateB - dateA;
  });
});

const visibleGroupedPredictions = computed<PredictionGroup[]>(() => {
  return groupedPredictions.value.filter((group) =>
    group.predictions.some(
      (prediction) =>
        Boolean(prediction.analystSlug) &&
        prediction.analystSlug !== 'arbitrator' &&
        ['up', 'down', 'bullish', 'bearish'].includes(
          String(prediction.direction || '').toLowerCase(),
        ),
    ),
  );
});

function onGroupClick(group: PredictionGroup) {
  selectedGroupPredictions.value = group.predictions;
  isAnalystModalOpen.value = true;
}

function closeAnalystModal() {
  isAnalystModalOpen.value = false;
  selectedGroupPredictions.value = [];
}

function onAnalystClick(group: PredictionGroup, analystSlug: string) {
  const prediction = group.predictions.find(p => p.analystSlug === analystSlug);
  if (prediction) {
    directAssessmentPredictionId.value = prediction.id;
    isDirectAssessmentsOpen.value = true;
  }
}

function closeDirectAssessments() {
  isDirectAssessmentsOpen.value = false;
  directAssessmentPredictionId.value = null;
}

const hasFilters = computed(() => {
  return selectedUniverse.value !== null || statusFilter.value !== 'all' || domainFilter.value !== null || outcomeFilter.value !== null;
});

async function loadData() {
  // Get organization from agent (not from global auth store which may be '*')
  const org = effectiveOrg.value;
  if (!org) {
    console.log('[PredictionDashboard] Waiting for organization context from agent...');
    store.setError('No organization context available. Please select a prediction agent from the agents panel.');
    return;
  }

  // Set the organization and agent slug for API calls
  const agent = agentSlug.value || 'us-tech-stocks';
  predictionDashboardService.setOrgSlug(org);
  predictionDashboardService.setAgentSlug(agent);

  // Debug: Log the organization and agent being used
  console.log('[PredictionDashboard] Loading data for org:', org, 'agent:', agent, '(from agent:', currentAgent.value?.name, ')');

  store.setLoading(true);
  store.clearError();

  try {
    const data = await predictionDashboardService.loadDashboardData(
      selectedUniverse.value || undefined,
      agentSlug.value
    );

    console.log('[PredictionDashboard] API response:', {
      universes: data.universes?.length ?? 0,
      predictions: data.predictions?.length ?? 0,
      strategies: data.strategies?.length ?? 0,
      rawPredictions: data.predictions,
      rawUniverses: data.universes,
    });

    store.setUniverses(data.universes);
    store.setPredictions(data.predictions);
    store.setStrategies(data.strategies);

    if (data.predictions.length > 0) {
      store.setTotalCount(data.predictions.length);
    }

    // Load instrument prices (non-blocking)
    predictionDashboardService.getInstrumentPrices()
      .then(prices => { instrumentPrices.value = prices; })
      .catch(err => console.warn('[PredictionDashboard] Failed to load prices:', err));
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Failed to load predictions');
  } finally {
    store.setLoading(false);
  }
}

function refreshData() {
  loadData();
}

function onUniverseChange() {
  store.selectUniverse(selectedUniverse.value);
  loadData();
}

function onFilterChange() {
  store.setFilters({
    status: statusFilter.value,
    domain: domainFilter.value,
    outcome: outcomeFilter.value,
  });
}

function onTradeClick(group: PredictionGroup, direction: 'buy' | 'sell') {
  // Use arbitrator prediction if available, otherwise first active directional prediction
  const arbitrator = group.predictions.find(p => p.isArbitrator && p.status === 'active');
  const activePred = arbitrator || group.predictions.find(p =>
    p.status === 'active' && (p.direction === 'up' || p.direction === 'down')
  );
  if (!activePred) return;

  const magnitudeMap: Record<string, number> = { small: 2, medium: 5, large: 10 };
  selectedPredictionForPosition.value = {
    id: activePred.id,
    symbol: activePred.targetSymbol || group.targetSymbol,
    direction: direction === 'buy' ? 'bullish' : 'bearish',
    confidence: activePred.confidence || 0,
    magnitudePercent: magnitudeMap[activePred.magnitude || ''] || undefined,
    rationale: activePred.reasoning,
  };
  isTakePositionModalOpen.value = true;
}

// Note: Individual prediction selection was replaced with group-based modal navigation
// The flow is now: Group Card -> Analyst Cards Modal -> Fork Analysis Modal

function closeTakePositionModal() {
  isTakePositionModalOpen.value = false;
  selectedPredictionForPosition.value = null;
}

function onTickerSelect(price: InstrumentPrice) {
  selectedPriceTarget.value = price;
  isPriceHistoryOpen.value = true;
}

function closePriceHistoryModal() {
  isPriceHistoryOpen.value = false;
  selectedPriceTarget.value = null;
}

function handleTradeQueued(result: { tradeId: string; symbol: string }) {
  console.log('Trade queued from dashboard:', result);
  // Modal closes automatically after success
}

function goToPage(page: number) {
  store.setPage(page);
  loadData();
}

function goToPortfolios() {
  router.push({
    name: 'PortfolioManagement',
    query: agentSlug.value ? { agentSlug: agentSlug.value } : undefined,
  });
}

function goToTradingDashboard() {
  router.push({
    name: 'TradingDashboard',
    query: agentSlug.value ? { agentSlug: agentSlug.value } : undefined,
  });
}

function goToDailyReport() {
  const reportAgentSlug = agentSlug.value || defaultAgentSlug;
  const reportOrgSlug = effectiveOrg.value;
  router.push({
    name: 'DailyReport',
    query: {
      agentSlug: reportAgentSlug,
      ...(reportOrgSlug ? { orgSlug: reportOrgSlug } : {}),
    },
  });
}

function navigateToTraining(screenName: string) {
  router.push({
    name: screenName,
    query: agentSlug.value ? { agentSlug: agentSlug.value } : undefined,
  });
}

// Track previous agentSlug to detect agent switches
let previousAgentSlug: string | undefined | null = null;

// Watch for organization context to become available (from agent or auth store)
watch(
  [effectiveOrg, agentSlug],
  ([newOrg, newAgentSlug]) => {
    // Reset state when switching between dashboard agents
    if (previousAgentSlug && previousAgentSlug !== newAgentSlug) {
      store.resetState();
    }
    previousAgentSlug = newAgentSlug;

    console.log('[PredictionDashboard] Org/agent changed:', newOrg, newAgentSlug);
    loadData();
  },
  { immediate: true }
);

// Content ref for scroll control
const contentRef = ref<InstanceType<typeof IonContent> | null>(null);

onMounted(async () => {
  // Scroll to top when page loads
  if (contentRef.value) {
    await contentRef.value.$el.scrollToTop(0);
  }

  // Note: Data loading is handled by the watch on effectiveOrg
  // which fires immediately. No need to call loadData() here.
});
</script>

<style scoped>
.prediction-dashboard {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  margin-bottom: 0.75rem;
}

/* Tab Bar */
.dashboard-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
  border-bottom: 2px solid var(--border-color, #e5e7eb);
  padding-bottom: 0;
}

.tab-btn {
  padding: 0.5rem 1.25rem;
  border: none;
  background: none;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  border-radius: 4px 4px 0 0;
  transition: color 0.15s, border-color 0.15s;
}

.tab-btn:hover {
  color: var(--text-primary, #111827);
}

.tab-btn--active {
  color: var(--primary-color, #15803d);
  border-bottom-color: var(--primary-color, #15803d);
  font-weight: 600;
}

html.ion-palette-dark .tab-btn,
html[data-theme="dark"] .tab-btn {
  color: var(--dark-text-subtle, #9ca3af);
}

html.ion-palette-dark .tab-btn:hover,
html[data-theme="dark"] .tab-btn:hover {
  color: var(--dark-text-primary, #f7fafc);
}

html.ion-palette-dark .tab-btn--active,
html[data-theme="dark"] .tab-btn--active {
  color: #4ade80;
  border-bottom-color: #4ade80;
}

html.ion-palette-dark .dashboard-tabs,
html[data-theme="dark"] .dashboard-tabs {
  border-bottom-color: var(--dark-border-subtle, #374151);
}

.dashboard-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
}

/* Activity Feed Section */
.activity-feed-section {
  margin-bottom: 1.5rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  width: 100%;
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

.btn-secondary {
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #111827);
  border: 1px solid var(--border-color, #e5e7eb);
}

.btn-secondary:hover {
  background: var(--hover-bg, #f9fafb);
  border-color: var(--border-color, #d1d5db);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon {
  font-size: 1rem;
}

/* Group Box */
.group-box {
  position: relative;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1.25rem 1rem 1rem;
  margin-bottom: 1.5rem;
  background: var(--card-bg, #ffffff);
}

.group-box-label {
  position: absolute;
  top: -0.55rem;
  left: 0.75rem;
  padding: 0 0.375rem;
  font-size: 0.675rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--card-bg, #ffffff);
}

.predictions-box {
  padding-bottom: 0.5rem;
}

/* Filters */
.filters-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.filter-group label {
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.filter-group select {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
  min-width: 160px;
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #111827);
  border: 1px solid var(--border-color, #e5e7eb);
}

/* Header Group (Training buttons) */
.header-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--card-bg, #ffffff);
}

.header-group-label {
  font-size: 0.675rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: 0.25rem;
  white-space: nowrap;
}

.btn-compact {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
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
  border-top-color: var(--primary-color, #15803d);
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

/* Dark mode: empty state text must be light for legibility */
html.ion-palette-dark .empty-state,
html.ion-palette-dark .empty-state h3,
html.ion-palette-dark .empty-state p {
  color: var(--dark-text-primary, #f7fafc);
}

/* Predictions Grid */
.predictions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

/* Pagination (inside predictions group-box) */
.pagination-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.page-info {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

html.ion-palette-dark .prediction-dashboard .header-group,
html[data-theme="dark"] .prediction-dashboard .header-group {
  background: var(--dark-bg-secondary, #1f2937);
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .prediction-dashboard .header-group-label,
html[data-theme="dark"] .prediction-dashboard .header-group-label {
  color: var(--dark-text-subtle, #9ca3af);
}

html.ion-palette-dark .prediction-dashboard .group-box,
html[data-theme="dark"] .prediction-dashboard .group-box {
  background: var(--dark-bg-secondary, #1f2937);
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .prediction-dashboard .group-box-label,
html[data-theme="dark"] .prediction-dashboard .group-box-label {
  background: var(--dark-bg-primary, #1a1a1a);
  color: var(--dark-text-subtle, #9ca3af);
}

html.ion-palette-dark .prediction-dashboard .filter-group select,
html[data-theme="dark"] .prediction-dashboard .filter-group select {
  background-color: var(--dark-bg-primary, #1a1a1a);
  color: var(--dark-text-primary, #f7fafc);
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .prediction-dashboard .pagination-row,
html[data-theme="dark"] .prediction-dashboard .pagination-row {
  border-top-color: var(--dark-border-subtle, #374151);
}

/* Dark mode only: header-actions .btn-secondary lose background, color, border */
html.ion-palette-dark .prediction-dashboard .header-actions .btn,
html.ion-palette-dark .prediction-dashboard .header-actions .btn-secondary,
html[data-theme="dark"] .prediction-dashboard .header-actions .btn,
html[data-theme="dark"] .prediction-dashboard .header-actions .btn-secondary {
  background: transparent !important;
  border: none !important;
  color: inherit !important;
}

html.ion-palette-dark .prediction-dashboard .header-actions .btn:hover,
html.ion-palette-dark .prediction-dashboard .header-actions .btn-secondary:hover,
html[data-theme="dark"] .prediction-dashboard .header-actions .btn:hover,
html[data-theme="dark"] .prediction-dashboard .header-actions .btn-secondary:hover {
  background: transparent !important;
  border: none !important;
}

/* Dark mode only: filter-group selects lose background, color, border */
html.ion-palette-dark .prediction-dashboard .filter-group select,
html[data-theme="dark"] .prediction-dashboard .filter-group select {
  background: transparent !important;
  border: none !important;
  color: inherit !important;
}

/* Light mode only: header-actions buttons, price-ticker-strip, filter-group selects */
html:not(.ion-palette-dark):not([data-theme="dark"]) .prediction-dashboard .header-actions .btn,
html:not(.ion-palette-dark):not([data-theme="dark"]) .prediction-dashboard .header-actions .btn-secondary,
html[data-theme="light"] .prediction-dashboard .header-actions .btn,
html[data-theme="light"] .prediction-dashboard .header-actions .btn-secondary {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #e5e7eb !important;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .prediction-dashboard .header-actions .btn:hover,
html:not(.ion-palette-dark):not([data-theme="dark"]) .prediction-dashboard .header-actions .btn-secondary:hover,
html[data-theme="light"] .prediction-dashboard .header-actions .btn:hover,
html[data-theme="light"] .prediction-dashboard .header-actions .btn-secondary:hover {
  background: #f9fafb !important;
  border-color: #d1d5db !important;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .prediction-dashboard .filter-group select,
html[data-theme="light"] .prediction-dashboard .filter-group select {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #e5e7eb !important;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .prediction-dashboard .filter-group label,
html[data-theme="light"] .prediction-dashboard .filter-group label {
  color: #6b7280 !important;
}
</style>
