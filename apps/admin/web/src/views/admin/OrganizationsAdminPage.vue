<template>
  <div class="detail-view">
    <!-- Detail Header -->
    <div class="detail-header">
      <h2>Organizations</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="openCreateModal">
          <ion-icon :icon="addOutline" slot="icon-only" />
        </ion-button>
        <ion-button fill="clear" size="small" @click="refreshData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <!-- Stats Banner -->
      <div class="stats-banner">
        <div class="stat">
          <span class="stat-value">{{ organizations.length }}</span>
          <span class="stat-label">Total Organizations</span>
        </div>
      </div>

      <!-- Search Bar and Actions -->
      <div class="filter-bar">
        <ion-searchbar
          v-model="searchQuery"
          placeholder="Search organizations..."
          @ionInput="applyFilters"
          :debounce="300"
        />
        <ion-button @click="openCreateModal">
          <ion-icon :icon="addOutline" slot="start" />
          New Organization
        </ion-button>
      </div>

      <!-- Organizations Table -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Slug</th>
              <th>Name</th>
              <th>Description</th>
              <th>URL</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="org in filteredOrganizations"
              :key="org.slug"
              @click="openDetailModal(org)"
              class="clickable-row"
            >
              <td class="mono">{{ org.slug }}</td>
              <td>{{ org.name }}</td>
              <td>{{ truncateText(org.description, 50) }}</td>
              <td>
                <a v-if="org.url" :href="org.url" target="_blank" @click.stop>{{ truncateText(org.url, 30) }}</a>
                <span v-else class="muted">-</span>
              </td>
              <td>{{ formatDateTime(org.created_at) }}</td>
              <td class="actions-cell" @click.stop>
                <ion-button fill="clear" size="small" @click="openEditModal(org)">
                  <ion-icon :icon="createOutline" slot="icon-only" />
                </ion-button>
                <ion-button fill="clear" size="small" color="danger" @click="confirmDelete(org)">
                  <ion-icon :icon="trashOutline" slot="icon-only" />
                </ion-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="empty-state" v-if="!loading && filteredOrganizations.length === 0">
        <ion-icon :icon="businessOutline" />
        <h3>No Organizations Found</h3>
        <p v-if="searchQuery">Try adjusting your search</p>
        <p v-else>Click the + button to create your first organization</p>
      </div>

      <!-- Create/Edit Modal -->
      <ion-modal :is-open="showFormModal" @didDismiss="closeFormModal">
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ editingOrg ? 'Edit Organization' : 'Create Organization' }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="closeFormModal">Cancel</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <div class="form-container">
            <ion-item v-if="!editingOrg">
              <ion-label position="stacked">Slug *</ion-label>
              <ion-input
                v-model="formData.slug"
                placeholder="my-organization"
                :disabled="!!editingOrg"
              />
            </ion-item>
            <p class="hint" v-if="!editingOrg">Unique identifier, cannot be changed later</p>

            <ion-item>
              <ion-label position="stacked">Name *</ion-label>
              <ion-input v-model="formData.name" placeholder="My Organization" />
            </ion-item>

            <ion-item>
              <ion-label position="stacked">Description</ion-label>
              <ion-textarea v-model="formData.description" placeholder="Optional description..." auto-grow />
            </ion-item>

            <ion-item>
              <ion-label position="stacked">URL</ion-label>
              <ion-input v-model="formData.url" placeholder="https://example.com" type="url" />
            </ion-item>

            <div class="form-actions">
              <ion-button expand="block" :disabled="!isFormValid || saving" @click="saveOrganization">
                {{ saving ? 'Saving...' : (editingOrg ? 'Update' : 'Create') }}
              </ion-button>
            </div>
          </div>
        </ion-content>
      </ion-modal>

      <!-- Detail Modal -->
      <ion-modal :is-open="showDetailModal" @didDismiss="closeDetailModal">
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ selectedOrg?.name }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="closeDetailModal">Close</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding" v-if="selectedOrg">
          <div class="org-detail">
            <div class="detail-section">
              <h4>Basic Information</h4>
              <div class="detail-row">
                <span class="detail-label">Slug</span>
                <span class="detail-value mono">{{ selectedOrg.slug }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Name</span>
                <span class="detail-value">{{ selectedOrg.name }}</span>
              </div>
              <div class="detail-row" v-if="selectedOrg.description">
                <span class="detail-label">Description</span>
                <span class="detail-value">{{ selectedOrg.description }}</span>
              </div>
              <div class="detail-row" v-if="selectedOrg.url">
                <span class="detail-label">URL</span>
                <a :href="selectedOrg.url" target="_blank" class="detail-value">{{ selectedOrg.url }}</a>
              </div>
            </div>

            <div class="detail-section" v-if="selectedOrg.settings && Object.keys(selectedOrg.settings).length > 0">
              <h4>Settings</h4>
              <pre class="settings-json">{{ JSON.stringify(selectedOrg.settings, null, 2) }}</pre>
            </div>

            <div class="detail-section">
              <h4>Timestamps</h4>
              <div class="detail-row">
                <span class="detail-label">Created</span>
                <span class="detail-value">{{ formatDateTime(selectedOrg.created_at) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Updated</span>
                <span class="detail-value">{{ formatDateTime(selectedOrg.updated_at) }}</span>
              </div>
            </div>

            <div class="detail-actions">
              <ion-button expand="block" @click="openEditFromDetail">Edit Organization</ion-button>
            </div>
          </div>
        </ion-content>
      </ion-modal>

      <!-- Delete Confirmation -->
      <ion-alert
        :is-open="showDeleteAlert"
        header="Delete Organization"
        :message="`Are you sure you want to delete '${orgToDelete?.name}'? This action cannot be undone.`"
        :buttons="deleteAlertButtons"
        @didDismiss="showDeleteAlert = false"
      />

      <ion-loading :is-open="loading" message="Loading organizations..." />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonSearchbar,
  IonModal,
  IonLoading,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonAlert,
  toastController,
} from '@ionic/vue';
import {
  refreshOutline,
  addOutline,
  createOutline,
  trashOutline,
  businessOutline,
} from 'ionicons/icons';
import { apiService } from '@/services/apiService';

interface Organization {
  slug: string;
  name: string;
  description?: string;
  url?: string;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// State
const loading = ref(false);
const saving = ref(false);
const organizations = ref<Organization[]>([]);
const searchQuery = ref('');
const showFormModal = ref(false);
const showDetailModal = ref(false);
const showDeleteAlert = ref(false);
const selectedOrg = ref<Organization | null>(null);
const editingOrg = ref<Organization | null>(null);
const orgToDelete = ref<Organization | null>(null);

const formData = ref({
  slug: '',
  name: '',
  description: '',
  url: '',
});

// Computed
const filteredOrganizations = computed(() => {
  if (!searchQuery.value) return organizations.value;

  const query = searchQuery.value.toLowerCase();
  return organizations.value.filter(org =>
    org.name.toLowerCase().includes(query) ||
    org.slug.toLowerCase().includes(query) ||
    org.description?.toLowerCase().includes(query)
  );
});

const isFormValid = computed(() => {
  if (editingOrg.value) {
    return Boolean(formData.value.name.trim());
  }
  return Boolean(formData.value.slug.trim() && formData.value.name.trim());
});

const deleteAlertButtons = [
  {
    text: 'Cancel',
    role: 'cancel',
  },
  {
    text: 'Delete',
    role: 'destructive',
    handler: () => {
      performDelete();
    },
  },
];

// Data fetching
const fetchOrganizations = async () => {
  loading.value = true;
  try {
    const response = await apiService.get('/admin/organizations');
    organizations.value = (response as Organization[]) || [];
  } catch (error) {
    console.error('Failed to fetch organizations:', error);
    organizations.value = [];
    const toast = await toastController.create({
      message: 'Failed to load organizations',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loading.value = false;
  }
};

const refreshData = () => {
  fetchOrganizations();
};

const applyFilters = () => {
  // Filters are applied via computed property
};

// Modal actions
const openCreateModal = () => {
  editingOrg.value = null;
  formData.value = {
    slug: '',
    name: '',
    description: '',
    url: '',
  };
  showFormModal.value = true;
};

const openEditModal = (org: Organization) => {
  editingOrg.value = org;
  formData.value = {
    slug: org.slug,
    name: org.name,
    description: org.description || '',
    url: org.url || '',
  };
  showFormModal.value = true;
};

const openDetailModal = (org: Organization) => {
  selectedOrg.value = org;
  showDetailModal.value = true;
};

const closeFormModal = () => {
  showFormModal.value = false;
  editingOrg.value = null;
};

const closeDetailModal = () => {
  showDetailModal.value = false;
  selectedOrg.value = null;
};

const openEditFromDetail = () => {
  if (selectedOrg.value) {
    closeDetailModal();
    openEditModal(selectedOrg.value);
  }
};

// CRUD operations
const saveOrganization = async () => {
  if (!isFormValid.value) return;

  saving.value = true;
  try {
    if (editingOrg.value) {
      // Update
      await apiService.put(`/admin/organizations/${editingOrg.value.slug}`, {
        name: formData.value.name,
        description: formData.value.description || null,
        url: formData.value.url || null,
      });
      const toast = await toastController.create({
        message: 'Organization updated successfully',
        duration: 2000,
        color: 'success',
      });
      await toast.present();
    } else {
      // Create
      await apiService.post('/admin/organizations', {
        slug: formData.value.slug,
        name: formData.value.name,
        description: formData.value.description || null,
        url: formData.value.url || null,
      });
      const toast = await toastController.create({
        message: 'Organization created successfully',
        duration: 2000,
        color: 'success',
      });
      await toast.present();
    }
    closeFormModal();
    await fetchOrganizations();
  } catch (error: unknown) {
    console.error('Failed to save organization:', error);
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    const message = err?.response?.data?.message || err?.message || 'Failed to save organization';
    const toast = await toastController.create({
      message,
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    saving.value = false;
  }
};

const confirmDelete = (org: Organization) => {
  orgToDelete.value = org;
  showDeleteAlert.value = true;
};

const performDelete = async () => {
  if (!orgToDelete.value) return;

  loading.value = true;
  try {
    await apiService.delete(`/admin/organizations/${orgToDelete.value.slug}`);
    const toast = await toastController.create({
      message: 'Organization deleted successfully',
      duration: 2000,
      color: 'success',
    });
    await toast.present();
    await fetchOrganizations();
  } catch (error: unknown) {
    console.error('Failed to delete organization:', error);
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    const message = err?.response?.data?.message || err?.message || 'Failed to delete organization';
    const toast = await toastController.create({
      message,
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loading.value = false;
    orgToDelete.value = null;
  }
};

// Helpers
const truncateText = (text: string | undefined, maxLength: number) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return 'Unknown';
  return new Date(dateStr).toLocaleString();
};

onMounted(() => {
  fetchOrganizations();
});
</script>

<style scoped>
/* Detail View Container */
.detail-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  background: var(--ion-toolbar-background, var(--ion-color-light));
}

.detail-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.header-actions {
  display: flex;
  gap: 0.25rem;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

/* Stats Banner */
.stats-banner {
  display: flex;
  gap: 1.5rem;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #a16c4a 0%, #6d4428 100%);
  border-radius: 10px;
  margin-bottom: 1.5rem;
  color: white;
}

.stats-banner .stat {
  text-align: center;
}

.stats-banner .stat-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 700;
}

.stats-banner .stat-label {
  font-size: 0.8rem;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Filter Bar */
.filter-bar {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.5rem;
}

.filter-bar ion-searchbar {
  flex: 1;
  --background: var(--ion-item-background, white);
  --border-radius: 8px;
  --color: var(--ion-text-color);
}

.filter-bar ion-button {
  --border-radius: 8px;
  height: 44px;
}

/* Table Styles */
.table-container {
  background: var(--ion-card-background, white);
  border-radius: 10px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: var(--ion-toolbar-background, var(--ion-color-light));
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  font-size: 0.9rem;
  color: var(--ion-text-color);
}

.data-table tr:last-child td {
  border-bottom: none;
}

.clickable-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.clickable-row:hover {
  background: var(--ion-color-step-50, var(--ion-color-light-tint));
}

.mono {
  font-family: monospace;
  font-size: 0.85rem;
}

.muted {
  color: var(--dark-text-muted, #999);
}

.actions-cell {
  display: flex;
  gap: 0.25rem;
}

.actions-cell ion-button {
  --padding-start: 0.25rem;
  --padding-end: 0.25rem;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--dark-text-muted, #888);
}

.empty-state ion-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: var(--ion-color-medium);
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: var(--ion-text-color, #555);
}

/* Form Styles */
.form-container {
  padding: 0.5rem;
}

.form-container ion-item {
  margin-bottom: 0.5rem;
}

.hint {
  font-size: 0.8rem;
  color: var(--dark-text-muted, #888);
  margin: 0.25rem 0 1rem 1rem;
}

.form-actions {
  margin-top: 1.5rem;
}

/* Detail Modal Styles */
.org-detail {
  padding: 0.5rem;
}

.detail-section {
  margin-bottom: 1.5rem;
}

.detail-section h4 {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  font-weight: 500;
  color: var(--dark-text-muted, #666);
}

.detail-value {
  color: var(--ion-text-color, #333);
}

.detail-value.mono {
  font-family: monospace;
  font-size: 0.9rem;
}

.settings-json {
  background: var(--ion-color-light);
  padding: 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  overflow-x: auto;
  margin: 0;
}

.detail-actions {
  margin-top: 1.5rem;
}

@media (max-width: 768px) {
  .table-container {
    overflow-x: auto;
  }

  .data-table {
    min-width: 600px;
  }

  .stats-banner {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
