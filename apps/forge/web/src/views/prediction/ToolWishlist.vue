<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="tool-wishlist">
    <header class="management-header">
      <div class="header-left">
        <button class="back-button" @click="goBackToDashboard">
          <span class="back-icon">&larr;</span>
          Back to Dashboard
        </button>
        <h1>Tool Wishlist</h1>
      </div>
      <button class="btn btn-primary" @click="openCreateModal">
        <span class="icon">+</span>
        New Request
      </button>
    </header>

    <!-- Stats Summary -->
    <div v-if="!isLoading && !error" class="stats-summary">
      <div class="stat-card">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">Total Requests</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.wishlist }}</span>
        <span class="stat-label">Wishlist</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.planned }}</span>
        <span class="stat-label">Planned</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.inProgress }}</span>
        <span class="stat-label">In Progress</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.done }}</span>
        <span class="stat-label">Done</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.highPriority }}</span>
        <span class="stat-label">High Priority</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.completionRate.toFixed(1) }}%</span>
        <span class="stat-label">Completion Rate</span>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-section">
      <div class="filter-row">
        <div class="filter-group">
          <label>View:</label>
          <button
            class="filter-btn"
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
          >
            List
          </button>
          <button
            class="filter-btn"
            :class="{ active: viewMode === 'kanban' }"
            @click="viewMode = 'kanban'"
          >
            Kanban
          </button>
        </div>

        <div class="filter-group">
          <label>Portfolio:</label>
          <select v-model="filters.universeId" @change="applyFilters">
            <option :value="null">All Portfolios</option>
            <option
              v-for="universe in universes"
              :key="universe.id"
              :value="universe.id"
            >
              {{ universe.name }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>Target:</label>
          <select v-model="filters.targetId" @change="applyFilters" :disabled="!filters.universeId">
            <option :value="null">All Targets</option>
            <option
              v-for="target in availableTargets"
              :key="target.id"
              :value="target.id"
            >
              {{ target.name }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>Type:</label>
          <select v-model="filters.requestType" @change="applyFilters">
            <option :value="null">All Types</option>
            <option value="source">Source</option>
            <option value="integration">Integration</option>
            <option value="feature">Feature</option>
          </select>
        </div>

        <div class="filter-group">
          <label>Status:</label>
          <select v-model="filters.status" @change="applyFilters">
            <option :value="null">All Statuses</option>
            <option value="wishlist">Wishlist</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div class="filter-group">
          <label>Priority:</label>
          <select v-model="filters.priority" @change="applyFilters">
            <option :value="null">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <button class="btn btn-secondary" @click="clearFilters">Clear Filters</button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading tool requests...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="loadRequests">Try Again</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="displayedRequests.length === 0" class="empty-state">
      <span class="empty-icon">&#128736;</span>
      <h3>No Tool Requests Found</h3>
      <p>Create your first tool request to track needed sources, integrations, or features</p>
      <button class="btn btn-primary" @click="openCreateModal">Create Request</button>
    </div>

    <!-- List View -->
    <div v-else-if="viewMode === 'list'" class="requests-grid">
      <ToolRequestCard
        v-for="request in displayedRequests"
        :key="request.id"
        :request="request"
        :is-selected="request.id === selectedRequestId"
        @select="onRequestSelect"
        @update-status="openStatusModal"
        @delete="confirmDelete"
      />
    </div>

    <!-- Kanban View -->
    <div v-else class="kanban-view">
      <div
        v-for="status in kanbanStatuses"
        :key="status"
        class="kanban-column"
      >
        <div class="column-header">
          <h3>{{ formatStatusLabel(status) }}</h3>
          <span class="count">{{ getRequestsByStatus(status).length }}</span>
        </div>
        <div class="column-body">
          <ToolRequestCard
            v-for="request in getRequestsByStatus(status)"
            :key="request.id"
            :request="request"
            :is-selected="request.id === selectedRequestId"
            @select="onRequestSelect"
            @update-status="openStatusModal"
            @delete="confirmDelete"
          />
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
      <div class="modal-content">
        <header class="modal-header">
          <h2>Create Tool Request</h2>
          <button class="close-btn" @click="closeCreateModal">&times;</button>
        </header>

        <form @submit.prevent="saveRequest" class="request-form">
          <div class="form-group">
            <label for="universeId">Universe *</label>
            <select id="universeId" v-model="formData.universeId" required>
              <option value="">Select universe</option>
              <option
                v-for="universe in universes"
                :key="universe.id"
                :value="universe.id"
              >
                {{ universe.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="targetId">Target (Optional)</label>
            <select id="targetId" v-model="formData.targetId" :disabled="!formData.universeId">
              <option value="">No specific target</option>
              <option
                v-for="target in getTargetsForUniverse(formData.universeId)"
                :key="target.id"
                :value="target.id"
              >
                {{ target.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="requestType">Request Type *</label>
            <select id="requestType" v-model="formData.requestType" required>
              <option value="">Select type</option>
              <option value="source">Source</option>
              <option value="integration">Integration</option>
              <option value="feature">Feature</option>
            </select>
          </div>

          <div class="form-group">
            <label for="title">Title *</label>
            <input
              id="title"
              v-model="formData.title"
              type="text"
              required
              placeholder="e.g., Add Reuters API integration"
            />
          </div>

          <div class="form-group">
            <label for="description">Description *</label>
            <textarea
              id="description"
              v-model="formData.description"
              rows="4"
              required
              placeholder="Describe the tool, source, or feature needed..."
            ></textarea>
          </div>

          <div class="form-group">
            <label for="priority">Priority</label>
            <select id="priority" v-model="formData.priority">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div class="form-group">
            <label for="sourceType">Source Type (Optional)</label>
            <input
              id="sourceType"
              v-model="formData.sourceType"
              type="text"
              placeholder="e.g., rss, twitter_search, api"
            />
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeCreateModal">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="isSaving">
              {{ isSaving ? 'Creating...' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Status Update Modal -->
    <div v-if="showStatusModal" class="modal-overlay" @click.self="closeStatusModal">
      <div class="modal-content">
        <header class="modal-header">
          <h2>Update Status</h2>
          <button class="close-btn" @click="closeStatusModal">&times;</button>
        </header>

        <form @submit.prevent="saveStatus" class="request-form">
          <div class="request-title-display">
            <strong>{{ statusFormData.request?.title }}</strong>
          </div>

          <div class="form-group">
            <label for="status">Status *</label>
            <select id="status" v-model="statusFormData.status" required>
              <option value="wishlist">Wishlist</option>
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div class="form-group">
            <label for="statusNotes">Status Notes</label>
            <textarea
              id="statusNotes"
              v-model="statusFormData.statusNotes"
              rows="3"
              placeholder="Optional notes about this status change..."
            ></textarea>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeStatusModal">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="isSaving">
              {{ isSaving ? 'Updating...' : 'Update' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal-content delete-modal">
        <header class="modal-header">
          <h2>Delete Tool Request</h2>
          <button class="close-btn" @click="cancelDelete">&times;</button>
        </header>
        <div class="modal-body">
          <p>Are you sure you want to delete <strong>{{ requestToDelete?.title }}</strong>?</p>
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
import { useRouter, useRoute } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import { useToolRequestStore } from '@/stores/toolRequestStore';
import type { ToolRequest, ToolRequestType, ToolRequestStatus, ToolRequestPriority } from '@/stores/toolRequestStore';
import { usePredictionStore } from '@/stores/predictionStore';
import { predictionDashboardService } from '@/services/predictionDashboardService';
import ToolRequestCard from '@/components/prediction/ToolRequestCard.vue';

const router = useRouter();
const route = useRoute();
const toolRequestStore = useToolRequestStore();
const predictionStore = usePredictionStore();

const isLoading = ref(false);
const error = ref<string | null>(null);
const showCreateModal = ref(false);
const showStatusModal = ref(false);
const showDeleteModal = ref(false);
const isSaving = ref(false);
const isDeleting = ref(false);
const requestToDelete = ref<ToolRequest | null>(null);
const viewMode = ref<'list' | 'kanban'>('list');

const filters = reactive({
  universeId: null as string | null,
  targetId: null as string | null,
  requestType: null as ToolRequestType | null,
  status: null as ToolRequestStatus | null,
  priority: null as ToolRequestPriority | null,
});

const formData = reactive({
  universeId: '',
  targetId: '',
  requestType: '' as '' | ToolRequestType,
  title: '',
  description: '',
  priority: 'medium' as ToolRequestPriority,
  sourceType: '',
});

const statusFormData = reactive({
  request: null as ToolRequest | null,
  status: '' as ToolRequestStatus | '',
  statusNotes: '',
});

const kanbanStatuses: ToolRequestStatus[] = ['wishlist', 'planned', 'in_progress', 'done', 'rejected'];

const stats = computed(() => toolRequestStore.requestStats);
const selectedRequestId = computed(() => toolRequestStore.selectedRequestId);
const universes = computed(() => predictionStore.universes);
const targets = computed(() => predictionStore.targets);

const availableTargets = computed(() => {
  if (!filters.universeId) return [];
  return targets.value.filter(t => t.universeId === filters.universeId);
});

const displayedRequests = computed(() => toolRequestStore.filteredRequests);

function getTargetsForUniverse(universeId: string): typeof targets.value {
  if (!universeId) return [];
  return targets.value.filter(t => t.universeId === universeId);
}

function getRequestsByStatus(status: ToolRequestStatus): ToolRequest[] {
  return displayedRequests.value.filter(r => r.status === status);
}

function formatStatusLabel(status: ToolRequestStatus): string {
  const map: Record<ToolRequestStatus, string> = {
    wishlist: 'Wishlist',
    planned: 'Planned',
    in_progress: 'In Progress',
    done: 'Done',
    rejected: 'Rejected',
  };
  return map[status];
}

async function loadRequests() {
  isLoading.value = true;
  error.value = null;

  try {
    // Load universes and targets first
    const dashboardData = await predictionDashboardService.loadDashboardData();
    predictionStore.setUniverses(dashboardData.universes);

    const targetsRes = await predictionDashboardService.listTargets();
    if (targetsRes.content) {
      predictionStore.setTargets(targetsRes.content);
    }

    // Load tool requests
    const response = await predictionDashboardService.listToolRequests();
    if (response.content) {
      toolRequestStore.setRequests(response.content);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load tool requests';
  } finally {
    isLoading.value = false;
  }
}

function applyFilters() {
  toolRequestStore.setFilters({
    universeId: filters.universeId,
    targetId: filters.targetId,
    requestType: filters.requestType,
    status: filters.status,
    priority: filters.priority,
  });
}

function clearFilters() {
  filters.universeId = null;
  filters.targetId = null;
  filters.requestType = null;
  filters.status = null;
  filters.priority = null;
  toolRequestStore.clearFilters();
}

function onRequestSelect(id: string) {
  toolRequestStore.selectRequest(id);
}

function openCreateModal() {
  resetForm();
  showCreateModal.value = true;
}

function closeCreateModal() {
  showCreateModal.value = false;
  resetForm();
}

function resetForm() {
  formData.universeId = '';
  formData.targetId = '';
  formData.requestType = '';
  formData.title = '';
  formData.description = '';
  formData.priority = 'medium';
  formData.sourceType = '';
}

async function saveRequest() {
  if (!formData.universeId || !formData.requestType || !formData.title || !formData.description) {
    return;
  }

  isSaving.value = true;

  try {
    const response = await predictionDashboardService.createToolRequest({
      universeId: formData.universeId,
      toolType: formData.requestType as 'source' | 'integration' | 'analyst' | 'other',
      title: formData.title,
      description: formData.description,
      sourceType: formData.sourceType ? (formData.sourceType as 'api' | 'rss' | 'web' | 'twitter_search') : undefined,
    });

    if (response.content) {
      toolRequestStore.addRequest(response.content);
    }

    closeCreateModal();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create tool request';
  } finally {
    isSaving.value = false;
  }
}

function openStatusModal(request: ToolRequest) {
  statusFormData.request = request;
  statusFormData.status = request.status;
  statusFormData.statusNotes = request.statusNotes || '';
  showStatusModal.value = true;
}

function closeStatusModal() {
  showStatusModal.value = false;
  statusFormData.request = null;
  statusFormData.status = '';
  statusFormData.statusNotes = '';
}

async function saveStatus() {
  if (!statusFormData.request || !statusFormData.status) {
    return;
  }

  isSaving.value = true;

  try {
    const response = await predictionDashboardService.updateToolRequestStatus({
      id: statusFormData.request.id,
      status: statusFormData.status as ToolRequestStatus,
      userNote: statusFormData.statusNotes || undefined,
    });

    if (response.content) {
      toolRequestStore.updateRequest(statusFormData.request.id, response.content);
    }

    closeStatusModal();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update status';
  } finally {
    isSaving.value = false;
  }
}

function confirmDelete(id: string) {
  requestToDelete.value = toolRequestStore.getRequestById(id) || null;
  showDeleteModal.value = true;
}

function cancelDelete() {
  showDeleteModal.value = false;
  requestToDelete.value = null;
}

async function executeDelete() {
  if (!requestToDelete.value) return;

  isDeleting.value = true;

  try {
    await predictionDashboardService.deleteToolRequest({ id: requestToDelete.value.id });
    toolRequestStore.removeRequest(requestToDelete.value.id);
    cancelDelete();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete tool request';
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
  loadRequests();
});
</script>

<style scoped>
.tool-wishlist {
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

/* Stats Summary */
.stats-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ion-color-secondary, #15803d);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  text-align: center;
  margin-top: 0.25rem;
}

/* Filter Section */
.filter-section {
  margin-bottom: 1.5rem;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
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

.filter-btn {
  padding: 0.5rem 1rem;
  background: var(--btn-secondary-bg, #f3f4f6);
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: var(--btn-secondary-hover, #e5e7eb);
  color: var(--text-primary, #111827);
}

.filter-btn.active {
  background: var(--ion-color-secondary, #15803d);
  color: white;
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

/* List View */
.requests-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1rem;
}

/* Kanban View */
.kanban-view {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.kanban-column {
  display: flex;
  flex-direction: column;
  background: var(--kanban-column-bg, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  min-height: 400px;
}

.column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.column-header h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
}

.count {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  background: var(--count-bg, #ffffff);
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
}

.column-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  flex: 1;
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
.request-form {
  padding: 1.5rem;
}

.request-title-display {
  padding: 0.75rem;
  background: var(--notes-bg, #f9fafb);
  border-radius: 6px;
  margin-bottom: 1rem;
  color: var(--text-primary, #111827);
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

.form-group input:disabled,
.form-group select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
html.ion-palette-dark .tool-wishlist,
html[data-theme="dark"] .tool-wishlist {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --input-bg: #374151;
    --hover-bg: #374151;
    --btn-secondary-bg: #374151;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #4b5563;
    --kanban-column-bg: #111827;
    --count-bg: #1f2937;
    --notes-bg: #111827;
  }
</style>
