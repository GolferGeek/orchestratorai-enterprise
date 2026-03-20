<template>
  <ion-page>
  <div class="detail-view">
    <div class="detail-header">
      <div class="header-left">
        <ion-button fill="clear" size="small" @click="goBack">
          <ion-icon :icon="arrowBackOutline" slot="icon-only" />
        </ion-button>
        <h2>{{ collectionName }}</h2>
      </div>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <!-- Upload Area -->
      <div class="upload-card">
        <div class="upload-area" @click="triggerFileInput" @dragover.prevent @drop.prevent="handleDrop">
          <ion-icon :icon="cloudUploadOutline" />
          <p>Click to upload or drag and drop files here</p>
          <input
            ref="fileInputRef"
            type="file"
            multiple
            style="display: none"
            @change="handleFileSelect"
          />
        </div>
        <div v-if="uploading" class="upload-progress">
          <ion-spinner />
          <span>Uploading...</span>
        </div>
      </div>

      <!-- Documents Table -->
      <div class="table-container" v-if="!loading">
        <table class="data-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Type</th>
              <th>Size</th>
              <th>Status</th>
              <th>Uploaded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="doc in documents" :key="doc.id">
              <td>{{ doc.filename }}</td>
              <td class="mono">{{ doc.contentType }}</td>
              <td>{{ formatSize(doc.sizeBytes) }}</td>
              <td>
                <span :class="['status-badge', `status-${doc.status}`]">{{ doc.status }}</span>
              </td>
              <td>{{ formatDate(doc.createdAt) }}</td>
              <td class="actions-cell">
                <ion-button
                  fill="clear"
                  size="small"
                  color="danger"
                  @click="confirmDeleteDocument(doc)"
                >
                  <ion-icon :icon="trashOutline" slot="icon-only" />
                </ion-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="empty-state" v-if="!loading && documents.length === 0">
        <ion-icon :icon="documentOutline" />
        <h3>No Documents</h3>
        <p>Upload files to add documents to this collection.</p>
      </div>

      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Loading documents...</p>
      </div>

      <!-- Delete Alert -->
      <ion-alert
        :is-open="showDeleteAlert"
        header="Delete Document"
        :message="`Delete '${documentToDelete?.filename}'? This cannot be undone.`"
        :buttons="deleteAlertButtons"
        @didDismiss="showDeleteAlert = false"
      />
    </div>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonButton,
  IonIcon,
  IonSpinner,
  IonAlert,
  toastController,
  IonPage,
} from '@ionic/vue';
import {
  refreshOutline,
  arrowBackOutline,
  trashOutline,
  cloudUploadOutline,
  documentOutline,
} from 'ionicons/icons';
import { adminApiService, type RagDocument } from '@/services/admin-api.service';
import { useRagStore } from '@/stores/rag.store';

const route = useRoute();
const router = useRouter();
const store = useRagStore();

const collectionId = route.params.id as string;
const collectionName = ref('Collection');
const loading = ref(false);
const uploading = ref(false);
const documents = ref<RagDocument[]>([]);
const showDeleteAlert = ref(false);
const documentToDelete = ref<RagDocument | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const deleteAlertButtons = [
  { text: 'Cancel', role: 'cancel' },
  {
    text: 'Delete',
    role: 'destructive',
    handler: () => performDeleteDocument(),
  },
];

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fetchData = async () => {
  loading.value = true;
  store.setLoading(true);
  try {
    const docs = await adminApiService.getRagCollectionDocuments(collectionId);
    documents.value = docs;
    store.setDocuments(docs);
    // Resolve collection name from store
    const col = store.collections.find((c) => c.id === collectionId);
    if (col) collectionName.value = col.name;
  } catch (_err) {
    const toast = await toastController.create({
      message: 'Failed to load documents',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loading.value = false;
    store.setLoading(false);
  }
};

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    uploadFiles(Array.from(input.files));
  }
};

const handleDrop = (event: DragEvent) => {
  const files = event.dataTransfer?.files;
  if (files) {
    uploadFiles(Array.from(files));
  }
};

const uploadFiles = async (files: File[]) => {
  if (files.length === 0) return;
  uploading.value = true;
  let successCount = 0;
  let errorCount = 0;
  for (const file of files) {
    try {
      const doc = await adminApiService.uploadRagDocument(collectionId, file);
      documents.value.push(doc);
      store.addDocument(doc);
      successCount++;
    } catch (_err) {
      errorCount++;
    }
  }
  uploading.value = false;
  if (successCount > 0) {
    const toast = await toastController.create({
      message: `${successCount} file(s) uploaded successfully`,
      duration: 2000,
      color: 'success',
    });
    await toast.present();
  }
  if (errorCount > 0) {
    const toast = await toastController.create({
      message: `${errorCount} file(s) failed to upload`,
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  }
};

const confirmDeleteDocument = (doc: RagDocument) => {
  documentToDelete.value = doc;
  showDeleteAlert.value = true;
};

const performDeleteDocument = async () => {
  if (!documentToDelete.value) return;
  try {
    await adminApiService.deleteRagDocument(collectionId, documentToDelete.value.id);
    store.removeDocument(documentToDelete.value.id);
    documents.value = documents.value.filter((d) => d.id !== documentToDelete.value!.id);
    const toast = await toastController.create({
      message: 'Document deleted',
      duration: 2000,
      color: 'success',
    });
    await toast.present();
  } catch (_err) {
    const toast = await toastController.create({
      message: 'Failed to delete document',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    documentToDelete.value = null;
  }
};

const goBack = () => {
  router.push('/app/admin/rag');
};

onMounted(() => {
  fetchData();
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

.header-left {
  display: flex;
  align-items: center;
  gap: 0.25rem;
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

.upload-card {
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.upload-area {
  border: 2px dashed var(--ion-color-medium);
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.upload-area:hover {
  border-color: var(--ion-color-primary);
}

.upload-area ion-icon {
  font-size: 2.5rem;
  color: var(--ion-color-medium);
  display: block;
  margin-bottom: 0.5rem;
}

.upload-area p {
  margin: 0;
  color: var(--dark-text-muted, #777);
  font-size: 0.9rem;
}

.upload-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  color: var(--dark-text-muted, #555);
  font-size: 0.9rem;
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

.mono {
  font-family: monospace;
  font-size: 0.85rem;
}

.actions-cell {
  display: flex;
  gap: 0.25rem;
}

.status-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.status-ready {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.status-pending {
  background: rgba(245, 127, 23, 0.15);
  color: #f57f17;
}

.status-processing {
  background: rgba(59, 130, 246, 0.15);
  color: var(--ion-color-primary, #2c4a7c);
}

.status-error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
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
</style>
