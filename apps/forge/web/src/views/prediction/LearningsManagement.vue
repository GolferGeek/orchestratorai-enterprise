<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="learnings-management">
    <header class="management-header">
      <div class="header-left">
        <button class="back-button" @click="goBackToDashboard">
          <span class="back-icon">&larr;</span>
          Back to Dashboard
        </button>
        <h1>Learnings Management</h1>
      </div>
      <button class="btn btn-primary" @click="openCreateModal">
        <span class="icon">+</span>
        New Learning
      </button>
    </header>

    <!-- Filters -->
    <div class="filters-section">
      <div class="filter-group">
        <label for="scopeLevel">Scope Level:</label>
        <select id="scopeLevel" v-model="selectedScopeLevel" class="filter-select">
          <option :value="null">All</option>
          <option value="runner">Runner</option>
          <option value="domain">Domain</option>
          <option value="universe">Universe</option>
          <option value="target">Target</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="learningType">Learning Type:</label>
        <select id="learningType" v-model="selectedLearningType" class="filter-select">
          <option :value="null">All</option>
          <option value="rule">Rule</option>
          <option value="pattern">Pattern</option>
          <option value="weight_adjustment">Weight Adjustment</option>
          <option value="threshold">Threshold</option>
          <option value="avoid">Avoid</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="sourceType">Source Type:</label>
        <select id="sourceType" v-model="selectedSourceType" class="filter-select">
          <option :value="null">All</option>
          <option value="human">Human</option>
          <option value="ai_suggested">AI Suggested</option>
          <option value="ai_approved">AI Approved</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="status">Status:</label>
        <select id="status" v-model="selectedStatus" class="filter-select">
          <option :value="null">All</option>
          <option value="active">Active</option>
          <option value="superseded">Superseded</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <button v-if="hasActiveFilters" class="btn btn-secondary" @click="clearAllFilters">
        Clear Filters
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading learnings...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadLearnings">Try Again</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="displayedLearnings.length === 0" class="empty-state">
      <span class="empty-icon">&#128161;</span>
      <h3>No Learnings Found</h3>
      <p>{{ hasActiveFilters ? 'No learnings match your filters' : 'Create your first learning to start improving predictions' }}</p>
      <button class="btn btn-primary" @click="openCreateModal">Create Learning</button>
    </div>

    <!-- Learnings Grid -->
    <div v-else class="learnings-grid">
      <LearningCard
        v-for="learning in displayedLearnings"
        :key="learning.id"
        :learning="learning"
        :is-selected="learning.id === store.selectedLearningId"
        @select="onLearningSelect"
        @edit="openEditModal"
        @delete="confirmDelete"
      />
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <header class="modal-header">
          <h2>{{ editingLearning ? 'Edit Learning' : 'Create Learning' }}</h2>
          <button class="close-btn" @click="closeModal">&times;</button>
        </header>

        <form @submit.prevent="saveLearning" class="learning-form">
          <div class="form-group">
            <label for="title">Title *</label>
            <input
              id="title"
              v-model="formData.title"
              type="text"
              required
              placeholder="e.g., Focus on volume spikes in tech sector"
            />
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

          <!-- Domain Selection (for domain scope) -->
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

          <!-- Universe Selection (for universe scope) -->
          <div v-if="formData.scopeLevel === 'universe'" class="form-group">
            <label for="universeId">Universe *</label>
            <select id="universeId" v-model="formData.universeId" required>
              <option value="">Select universe</option>
              <option
                v-for="universe in availableUniverses"
                :key="universe.id"
                :value="universe.id"
              >
                {{ universe.name }} ({{ universe.domain }})
              </option>
            </select>
          </div>

          <!-- Target Selection (for target scope) -->
          <div v-if="formData.scopeLevel === 'target'" class="form-group">
            <label for="targetId">Target *</label>
            <select id="targetId" v-model="formData.targetId" required>
              <option value="">Select target</option>
              <option
                v-for="target in availableTargets"
                :key="target.id"
                :value="target.id"
              >
                {{ target.name }} ({{ target.symbol }})
              </option>
            </select>
          </div>

          <!-- Analyst Selection (optional) -->
          <div class="form-group">
            <label for="analystId">Analyst (Optional)</label>
            <select id="analystId" v-model="formData.analystId">
              <option value="">All analysts</option>
              <option
                v-for="analyst in availableAnalysts"
                :key="analyst.id"
                :value="analyst.id"
              >
                {{ analyst.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="learningType">Learning Type *</label>
            <select id="learningType" v-model="formData.learningType" required>
              <option value="">Select type</option>
              <option value="rule">Rule</option>
              <option value="pattern">Pattern</option>
              <option value="weight_adjustment">Weight Adjustment</option>
              <option value="threshold">Threshold</option>
              <option value="avoid">Avoid</option>
            </select>
          </div>

          <div class="form-group">
            <label for="content">Content *</label>
            <textarea
              id="content"
              v-model="formData.content"
              rows="5"
              required
              placeholder="Describe the learning in detail..."
            ></textarea>
          </div>

          <div class="form-group">
            <label for="sourceType">Source Type *</label>
            <select id="sourceType" v-model="formData.sourceType" required>
              <option value="">Select source type</option>
              <option value="human">Human</option>
              <option value="ai_suggested">AI Suggested</option>
              <option value="ai_approved">AI Approved</option>
            </select>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="isSaving">
              {{ isSaving ? 'Saving...' : (editingLearning ? 'Update' : 'Create') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal-content delete-modal">
        <header class="modal-header">
          <h2>Delete Learning</h2>
          <button class="close-btn" @click="cancelDelete">&times;</button>
        </header>
        <div class="modal-body">
          <p>Are you sure you want to delete <strong>{{ learningToDelete?.title }}</strong>?</p>
          <p class="warning">This action cannot be undone.</p>
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
import { useRoute, useRouter } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import { useLearningStore } from '@/stores/learningStore';
import type { PredictionLearning, LearningScopeLevel, LearningType, LearningSourceType, LearningStatus } from '@/stores/learningStore';
import { predictionDashboardService } from '@/services/predictionDashboardService';
import LearningCard from '@/components/prediction/LearningCard.vue';
import { usePredictionStore } from '@/stores/predictionStore';

const route = useRoute();
const router = useRouter();
const store = useLearningStore();
const predictionStore = usePredictionStore();

const isLoading = ref(false);
const error = ref<string | null>(null);
const selectedScopeLevel = ref<LearningScopeLevel | null>(null);
const selectedLearningType = ref<LearningType | null>(null);
const selectedSourceType = ref<LearningSourceType | null>(null);
const selectedStatus = ref<LearningStatus | null>(null);
const showModal = ref(false);
const showDeleteModal = ref(false);
const isSaving = ref(false);
const isDeleting = ref(false);
const editingLearning = ref<PredictionLearning | null>(null);
const learningToDelete = ref<PredictionLearning | null>(null);

const formData = reactive({
  title: '',
  scopeLevel: '' as LearningScopeLevel | '',
  domain: '',
  universeId: '',
  targetId: '',
  analystId: '',
  learningType: '' as LearningType | '',
  content: '',
  sourceType: '' as LearningSourceType | '',
});

const availableUniverses = computed(() => predictionStore.universes);
const availableTargets = computed(() => predictionStore.targets);
const availableAnalysts = computed<Array<{ id: string; name: string }>>(() => []); // TODO: Load from analyst store when available

const hasActiveFilters = computed(() => {
  return !!(
    selectedScopeLevel.value ||
    selectedLearningType.value ||
    selectedSourceType.value ||
    selectedStatus.value
  );
});

const displayedLearnings = computed(() => {
  let result = store.learnings;

  if (selectedScopeLevel.value) {
    result = result.filter((l) => l.scopeLevel === selectedScopeLevel.value);
  }

  if (selectedLearningType.value) {
    result = result.filter((l) => l.learningType === selectedLearningType.value);
  }

  if (selectedSourceType.value) {
    result = result.filter((l) => l.sourceType === selectedSourceType.value);
  }

  if (selectedStatus.value) {
    result = result.filter((l) => l.status === selectedStatus.value);
  }

  return result;
});

async function loadLearnings() {
  isLoading.value = true;
  error.value = null;
  store.clearError();

  try {
    const response = await predictionDashboardService.listLearnings();
    if (response.content) {
      // Convert service type to store type (optional to null)
      const learnings: PredictionLearning[] = response.content.map((l) => ({
        ...l,
        domain: l.domain ?? null,
        universeId: l.universeId ?? null,
        targetId: l.targetId ?? null,
        analystId: l.analystId ?? null,
        supersededBy: l.supersededBy ?? null,
      }));
      store.setLearnings(learnings);
    }

    // Load universes and targets for form dropdowns
    const universesRes = await predictionDashboardService.listUniverses();
    if (universesRes.content) {
      predictionStore.setUniverses(universesRes.content);
    }

    const targetsRes = await predictionDashboardService.listTargets();
    if (targetsRes.content) {
      predictionStore.setTargets(targetsRes.content);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load learnings';
    store.setError(error.value);
  } finally {
    isLoading.value = false;
  }
}

function onLearningSelect(id: string) {
  store.selectLearning(id);
}

function openCreateModal() {
  editingLearning.value = null;
  resetForm();
  showModal.value = true;
}

function openEditModal(learning: PredictionLearning) {
  editingLearning.value = learning;
  formData.title = learning.title;
  formData.scopeLevel = learning.scopeLevel;
  formData.domain = learning.domain || '';
  formData.universeId = learning.universeId || '';
  formData.targetId = learning.targetId || '';
  formData.analystId = learning.analystId || '';
  formData.learningType = learning.learningType;
  formData.content = learning.content;
  formData.sourceType = learning.sourceType;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingLearning.value = null;
  resetForm();
}

function resetForm() {
  formData.title = '';
  formData.scopeLevel = '';
  formData.domain = '';
  formData.universeId = '';
  formData.targetId = '';
  formData.analystId = '';
  formData.learningType = '';
  formData.content = '';
  formData.sourceType = '';
}

async function saveLearning() {
  if (!formData.title || !formData.scopeLevel || !formData.learningType || !formData.content || !formData.sourceType) {
    return;
  }

  // Validate scope-specific requirements
  if (formData.scopeLevel === 'domain' && !formData.domain) {
    error.value = 'Domain is required for domain-scoped learnings';
    return;
  }
  if (formData.scopeLevel === 'universe' && !formData.universeId) {
    error.value = 'Universe is required for universe-scoped learnings';
    return;
  }
  if (formData.scopeLevel === 'target' && !formData.targetId) {
    error.value = 'Target is required for target-scoped learnings';
    return;
  }

  isSaving.value = true;
  error.value = null;

  try {
    if (editingLearning.value) {
      const response = await predictionDashboardService.updateLearning({
        id: editingLearning.value.id,
        title: formData.title,
        content: formData.content,
      });
      if (response.content) {
        store.updateLearning(editingLearning.value.id, response.content);
      }
    } else {
      const response = await predictionDashboardService.createLearning({
        title: formData.title,
        scopeLevel: formData.scopeLevel as LearningScopeLevel,
        domain: formData.domain || undefined,
        universeId: formData.universeId || undefined,
        targetId: formData.targetId || undefined,
        analystId: formData.analystId || undefined,
        learningType: formData.learningType as LearningType,
        content: formData.content,
        sourceType: formData.sourceType as LearningSourceType,
      });
      if (response.content) {
        // Convert service type to store type (optional to null)
        const learning: PredictionLearning = {
          ...response.content,
          domain: response.content.domain ?? null,
          universeId: response.content.universeId ?? null,
          targetId: response.content.targetId ?? null,
          analystId: response.content.analystId ?? null,
          supersededBy: response.content.supersededBy ?? null,
        };
        store.addLearning(learning);
      }
    }

    closeModal();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save learning';
    store.setError(error.value);
  } finally {
    isSaving.value = false;
  }
}

function confirmDelete(id: string) {
  learningToDelete.value = store.getLearningById(id) || null;
  showDeleteModal.value = true;
}

function cancelDelete() {
  showDeleteModal.value = false;
  learningToDelete.value = null;
}

async function executeDelete() {
  if (!learningToDelete.value) return;

  isDeleting.value = true;
  error.value = null;

  try {
    await predictionDashboardService.deleteLearning({ id: learningToDelete.value.id });
    store.removeLearning(learningToDelete.value.id);
    cancelDelete();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete learning';
    store.setError(error.value);
  } finally {
    isDeleting.value = false;
  }
}

function clearAllFilters() {
  selectedScopeLevel.value = null;
  selectedLearningType.value = null;
  selectedSourceType.value = null;
  selectedStatus.value = null;
}

onMounted(async () => {
  // Load learnings first so dropdowns are populated
  await loadLearnings();

  // Check for pre-fill query params (from PredictionDetail "Create Learning" action)
  const { prefill, targetId, scopeLevel, suggestedTitle, suggestedContent, learningType } = route.query;

  if (prefill === 'true') {
    // Pre-fill form fields
    if (targetId) {
      formData.targetId = targetId as string;
    }
    if (scopeLevel) {
      formData.scopeLevel = scopeLevel as LearningScopeLevel;
    }
    if (suggestedTitle) {
      formData.title = suggestedTitle as string;
    }
    if (suggestedContent) {
      formData.content = suggestedContent as string;
    }
    if (learningType) {
      formData.learningType = learningType as LearningType;
    }
    // Default source type to 'human' for manual creation
    formData.sourceType = 'human';

    // Auto-open the create modal
    showModal.value = true;

    // Clear the query params to prevent re-opening on navigation
    router.replace({ query: {} });
  }
});

function goBackToDashboard() {
  const agentSlug = route.query.agentSlug as string;
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug ? { agentSlug } : undefined,
  });
}
</script>

<style scoped>
.learnings-management {
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

/* Filters */
.filters-section {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-wrap: wrap;
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

.filter-select {
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  background: var(--input-bg, #ffffff);
  color: var(--text-primary, #111827);
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
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

/* Learnings Grid */
.learnings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
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
.learning-form {
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
  min-height: 100px;
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
html.ion-palette-dark .learnings-management,
html[data-theme="dark"] .learnings-management {
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
