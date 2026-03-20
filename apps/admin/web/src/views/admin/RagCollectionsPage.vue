<template>
  <ion-page>
  <div class="detail-view">
    <div class="detail-header">
      <h2>RAG Collections</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="openCreateModal" :disabled="!selectedOrgSlug">
          <ion-icon :icon="addOutline" slot="icon-only" />
        </ion-button>
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading || !selectedOrgSlug">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <!-- Org Selector -->
      <div class="org-selector-bar">
        <ion-label>Organization:</ion-label>
        <ion-select
          :key="`org-select-${orgs.length}`"
          :value="selectedOrgSlug"
          @ionChange="onOrgChange($event)"
          placeholder="Select organization..."
          interface="popover"
        >
          <ion-select-option v-for="org in orgs" :key="org.slug" :value="org.slug">
            {{ org.name }}
          </ion-select-option>
        </ion-select>
      </div>

      <div v-if="!selectedOrgSlug" class="empty-state">
        <ion-icon :icon="businessOutline" />
        <h3>Select an Organization</h3>
        <p>Choose an organization to view and manage its RAG collections.</p>
      </div>

      <template v-else>
        <div class="stats-banner" v-if="visibleCollections.length > 0">
          <div class="stat">
            <span class="stat-value">{{ visibleCollections.length }}</span>
            <span class="stat-label">Collections</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ totalDocuments }}</span>
            <span class="stat-label">Total Documents</span>
          </div>
        </div>

        <div class="filter-bar">
          <ion-button @click="openCreateModal">
            <ion-icon :icon="addOutline" slot="start" />
            New Collection
          </ion-button>
        </div>

        <div class="table-container" v-if="!loading">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Organization</th>
                <th>Documents</th>
                <th>Description</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="col in visibleCollections"
                :key="col.id"
                class="clickable-row"
                @click="navigateToDetail(col.id)"
              >
                <td>{{ col.name }}</td>
                <td class="mono">{{ col.orgSlug }}</td>
                <td>{{ col.documentCount }}</td>
                <td>{{ col.description ? truncate(col.description, 60) : '-' }}</td>
                <td>{{ formatDate(col.createdAt) }}</td>
                <td class="actions-cell" @click.stop>
                  <ion-button fill="clear" size="small" @click="navigateToDetail(col.id)">
                    <ion-icon :icon="folderOpenOutline" slot="icon-only" />
                  </ion-button>
                  <ion-button fill="clear" size="small" color="danger" @click="confirmDelete(col)">
                    <ion-icon :icon="trashOutline" slot="icon-only" />
                  </ion-button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="empty-state" v-if="!loading && visibleCollections.length === 0">
          <ion-icon :icon="libraryOutline" />
          <h3>No RAG Collections</h3>
          <p>Create a collection to start managing documents for retrieval-augmented generation.</p>
        </div>

        <div class="loading-state" v-if="loading">
          <ion-spinner />
          <p>Loading collections...</p>
        </div>
      </template>

      <!-- Create Modal -->
      <ion-modal :is-open="showCreateModal" @didDismiss="closeCreateModal">
        <ion-header>
          <ion-toolbar>
            <ion-title>New Collection</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="closeCreateModal">Cancel</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <div class="form-container">
            <ion-item>
              <ion-label position="stacked">Name *</ion-label>
              <ion-input v-model="formData.name" placeholder="my-collection" />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Organization Slug *</ion-label>
              <ion-input v-model="formData.orgSlug" placeholder="my-org" />
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Description</ion-label>
              <ion-textarea v-model="formData.description" placeholder="Optional description..." auto-grow />
            </ion-item>
            <div class="form-actions">
              <ion-button expand="block" :disabled="!isFormValid || saving" @click="createCollection">
                {{ saving ? 'Creating...' : 'Create Collection' }}
              </ion-button>
            </div>
          </div>
        </ion-content>
      </ion-modal>

      <!-- Delete Alert -->
      <ion-alert
        :is-open="showDeleteAlert"
        header="Delete Collection"
        :message="`Delete '${collectionToDelete?.name}'? All documents will be removed. This cannot be undone.`"
        :buttons="deleteAlertButtons"
        @didDismiss="showDeleteAlert = false"
      />
    </div>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonButton,
  IonIcon,
  IonSpinner,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonTextarea,
  IonAlert,
  toastController,
  IonPage,
} from '@ionic/vue';
import {
  refreshOutline,
  addOutline,
  trashOutline,
  folderOpenOutline,
  libraryOutline,
  businessOutline,
} from 'ionicons/icons';
import { adminApiService, type RagCollection } from '@/services/admin-api.service';
import { authApiService } from '@/services/auth-api.service';
import { useRagStore } from '@/stores/rag.store';
import { useOrgsStore } from '@/stores/orgs.store';

const router = useRouter();
const store = useRagStore();
const orgsStore = useOrgsStore();

const orgs = computed(() => orgsStore.sortedOrgs);
const selectedOrgSlug = ref<string | null>(null);

const loading = ref(false);
const saving = ref(false);
const collections = ref<RagCollection[]>([]);
const showCreateModal = ref(false);
const showDeleteAlert = ref(false);
const collectionToDelete = ref<RagCollection | null>(null);

const formData = ref({ name: '', orgSlug: '', description: '' });

// Filter out rows with no name — guards against orphan records with null/missing fields
const visibleCollections = computed(() => collections.value.filter((c) => Boolean(c.name)));

const isFormValid = computed(() =>
  Boolean(formData.value.name.trim() && formData.value.orgSlug.trim()),
);

const totalDocuments = computed(() =>
  visibleCollections.value.reduce((sum, c) => sum + c.documentCount, 0),
);

const deleteAlertButtons = [
  { text: 'Cancel', role: 'cancel' },
  {
    text: 'Delete',
    role: 'destructive',
    handler: () => performDelete(),
  },
];

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();

const truncate = (text: string, max: number) =>
  text.length > max ? text.substring(0, max) + '...' : text;

const onOrgChange = (event: CustomEvent) => {
  selectedOrgSlug.value = event.detail.value;
};

watch(selectedOrgSlug, (slug) => {
  if (slug) {
    fetchData();
  } else {
    collections.value = [];
    store.setCollections([]);
  }
});

const fetchData = async () => {
  if (!selectedOrgSlug.value) return;
  loading.value = true;
  store.setLoading(true);
  store.setError(null);
  try {
    const data = await adminApiService.getRagCollections(selectedOrgSlug.value);
    collections.value = data;
    store.setCollections(data);
  } catch (_err) {
    const msg = 'Failed to load RAG collections';
    store.setError(msg);
    const toast = await toastController.create({ message: msg, duration: 3000, color: 'danger' });
    await toast.present();
  } finally {
    loading.value = false;
    store.setLoading(false);
  }
};

const openCreateModal = () => {
  formData.value = { name: '', orgSlug: selectedOrgSlug.value ?? '', description: '' };
  showCreateModal.value = true;
};

const closeCreateModal = () => {
  showCreateModal.value = false;
};

const createCollection = async () => {
  if (!isFormValid.value) return;
  saving.value = true;
  try {
    const created = await adminApiService.createRagCollection({
      name: formData.value.name,
      orgSlug: formData.value.orgSlug,
      description: formData.value.description || undefined,
    });
    store.addCollection(created);
    collections.value.push(created);
    closeCreateModal();
    const toast = await toastController.create({
      message: 'Collection created',
      duration: 2000,
      color: 'success',
    });
    await toast.present();
  } catch (_err) {
    const toast = await toastController.create({
      message: 'Failed to create collection',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    saving.value = false;
  }
};

const confirmDelete = (col: RagCollection) => {
  collectionToDelete.value = col;
  showDeleteAlert.value = true;
};

const performDelete = async () => {
  if (!collectionToDelete.value) return;
  loading.value = true;
  try {
    await adminApiService.deleteRagCollection(collectionToDelete.value.id);
    store.removeCollection(collectionToDelete.value.id);
    collections.value = collections.value.filter((c) => c.id !== collectionToDelete.value!.id);
    const toast = await toastController.create({
      message: 'Collection deleted',
      duration: 2000,
      color: 'success',
    });
    await toast.present();
  } catch (_err) {
    const toast = await toastController.create({
      message: 'Failed to delete collection',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loading.value = false;
    collectionToDelete.value = null;
  }
};

const navigateToDetail = (id: string) => {
  router.push(`/app/admin/rag/${id}`);
};

onMounted(async () => {
  // Load orgs only when the store is empty.
  // Use the statically-imported authApiService — do NOT use a dynamic import
  // here; under Vite HMR, dynamic re-imports of the same module can yield a
  // second singleton instance, causing the store to receive a write from a
  // stale reference and triggering Ionic's ion-select to render options twice.
  if (orgsStore.orgs.length === 0) {
    try {
      const list = await authApiService.listOrgs();
      orgsStore.setOrgs(list);
    } catch (err) {
      console.error('Failed to load orgs for RAG collections:', err);
    }
  }
});
</script>

<style scoped>
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

.stats-banner {
  display: flex;
  gap: 1.5rem;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #6a1b9a 0%, #4a148c 100%);
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

.org-selector-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--ion-color-light);
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border: 1px solid var(--ion-color-light-shade);
}

.org-selector-bar ion-label {
  font-weight: 600;
  white-space: nowrap;
  color: var(--dark-text-muted, #555);
}

.org-selector-bar ion-select {
  flex: 1;
  --placeholder-color: var(--ion-color-medium);
}

.filter-bar {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

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
  background: var(--ion-color-light-tint);
}

.mono {
  font-family: monospace;
  font-size: 0.85rem;
}

.actions-cell {
  display: flex;
  gap: 0.25rem;
}

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

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: var(--dark-text-muted, #888);
}

.form-container {
  padding: 0.5rem;
}

.form-container ion-item {
  margin-bottom: 0.5rem;
}

.form-actions {
  margin-top: 1.5rem;
}
</style>
