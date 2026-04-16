<template>
  <div class="dd-room-view">
    <div class="dd-header">
      <div class="dd-header-row">
        <h2>Due Diligence Room</h2>
        <div v-if="job?.status === 'completed'" class="dd-header-actions">
          <ion-button
            size="small"
            fill="outline"
            @click="addDocModalOpen = true"
          >
            Add Documents
          </ion-button>
          <ion-button
            v-if="context"
            size="small"
            color="primary"
            @click="generateMemoModalOpen = true"
          >
            Generate Deal Memo
          </ion-button>
        </div>
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

    <!-- Generate Deal Memo Modal -->
    <GenerateDealMemoModal
      :open="generateMemoModalOpen"
      :parent-job-id="jobId"
      :context="context ?? null"
      @close="generateMemoModalOpen = false"
      @queued="onMemoQueued"
    />

    <!-- Deal Memos panel — list any prior memos drafted from this room -->
    <DealMemosPanel
      v-if="job?.status === 'completed'"
      :parent-job-id="jobId"
      :org-slug="orgSlug"
      :refresh-token="memosPanelRefresh"
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

      <!-- Tab 2: Risk Matrix + Financial Findings -->
      <template v-if="activeTab === 'risk-matrix'">
        <RiskMatrixComponent
          v-if="riskMatrixData"
          :risk-matrix="riskMatrixData.riskMatrix"
          :deal-breaker-flags="riskMatrixData.dealBreakerFlags"
          :missing-documents="riskMatrixData.missingDocuments"
        />
        <FinancialFindingsPanel
          v-if="riskMatrixData"
          :running-findings="riskMatrixData.runningFindings ?? {}"
          :per-document-outputs="riskMatrixData.perDocumentOutputs ?? {}"
          :document-index="documentIndex"
        />
        <div v-if="!riskMatrixData" class="placeholder">
          Awaiting synthesis... (available after all documents are analyzed and HITL Gate 1 is approved)
        </div>
      </template>

      <!-- Tab 3: Report -->
      <div v-else-if="activeTab === 'report' && reportMarkdown" class="report-tab">
        <div class="report-actions">
          <ion-button size="small" fill="outline" @click="downloadReport">
            Download Report
          </ion-button>
        </div>
        <ReportMarkdown class="report-content" :markdown="reportMarkdown" />
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
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { IonSegment, IonSegmentButton, IonLabel, IonButton, IonIcon } from '@ionic/vue';
import { refreshOutline } from 'ionicons/icons';
import DataRoomViewer, { type DocIndexEntry } from './DataRoomViewer.vue';
import RiskMatrixComponent, {
  type RiskMatrixCell,
  type DealBreakerFlagType,
  type MissingDocumentType,
} from './RiskMatrix.vue';
import AddDocumentsModal from './AddDocumentsModal.vue';
import GenerateDealMemoModal from './GenerateDealMemoModal.vue';
import DealMemosPanel from './DealMemosPanel.vue';
import ReportMarkdown from './ReportMarkdown.vue';
import FinancialFindingsPanel from './FinancialFindingsPanel.vue';
import {
  legalJobsService,
  type AgentJobRow,
  type ExecutionContextLike,
  type ObservabilityEvent,
} from '../legalJobsService';

const props = defineProps<{
  jobId: string;
  orgSlug: string;
  context?: ExecutionContextLike | null;
}>();

const router = useRouter();

const activeTab = ref('documents');
const job = ref<AgentJobRow | null>(null);
const documentIndex = ref<DocIndexEntry[]>([]);
const reportMarkdown = ref<string | null>(null);
const riskMatrixData = ref<{
  riskMatrix: { cells: RiskMatrixCell[] };
  dealBreakerFlags: DealBreakerFlagType[];
  missingDocuments: MissingDocumentType[];
  runningFindings?: Record<string, unknown>;
  perDocumentOutputs?: Record<string, unknown>;
} | null>(null);
const addDocModalOpen = ref(false);
const generateMemoModalOpen = ref(false);
const memosPanelRefresh = ref(0);
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

async function onMemoQueued(payload: {
  jobId: string;
  conversationId: string;
  status: string;
}): Promise<void> {
  generateMemoModalOpen.value = false;
  // Bump the panel refresh token so the listing reloads to include the new memo
  memosPanelRefresh.value += 1;
  // Navigate to the new memo workspace
  await router.push(
    `/forge/agents/legal-department/dd/${encodeURIComponent(props.jobId)}/memo/${encodeURIComponent(payload.jobId)}`,
  );
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
    documentIndex.value = data.documentIndex as unknown as DocIndexEntry[];
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
.dd-header-actions {
  display: flex;
  gap: 8px;
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
