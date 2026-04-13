<template>
  <div class="dd-room-view">
    <div class="dd-header">
      <div class="dd-header-row">
        <h2>Due Diligence Room</h2>
        <ion-button
          v-if="job?.status === 'completed'"
          size="small"
          fill="outline"
          @click="addDocModalOpen = true"
        >
          Add Documents
        </ion-button>
      </div>
      <div v-if="job" class="dd-meta">
        <span class="dd-status" :class="job.status">{{ job.status }}</span>
        <span v-if="job.progress != null" class="dd-progress">
          {{ job.progress }}%
        </span>
        <span v-if="job.last_message" class="dd-message">
          {{ job.last_message }}
        </span>
      </div>
    </div>

    <!-- Incremental update banner -->
    <div
      v-if="job?.status === 'processing' && documentIndex.length > 0"
      class="incremental-banner"
    >
      <ion-icon :icon="refreshOutline" class="spin" />
      <span>
        Incremental update in progress — existing results shown below
        <template v-if="job.progress != null"> ({{ job.progress }}%)</template>
      </span>
    </div>

    <!-- Add Documents Modal -->
    <AddDocumentsModal
      :open="addDocModalOpen"
      :job-id="jobId"
      :org-slug="orgSlug"
      @close="addDocModalOpen = false"
      @queued="onAddDocumentsQueued"
    />

    <ion-segment v-model="activeTab" class="dd-tabs">
      <ion-segment-button value="documents">
        <ion-label>Document Index</ion-label>
      </ion-segment-button>
      <ion-segment-button value="risk-matrix">
        <ion-label>Risk Matrix</ion-label>
      </ion-segment-button>
      <ion-segment-button value="report">
        <ion-label>Report</ion-label>
      </ion-segment-button>
    </ion-segment>

    <div class="dd-content">
      <!-- Tab 1: Document Index -->
      <DataRoomViewer
        v-if="activeTab === 'documents'"
        :entries="documentIndex"
      />

      <!-- Tab 2: Risk Matrix -->
      <RiskMatrixComponent
        v-else-if="activeTab === 'risk-matrix' && riskMatrixData"
        :risk-matrix="riskMatrixData.riskMatrix"
        :deal-breaker-flags="riskMatrixData.dealBreakerFlags"
        :missing-documents="riskMatrixData.missingDocuments"
      />
      <div
        v-else-if="activeTab === 'risk-matrix' && !riskMatrixData"
        class="placeholder"
      >
        Awaiting synthesis... (available after all documents are analyzed and HITL Gate 1 is approved)
      </div>

      <!-- Tab 3: Report -->
      <div v-else-if="activeTab === 'report' && reportMarkdown" class="report-tab">
        <div class="report-actions">
          <ion-button size="small" fill="outline" @click="downloadReport">
            Download Report
          </ion-button>
        </div>
        <div class="report-content" v-html="renderedReport"></div>
      </div>
      <div
        v-else-if="activeTab === 'report' && !reportMarkdown"
        class="placeholder"
      >
        Awaiting report generation... (available after synthesis and HITL Gate 2 approval)
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { IonSegment, IonSegmentButton, IonLabel, IonButton, IonIcon } from '@ionic/vue';
import { refreshOutline } from 'ionicons/icons';
import DataRoomViewer, { type DocIndexEntry } from './DataRoomViewer.vue';
import RiskMatrixComponent from './RiskMatrix.vue';
import AddDocumentsModal from './AddDocumentsModal.vue';
import {
  legalJobsService,
  type AgentJobRow,
  type ObservabilityEvent,
} from '../legalJobsService';

const props = defineProps<{
  jobId: string;
  orgSlug: string;
}>();

const activeTab = ref('documents');
const job = ref<AgentJobRow | null>(null);
const documentIndex = ref<DocIndexEntry[]>([]);
const reportMarkdown = ref<string | null>(null);
const renderedReport = computed(() => {
  if (!reportMarkdown.value) return '';
  // Simple markdown rendering — just escape HTML and handle headers/bold/lists
  return reportMarkdown.value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match
        .split('|')
        .filter(Boolean)
        .map((c) => c.trim());
      return '<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>';
    });
});
const riskMatrixData = ref<{
  riskMatrix: { cells: Array<Record<string, unknown>> };
  dealBreakerFlags: Array<Record<string, unknown>>;
  missingDocuments: Array<Record<string, unknown>>;
} | null>(null);
const addDocModalOpen = ref(false);
let eventSource: EventSource | null = null;

async function onAddDocumentsQueued(_payload: {
  jobId: string;
  conversationId: string;
}): Promise<void> {
  addDocModalOpen.value = false;
  // Refresh job status — it's now processing
  await loadJob();
  // Reconnect SSE for the incremental update
  stopSSE();
  startSSE();
}

async function loadJob(): Promise<void> {
  try {
    job.value = await legalJobsService.getJob(props.jobId, props.orgSlug);
  } catch {
    // ignore
  }
}

async function loadDocumentIndex(): Promise<void> {
  try {
    const data = await legalJobsService.fetchDocumentIndex(
      props.jobId,
      props.orgSlug,
    );
    documentIndex.value = data.documentIndex as DocIndexEntry[];
  } catch {
    // ignore — graph might not have run yet
  }
}

async function loadReport(): Promise<void> {
  try {
    const data = await legalJobsService.fetchReport(
      props.jobId,
      props.orgSlug,
    );
    reportMarkdown.value = data.report;
  } catch {
    // ignore — report might not be generated yet
  }
}

function downloadReport(): void {
  if (!reportMarkdown.value) return;
  const blob = new Blob([reportMarkdown.value], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dd-report.md';
  a.click();
  URL.revokeObjectURL(url);
}

async function loadRiskMatrix(): Promise<void> {
  try {
    const data = await legalJobsService.fetchRiskMatrix(
      props.jobId,
      props.orgSlug,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    riskMatrixData.value = data as any;
  } catch {
    // ignore — synthesis might not have run yet
  }
}

function startSSE(): void {
  if (!job.value?.conversation_id) return;
  eventSource = legalJobsService.openEventStream(job.value.conversation_id);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as ObservabilityEvent;
      const step = data.step ?? '';

      // Update document index entries from SSE events
      if (
        step === 'dd:document_classified' ||
        step === 'dd:document_analysis_complete' ||
        step === 'dd:document_analysis_failed'
      ) {
        void loadDocumentIndex();
      }

      // Load risk matrix when synthesis completes
      if (step === 'dd:synthesis_complete') {
        void loadRiskMatrix();
      }

      // Load report when generated
      if (step === 'dd:report_generated') {
        void loadReport();
      }

      // Update progress info
      if (data.progress != null && job.value) {
        job.value = {
          ...job.value,
          progress: data.progress,
          last_message: data.message ?? job.value.last_message,
        };
      }
    } catch {
      // ignore parse errors
    }
  };
}

function stopSSE(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

onMounted(async () => {
  await loadJob();
  await loadDocumentIndex();
  await loadRiskMatrix();
  await loadReport();
  startSSE();
});

onUnmounted(() => {
  stopSSE();
});

watch(
  () => props.jobId,
  async () => {
    stopSSE();
    await loadJob();
    await loadDocumentIndex();
    startSSE();
  },
);
</script>

<style scoped>
.dd-room-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.dd-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--ion-color-step-100);
}
.dd-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dd-header h2 {
  margin: 0 0 4px;
  font-size: 1.1rem;
  font-weight: 600;
}

.incremental-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--ion-color-primary-tint);
  color: var(--ion-color-primary-shade);
  font-size: 0.85rem;
  border-bottom: 1px solid var(--ion-color-primary);
}
.incremental-banner .spin {
  animation: spin 1.5s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.dd-meta {
  display: flex;
  gap: 12px;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}
.dd-status {
  font-weight: 600;
  text-transform: capitalize;
}
.dd-status.completed { color: var(--ion-color-success); }
.dd-status.processing { color: var(--ion-color-primary); }
.dd-status.failed { color: var(--ion-color-danger); }
.dd-status.awaiting_review { color: var(--ion-color-warning); }

.dd-tabs {
  --background: var(--ion-color-step-50);
}

.dd-content {
  flex: 1;
  overflow: hidden;
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--ion-color-medium);
  font-size: 0.95rem;
  padding: 24px;
  text-align: center;
}

.report-tab {
  height: 100%;
  overflow: auto;
}
.report-actions {
  padding: 8px 16px;
  border-bottom: 1px solid var(--ion-color-step-100);
}
.report-content {
  padding: 16px;
  font-size: 0.9rem;
  line-height: 1.6;
}
.report-content :deep(h1) { font-size: 1.3rem; margin: 16px 0 8px; }
.report-content :deep(h2) { font-size: 1.1rem; margin: 14px 0 6px; }
.report-content :deep(h3) { font-size: 1rem; margin: 12px 0 4px; }
.report-content :deep(table) { width: 100%; border-collapse: collapse; margin: 8px 0; }
.report-content :deep(td) { border: 1px solid var(--ion-color-step-150); padding: 4px 8px; font-size: 0.85rem; }
.report-content :deep(hr) { margin: 16px 0; border: none; border-top: 1px solid var(--ion-color-step-150); }
</style>
