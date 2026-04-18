<template>
  <div class="documents-tab">
    <div class="upload-row">
      <input
        ref="fileInputRef"
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        style="display: none"
        @change="onFileSelected"
      />
      <ion-button :disabled="uploading || !context" @click="fileInputRef?.click()">
        <ion-icon :icon="cloudUploadOutline" slot="start" />
        {{ uploading ? 'Uploading...' : 'Upload Document' }}
      </ion-button>
      <span v-if="uploadError" class="upload-error">{{ uploadError }}</span>
    </div>

    <div v-if="loading" class="loading-state">
      <ion-spinner />
    </div>

    <div v-else-if="documents.length === 0" class="empty-state">
      <ion-icon :icon="documentOutline" size="large" color="medium" />
      <p>No documents yet. Upload a document to begin.</p>
    </div>

    <ion-list v-else>
      <ion-item-group v-for="doc in documents" :key="doc.id">
        <ion-item button @click="toggleExpand(doc.id)">
          <ion-label>
            <h3>{{ doc.original_name }}</h3>
            <p>
              <ion-badge
                v-if="doc.document_class"
                :color="classColor(doc.document_class)"
              >{{ doc.document_class }}</ion-badge>
              <span v-if="doc.document_date"> · {{ doc.document_date }}</span>
              <span v-if="doc.parties.length"> · {{ doc.parties.slice(0, 2).join(', ') }}</span>
            </p>
            <p v-if="doc.summary" class="doc-summary">{{ doc.summary }}</p>
          </ion-label>
          <div slot="end" class="processing-status">
            <ion-spinner v-if="!doc.facts_processed || !doc.docs_processed" name="dots" />
            <ion-icon
              v-else
              :icon="checkmarkCircleOutline"
              color="success"
            />
          </div>
        </ion-item>

        <div v-if="expandedId === doc.id" class="doc-detail">
          <div v-if="doc.key_terms.length" class="detail-section">
            <h4>Key Terms</h4>
            <div class="term-chips">
              <ion-chip v-for="term in doc.key_terms" :key="term" outline>{{ term }}</ion-chip>
            </div>
          </div>
          <div v-if="doc.parties.length" class="detail-section">
            <h4>Parties</h4>
            <p>{{ doc.parties.join(', ') }}</p>
          </div>
        </div>
      </ion-item-group>
    </ion-list>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import {
  IonSpinner, IonIcon, IonButton, IonList, IonItem, IonItemGroup,
  IonLabel, IonBadge, IonChip,
} from '@ionic/vue';
import {
  cloudUploadOutline, documentOutline, checkmarkCircleOutline,
} from 'ionicons/icons';
import { legalJobsService, type MatterDocumentRow } from '../legalJobsService';

const props = defineProps<{
  matterId: string;
  orgSlug: string;
  context: {
    orgSlug: string;
    userId: string;
    conversationId: string;
    agentSlug: string;
    agentType: string;
    provider: string;
    model: string;
  } | null;
}>();

const emit = defineEmits<{ updated: [] }>();

const documents = ref<MatterDocumentRow[]>([]);
const loading = ref(false);
const uploading = ref(false);
const uploadError = ref<string | null>(null);
const expandedId = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

function hasProcessingDocs(): boolean {
  return documents.value.some((d) => !d.facts_processed || !d.docs_processed);
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (!hasProcessingDocs()) {
      stopPolling();
      return;
    }
    void load();
  }, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function load() {
  try {
    documents.value = await legalJobsService.getMatterDocuments(
      props.matterId,
      props.orgSlug,
    );
    if (hasProcessingDocs()) {
      startPolling();
    } else {
      stopPolling();
    }
    emit('updated');
  } catch {
    // keep previous data on poll error
  }
}

async function initialLoad() {
  loading.value = true;
  try {
    await load();
  } finally {
    loading.value = false;
  }
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !props.context) return;

  uploading.value = true;
  uploadError.value = null;
  try {
    await legalJobsService.uploadMatterDocument(
      props.matterId,
      props.context,
      file,
    );
    input.value = '';
    await load();
  } catch (e) {
    uploadError.value = e instanceof Error ? e.message : 'Upload failed';
  } finally {
    uploading.value = false;
  }
}

function toggleExpand(docId: string) {
  expandedId.value = expandedId.value === docId ? null : docId;
}

function classColor(docClass: string): string {
  const colors: Record<string, string> = {
    contract: 'primary',
    deposition: 'warning',
    court_filing: 'danger',
    correspondence: 'secondary',
    evidence: 'tertiary',
    other: 'medium',
  };
  return colors[docClass] ?? 'medium';
}

defineExpose({ load });
onMounted(initialLoad);
onUnmounted(stopPolling);
</script>

<style scoped>
.documents-tab {
  padding: 16px;
}

.upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.upload-error {
  color: var(--ion-color-danger);
  font-size: 0.875rem;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  text-align: center;
  color: var(--ion-color-medium);
}

.processing-status {
  display: flex;
  align-items: center;
}

.doc-summary {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

.doc-detail {
  padding: 12px 16px;
  background: var(--ion-color-light);
  border-left: 3px solid var(--ion-color-primary);
}

.detail-section {
  margin-bottom: 12px;
}

.detail-section h4 {
  margin: 0 0 4px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ion-color-medium);
  text-transform: uppercase;
}

.term-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
