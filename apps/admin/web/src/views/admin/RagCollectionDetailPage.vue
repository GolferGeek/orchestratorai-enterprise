<template>
  <ion-page>
  <div class="detail-view">
    <div class="detail-header">
      <div class="header-left">
        <ion-button fill="clear" size="small" @click="goBack">
          <ion-icon :icon="arrowBackOutline" slot="icon-only" />
        </ion-button>
        <h2>{{ collection?.name ?? 'Collection' }}</h2>
      </div>
      <div class="header-actions">
        <ion-button size="small" @click="showUploadModal = true" :disabled="!collection">
          <ion-icon :icon="cloudUploadOutline" slot="start" />
          Upload
        </ion-button>
        <ion-button fill="clear" size="small" @click="loadAll" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <!-- Collection Info Card -->
      <div class="collection-info" v-if="collection">
        <div class="info-header">
          <div>
            <div class="info-name">{{ collection.name }}</div>
            <div class="info-slug mono">{{ collection.slug }}</div>
            <div v-if="collection.description" class="info-desc">{{ collection.description }}</div>
          </div>
          <span :class="['status-badge', `status-${collection.status}`]">{{ collection.status }}</span>
        </div>
        <div class="info-stats">
          <div class="stat-item">
            <span class="stat-value">{{ collection.documentCount }}</span>
            <span class="stat-label">Documents</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ collection.chunkCount ?? 0 }}</span>
            <span class="stat-label">Chunks</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ formatTokens(collection.totalTokens ?? 0) }}</span>
            <span class="stat-label">Tokens</span>
          </div>
          <div class="stat-item">
            <span class="stat-value mono small">{{ collection.embeddingModel || '-' }}</span>
            <span class="stat-label">Embedding Model</span>
          </div>
          <div class="stat-item">
            <span :class="['complexity-badge', `complexity-${collection.complexityType}`]">
              {{ complexityLabel(collection.complexityType) }}
            </span>
            <span class="stat-label">Complexity</span>
          </div>
        </div>
      </div>

      <!-- Documents Section -->
      <div class="documents-section">
        <h3>Documents</h3>

        <div class="table-container" v-if="!documentsLoading && documents.length > 0">
          <table class="data-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Type</th>
                <th>Size</th>
                <th>Chunks</th>
                <th>Tokens</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="doc in documents" :key="doc.id">
                <td>{{ doc.filename }}</td>
                <td class="mono small">{{ doc.contentType }}</td>
                <td>{{ formatFileSize(doc.sizeBytes) }}</td>
                <td>{{ doc.chunkCount ?? '-' }}</td>
                <td>{{ doc.tokenCount ?? '-' }}</td>
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

        <div class="empty-state" v-if="!documentsLoading && documents.length === 0">
          <ion-icon :icon="documentOutline" />
          <h3>No Documents</h3>
          <p>Upload files to add documents to this collection.</p>
        </div>

        <div class="loading-state" v-if="documentsLoading">
          <ion-spinner />
          <p>Loading documents...</p>
        </div>
      </div>

      <!-- Upload Modal -->
      <ion-modal :is-open="showUploadModal" @didDismiss="closeUploadModal">
        <ion-header>
          <ion-toolbar>
            <ion-title>Upload Documents</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="closeUploadModal" :disabled="uploading">Close</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <div class="upload-tabs">
            <button
              :class="['tab-btn', { active: uploadTab === 'files' }]"
              @click="uploadTab = 'files'"
            >Files</button>
            <button
              :class="['tab-btn', { active: uploadTab === 'folder' }]"
              @click="uploadTab = 'folder'"
            >Folder</button>
          </div>

          <!-- Files Tab -->
          <div v-if="uploadTab === 'files'" class="tab-content">
            <div
              class="drop-zone"
              :class="{ 'drop-zone--active': isDragging }"
              @click="fileInputRef?.click()"
              @dragover.prevent="isDragging = true"
              @dragleave="isDragging = false"
              @drop.prevent="handleFileDrop"
            >
              <ion-icon :icon="cloudUploadOutline" class="drop-icon" />
              <p>Click or drag files here</p>
              <p class="drop-hint">Accepts .pdf, .docx, .doc, .txt, .md</p>
              <input
                ref="fileInputRef"
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.md"
                style="display: none"
                @change="handleFileSelect"
              />
            </div>

            <div class="selected-files" v-if="selectedFiles.length > 0">
              <div class="selected-files-header">
                <span>{{ selectedFiles.length }} file(s) selected</span>
                <ion-button fill="clear" size="small" color="medium" @click="selectedFiles = []">
                  Clear all
                </ion-button>
              </div>
              <div v-for="(file, i) in selectedFiles" :key="i" class="file-item">
                <ion-icon :icon="documentOutline" />
                <span class="file-name">{{ file.name }}</span>
                <span class="file-size">{{ formatFileSize(file.size) }}</span>
                <ion-button fill="clear" size="small" color="medium" @click="removeSelectedFile(i)">
                  <ion-icon :icon="closeOutline" slot="icon-only" />
                </ion-button>
              </div>
            </div>

            <div v-if="uploading" class="upload-progress">
              <ion-spinner />
              <span>Uploading {{ uploadProgressCurrent }} of {{ selectedFiles.length }}...</span>
            </div>

            <ion-button
              expand="block"
              :disabled="selectedFiles.length === 0 || uploading"
              @click="uploadFiles"
              class="upload-btn"
            >
              Upload {{ selectedFiles.length > 0 ? selectedFiles.length + ' File(s)' : '' }}
            </ion-button>
          </div>

          <!-- Folder Tab -->
          <div v-if="uploadTab === 'folder'" class="tab-content">
            <div class="folder-select-area">
              <ion-button @click="folderInputRef?.click()">
                <ion-icon :icon="folderOpenOutline" slot="start" />
                Select Folder
              </ion-button>
              <input
                ref="folderInputRef"
                type="file"
                :webkitdirectory="true"
                style="display: none"
                @change="handleFolderSelect"
              />
              <span v-if="folderFiles.length > 0" class="folder-count">
                {{ folderFiles.length }} files found
              </span>
            </div>

            <FolderTreeSelector
              v-if="folderFiles.length > 0"
              :files="folderFiles"
              :batch-upload-items="store.batchUploadItems"
              @update:selected-files="onFolderSelectionChange"
            />

            <div v-if="store.batchUploadActive" class="batch-progress">
              <div class="batch-progress-bar">
                <div
                  class="batch-progress-fill"
                  :style="{ width: batchProgressPercent + '%' }"
                />
              </div>
              <div class="batch-progress-info">
                <span>{{ store.batchUploadProgress.current }} / {{ store.batchUploadProgress.total }}</span>
                <span class="batch-current-file">{{ store.batchUploadProgress.currentFile }}</span>
              </div>
              <div class="batch-results">
                <span class="result-success">{{ store.batchUploadResults.success }} succeeded</span>
                <span class="result-failed" v-if="store.batchUploadResults.failed > 0">
                  {{ store.batchUploadResults.failed }} failed
                </span>
              </div>
              <ion-button fill="outline" color="medium" size="small" @click="cancelProcessing">
                Cancel
              </ion-button>
            </div>

            <div v-if="!store.batchUploadActive && store.batchUploadResults.success + store.batchUploadResults.failed > 0" class="batch-done">
              <span class="result-success">{{ store.batchUploadResults.success }} uploaded</span>
              <span v-if="store.batchUploadResults.failed > 0" class="result-failed">
                {{ store.batchUploadResults.failed }} failed
              </span>
              <ion-button fill="clear" size="small" @click="store.clearBatchUpload(); folderFiles = []; selectedFolderFiles = []">
                Clear
              </ion-button>
            </div>

            <ion-button
              v-if="folderFiles.length > 0 && !store.batchUploadActive"
              expand="block"
              :disabled="selectedFolderFiles.length === 0"
              @click="uploadFolderFiles"
              class="upload-btn"
            >
              Upload {{ selectedFolderFiles.length > 0 ? selectedFolderFiles.length + ' File(s)' : '' }}
            </ion-button>
          </div>
        </ion-content>
      </ion-modal>

      <!-- Delete Document Alert -->
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
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonButton,
  IonIcon,
  IonSpinner,
  IonAlert,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  toastController,
  IonPage,
} from '@ionic/vue';
import {
  refreshOutline,
  arrowBackOutline,
  trashOutline,
  cloudUploadOutline,
  documentOutline,
  folderOpenOutline,
  closeOutline,
} from 'ionicons/icons';
import { adminApiService, type RagCollection, type RagDocument } from '@/services/admin-api.service';
import { useRagStore } from '@/stores/rag.store';
import FolderTreeSelector from '@/components/rag/FolderTreeSelector.vue';

const route = useRoute();
const router = useRouter();
const store = useRagStore();

const collectionId = route.params.id as string;

const collection = ref<RagCollection | null>(null);
const documents = ref<RagDocument[]>([]);
const loading = ref(false);
const documentsLoading = ref(false);

// Upload Modal
const showUploadModal = ref(false);
const uploadTab = ref<'files' | 'folder'>('files');
const isDragging = ref(false);
const uploading = ref(false);
const uploadProgressCurrent = ref(0);
const selectedFiles = ref<File[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);

// Folder upload
const folderFiles = ref<File[]>([]);
const selectedFolderFiles = ref<File[]>([]);
const folderInputRef = ref<HTMLInputElement | null>(null);

// Delete
const showDeleteAlert = ref(false);
const documentToDelete = ref<RagDocument | null>(null);

const deleteAlertButtons = [
  { text: 'Cancel', role: 'cancel' },
  {
    text: 'Delete',
    role: 'destructive',
    handler: () => performDeleteDocument(),
  },
];

const batchProgressPercent = computed(() => {
  const { current, total } = store.batchUploadProgress;
  if (total === 0) return 0;
  return Math.round((current / total) * 100);
});

const complexityLabel = (type: string) => {
  const labels: Record<string, string> = {
    basic: 'Basic',
    attributed: 'Attributed',
    hybrid: 'Hybrid',
    'cross-reference': 'Cross-Ref',
    temporal: 'Temporal',
  };
  return labels[type] ?? type;
};

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const loadCollection = async () => {
  loading.value = true;
  try {
    const col = await adminApiService.getRagCollection(collectionId);
    collection.value = col;
    store.setCurrentCollection(col);
  } catch (_err) {
    const toast = await toastController.create({
      message: 'Failed to load collection',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loading.value = false;
  }
};

const loadDocuments = async () => {
  documentsLoading.value = true;
  store.setDocumentsLoading(true);
  try {
    const docs = await adminApiService.getRagCollectionDocuments(collectionId);
    documents.value = docs;
    store.setDocuments(docs);
  } catch (_err) {
    const toast = await toastController.create({
      message: 'Failed to load documents',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    documentsLoading.value = false;
    store.setDocumentsLoading(false);
  }
};

const loadAll = async () => {
  await Promise.all([loadCollection(), loadDocuments()]);
};

const closeUploadModal = () => {
  if (uploading.value || store.batchUploadActive) return;
  showUploadModal.value = false;
  selectedFiles.value = [];
  folderFiles.value = [];
  selectedFolderFiles.value = [];
  store.clearBatchUpload();
  uploadTab.value = 'files';
};

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    selectedFiles.value = [...selectedFiles.value, ...Array.from(input.files)];
    input.value = '';
  }
};

const handleFileDrop = (event: DragEvent) => {
  isDragging.value = false;
  const files = event.dataTransfer?.files;
  if (files) {
    selectedFiles.value = [...selectedFiles.value, ...Array.from(files)];
  }
};

const removeSelectedFile = (index: number) => {
  selectedFiles.value = selectedFiles.value.filter((_, i) => i !== index);
};

const uploadFiles = async () => {
  if (selectedFiles.value.length === 0) return;
  uploading.value = true;
  uploadProgressCurrent.value = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const file of selectedFiles.value) {
    try {
      const response = await adminApiService.uploadRagDocument(collectionId, file);
      // Reload documents to get the actual document record
      uploadProgressCurrent.value++;
      successCount++;
      // Store the upload response id so we can update state
      void response;
    } catch (_err) {
      errorCount++;
    }
  }

  uploading.value = false;
  selectedFiles.value = [];

  if (successCount > 0) {
    await loadDocuments();
    if (collection.value) await loadCollection();
    const toast = await toastController.create({
      message: `${successCount} file(s) uploaded`,
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

const handleFolderSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    folderFiles.value = Array.from(input.files);
    selectedFolderFiles.value = Array.from(input.files);
  }
};

const onFolderSelectionChange = (files: File[]) => {
  selectedFolderFiles.value = files;
};

const uploadFolderFiles = async () => {
  if (selectedFolderFiles.value.length === 0) return;

  const items = selectedFolderFiles.value.map((f) => ({
    path: (f as File & { webkitRelativePath: string }).webkitRelativePath || f.name,
    name: f.name,
    status: 'pending' as const,
  }));

  store.initBatchUpload(items);

  for (let i = 0; i < selectedFolderFiles.value.length; i++) {
    if (store.batchUploadCancelled) break;

    const file = selectedFolderFiles.value[i];
    const path = (file as File & { webkitRelativePath: string }).webkitRelativePath || file.name;

    store.updateBatchUploadItem(path, 'processing');
    store.updateBatchUploadProgress(i + 1, file.name);

    try {
      await adminApiService.uploadRagDocument(collectionId, file);
      store.updateBatchUploadItem(path, 'success');
      store.incrementBatchUploadResult(true);
    } catch (_err) {
      store.updateBatchUploadItem(path, 'error', 'Upload failed');
      store.incrementBatchUploadResult(false);
    }
  }

  store.finishBatchUpload();

  if (store.batchUploadResults.success > 0) {
    await loadDocuments();
    if (collection.value) await loadCollection();
  }
};

const cancelProcessing = () => {
  store.cancelBatchUpload();
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
  loadAll();
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
  align-items: center;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

/* Collection Info Card */
.collection-info {
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.info-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color);
}

.info-slug {
  font-size: 0.85rem;
  color: var(--dark-text-muted, #888);
  margin-top: 0.15rem;
}

.info-desc {
  font-size: 0.9rem;
  color: var(--dark-text-muted, #666);
  margin-top: 0.25rem;
}

.info-stats {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--ion-text-color);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-top: 0.15rem;
}

/* Documents Section */
.documents-section {
  margin-bottom: 1.5rem;
}

.documents-section h3 {
  margin: 0 0 1rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
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
}

.small {
  font-size: 0.85rem;
}

.actions-cell {
  display: flex;
  gap: 0.25rem;
}

/* Status Badges */
.status-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: capitalize;
}

.status-active {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.status-completed {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.status-pending {
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
}

.status-processing {
  background: rgba(59, 130, 246, 0.15);
  color: #2563eb;
}

.status-error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* Complexity Badges */
.complexity-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.complexity-basic {
  background: rgba(99, 102, 241, 0.12);
  color: #6366f1;
}

.complexity-attributed {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.complexity-hybrid {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
}

.complexity-cross-reference {
  background: rgba(236, 72, 153, 0.12);
  color: #db2777;
}

.complexity-temporal {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

/* Empty / Loading States */
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

/* Upload Modal */
.upload-tabs {
  display: flex;
  border-bottom: 2px solid var(--ion-color-light-shade);
  margin-bottom: 1.5rem;
}

.tab-btn {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.95rem;
  color: var(--dark-text-muted, #888);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.15s, border-color 0.15s;
}

.tab-btn.active {
  color: var(--ion-color-primary);
  border-bottom-color: var(--ion-color-primary);
  font-weight: 600;
}

.tab-content {
  padding: 0 0.25rem;
}

.drop-zone {
  border: 2px dashed var(--ion-color-medium);
  border-radius: 8px;
  padding: 2.5rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 1rem;
}

.drop-zone--active {
  border-color: var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.05);
}

.drop-zone:hover {
  border-color: var(--ion-color-primary);
}

.drop-icon {
  font-size: 2.5rem;
  color: var(--ion-color-medium);
  display: block;
  margin-bottom: 0.5rem;
}

.drop-zone p {
  margin: 0.25rem 0;
  color: var(--dark-text-muted, #777);
}

.drop-hint {
  font-size: 0.8rem;
  color: var(--ion-color-medium) !important;
}

.selected-files {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.selected-files-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: var(--ion-color-light);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--dark-text-muted, #555);
}

.file-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--ion-color-light-shade);
  font-size: 0.9rem;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 0.8rem;
  color: var(--dark-text-muted, #888);
  white-space: nowrap;
}

.upload-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  color: var(--dark-text-muted, #555);
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.upload-btn {
  margin-top: 0.5rem;
}

/* Folder Upload */
.folder-select-area {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.folder-count {
  font-size: 0.9rem;
  color: var(--dark-text-muted, #555);
}

/* Batch Progress */
.batch-progress {
  background: var(--ion-color-light);
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
}

.batch-progress-bar {
  height: 8px;
  background: var(--ion-color-light-shade);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.batch-progress-fill {
  height: 100%;
  background: var(--ion-color-primary);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.batch-progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--dark-text-muted, #555);
  margin-bottom: 0.5rem;
}

.batch-current-file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}

.batch-results {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.batch-done {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: var(--ion-color-light);
  border-radius: 8px;
  margin: 1rem 0;
  font-size: 0.9rem;
}

.result-success {
  color: #10b981;
  font-weight: 600;
}

.result-failed {
  color: #ef4444;
  font-weight: 600;
}
</style>
