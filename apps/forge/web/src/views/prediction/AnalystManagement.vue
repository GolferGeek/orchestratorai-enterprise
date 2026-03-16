<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="analyst-management">
    <header class="management-header">
      <div class="header-left">
        <button class="back-button" @click="goBackToDashboard">
          <span class="back-icon">&larr;</span>
          Back to Dashboard
        </button>
        <h1>Analyst Management</h1>
      </div>
      <button class="btn btn-primary" @click="openCreateModal">
        <span class="icon">+</span>
        New Analyst
      </button>
    </header>

    <!-- Filter Tabs -->
    <div class="filter-tabs">
      <div class="filter-group">
        <label>Scope Level:</label>
        <button
          class="filter-tab"
          :class="{ active: selectedScopeLevel === null }"
          @click="selectedScopeLevel = null"
        >
          All
        </button>
        <button
          v-for="level in scopeLevels"
          :key="level"
          class="filter-tab"
          :class="{ active: selectedScopeLevel === level }"
          @click="selectedScopeLevel = level as 'runner' | 'domain' | 'universe' | 'target'"
        >
          {{ level }}
        </button>
      </div>

      <div class="filter-group">
        <label>Domain:</label>
        <button
          class="filter-tab"
          :class="{ active: selectedDomain === null }"
          @click="selectedDomain = null"
        >
          All
        </button>
        <button
          v-for="domain in domains"
          :key="domain"
          class="filter-tab"
          :class="{ active: selectedDomain === domain }"
          @click="selectedDomain = domain"
        >
          {{ domain }}
        </button>
      </div>

      <div class="filter-group">
        <label>Status:</label>
        <button
          class="filter-tab"
          :class="{ active: selectedActive === null }"
          @click="selectedActive = null"
        >
          All
        </button>
        <button
          class="filter-tab"
          :class="{ active: selectedActive === true }"
          @click="selectedActive = true"
        >
          Active
        </button>
        <button
          class="filter-tab"
          :class="{ active: selectedActive === false }"
          @click="selectedActive = false"
        >
          Inactive
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading analysts...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadAnalysts">Try Again</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="displayedAnalysts.length === 0" class="empty-state">
      <span class="empty-icon">&#128373;</span>
      <h3>No Analysts Found</h3>
      <p>{{ getEmptyStateMessage() }}</p>
      <button class="btn btn-primary" @click="openCreateModal">Create Analyst</button>
    </div>

    <!-- Analysts Grid -->
    <div v-else class="analysts-grid">
      <AnalystCard
        v-for="analyst in displayedAnalysts"
        :key="analyst.id"
        :analyst="analyst as import('@/stores/analystStore').PredictionAnalyst"
        :is-selected="analyst.id === selectedAnalystId"
        @select="onAnalystSelect"
        @edit="openEditModal"
        @delete="confirmDelete"
      />
    </div>

    <!-- Analyst Details Panel (Phase 7 - Fork Comparison & Version History) -->
    <div v-if="selectedAnalystId && selectedAnalyst" class="analyst-details-panel">
      <div class="details-header">
        <h2>{{ selectedAnalyst.name }}</h2>
        <button class="close-btn" @click="closeDetailsPanel">&times;</button>
      </div>

      <!-- Detail Tabs -->
      <div class="details-tabs">
        <button
          class="details-tab"
          :class="{ active: activeDetailTab === 'fork' }"
          @click="activeDetailTab = 'fork'; loadForkComparison()"
        >
          Fork Performance
        </button>
        <button
          class="details-tab"
          :class="{ active: activeDetailTab === 'history' }"
          @click="activeDetailTab = 'history'; loadVersionHistory()"
        >
          Context History
        </button>
        <button
          class="details-tab"
          :class="{ active: activeDetailTab === 'session' }"
          @click="activeDetailTab = 'session'"
        >
          Learning Session
        </button>
      </div>

      <!-- Fork Comparison Tab -->
      <div v-if="activeDetailTab === 'fork'" class="tab-content">
        <div v-if="isLoadingForkComparison" class="loading-state small">
          <div class="spinner"></div>
          <span>Loading fork comparison...</span>
        </div>

        <div v-else-if="!forkComparison" class="empty-state small">
          <p>No portfolio data available yet.</p>
        </div>

        <div v-else class="fork-comparison">
          <!-- Performance Summary -->
          <div class="comparison-header">
            <div class="fork-summary user">
              <h4>User Fork</h4>
              <div class="pnl" :class="getPnlClass(forkComparison.userFork?.totalRealizedPnl)">
                ${{ formatCurrency(forkComparison.userFork?.currentBalance || 0) }}
                <span class="pnl-change">
                  ({{ formatPnlPercent(forkComparison.userFork?.totalRealizedPnl, 1000000) }})
                </span>
              </div>
              <div class="stats">
                <span>Win: {{ forkComparison.userFork?.winCount || 0 }}</span>
                <span>Loss: {{ forkComparison.userFork?.lossCount || 0 }}</span>
                <span>Rate: {{ formatWinRate(forkComparison.userFork) }}</span>
              </div>
            </div>

            <div class="vs-divider">vs</div>

            <div class="fork-summary agent">
              <h4>Agent Fork</h4>
              <div class="pnl" :class="getPnlClass(forkComparison.agentFork?.totalRealizedPnl)">
                ${{ formatCurrency(forkComparison.agentFork?.currentBalance || 0) }}
                <span class="pnl-change">
                  ({{ formatPnlPercent(forkComparison.agentFork?.totalRealizedPnl, 1000000) }})
                </span>
              </div>
              <div class="stats">
                <span>Win: {{ forkComparison.agentFork?.winCount || 0 }}</span>
                <span>Loss: {{ forkComparison.agentFork?.lossCount || 0 }}</span>
                <span>Rate: {{ formatWinRate(forkComparison.agentFork) }}</span>
              </div>
              <div v-if="forkComparison.agentFork?.status" class="portfolio-status" :class="forkComparison.agentFork.status">
                {{ forkComparison.agentFork.status.toUpperCase() }}
              </div>
            </div>
          </div>

          <!-- Performance Diff -->
          <div v-if="forkComparison.performanceDiff" class="performance-diff">
            <div class="diff-item">
              <span class="diff-label">P&amp;L Difference:</span>
              <span class="diff-value" :class="getPnlClass(forkComparison.performanceDiff.pnlDiff)">
                ${{ formatCurrency(forkComparison.performanceDiff.pnlDiff) }}
              </span>
            </div>
            <div v-if="forkComparison.performanceDiff.betterFork" class="diff-item">
              <span class="diff-label">Better Performer:</span>
              <span class="diff-value winner">
                {{ forkComparison.performanceDiff.betterFork === 'agent' ? 'Agent Fork' : 'User Fork' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Context History Tab -->
      <div v-if="activeDetailTab === 'history'" class="tab-content">
        <div v-if="isLoadingVersionHistory" class="loading-state small">
          <div class="spinner"></div>
          <span>Loading version history...</span>
        </div>

        <div v-else-if="versionHistory.length === 0" class="empty-state small">
          <p>No version history available.</p>
        </div>

        <div v-else class="version-history">
          <!-- Fork Toggle -->
          <div class="fork-toggle">
            <button
              class="fork-btn"
              :class="{ active: selectedHistoryFork === 'user' }"
              @click="selectedHistoryFork = 'user'"
            >
              User Fork ({{ userForkVersions.length }})
            </button>
            <button
              class="fork-btn"
              :class="{ active: selectedHistoryFork === 'agent' }"
              @click="selectedHistoryFork = 'agent'"
            >
              Agent Fork ({{ agentForkVersions.length }})
            </button>
          </div>

          <!-- Version Timeline -->
          <div class="version-timeline">
            <div
              v-for="version in displayedVersions"
              :key="version.id"
              class="version-item"
              :class="{ current: version.isCurrent }"
            >
              <div class="version-header">
                <span class="version-number">v{{ version.versionNumber }}</span>
                <span v-if="version.isCurrent" class="current-badge">Current</span>
                <span class="version-date">{{ formatTimestamp(version.createdAt) }}</span>
              </div>
              <div class="version-reason">{{ version.changeReason }}</div>
              <div class="version-by">Changed by: {{ version.changedBy }}</div>
              <div class="version-actions">
                <button
                  v-if="!version.isCurrent"
                  class="btn btn-small btn-secondary"
                  @click="confirmRollback(version)"
                >
                  Rollback to this version
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Learning Session Tab -->
      <div v-if="activeDetailTab === 'session'" class="tab-content">
        <div class="session-prompt">
          <p>Start a learning session to compare fork performance and exchange learnings.</p>
          <button class="btn btn-primary" @click="openLearningSessionDialog">
            Start Learning Session
          </button>
        </div>
      </div>
    </div>

    <!-- Rollback Confirmation Modal -->
    <div v-if="showRollbackModal" class="modal-overlay" @click.self="cancelRollback">
      <div class="modal-content delete-modal">
        <header class="modal-header">
          <h2>Rollback Context Version</h2>
          <button class="close-btn" @click="cancelRollback">&times;</button>
        </header>
        <div class="modal-body">
          <p>Are you sure you want to rollback to <strong>v{{ versionToRollback?.versionNumber }}</strong>?</p>
          <p class="info">Reason: {{ versionToRollback?.changeReason }}</p>
          <div class="form-group">
            <label for="rollbackReason">Rollback Reason</label>
            <input
              id="rollbackReason"
              v-model="rollbackReason"
              type="text"
              placeholder="Why are you rolling back?"
              required
            />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" @click="cancelRollback">Cancel</button>
          <button class="btn btn-primary" :disabled="isRollingBack || !rollbackReason" @click="executeRollback">
            {{ isRollingBack ? 'Rolling back...' : 'Rollback' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <header class="modal-header">
          <h2>{{ editingAnalyst ? 'Edit Analyst' : 'Create Analyst' }}</h2>
          <button class="close-btn" @click="closeModal">&times;</button>
        </header>

        <form @submit.prevent="saveAnalyst" class="analyst-form">
          <div class="form-group">
            <label for="slug">Slug *</label>
            <input
              id="slug"
              v-model="formData.slug"
              type="text"
              required
              placeholder="e.g., technical-analyst"
              :readonly="editingAnalyst !== null"
              :class="{ readonly: editingAnalyst !== null }"
            />
            <span class="help-text">Unique identifier (lowercase, hyphens only)</span>
          </div>

          <div class="form-group">
            <label for="name">Name *</label>
            <input
              id="name"
              v-model="formData.name"
              type="text"
              required
              placeholder="e.g., Technical Analyst"
            />
          </div>

          <div class="form-group">
            <label for="perspective">Perspective *</label>
            <textarea
              id="perspective"
              v-model="formData.perspective"
              rows="2"
              required
              placeholder="Brief description of this analyst's perspective and approach"
            ></textarea>
          </div>

          <div class="form-group">
            <label for="scopeLevel">Scope Level *</label>
            <select id="scopeLevel" v-model="formData.scopeLevel" required>
              <option value="">Select scope level</option>
              <option value="runner">Runner (Global)</option>
              <option value="domain">Domain</option>
              <option value="universe">Universe</option>
              <option value="target">Target</option>
            </select>
          </div>

          <!-- Conditional scope fields -->
          <div v-if="formData.scopeLevel === 'domain'" class="form-group">
            <label for="domain">Domain *</label>
            <select id="domain" v-model="formData.domain" required>
              <option value="">Select domain</option>
              <option value="stocks">Stocks</option>
              <option value="crypto">Crypto</option>
              <option value="elections">Elections</option>
              <option value="polymarket">Polymarket</option>
            </select>
          </div>

          <div v-if="formData.scopeLevel === 'universe'" class="form-group">
            <label for="universeId">Universe *</label>
            <select id="universeId" v-model="formData.universeId" required>
              <option value="">Select universe</option>
              <option
                v-for="universe in universes"
                :key="universe.id"
                :value="universe.id"
              >
                {{ universe.name }} ({{ universe.domain }})
              </option>
            </select>
          </div>

          <div v-if="formData.scopeLevel === 'target'" class="form-group">
            <label for="targetId">Target *</label>
            <select id="targetId" v-model="formData.targetId" required>
              <option value="">Select target</option>
              <option
                v-for="target in targets"
                :key="target.id"
                :value="target.id"
              >
                {{ target.name }} ({{ target.symbol }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="defaultWeight">Default Weight *</label>
            <input
              id="defaultWeight"
              v-model.number="formData.defaultWeight"
              type="number"
              step="0.01"
              min="0"
              max="1"
              required
              placeholder="0.0 - 1.0"
            />
            <span class="help-text">Weight in ensemble (0.0 to 1.0)</span>
          </div>

          <!-- Tier Instructions -->
          <fieldset class="tier-instructions-fieldset">
            <legend>Tier Instructions</legend>

            <div class="tier-config">
              <h4 class="tier-label gold">Gold Tier</h4>
              <textarea
                v-model="formData.tierInstructions.gold"
                rows="3"
                placeholder="Specific instructions for gold tier LLM"
              ></textarea>
            </div>

            <div class="tier-config">
              <h4 class="tier-label silver">Silver Tier</h4>
              <textarea
                v-model="formData.tierInstructions.silver"
                rows="3"
                placeholder="Specific instructions for silver tier LLM"
              ></textarea>
            </div>

            <div class="tier-config">
              <h4 class="tier-label bronze">Bronze Tier</h4>
              <textarea
                v-model="formData.tierInstructions.bronze"
                rows="3"
                placeholder="Specific instructions for bronze tier LLM"
              ></textarea>
            </div>
          </fieldset>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="isSaving">
              {{ isSaving ? 'Saving...' : (editingAnalyst ? 'Update' : 'Create') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal-content delete-modal">
        <header class="modal-header">
          <h2>Delete Analyst</h2>
          <button class="close-btn" @click="cancelDelete">&times;</button>
        </header>
        <div class="modal-body">
          <p>Are you sure you want to delete <strong>{{ analystToDelete?.name }}</strong>?</p>
          <p class="warning">This will remove this analyst from all predictions. This action cannot be undone.</p>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" @click="cancelDelete">Cancel</button>
          <button class="btn btn-danger" :disabled="isDeleting" @click="executeDelete">
            {{ isDeleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Learning Session Dialog (Phase 7.5) -->
    <LearningSessionDialog
      v-if="selectedAnalyst"
      :is-visible="showLearningSessionDialog"
      :analyst-id="selectedAnalyst.id"
      :analyst-name="selectedAnalyst.name"
      @close="closeLearningSessionDialog"
      @session-ended="onLearningSessionEnded"
    />
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import { useAnalystStore } from '@/stores/analystStore';
import { usePredictionStore } from '@/stores/predictionStore';
import {
  predictionDashboardService,
  type PredictionAnalyst as ServicePredictionAnalyst,
} from '@/services/predictionDashboardService';
import AnalystCard from '@/components/prediction/AnalystCard.vue';
import LearningSessionDialog from '@/components/prediction/LearningSessionDialog.vue';
import type { ForkComparison, AnalystContextVersion, ForkType, PredictionAnalyst } from '@/stores/analystStore';

const router = useRouter();
const route = useRoute();
const analystStore = useAnalystStore();
const predictionStore = usePredictionStore();

function goBackToDashboard() {
  const agentSlug = route.query.agentSlug as string;
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug ? { agentSlug } : undefined,
  });
}

// Helper function to convert service type to store type
function convertToStoreAnalyst(serviceAnalyst: ServicePredictionAnalyst): PredictionAnalyst {
  return {
    id: serviceAnalyst.id,
    slug: serviceAnalyst.slug,
    name: serviceAnalyst.name,
    perspective: serviceAnalyst.perspective,
    scopeLevel: serviceAnalyst.scopeLevel,
    domain: serviceAnalyst.domain ?? null,
    universeId: serviceAnalyst.universeId ?? null,
    targetId: serviceAnalyst.targetId ?? null,
    defaultWeight: serviceAnalyst.defaultWeight,
    tierInstructions: serviceAnalyst.tierInstructions ?? {},
    learnedPatterns: serviceAnalyst.learnedPatterns ?? [],
    active: serviceAnalyst.active,
    createdAt: serviceAnalyst.createdAt,
    updatedAt: serviceAnalyst.updatedAt,
  };
}

const isLoading = ref(false);
const error = ref<string | null>(null);
const selectedScopeLevel = ref<'runner' | 'domain' | 'universe' | 'target' | null>(null);
const selectedDomain = ref<string | null>(null);
const selectedActive = ref<boolean | null>(null);
const selectedAnalystId = ref<string | null>(null);
const showModal = ref(false);
const showDeleteModal = ref(false);
const isSaving = ref(false);
const isDeleting = ref(false);
const editingAnalyst = ref<PredictionAnalyst | ServicePredictionAnalyst | null>(null);
const analystToDelete = ref<PredictionAnalyst | null>(null);

// Phase 7: Details Panel State
const activeDetailTab = ref<'fork' | 'history' | 'session'>('fork');
const isLoadingForkComparison = ref(false);
const isLoadingVersionHistory = ref(false);
const forkComparison = ref<ForkComparison | null>(null);
const versionHistory = ref<AnalystContextVersion[]>([]);
const selectedHistoryFork = ref<ForkType>('user');
const showRollbackModal = ref(false);
const versionToRollback = ref<AnalystContextVersion | null>(null);
const rollbackReason = ref('');
const isRollingBack = ref(false);

// Phase 7.5: Learning Session Dialog
const showLearningSessionDialog = ref(false);

const scopeLevels = ['runner', 'domain', 'universe', 'target'];
const domains = ['stocks', 'crypto', 'elections', 'polymarket'];

const universes = computed(() => predictionStore.universes);
const targets = computed(() => predictionStore.targets);

const formData = reactive({
  slug: '',
  name: '',
  perspective: '',
  scopeLevel: '' as 'runner' | 'domain' | 'universe' | 'target' | '',
  domain: '',
  universeId: '',
  targetId: '',
  defaultWeight: 0.5,
  tierInstructions: {
    gold: '',
    silver: '',
    bronze: '',
  },
});

const displayedAnalysts = computed(() => {
  let result = analystStore.analysts;

  if (selectedScopeLevel.value) {
    result = result.filter((a) => a.scopeLevel === selectedScopeLevel.value);
  }

  if (selectedDomain.value) {
    result = result.filter((a) => a.domain === selectedDomain.value);
  }

  if (selectedActive.value !== null) {
    result = result.filter((a) => a.active === selectedActive.value);
  }

  return result;
});

// Phase 7: Selected analyst and version computed properties
const selectedAnalyst = computed(() => {
  if (!selectedAnalystId.value) return null;
  return analystStore.analysts.find((a) => a.id === selectedAnalystId.value) || null;
});

const userForkVersions = computed(() => {
  return versionHistory.value.filter((v) => v.forkType === 'user');
});

const agentForkVersions = computed(() => {
  return versionHistory.value.filter((v) => v.forkType === 'agent');
});

const displayedVersions = computed(() => {
  return selectedHistoryFork.value === 'user'
    ? userForkVersions.value
    : agentForkVersions.value;
});

function getEmptyStateMessage(): string {
  if (selectedScopeLevel.value) {
    return `No ${selectedScopeLevel.value} analysts found`;
  }
  if (selectedDomain.value) {
    return `No analysts in the ${selectedDomain.value} domain`;
  }
  if (selectedActive.value !== null) {
    return `No ${selectedActive.value ? 'active' : 'inactive'} analysts found`;
  }
  return 'Create your first prediction analyst to get started';
}

async function loadAnalysts() {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await predictionDashboardService.listAnalysts();
    if (response.content) {
      const storeAnalysts = response.content.map(convertToStoreAnalyst);
      analystStore.setAnalysts(storeAnalysts);
    }

    // Load universes and targets for dropdowns
    const dashboardData = await predictionDashboardService.loadDashboardData();
    predictionStore.setUniverses(dashboardData.universes);

    const targetsRes = await predictionDashboardService.listTargets();
    if (targetsRes.content) {
      predictionStore.setTargets(targetsRes.content);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load analysts';
  } finally {
    isLoading.value = false;
  }
}

function onAnalystSelect(id: string) {
  selectedAnalystId.value = id;
  analystStore.selectAnalyst(id);
  // Load fork comparison when selecting
  loadForkComparison();
}

// Phase 7: Details Panel Functions
function closeDetailsPanel() {
  selectedAnalystId.value = null;
  analystStore.selectAnalyst(null);
  forkComparison.value = null;
  versionHistory.value = [];
  activeDetailTab.value = 'fork';
}

async function loadForkComparison() {
  if (!selectedAnalystId.value) return;

  isLoadingForkComparison.value = true;
  try {
    const response = await predictionDashboardService.getForkComparison(selectedAnalystId.value);
    if (response.content) {
      // Transform ForkComparisonReport to ForkComparison format for store
      forkComparison.value = {
        analystId: response.content.analystId,
        analystName: response.content.analystName,
        userFork: response.content.userFork ? {
          id: '',
          analystId: response.content.analystId,
          forkType: 'user',
          initialBalance: 1000000,
          currentBalance: response.content.userFork.currentBalance,
          totalRealizedPnl: response.content.userFork.totalPnl,
          totalUnrealizedPnl: 0,
          winCount: response.content.userFork.winCount,
          lossCount: response.content.userFork.lossCount,
          status: 'active',
          statusChangedAt: null,
          createdAt: '',
          updatedAt: '',
        } : null,
        agentFork: response.content.agentFork ? {
          id: '',
          analystId: response.content.analystId,
          forkType: 'agent',
          initialBalance: 1000000,
          currentBalance: response.content.agentFork.currentBalance,
          totalRealizedPnl: response.content.agentFork.totalPnl,
          totalUnrealizedPnl: 0,
          winCount: response.content.agentFork.winCount,
          lossCount: response.content.agentFork.lossCount,
          status: 'active',
          statusChangedAt: null,
          createdAt: '',
          updatedAt: '',
        } : null,
        performanceDiff: {
          pnlDiff: (response.content.agentFork?.totalPnl || 0) - (response.content.userFork?.totalPnl || 0),
          winRateDiff: 0,
          betterFork: response.content.agentFork && response.content.userFork
            ? (response.content.agentFork.totalPnl > response.content.userFork.totalPnl ? 'agent' : 'user')
            : null,
        },
      };
    }
  } catch (err) {
    console.error('Failed to load fork comparison:', err);
    forkComparison.value = null;
  } finally {
    isLoadingForkComparison.value = false;
  }
}

async function loadVersionHistory() {
  if (!selectedAnalystId.value) return;

  isLoadingVersionHistory.value = true;
  try {
    const response = await predictionDashboardService.getAnalystVersionHistory(
      selectedAnalystId.value,
    );
    if (response.content) {
      versionHistory.value = response.content;
    }
  } catch (err) {
    console.error('Failed to load version history:', err);
    versionHistory.value = [];
  } finally {
    isLoadingVersionHistory.value = false;
  }
}

function confirmRollback(version: AnalystContextVersion) {
  versionToRollback.value = version;
  rollbackReason.value = '';
  showRollbackModal.value = true;
}

function cancelRollback() {
  showRollbackModal.value = false;
  versionToRollback.value = null;
  rollbackReason.value = '';
}

async function executeRollback() {
  if (!versionToRollback.value || !selectedAnalystId.value || !rollbackReason.value) return;

  isRollingBack.value = true;
  try {
    await predictionDashboardService.rollbackAnalystVersion({
      analystId: selectedAnalystId.value,
      targetVersionId: versionToRollback.value.id,
      forkType: versionToRollback.value.forkType,
      reason: rollbackReason.value,
    });
    // Reload version history
    await loadVersionHistory();
    cancelRollback();
  } catch (err) {
    console.error('Failed to rollback version:', err);
  } finally {
    isRollingBack.value = false;
  }
}

function openLearningSessionDialog() {
  if (!selectedAnalystId.value) return;
  showLearningSessionDialog.value = true;
}

function closeLearningSessionDialog() {
  showLearningSessionDialog.value = false;
}

function onLearningSessionEnded() {
  // Refresh fork comparison after learning session ends
  if (selectedAnalystId.value) {
    loadForkComparison();
  }
}

// Formatting helpers
function formatCurrency(value: number): string {
  return Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPnlPercent(pnl: number | undefined, initial: number): string {
  if (pnl === undefined) return '0%';
  const percent = (pnl / initial) * 100;
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}

function formatWinRate(portfolio: { winCount: number; lossCount: number } | null | undefined): string {
  if (!portfolio) return '0%';
  const total = portfolio.winCount + portfolio.lossCount;
  if (total === 0) return '0%';
  return `${((portfolio.winCount / total) * 100).toFixed(0)}%`;
}

function getPnlClass(value: number | undefined): string {
  if (value === undefined || value === 0) return 'neutral';
  return value > 0 ? 'positive' : 'negative';
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 1) {
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / 60000);
      return `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function openCreateModal() {
  editingAnalyst.value = null;
  resetForm();
  showModal.value = true;
}

function openEditModal(analyst: ServicePredictionAnalyst) {
  editingAnalyst.value = analyst;
  formData.slug = analyst.slug;
  formData.name = analyst.name;
  formData.perspective = analyst.perspective;
  formData.scopeLevel = analyst.scopeLevel;
  formData.domain = analyst.domain ?? '';
  formData.universeId = analyst.universeId ?? '';
  formData.targetId = analyst.targetId ?? '';
  formData.defaultWeight = analyst.defaultWeight;
  formData.tierInstructions.gold = analyst.tierInstructions?.gold ?? '';
  formData.tierInstructions.silver = analyst.tierInstructions?.silver ?? '';
  formData.tierInstructions.bronze = analyst.tierInstructions?.bronze ?? '';
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingAnalyst.value = null;
  resetForm();
}

function resetForm() {
  formData.slug = '';
  formData.name = '';
  formData.perspective = '';
  formData.scopeLevel = '';
  formData.domain = '';
  formData.universeId = '';
  formData.targetId = '';
  formData.defaultWeight = 0.5;
  formData.tierInstructions.gold = '';
  formData.tierInstructions.silver = '';
  formData.tierInstructions.bronze = '';
}

async function saveAnalyst() {
  if (!formData.name || !formData.slug || !formData.perspective || !formData.scopeLevel) return;

  isSaving.value = true;

  try {
    const tierInstructions = {
      gold: formData.tierInstructions.gold || undefined,
      silver: formData.tierInstructions.silver || undefined,
      bronze: formData.tierInstructions.bronze || undefined,
    };

    if (editingAnalyst.value) {
      const response = await predictionDashboardService.updateAnalyst({
        id: editingAnalyst.value.id,
        name: formData.name,
        perspective: formData.perspective,
        defaultWeight: formData.defaultWeight,
        tierInstructions,
      });
      if (response.content) {
        analystStore.updateAnalyst(editingAnalyst.value.id, convertToStoreAnalyst(response.content));
      }
    } else {
      const response = await predictionDashboardService.createAnalyst({
        slug: formData.slug,
        name: formData.name,
        perspective: formData.perspective,
        scopeLevel: formData.scopeLevel as 'runner' | 'domain' | 'universe' | 'target',
        domain: formData.domain || undefined,
        universeId: formData.universeId || undefined,
        targetId: formData.targetId || undefined,
        defaultWeight: formData.defaultWeight,
        tierInstructions,
      });
      if (response.content) {
        analystStore.addAnalyst(convertToStoreAnalyst(response.content));
      }
    }

    closeModal();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save analyst';
  } finally {
    isSaving.value = false;
  }
}

function confirmDelete(id: string) {
  analystToDelete.value = analystStore.getAnalystById(id) ?? null;
  showDeleteModal.value = true;
}

function cancelDelete() {
  showDeleteModal.value = false;
  analystToDelete.value = null;
}

async function executeDelete() {
  if (!analystToDelete.value) return;

  isDeleting.value = true;

  try {
    await predictionDashboardService.deleteAnalyst({ id: analystToDelete.value.id });
    analystStore.removeAnalyst(analystToDelete.value.id);
    cancelDelete();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete analyst';
  } finally {
    isDeleting.value = false;
  }
}

onMounted(() => {
  loadAnalysts();
});
</script>

<style scoped>
.analyst-management {
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

.management-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
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

.icon {
  font-size: 1.125rem;
  font-weight: 600;
}

/* Filter Tabs */
.filter-tabs {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  min-width: 100px;
}

.filter-tab {
  padding: 0.375rem 0.75rem;
  background: none;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  text-transform: capitalize;
  transition: all 0.2s;
}

.filter-tab:hover {
  color: var(--text-primary, #111827);
  border-color: var(--ion-color-secondary, #15803d);
}

.filter-tab.active {
  color: white;
  background: var(--ion-color-secondary, #15803d);
  border-color: var(--ion-color-secondary, #15803d);
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

/* Analysts Grid */
.analysts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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
  max-width: 560px;
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

/* Form */
.analyst-form {
  padding: 1.5rem;
}

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

.form-group input.readonly {
  background: var(--readonly-bg, #f9fafb);
  color: var(--text-secondary, #6b7280);
  cursor: not-allowed;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.help-text {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin-top: 0.25rem;
}

/* Tier Instructions */
.tier-instructions-fieldset {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
}

.tier-instructions-fieldset legend {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  padding: 0 0.5rem;
}

.tier-config {
  margin-bottom: 1rem;
}

.tier-config:last-child {
  margin-bottom: 0;
}

.tier-label {
  font-size: 0.75rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  display: inline-block;
}

.tier-label.gold {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(184, 134, 11, 0.2));
  color: #b8860b;
}

.tier-label.silver {
  background: linear-gradient(135deg, rgba(192, 192, 192, 0.2), rgba(128, 128, 128, 0.2));
  color: #666;
}

.tier-label.bronze {
  background: linear-gradient(135deg, rgba(205, 127, 50, 0.2), rgba(139, 69, 19, 0.2));
  color: #8b4513;
}

.tier-config textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  font-size: 0.8125rem;
  resize: vertical;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

/* Delete Modal */
.delete-modal {
  max-width: 400px;
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  margin: 0 0 0.75rem 0;
  color: var(--text-primary, #111827);
}

.modal-body .warning {
  font-size: 0.875rem;
  color: #ef4444;
}

/* Phase 7: Analyst Details Panel */
.analyst-details-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 600px;
  max-width: 100%;
  height: 100vh;
  background: var(--card-bg, #ffffff);
  border-left: 1px solid var(--border-color, #e5e7eb);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: var(--card-bg, #ffffff);
}

.details-header h3 {
  margin: 0;
  font-size: 1.125rem;
  color: var(--text-primary, #111827);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary, #111827);
}

.details-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: var(--card-bg, #ffffff);
}

.details-tab {
  flex: 1;
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s;
}

.details-tab:hover {
  color: var(--text-primary, #111827);
  background: var(--hover-bg, #f9fafb);
}

.details-tab.active {
  color: #15803d;
  border-bottom-color: #15803d;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

/* Fork Comparison */
.fork-comparison {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.comparison-header {
  text-align: center;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.comparison-header h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  color: var(--text-primary, #111827);
}

.comparison-header .period {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.forks-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.fork-summary {
  padding: 1rem;
  background: var(--hover-bg, #f9fafb);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
}

.fork-summary h5 {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.fork-summary.user h5 {
  color: #15803d;
}

.fork-summary.agent h5 {
  color: #8b5cf6;
}

.fork-stats {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
}

.stat-row .label {
  color: var(--text-secondary, #6b7280);
}

.stat-row .value {
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.pnl.positive {
  color: #10b981;
}

.pnl.negative {
  color: #ef4444;
}

.portfolio-status {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.portfolio-status.active {
  background: #d1fae5;
  color: #059669;
}

.portfolio-status.warning {
  background: #fef3c7;
  color: #d97706;
}

.portfolio-status.probation {
  background: #fee2e2;
  color: #dc2626;
}

.portfolio-status.suspended {
  background: #f3f4f6;
  color: #6b7280;
}

.performance-diff {
  padding: 1rem;
  background: linear-gradient(135deg, #f0f9ff 0%, #faf5ff 100%);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
}

.performance-diff h5 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

.diff-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.diff-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
}

.diff-row .label {
  color: var(--text-secondary, #6b7280);
}

.diff-row .value {
  font-weight: 500;
}

.better-fork {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
  text-align: center;
  font-size: 0.875rem;
}

.better-fork .winner {
  font-weight: 600;
  color: #10b981;
}

.better-fork .winner.user {
  color: #15803d;
}

.better-fork .winner.agent {
  color: #8b5cf6;
}

/* Version History */
.version-history {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.fork-toggle {
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem;
  background: var(--hover-bg, #f3f4f6);
  border-radius: 8px;
}

.fork-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s;
}

.fork-btn:hover {
  color: var(--text-primary, #111827);
}

.fork-btn.active {
  background: var(--card-bg, #ffffff);
  color: var(--text-primary, #111827);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.fork-btn.active.user {
  color: #15803d;
}

.fork-btn.active.agent {
  color: #8b5cf6;
}

.version-timeline {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.version-item {
  padding: 1rem;
  background: var(--hover-bg, #f9fafb);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  transition: all 0.2s;
}

.version-item:hover {
  border-color: #15803d;
}

.version-item.current {
  border-color: #10b981;
  background: #f0fdf4;
}

.version-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.version-number {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
}

.current-badge {
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  background: #d1fae5;
  color: #059669;
  border-radius: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.version-meta {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 0.5rem;
}

.version-reason {
  font-size: 0.8125rem;
  color: var(--text-primary, #111827);
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  background: var(--card-bg, #ffffff);
  border-radius: 4px;
  border-left: 3px solid #15803d;
}

.version-actions {
  display: flex;
  justify-content: flex-end;
}

.rollback-btn {
  padding: 0.375rem 0.75rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s;
}

.rollback-btn:hover {
  border-color: #f59e0b;
  color: #f59e0b;
}

.empty-versions {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary, #6b7280);
}

/* Learning Session Prompt */
.session-prompt {
  text-align: center;
  padding: 2rem;
}

.session-prompt p {
  margin: 0 0 1rem 0;
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
}

.start-session-btn {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #15803d 0%, #8b5cf6 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.start-session-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(21, 128, 61, 0.4);
}

/* Rollback Modal */
.rollback-modal {
  max-width: 450px;
}

.rollback-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background: #fef3c7;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.rollback-warning .warning-icon {
  font-size: 1.25rem;
}

.rollback-warning p {
  margin: 0;
  font-size: 0.875rem;
  color: #92400e;
}

/* Loading State */
.loading-panel {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem;
  color: var(--text-secondary, #6b7280);
}

/* Dark mode */
html.ion-palette-dark .analyst-management,
html[data-theme="dark"] .analyst-management {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --input-bg: #374151;
    --hover-bg: #374151;
    --btn-secondary-bg: #374151;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #4b5563;
    --readonly-bg: #1f2937;
  }
</style>
