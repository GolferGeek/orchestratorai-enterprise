<template>
  <div class="portfolios-component">
    <!-- Header Section -->
    <div class="section-header">
      <h3>Trading Portfolios</h3>
      <p>Manage instrument portfolios for predictions and recommendations</p>
    </div>

    <!-- Stats Overview -->
    <div class="stats-section">
      <div class="stat-card">
        <div class="stat-value">{{ financeStore.universes.length }}</div>
        <div class="stat-label">Portfolios</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalInstruments }}</div>
        <div class="stat-label">Instruments</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalRecommendations }}</div>
        <div class="stat-label">Recommendations</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ winRate.toFixed(1) }}%</div>
        <div class="stat-label">Win Rate</div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading portfolios...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">⚠</span>
      <p>{{ error }}</p>
      <button class="action-btn" @click="loadUniverses">Retry</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="!financeStore.hasUniverses" class="empty-state">
      <span class="empty-icon">📁</span>
      <h4>No Portfolios Yet</h4>
      <p>Create your first portfolio to start tracking instruments</p>
      <button class="action-btn primary" @click="openCreateModal">
        Create Portfolio
      </button>
    </div>

    <!-- Portfolios List -->
    <div v-else class="portfolios-list">
      <div class="list-header">
        <h4>Your Portfolios</h4>
        <button class="action-btn primary" @click="openCreateModal">
          + New Portfolio
        </button>
      </div>

      <div
        v-for="universe in financeStore.universes"
        :key="universe.id"
        class="portfolio-card"
      >
        <div class="portfolio-header">
          <div class="portfolio-info">
            <h5>{{ universe.name }}</h5>
            <span class="portfolio-slug">{{ universe.slug }}</span>
          </div>
          <div class="portfolio-actions">
            <button class="icon-btn" @click="selectUniverse(universe)" title="Settings">
              ⚙️
            </button>
            <button class="icon-btn danger" @click="confirmDeleteUniverse(universe)" title="Delete">
              🗑️
            </button>
          </div>
        </div>
        <p v-if="universe.description" class="portfolio-description">
          {{ universe.description }}
        </p>
        <div class="portfolio-stats">
          <span v-if="getActiveVersion(universe.id)" class="version-badge">
            v{{ getActiveVersion(universe.id)?.version }}
          </span>
          <span class="instrument-count">
            {{ getInstrumentCount(universe.id) }} instruments
          </span>
        </div>
      </div>
    </div>

    <!-- Create Portfolio Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
      <div class="modal-content">
        <div class="modal-header">
          <h4>Create Portfolio</h4>
          <button class="close-btn" @click="closeCreateModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Name *</label>
            <input
              v-model="newUniverse.name"
              type="text"
              placeholder="e.g., US Tech Stocks"
            />
          </div>
          <div class="form-group">
            <label>Slug (optional)</label>
            <input
              v-model="newUniverse.slug"
              type="text"
              placeholder="e.g., us-tech-stocks"
            />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea
              v-model="newUniverse.description"
              placeholder="Describe this portfolio..."
              rows="3"
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="action-btn" @click="closeCreateModal">Cancel</button>
          <button
            class="action-btn primary"
            @click="createUniverse"
            :disabled="!newUniverse.name"
          >
            Create
          </button>
        </div>
      </div>
    </div>

    <!-- Portfolio Detail Modal -->
    <div v-if="showDetailModal" class="modal-overlay" @click.self="closeDetailModal">
      <div class="modal-content large">
        <div class="modal-header">
          <h4>{{ selectedUniverse?.name }}</h4>
          <button class="close-btn" @click="closeDetailModal">×</button>
        </div>
        <div class="modal-body" v-if="selectedUniverse">
          <div class="versions-section">
            <h5>Versions</h5>
            <div v-if="universeVersions.length === 0" class="empty-versions">
              <p>No versions yet. Create your first version to add instruments.</p>
            </div>
            <div v-else class="versions-list">
              <div
                v-for="version in universeVersions"
                :key="version.id"
                class="version-card"
                :class="{ active: version.isActive }"
              >
                <div class="version-header">
                  <span class="version-title">Version {{ version.version }}</span>
                  <span v-if="version.isActive" class="active-badge">Active</span>
                  <button
                    v-else
                    class="action-btn small"
                    @click="activateVersion(version)"
                  >
                    Set Active
                  </button>
                </div>
                <div class="instruments-grid">
                  <span
                    v-for="inst in version.config.instruments"
                    :key="inst.symbol"
                    class="instrument-chip"
                  >
                    {{ inst.symbol }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="new-version-section">
            <h5>Create New Version</h5>
            <div class="form-group">
              <label>Instruments (comma-separated symbols)</label>
              <textarea
                v-model="newVersionInstruments"
                placeholder="AAPL, MSFT, GOOGL, AMZN"
                rows="2"
              ></textarea>
            </div>
            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" v-model="newVersionSetActive" />
                Set as active version
              </label>
            </div>
            <button
              class="action-btn primary"
              @click="createVersion"
              :disabled="!newVersionInstruments"
            >
              Create Version
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal-content small">
        <div class="modal-header">
          <h4>Delete Portfolio</h4>
          <button class="close-btn" @click="cancelDelete">×</button>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete '{{ universeToDelete?.name }}'?</p>
          <p class="warning-text">This will also delete all versions and recommendations.</p>
        </div>
        <div class="modal-footer">
          <button class="action-btn" @click="cancelDelete">Cancel</button>
          <button class="action-btn danger" @click="deleteUniverse">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useFinanceStore } from '@/stores/financeStore';
import { financeService } from '@/services/financeService';
import type { Universe, UniverseVersion } from '@/services/financeService';

const financeStore = useFinanceStore();

// State
const loading = ref(false);
const error = ref<string | null>(null);
const showCreateModal = ref(false);
const showDetailModal = ref(false);
const showDeleteConfirm = ref(false);
const selectedUniverse = ref<Universe | null>(null);
const universeToDelete = ref<Universe | null>(null);
const universeVersions = ref<UniverseVersion[]>([]);

const newUniverse = ref({
  name: '',
  slug: '',
  description: '',
});

const newVersionInstruments = ref('');
const newVersionSetActive = ref(true);

// Computed
const totalInstruments = computed(() => {
  return financeStore.activeVersionInstrumentCount;
});

const totalRecommendations = computed(() => {
  return financeStore.recommendationsWithOutcomes.length;
});

const winRate = computed(() => {
  return financeStore.overallWinRate;
});

// Methods
function openCreateModal() {
  newUniverse.value = { name: '', slug: '', description: '' };
  showCreateModal.value = true;
}

function closeCreateModal() {
  showCreateModal.value = false;
}

function closeDetailModal() {
  showDetailModal.value = false;
  selectedUniverse.value = null;
}

async function loadUniverses() {
  loading.value = true;
  error.value = null;
  try {
    financeStore.setUniversesLoading(true);
    financeStore.setUniversesError(null);
    const universes = await financeService.getUniverses();
    financeStore.setUniverses(universes);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load portfolios';
    financeStore.setUniversesError(error.value);
  } finally {
    loading.value = false;
    financeStore.setUniversesLoading(false);
  }
}

async function createUniverse() {
  try {
    const universe = await financeService.createUniverse(newUniverse.value);
    financeStore.addUniverse(universe);
    closeCreateModal();
  } catch (err) {
    console.error('Failed to create portfolio:', err);
  }
}

async function selectUniverse(universe: Universe) {
  selectedUniverse.value = universe;
  try {
    universeVersions.value = await financeService.getUniverseVersions(universe.id);
  } catch (err) {
    console.error('Failed to load versions:', err);
    universeVersions.value = [];
  }
  showDetailModal.value = true;
}

function confirmDeleteUniverse(universe: Universe) {
  universeToDelete.value = universe;
  showDeleteConfirm.value = true;
}

function cancelDelete() {
  showDeleteConfirm.value = false;
  universeToDelete.value = null;
}

async function deleteUniverse() {
  if (!universeToDelete.value) return;

  try {
    await financeService.deleteUniverse(universeToDelete.value.id);
    financeStore.removeUniverse(universeToDelete.value.id);
    showDeleteConfirm.value = false;
    universeToDelete.value = null;
  } catch (err) {
    console.error('Failed to delete portfolio:', err);
  }
}

async function activateVersion(version: UniverseVersion) {
  if (!selectedUniverse.value) return;

  try {
    await financeService.setActiveVersion(selectedUniverse.value.id, version.id);
    universeVersions.value = await financeService.getUniverseVersions(selectedUniverse.value.id);
    financeStore.setActiveVersion(version.id);
  } catch (err) {
    console.error('Failed to activate version:', err);
  }
}

async function createVersion() {
  if (!selectedUniverse.value || !newVersionInstruments.value) return;

  const symbols = newVersionInstruments.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const instruments = symbols.map(symbol => ({
    symbol,
    name: symbol,
    type: 'stock' as const,
  }));

  try {
    await financeService.createUniverseVersion(selectedUniverse.value.id, {
      config: { instruments },
      setActive: newVersionSetActive.value,
    });
    universeVersions.value = await financeService.getUniverseVersions(selectedUniverse.value.id);
    newVersionInstruments.value = '';
  } catch (err) {
    console.error('Failed to create version:', err);
  }
}

function getActiveVersion(_universeId: string): UniverseVersion | undefined {
  return undefined;
}

function getInstrumentCount(_universeId: string): number {
  return 0;
}

// Lifecycle
onMounted(async () => {
  await loadUniverses();
});
</script>

<style scoped>
.portfolios-component {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-header {
  margin-bottom: 0.5rem;
}

.section-header h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.section-header p {
  margin: 0;
  color: #6b7280;
}

.stats-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
}

.stat-card {
  padding: 1rem;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  text-align: center;
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
  letter-spacing: 0.05em;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  text-align: center;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid #e5e7eb;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon,
.empty-icon {
  font-size: 2rem;
}

.action-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: #ffffff;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: #f3f4f6;
}

.action-btn.primary {
  background: #15803d;
  border-color: #15803d;
  color: white;
}

.action-btn.primary:hover {
  background: #166534;
}

.action-btn.danger {
  background: #ef4444;
  border-color: #ef4444;
  color: white;
}

.action-btn.danger:hover {
  background: #dc2626;
}

.action-btn.small {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.list-header h4 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.portfolios-list {
  display: flex;
  flex-direction: column;
}

.portfolio-card {
  padding: 1rem;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
}

.portfolio-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.portfolio-info h5 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}

.portfolio-slug {
  font-size: 0.75rem;
  color: #6b7280;
}

.portfolio-actions {
  display: flex;
  gap: 0.25rem;
}

.icon-btn {
  padding: 0.25rem 0.5rem;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 1rem;
}

.icon-btn:hover {
  background: #f3f4f6;
}

.icon-btn.danger:hover {
  background: #fef2f2;
}

.portfolio-description {
  margin: 0.5rem 0;
  font-size: 0.875rem;
  color: #6b7280;
}

.portfolio-stats {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.version-badge {
  padding: 0.125rem 0.5rem;
  background: #10b981;
  color: white;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.instrument-count {
  padding: 0.125rem 0.5rem;
  background: #15803d;
  color: white;
  border-radius: 9999px;
  font-size: 0.75rem;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 0.5rem;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content.large {
  max-width: 700px;
}

.modal-content.small {
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h4 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6b7280;
}

.modal-body {
  padding: 1rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: auto;
}

.versions-section h5,
.new-version-section h5 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}

.new-version-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.empty-versions {
  padding: 1.5rem;
  text-align: center;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 0.375rem;
}

.versions-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.version-card {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
}

.version-card.active {
  border-left: 4px solid #10b981;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.version-title {
  font-weight: 600;
  color: #111827;
}

.active-badge {
  padding: 0.125rem 0.5rem;
  background: #10b981;
  color: white;
  border-radius: 9999px;
  font-size: 0.75rem;
}

.instruments-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.instrument-chip {
  padding: 0.125rem 0.5rem;
  background: #f3f4f6;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  color: #374151;
}

.warning-text {
  color: #dc2626;
  font-size: 0.875rem;
}
</style>
