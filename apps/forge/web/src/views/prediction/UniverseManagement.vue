<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="universe-management">
    <header class="management-header">
      <div class="header-left">
        <button class="back-button" @click="goBackToDashboard">
          <span class="back-icon">&larr;</span>
          Back to Dashboard
        </button>
        <h1>Portfolio Management</h1>
      </div>
      <button class="btn btn-primary" @click="openCreateModal">
        <span class="icon">+</span>
        New Portfolio
      </button>
    </header>

    <!-- Domain Filter Tabs -->
    <div class="domain-tabs">
      <button
        class="domain-tab"
        :class="{ active: selectedDomain === null }"
        @click="selectedDomain = null"
      >
        All
      </button>
      <button
        v-for="domain in domains"
        :key="domain"
        class="domain-tab"
        :class="{ active: selectedDomain === domain }"
        @click="selectedDomain = domain"
      >
        {{ domain.charAt(0).toUpperCase() + domain.slice(1) }}
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading portfolios...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadUniverses">Try Again</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredUniverses.length === 0" class="empty-state">
      <span class="empty-icon">&#127758;</span>
      <h3>No Portfolios Found</h3>
      <p>{{ selectedDomain ? `No portfolios in the ${selectedDomain} domain` : 'Create your first portfolio to get started' }}</p>
      <button class="btn btn-primary" @click="openCreateModal">Create Portfolio</button>
    </div>

    <!-- Universes Grid -->
    <div v-else class="universes-grid">
      <UniverseCard
        v-for="universe in filteredUniverses"
        :key="universe.id"
        :universe="universe"
        :is-selected="universe.id === selectedUniverseId"
        :target-count="getTargetCount(universe.id)"
        :prediction-count="getPredictionCount(universe.id)"
        :strategy="getStrategy(universe.strategyId)"
        @select="onUniverseSelect"
        @edit="openEditModal"
        @delete="confirmDelete"
      />
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <header class="modal-header">
          <h2>{{ editingUniverse ? 'Edit Portfolio' : 'Create Portfolio' }}</h2>
          <button class="close-btn" @click="closeModal">&times;</button>
        </header>

        <form @submit.prevent="saveUniverse" class="universe-form">
          <div class="form-group">
            <label for="name">Name *</label>
            <input
              id="name"
              v-model="formData.name"
              type="text"
              required
              placeholder="e.g., Tech Stocks Q1 2026"
            />
          </div>

          <div class="form-group">
            <label for="domain">Domain *</label>
            <select id="domain" v-model="formData.domain" required>
              <option value="">Select domain</option>
              <option value="stocks">Stocks</option>
              <option value="crypto">Crypto</option>
            </select>
          </div>

          <div class="form-group">
            <label for="description">Description</label>
            <textarea
              id="description"
              v-model="formData.description"
              rows="3"
              placeholder="Optional description of this universe"
            ></textarea>
          </div>

          <div class="form-group">
            <label for="strategy">Strategy</label>
            <select id="strategy" v-model="formData.strategyId">
              <option value="">Default strategy</option>
              <option
                v-for="strategy in strategies"
                :key="strategy.id"
                :value="strategy.id"
              >
                {{ strategy.name }} ({{ strategy.riskLevel }})
              </option>
            </select>
          </div>

          <!-- LLM Tier Configuration -->
          <fieldset class="llm-config-fieldset">
            <legend>LLM Tier Configuration</legend>

            <div class="tier-config">
              <h4 class="tier-label gold">Gold Tier</h4>
              <div class="tier-inputs">
                <input
                  v-model="formData.llmConfig.tiers.gold.provider"
                  type="text"
                  placeholder="Provider (e.g., anthropic)"
                />
                <input
                  v-model="formData.llmConfig.tiers.gold.model"
                  type="text"
                  placeholder="Model (e.g., claude-opus-4-5-20251101)"
                />
              </div>
            </div>

            <div class="tier-config">
              <h4 class="tier-label silver">Silver Tier</h4>
              <div class="tier-inputs">
                <input
                  v-model="formData.llmConfig.tiers.silver.provider"
                  type="text"
                  placeholder="Provider (e.g., anthropic)"
                />
                <input
                  v-model="formData.llmConfig.tiers.silver.model"
                  type="text"
                  placeholder="Model (e.g., claude-sonnet-4-20250514)"
                />
              </div>
            </div>

            <div class="tier-config">
              <h4 class="tier-label bronze">Bronze Tier</h4>
              <div class="tier-inputs">
                <input
                  v-model="formData.llmConfig.tiers.bronze.provider"
                  type="text"
                  placeholder="Provider (e.g., openai)"
                />
                <input
                  v-model="formData.llmConfig.tiers.bronze.model"
                  type="text"
                  placeholder="Model (e.g., gpt-4o)"
                />
              </div>
            </div>
          </fieldset>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="isSaving">
              {{ isSaving ? 'Saving...' : (editingUniverse ? 'Update' : 'Create') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal-content delete-modal">
        <header class="modal-header">
          <h2>Delete Universe</h2>
          <button class="close-btn" @click="cancelDelete">&times;</button>
        </header>
        <div class="modal-body">
          <p>Are you sure you want to delete <strong>{{ universeToDelete?.name }}</strong>?</p>
          <p class="warning">This will also delete all associated targets and predictions. This action cannot be undone.</p>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" @click="cancelDelete">Cancel</button>
          <button class="btn btn-danger" :disabled="isDeleting" @click="executeDelete">
            {{ isDeleting ? 'Deleting...' : 'Delete' }}
          </button>
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
import { usePredictionStore } from '@/stores/predictionStore';
import {
  predictionDashboardService,
  type PredictionUniverse,
  type PredictionStrategy,
} from '@/services/predictionDashboardService';
import UniverseCard from '@/components/prediction/UniverseCard.vue';

const router = useRouter();
const route = useRoute();
const store = usePredictionStore();

const isLoading = ref(false);
const error = ref<string | null>(null);
const selectedDomain = ref<string | null>(null);
const selectedUniverseId = ref<string | null>(null);
const showModal = ref(false);
const showDeleteModal = ref(false);
const isSaving = ref(false);
const isDeleting = ref(false);
const editingUniverse = ref<PredictionUniverse | null>(null);
const universeToDelete = ref<PredictionUniverse | null>(null);

const domains = ['stocks', 'crypto'];

const strategies = computed(() => store.strategies);

const formData = reactive({
  name: '',
  domain: '' as 'stocks' | 'crypto' | 'elections' | 'polymarket' | '',
  description: '',
  strategyId: '',
  llmConfig: {
    tiers: {
      gold: { provider: '', model: '' },
      silver: { provider: '', model: '' },
      bronze: { provider: '', model: '' },
    },
  },
});

const filteredUniverses = computed(() => {
  if (!selectedDomain.value) {
    return store.universes;
  }
  return store.universes.filter((u) => u.domain === selectedDomain.value);
});

function getTargetCount(universeId: string): number {
  return store.getTargetsForUniverse(universeId).length;
}

function getPredictionCount(universeId: string): number {
  return store.predictions.filter((p) => p.universeId === universeId).length;
}

function getStrategy(strategyId?: string): PredictionStrategy | undefined {
  return strategyId ? store.getStrategyById(strategyId) : undefined;
}

async function loadUniverses() {
  isLoading.value = true;
  error.value = null;

  try {
    const data = await predictionDashboardService.loadDashboardData();
    store.setUniverses(data.universes);
    store.setStrategies(data.strategies);
    store.setPredictions(data.predictions);

    // Load targets for each universe in parallel (API requires universeId)
    const targetPromises = data.universes.map((universe) =>
      predictionDashboardService.listTargets({ universeId: universe.id })
    );
    const targetResults = await Promise.all(targetPromises);
    const allTargets = targetResults.flatMap((res) => res.content || []);
    store.setTargets(allTargets);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load universes';
  } finally {
    isLoading.value = false;
  }
}

function onUniverseSelect(id: string) {
  selectedUniverseId.value = id;
  router.push({ name: 'PortfolioDetail', params: { id } });
}

function openCreateModal() {
  editingUniverse.value = null;
  resetForm();
  showModal.value = true;
}

function openEditModal(universe: PredictionUniverse) {
  editingUniverse.value = universe;
  formData.name = universe.name;
  formData.domain = universe.domain;
  formData.description = universe.description || '';
  formData.strategyId = universe.strategyId || '';
  formData.llmConfig.tiers.gold = universe.llmConfig?.tiers?.gold || { provider: '', model: '' };
  formData.llmConfig.tiers.silver = universe.llmConfig?.tiers?.silver || { provider: '', model: '' };
  formData.llmConfig.tiers.bronze = universe.llmConfig?.tiers?.bronze || { provider: '', model: '' };
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingUniverse.value = null;
  resetForm();
}

function resetForm() {
  formData.name = '';
  formData.domain = '';
  formData.description = '';
  formData.strategyId = '';
  formData.llmConfig.tiers.gold = { provider: '', model: '' };
  formData.llmConfig.tiers.silver = { provider: '', model: '' };
  formData.llmConfig.tiers.bronze = { provider: '', model: '' };
}

async function saveUniverse() {
  if (!formData.name || !formData.domain) return;

  isSaving.value = true;

  try {
    const llmConfig = {
      tiers: {
        gold: formData.llmConfig.tiers.gold.provider ? formData.llmConfig.tiers.gold : undefined,
        silver: formData.llmConfig.tiers.silver.provider ? formData.llmConfig.tiers.silver : undefined,
        bronze: formData.llmConfig.tiers.bronze.provider ? formData.llmConfig.tiers.bronze : undefined,
      },
    };

    if (editingUniverse.value) {
      const response = await predictionDashboardService.updateUniverse({
        id: editingUniverse.value.id,
        name: formData.name,
        description: formData.description || undefined,
        strategyId: formData.strategyId || undefined,
        llmConfig,
      });
      if (response.content) {
        store.updateUniverse(editingUniverse.value.id, response.content);
      }
    } else {
      const response = await predictionDashboardService.createUniverse({
        name: formData.name,
        domain: formData.domain as 'stocks' | 'crypto' | 'elections' | 'polymarket',
        description: formData.description || undefined,
        strategyId: formData.strategyId || undefined,
        llmConfig,
      });
      if (response.content) {
        store.addUniverse(response.content);
      }
    }

    closeModal();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save universe';
  } finally {
    isSaving.value = false;
  }
}

function confirmDelete(id: string) {
  universeToDelete.value = store.getUniverseById(id) || null;
  showDeleteModal.value = true;
}

function cancelDelete() {
  showDeleteModal.value = false;
  universeToDelete.value = null;
}

async function executeDelete() {
  if (!universeToDelete.value) return;

  isDeleting.value = true;

  try {
    await predictionDashboardService.deleteUniverse({ id: universeToDelete.value.id });
    store.removeUniverse(universeToDelete.value.id);
    cancelDelete();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete universe';
  } finally {
    isDeleting.value = false;
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
  loadUniverses();
});
</script>

<style scoped>
.universe-management {
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

/* Domain Tabs */
.domain-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  padding-bottom: 0.5rem;
}

.domain-tab {
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

.domain-tab:hover {
  color: var(--text-primary, #111827);
  background: var(--hover-bg, #f3f4f6);
}

.domain-tab.active {
  color: var(--ion-color-secondary, #15803d);
  background: rgba(21, 128, 61, 0.1);
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

/* Universes Grid */
.universes-grid {
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
.universe-form {
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

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

/* LLM Config */
.llm-config-fieldset {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
}

.llm-config-fieldset legend {
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

.tier-inputs {
  display: flex;
  gap: 0.5rem;
}

.tier-inputs input {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  font-size: 0.8125rem;
  background: var(--input-bg, #ffffff);
  color: var(--text-primary, #111827);
}

/* Light mode only: ensure LLM tier inputs use light appearance */
html:not(.ion-palette-dark):not([data-theme="dark"]) .universe-management .tier-inputs input {
  background: #ffffff;
  color: #111827;
  border-color: #e5e7eb;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .universe-management .tier-inputs input::placeholder {
  color: #6b7280;
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

/* Dark mode */
html.ion-palette-dark .universe-management,
html[data-theme="dark"] .universe-management {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --input-bg: #374151;
    --hover-bg: #374151;
    --btn-secondary-bg: #374151;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #4b5563;
  }
</style>
