<template>
  <div class="batch-panel">
    <!-- Batch header -->
    <div class="batch-header">
      <div class="batch-meta">
        <span class="batch-type-badge" :class="batch.batchType">
          {{ batchTypeLabel }}
        </span>
        <span class="batch-count">{{ batch.documentIds.length }} documents</span>
      </div>

      <div class="batch-stats-bar">
        <span class="stat">
          Approved: <strong>{{ approvedCount }}</strong>
        </span>
        <span class="stat">
          Corrected: <strong>{{ correctedCount }}</strong>
        </span>
        <span class="stat" v-if="flaggedCount > 0">
          Flagged: <strong class="flag">{{ flaggedCount }}</strong>
        </span>
        <span class="stat remaining">
          Remaining: <strong>{{ remainingCount }}</strong>
        </span>
      </div>
    </div>

    <!-- Document table -->
    <div class="batch-table">
      <div class="table-header">
        <span class="col-name">Name</span>
        <span class="col-type">Type</span>
        <span class="col-rel">Relevance</span>
        <span class="col-priv">Privilege</span>
        <span class="col-actions">Decision</span>
      </div>

      <div
        v-for="docId in batch.documentIds"
        :key="docId"
        class="doc-section"
      >
        <!-- Row header -->
        <div class="batch-doc-row" @click="toggleExpand(docId)">
          <ion-icon
            :icon="expandedDocs.has(docId) ? chevronDownOutline : chevronForwardOutline"
            class="chevron"
          />
          <span class="col-name doc-name">{{ docName(docId) }}</span>
          <span class="col-type">{{ docCoding(docId)?.relevance?.classification ? docType(docId) : '—' }}</span>
          <span class="col-rel" :class="docCoding(docId)?.relevance?.classification">
            {{ docCoding(docId)?.relevance?.classification ?? '—' }}
          </span>
          <span class="col-priv" :class="privClass(docCoding(docId)?.privilege?.classification)">
            {{ docCoding(docId)?.privilege?.classification ?? '—' }}
          </span>
          <span class="col-actions">
            <span v-if="decisions[docId]" class="decision-chip" :class="decisions[docId]?.action">
              {{ decisions[docId]?.action }}
              <span v-if="decisions[docId]?.flagSeniorReview" class="flag-icon">⚑</span>
            </span>
            <span v-else class="decision-pending">—</span>
          </span>
        </div>

        <!-- Expanded row: reasoning + decision controls -->
        <div v-if="expandedDocs.has(docId)" class="doc-detail">
          <div v-if="docCoding(docId)" class="coding-summary">
            <div class="coding-row">
              <strong>Relevance:</strong>
              {{ docCoding(docId)!.relevance.classification }}
              ({{ Math.round((docCoding(docId)!.relevance.confidence ?? 0) * 100) }}%)
              — {{ docCoding(docId)!.relevance.reasoning }}
            </div>
            <div class="coding-row">
              <strong>Privilege:</strong>
              {{ docCoding(docId)!.privilege.classification }}
              ({{ Math.round((docCoding(docId)!.privilege.confidence ?? 0) * 100) }}%)
              — {{ docCoding(docId)!.privilege.reasoning }}
            </div>
            <div v-if="docCoding(docId)!.issueTags?.length" class="coding-row">
              <strong>Issues:</strong>
              {{ (docCoding(docId)!.issueTags ?? []).map(t => `${t.tagId} (${Math.round((t.confidence ?? 0) * 100)}%)`).join(', ') }}
            </div>
          </div>

          <!-- Decision buttons -->
          <div class="decision-controls">
            <ion-button
              size="small"
              :color="decisions[docId]?.action === 'approve' ? 'success' : 'medium'"
              @click="setDecision(docId, 'approve')"
            >
              Approve
            </ion-button>
            <ion-button
              size="small"
              :color="decisions[docId]?.action === 'correct' ? 'warning' : 'medium'"
              @click="setDecision(docId, 'correct')"
            >
              Correct
            </ion-button>
            <ion-button
              size="small"
              :color="decisions[docId]?.flagSeniorReview ? 'danger' : 'medium'"
              @click="toggleFlag(docId)"
            >
              {{ decisions[docId]?.flagSeniorReview ? '⚑ Flagged' : 'Flag Senior' }}
            </ion-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Batch-level actions -->
    <div class="batch-actions">
      <ion-button
        color="medium"
        :disabled="isPrivilegeBatch"
        :title="isPrivilegeBatch ? 'Privilege batches require per-document review' : undefined"
        @click="approveRemaining"
      >
        Approve Remaining
      </ion-button>

      <ion-button
        color="primary"
        :disabled="!canSubmit"
        @click="submitBatch"
      >
        Submit Batch
      </ion-button>

      <div v-if="isPrivilegeBatch" class="privilege-notice">
        Privilege batch — each document must be individually reviewed.
      </div>

      <div v-if="submitError" class="submit-error">{{ submitError }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IonButton, IonIcon } from '@ionic/vue';
import { chevronDownOutline, chevronForwardOutline } from 'ionicons/icons';
import { legalJobsService, type ExecutionContextLike } from '../legalJobsService';

interface ReviewBatch {
  batchId: string;
  batchType: 'privilege' | 'low_confidence_relevance' | 'hot_documents' | 'random_sample';
  documentIds: string[];
  status: string;
}

interface DocumentCodingLike {
  relevance: { classification: string; confidence?: number; reasoning?: string };
  privilege: { classification: string; confidence?: number; reasoning?: string };
  issueTags?: Array<{ tagId: string; confidence?: number }>;
  hotDocument?: boolean;
}

interface DocIndexEntry {
  documentId: string;
  name: string;
  documentType?: string;
}

interface BatchDocDecision {
  action: 'approve' | 'correct';
  flagSeniorReview?: boolean;
}

const props = defineProps<{
  batch: ReviewBatch;
  documentCodings: Record<string, DocumentCodingLike>;
  documentIndex: DocIndexEntry[];
  jobId: string;
  context: ExecutionContextLike;
}>();

const emit = defineEmits<{
  (e: 'reviewed'): void;
}>();

const expandedDocs = ref<Set<string>>(new Set());
const decisions = ref<Record<string, BatchDocDecision>>({});
const submitError = ref<string | null>(null);
const submitting = ref(false);

const isPrivilegeBatch = computed(() => props.batch.batchType === 'privilege');

const batchTypeLabel = computed(() => {
  switch (props.batch.batchType) {
    case 'privilege': return 'Privilege Review';
    case 'low_confidence_relevance': return 'Low-Confidence Relevance';
    case 'hot_documents': return 'Hot Documents';
    case 'random_sample': return 'Random Sample';
    default: return props.batch.batchType;
  }
});

const approvedCount = computed(() =>
  Object.values(decisions.value).filter(d => d.action === 'approve').length,
);
const correctedCount = computed(() =>
  Object.values(decisions.value).filter(d => d.action === 'correct').length,
);
const flaggedCount = computed(() =>
  Object.values(decisions.value).filter(d => d.flagSeniorReview).length,
);
const remainingCount = computed(() =>
  props.batch.documentIds.filter(id => !decisions.value[id]).length,
);

// All docs must have a decision unless approve_remaining is used (non-privilege only)
const canSubmit = computed(() => {
  if (submitting.value) return false;
  // For privilege batch: every doc must have a decision
  if (isPrivilegeBatch.value) {
    return props.batch.documentIds.every(id => !!decisions.value[id]);
  }
  // For non-privilege: at least one decision OR approve_remaining intent is indicated
  return props.batch.documentIds.some(id => !!decisions.value[id]) || remainingCount.value === 0;
});

function docCoding(docId: string): DocumentCodingLike | undefined {
  return props.documentCodings[docId];
}

function docName(docId: string): string {
  return props.documentIndex.find(e => e.documentId === docId)?.name ?? docId;
}

function docType(docId: string): string {
  return props.documentIndex.find(e => e.documentId === docId)?.documentType ?? '—';
}

function privClass(classification?: string): string {
  if (!classification) return '';
  if (classification === 'privileged') return 'privileged';
  if (classification === 'potentially_privileged') return 'potentially_privileged';
  return 'not_privileged';
}

function toggleExpand(docId: string): void {
  if (expandedDocs.value.has(docId)) {
    expandedDocs.value.delete(docId);
  } else {
    expandedDocs.value.add(docId);
  }
}

function setDecision(docId: string, action: 'approve' | 'correct'): void {
  decisions.value = {
    ...decisions.value,
    [docId]: { ...(decisions.value[docId] ?? {}), action },
  };
}

function toggleFlag(docId: string): void {
  const current = decisions.value[docId];
  decisions.value = {
    ...decisions.value,
    [docId]: {
      action: current?.action ?? 'approve',
      flagSeniorReview: !current?.flagSeniorReview,
    },
  };
}

function approveRemaining(): void {
  if (isPrivilegeBatch.value) return;
  const updated = { ...decisions.value };
  for (const docId of props.batch.documentIds) {
    if (!updated[docId]) {
      updated[docId] = { action: 'approve' };
    }
  }
  decisions.value = updated;
}

async function submitBatch(): Promise<void> {
  submitError.value = null;
  submitting.value = true;
  try {
    const documentDecisions = props.batch.documentIds
      .filter(id => !!decisions.value[id])
      .map(id => ({
        documentId: id,
        action: decisions.value[id]!.action,
        flagSeniorReview: decisions.value[id]!.flagSeniorReview,
      }));

    const allDecided = remainingCount.value === 0;
    const useApproveRemaining = !isPrivilegeBatch.value && !allDecided;

    await legalJobsService.review(props.jobId, props.context, {
      decision: 'batch_review',
      batchId: props.batch.batchId,
      documentDecisions,
      approveRemaining: useApproveRemaining || undefined,
    } as Parameters<typeof legalJobsService.review>[2]);

    emit('reviewed');
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.batch-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.batch-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.batch-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.batch-type-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--ion-color-medium);
  color: white;
}

.batch-type-badge.privilege { background: var(--ion-color-danger); }
.batch-type-badge.low_confidence_relevance { background: var(--ion-color-warning); color: #000; }
.batch-type-badge.hot_documents { background: var(--ion-color-primary); }
.batch-type-badge.random_sample { background: var(--ion-color-medium); }

.batch-count { font-size: 13px; color: var(--ion-color-medium); }

.batch-stats-bar {
  display: flex;
  gap: 16px;
  font-size: 13px;
}

.stat { color: var(--ion-color-medium); }
.stat strong { color: var(--ion-text-color); }
.stat.remaining strong { color: var(--ion-color-primary); }
.flag { color: var(--ion-color-danger) !important; }

.batch-table { border: 1px solid var(--ion-color-light); border-radius: 6px; overflow: hidden; }

.table-header {
  display: grid;
  grid-template-columns: 2fr 100px 130px 160px 120px;
  padding: 8px 12px;
  background: var(--ion-color-light);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ion-color-medium);
}

.batch-doc-row {
  display: grid;
  grid-template-columns: 24px 2fr 100px 130px 160px 120px;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  border-top: 1px solid var(--ion-color-light);
  font-size: 13px;
  transition: background 0.1s;
}

.batch-doc-row:hover { background: rgba(var(--ion-color-primary-rgb), 0.04); }

.chevron { font-size: 14px; color: var(--ion-color-medium); }

.col-name { font-family: monospace; font-size: 12px; }
.col-rel, .col-priv { font-size: 12px; font-weight: 500; }

.col-rel.relevant { color: var(--ion-color-success); }
.col-rel.not_relevant { color: var(--ion-color-medium); }
.col-rel.potentially_relevant { color: var(--ion-color-warning); }

.col-priv.privileged { color: var(--ion-color-danger); }
.col-priv.potentially_privileged { color: var(--ion-color-warning); }
.col-priv.not_privileged { color: var(--ion-color-success); }

.decision-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
}

.decision-chip.approve { background: rgba(var(--ion-color-success-rgb), 0.15); color: var(--ion-color-success); }
.decision-chip.correct { background: rgba(var(--ion-color-warning-rgb), 0.15); color: var(--ion-color-warning); }
.flag-icon { margin-left: 4px; }
.decision-pending { color: var(--ion-color-medium); font-size: 12px; }

.doc-detail {
  padding: 12px 16px 12px 36px;
  background: rgba(var(--ion-color-primary-rgb), 0.03);
  border-top: 1px dashed var(--ion-color-light);
}

.coding-summary { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }

.coding-row {
  font-size: 12px;
  color: var(--ion-color-medium);
  line-height: 1.5;
}

.coding-row strong { color: var(--ion-text-color); }

.decision-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.batch-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--ion-color-light);
}

.privilege-notice {
  font-size: 12px;
  color: var(--ion-color-danger);
  margin-left: auto;
}

.submit-error {
  font-size: 12px;
  color: var(--ion-color-danger);
}
</style>
