<template>
  <div class="dr-view">
    <!-- Header -->
    <div class="dr-header">
      <div class="dr-title-group">
        <h2>Discovery Document Review</h2>
        <span v-if="job" class="dr-status" :class="job.status">{{ job.status }}</span>
      </div>
      <div v-if="job" class="dr-meta">
        <span v-if="job.progress != null" class="dr-progress">{{ job.progress }}%</span>
        <span v-if="job.last_message" class="dr-message">{{ job.last_message }}</span>
      </div>
    </div>

    <!-- Progress bar while processing -->
    <div v-if="isProcessing" class="dr-progress-bar-wrap">
      <div class="dr-progress-bar" :style="{ width: `${job?.progress ?? 0}%` }" />
    </div>

    <!-- Tab bar -->
    <ion-segment v-model="activeTab" class="dr-tabs">
      <ion-segment-button value="overview">
        <ion-label>Overview</ion-label>
      </ion-segment-button>
      <ion-segment-button value="documents" :disabled="!hasCodings">
        <ion-label>Documents</ion-label>
      </ion-segment-button>
      <ion-segment-button value="privilege-log" disabled>
        <ion-label>Privilege Log</ion-label>
      </ion-segment-button>
      <ion-segment-button value="production" disabled>
        <ion-label>Production Set</ion-label>
      </ion-segment-button>
      <ion-segment-button value="report" disabled>
        <ion-label>Report</ion-label>
      </ion-segment-button>
    </ion-segment>

    <div class="dr-content">
      <!-- Tab 1: Overview -->
      <div v-if="activeTab === 'overview'" class="overview-tab">

        <!-- Matter information -->
        <div v-if="reviewProtocol" class="dr-card matter-card">
          <h3>Matter</h3>
          <div class="matter-row">
            <span class="matter-label">ID</span>
            <span class="matter-value">{{ reviewProtocol.matterId }}</span>
          </div>
          <div class="matter-row">
            <span class="matter-label">Name</span>
            <span class="matter-value">{{ reviewProtocol.matterName }}</span>
          </div>
          <div class="matter-row" v-if="reviewProtocol.relevanceCriteria?.claims?.length">
            <span class="matter-label">Claims</span>
            <span class="matter-value">{{ reviewProtocol.relevanceCriteria.claims.join(', ') }}</span>
          </div>
        </div>

        <!-- Ingestion progress -->
        <div class="dr-card ingestion-card">
          <h3>Ingestion Progress</h3>

          <div v-if="ingestionStats.total === 0 && !isProcessing" class="dr-placeholder">
            No documents ingested yet. Upload documents to begin.
          </div>

          <div v-else class="ingestion-stats">
            <div class="stat-row">
              <span class="stat-label">Total Documents</span>
              <span class="stat-value">{{ ingestionStats.total }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Ingested</span>
              <span class="stat-value">{{ ingestionStats.ingested }}</span>
            </div>
            <div class="stat-row" v-if="ingestionStats.failed > 0">
              <span class="stat-label">Failed</span>
              <span class="stat-value failed">{{ ingestionStats.failed }}</span>
            </div>
          </div>

          <!-- Live ingestion event feed -->
          <div v-if="recentIngestEvents.length" class="event-feed">
            <div
              v-for="(evt, i) in recentIngestEvents"
              :key="i"
              class="event-row"
            >
              <span class="event-icon">+</span>
              <span class="event-message">{{ evt.message ?? evt.step }}</span>
            </div>
          </div>
        </div>

        <!-- Classification results -->
        <div v-if="classificationSummary" class="dr-card classification-card">
          <h3>Classification</h3>
          <div class="stat-grid">
            <div
              v-for="(count, docType) in classificationSummary.typeBreakdown"
              :key="docType"
              class="stat-cell"
            >
              <span class="stat-cell-label">{{ docType }}</span>
              <span class="stat-cell-value">{{ count }}</span>
            </div>
          </div>
        </div>

        <!-- Coding progress (live, driven by dr:document_coded events) -->
        <div v-if="codingStats.total > 0 || isProcessing" class="dr-card coding-card">
          <h3>Coding Progress</h3>
          <div class="coding-summary">
            <div class="stat-row">
              <span class="stat-label">Coded</span>
              <span class="stat-value">{{ codingStats.coded }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Failed</span>
              <span class="stat-value" :class="{ failed: codingStats.failed > 0 }">{{ codingStats.failed }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Total</span>
              <span class="stat-value">{{ codingStats.total }}</span>
            </div>
          </div>

          <!-- Relevance breakdown -->
          <div v-if="relevanceBreakdown.total > 0" class="breakdown-section">
            <div class="breakdown-label">Relevance</div>
            <div class="breakdown-bars">
              <div class="breakdown-row" v-if="relevanceBreakdown.relevant > 0">
                <span class="breakdown-name">Relevant</span>
                <div class="bar-wrap">
                  <div class="bar bar-relevant" :style="{ width: pct(relevanceBreakdown.relevant, relevanceBreakdown.total) }" />
                </div>
                <span class="breakdown-count">{{ relevanceBreakdown.relevant }}</span>
              </div>
              <div class="breakdown-row" v-if="relevanceBreakdown.not_relevant > 0">
                <span class="breakdown-name">Not Relevant</span>
                <div class="bar-wrap">
                  <div class="bar bar-not-relevant" :style="{ width: pct(relevanceBreakdown.not_relevant, relevanceBreakdown.total) }" />
                </div>
                <span class="breakdown-count">{{ relevanceBreakdown.not_relevant }}</span>
              </div>
              <div class="breakdown-row" v-if="relevanceBreakdown.potentially_relevant > 0">
                <span class="breakdown-name">Potentially Relevant</span>
                <div class="bar-wrap">
                  <div class="bar bar-potential" :style="{ width: pct(relevanceBreakdown.potentially_relevant, relevanceBreakdown.total) }" />
                </div>
                <span class="breakdown-count">{{ relevanceBreakdown.potentially_relevant }}</span>
              </div>
            </div>
          </div>

          <!-- Privilege flagged -->
          <div v-if="codingStats.privilegeCount > 0" class="privilege-badge">
            <ion-icon :icon="shieldCheckmarkOutline" color="warning" />
            <span>{{ codingStats.privilegeCount }} document{{ codingStats.privilegeCount !== 1 ? 's' : '' }} flagged for privilege review</span>
          </div>

          <!-- Hot documents -->
          <div v-if="codingStats.hotDocumentCount > 0" class="hot-badge">
            <ion-icon :icon="flameOutline" color="danger" />
            <span>{{ codingStats.hotDocumentCount }} hot document{{ codingStats.hotDocumentCount !== 1 ? 's' : '' }}</span>
          </div>
        </div>

        <!-- Completed summary -->
        <div v-if="job?.status === 'completed'" class="dr-card complete-card">
          <ion-icon :icon="checkmarkCircleOutline" color="success" size="large" />
          <p>Phase 1 ingestion and classification complete.</p>
        </div>

        <!-- Error display -->
        <div v-if="job?.status === 'failed'" class="dr-card error-card">
          <ion-icon :icon="alertCircleOutline" color="danger" size="large" />
          <p>{{ job.error ?? 'An error occurred during processing.' }}</p>
        </div>
      </div>

      <!-- Tab 2: Document Browser -->
      <div v-else-if="activeTab === 'documents'" class="documents-tab">
        <!-- Search + filter toolbar -->
        <div class="browser-toolbar">
          <ion-searchbar
            v-model="docSearch"
            placeholder="Search documents…"
            :debounce="200"
            class="browser-search"
          />
          <ion-select
            v-model="relevanceFilter"
            placeholder="Relevance"
            interface="popover"
            class="browser-filter"
          >
            <ion-select-option value="">All</ion-select-option>
            <ion-select-option value="relevant">Relevant</ion-select-option>
            <ion-select-option value="not_relevant">Not Relevant</ion-select-option>
            <ion-select-option value="potentially_relevant">Potentially Relevant</ion-select-option>
          </ion-select>
          <ion-select
            v-model="privilegeFilter"
            placeholder="Privilege"
            interface="popover"
            class="browser-filter"
          >
            <ion-select-option value="">All</ion-select-option>
            <ion-select-option value="not_privileged">Not Privileged</ion-select-option>
            <ion-select-option value="potentially_privileged">Potentially Privileged</ion-select-option>
            <ion-select-option value="privileged">Privileged</ion-select-option>
          </ion-select>
        </div>

        <div class="browser-table">
          <div class="table-header">
            <span class="col-name">Name</span>
            <span class="col-type">Type</span>
            <span class="col-rel">Relevance</span>
            <span class="col-priv">Privilege</span>
            <span class="col-hot">Hot</span>
          </div>

          <div v-if="filteredDocuments.length === 0" class="dr-placeholder">
            No documents match the current filter.
          </div>

          <div
            v-for="doc in filteredDocuments"
            :key="doc.documentId"
            class="table-row"
            :class="{ expanded: expandedDoc === doc.documentId, failed: doc.status === 'failed' }"
            @click="toggleDoc(doc.documentId)"
          >
            <div class="row-summary">
              <span class="col-name">
                <ion-icon :icon="expandedDoc === doc.documentId ? chevronDownOutline : chevronForwardOutline" class="expand-icon" />
                {{ doc.name }}
              </span>
              <span class="col-type">{{ doc.documentType }}</span>
              <span class="col-rel" :class="doc.coding?.relevance.classification">
                {{ formatClassification(doc.coding?.relevance.classification) }}
              </span>
              <span class="col-priv" :class="doc.coding?.privilege.classification">
                {{ formatClassification(doc.coding?.privilege.classification) }}
              </span>
              <span class="col-hot">
                <ion-icon v-if="doc.coding?.hotDocument" :icon="flameOutline" color="danger" />
                <span v-else>—</span>
              </span>
            </div>

            <!-- Expanded detail row -->
            <div v-if="expandedDoc === doc.documentId" class="row-detail">
              <div v-if="doc.status === 'failed'" class="detail-error">
                {{ doc.error ?? 'Coding failed.' }}
              </div>
              <template v-else-if="doc.coding">
                <div class="detail-summary" v-if="doc.summary">
                  <strong>Summary:</strong> {{ doc.summary }}
                </div>
                <div class="detail-section">
                  <strong>Relevance</strong>
                  <div class="detail-row">
                    <span class="detail-label">Classification:</span>
                    <span :class="doc.coding.relevance.classification">{{ doc.coding.relevance.classification }}</span>
                    <span class="detail-conf">({{ pctNum(doc.coding.relevance.confidence) }}%)</span>
                  </div>
                  <div class="detail-reasoning">{{ doc.coding.relevance.reasoning }}</div>
                  <div class="detail-criteria" v-if="doc.coding.relevance.matchingCriteria.length">
                    Matching criteria: {{ doc.coding.relevance.matchingCriteria.join(', ') }}
                  </div>
                </div>
                <div class="detail-section">
                  <strong>Privilege</strong>
                  <div class="detail-row">
                    <span class="detail-label">Classification:</span>
                    <span :class="doc.coding.privilege.classification">{{ doc.coding.privilege.classification }}</span>
                    <span class="detail-conf">({{ pctNum(doc.coding.privilege.confidence) }}%)</span>
                  </div>
                  <div class="detail-reasoning">{{ doc.coding.privilege.reasoning }}</div>
                </div>
                <div class="detail-section" v-if="doc.coding.hotDocument">
                  <strong>Hot Document</strong>
                  <div class="detail-reasoning">{{ doc.coding.hotDocumentReason }}</div>
                </div>
                <div class="detail-section" v-if="doc.coding.issueTags.length">
                  <strong>Issue Tags</strong>
                  <div class="issue-chips">
                    <span v-for="tag in doc.coding.issueTags" :key="tag.tagId" class="issue-chip">
                      {{ tag.tagId }} ({{ pctNum(tag.confidence) }}%)
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs 3-5: future phases -->
      <div v-else class="dr-placeholder">
        This tab will be available in a future phase.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonIcon,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
} from '@ionic/vue';
import {
  checkmarkCircleOutline,
  alertCircleOutline,
  shieldCheckmarkOutline,
  flameOutline,
  chevronDownOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import {
  legalJobsService,
  type AgentJobRow,
  type ExecutionContextLike,
  type ObservabilityEvent,
} from '../legalJobsService';

interface DocumentCoding {
  relevance: {
    classification: 'relevant' | 'not_relevant' | 'potentially_relevant';
    confidence: number;
    reasoning: string;
    matchingCriteria: string[];
  };
  privilege: {
    classification: 'privileged' | 'not_privileged' | 'potentially_privileged';
    confidence: number;
    privilegeType: string;
    reasoning: string;
  };
  issueTags: Array<{ tagId: string; confidence: number }>;
  hotDocument: boolean;
  hotDocumentReason?: string;
}

interface DocumentIndexEntry {
  documentId: string;
  name: string;
  documentType: string;
  date?: string | null;
  summary: string;
  status: 'pending' | 'ingested' | 'classified' | 'coded' | 'failed';
  error?: string;
}

interface DiscoveryPayload {
  documentIndex: DocumentIndexEntry[];
  documentCodings: Record<string, DocumentCoding>;
  reviewStatistics: {
    totalDocuments: number;
    totalCoded: number;
    totalFailed: number;
    relevanceBreakdown: { relevant: number; not_relevant: number; potentially_relevant: number };
    privilegeCount: number;
    hotDocumentCount: number;
    issueDistribution: Record<string, number>;
  };
}

const props = defineProps<{
  jobId: string;
  orgSlug: string;
  context?: ExecutionContextLike | null;
}>();

const activeTab = ref<string>('overview');
const job = ref<AgentJobRow | null>(null);
const events = ref<ObservabilityEvent[]>([]);
const docSearch = ref('');
const relevanceFilter = ref('');
const privilegeFilter = ref('');
const expandedDoc = ref<string | null>(null);
let eventSource: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const isProcessing = computed(
  () => job.value?.status === 'processing' || job.value?.status === 'queued',
);

interface StoredReviewProtocol {
  matterId: string;
  matterName: string;
  relevanceCriteria?: {
    claims?: string[];
    keyParties?: string[];
    keyTopics?: string[];
  };
}

const reviewProtocol = computed((): StoredReviewProtocol | null => {
  const data = job.value?.input?.data as Record<string, unknown> | undefined;
  if (!data?.reviewProtocol) return null;
  return data.reviewProtocol as StoredReviewProtocol;
});

const discoveryPayload = computed((): DiscoveryPayload | null => {
  const row = job.value as (AgentJobRow & { discoveryPayload?: DiscoveryPayload }) | null;
  return row?.discoveryPayload ?? null;
});

const hasCodings = computed(() => {
  const dp = discoveryPayload.value;
  return dp !== null && Object.keys(dp.documentCodings).length > 0;
});

/** Ingest events emitted with step 'dr:document_ingested'. */
const ingestEvents = computed(() =>
  events.value.filter((e) => e.step === 'dr:document_ingested'),
);

/** The 5 most recent ingest events for the live feed. */
const recentIngestEvents = computed(() => ingestEvents.value.slice(-5));

/** Aggregate ingestion stats from events + job document_count. */
const ingestionStats = computed(() => {
  const total = job.value?.document_count ?? 0;
  const ingested = ingestEvents.value.length;
  const failedPayloads = ingestEvents.value.filter(
    (e) => (e.payload as Record<string, unknown> | undefined)?.failed,
  ).length;
  return { total, ingested, failed: failedPayloads };
});

/** Classification breakdown from the dr:classification_complete event payload. */
const classificationSummary = computed(() => {
  const evt = events.value.find((e) => e.step === 'dr:classification_complete');
  if (!evt) return null;
  return evt.payload as { typeBreakdown: Record<string, number> } | null;
});

/** Coding stats — prefer discoveryPayload (authoritative), fall back to SSE events. */
const codingStats = computed(() => {
  const dp = discoveryPayload.value;
  if (dp) {
    return {
      total: dp.reviewStatistics.totalDocuments,
      coded: dp.reviewStatistics.totalCoded,
      failed: dp.reviewStatistics.totalFailed,
      privilegeCount: dp.reviewStatistics.privilegeCount,
      hotDocumentCount: dp.reviewStatistics.hotDocumentCount,
    };
  }
  // Fall back to live SSE event aggregation
  const codedEvents = events.value.filter((e) => e.step === 'dr:document_coded');
  const failedEvents = events.value.filter((e) => e.step === 'dr:document_coding_failed');
  const total = job.value?.document_count ?? 0;
  let privilegeCount = 0;
  let hotDocumentCount = 0;
  for (const e of codedEvents) {
    const p = e.payload as Record<string, unknown> | undefined;
    if (p?.privilegeClassification && p.privilegeClassification !== 'not_privileged') privilegeCount++;
    if (p?.hotDocument) hotDocumentCount++;
  }
  return {
    total,
    coded: codedEvents.length,
    failed: failedEvents.length,
    privilegeCount,
    hotDocumentCount,
  };
});

/** Relevance breakdown — prefer discoveryPayload, fall back to live events. */
const relevanceBreakdown = computed(() => {
  const dp = discoveryPayload.value;
  if (dp) {
    return { ...dp.reviewStatistics.relevanceBreakdown, total: dp.reviewStatistics.totalCoded };
  }
  const codedEvents = events.value.filter((e) => e.step === 'dr:document_coded');
  const counts = { relevant: 0, not_relevant: 0, potentially_relevant: 0, total: codedEvents.length };
  for (const e of codedEvents) {
    const p = e.payload as Record<string, unknown> | undefined;
    const cls = p?.relevanceClassification as string | undefined;
    if (cls === 'relevant') counts.relevant++;
    else if (cls === 'not_relevant') counts.not_relevant++;
    else if (cls === 'potentially_relevant') counts.potentially_relevant++;
  }
  return counts;
});

/** Combined document list for the Document Browser. */
const allDocuments = computed(() => {
  const dp = discoveryPayload.value;
  if (!dp) return [];
  return dp.documentIndex.map((entry) => ({
    ...entry,
    coding: dp.documentCodings[entry.documentId] ?? null,
  }));
});

const filteredDocuments = computed(() => {
  const search = docSearch.value.toLowerCase();
  return allDocuments.value.filter((doc) => {
    if (search && !doc.name.toLowerCase().includes(search) && !doc.summary.toLowerCase().includes(search)) {
      return false;
    }
    if (relevanceFilter.value && doc.coding?.relevance.classification !== relevanceFilter.value) {
      return false;
    }
    if (privilegeFilter.value && doc.coding?.privilege.classification !== privilegeFilter.value) {
      return false;
    }
    return true;
  });
});

function pct(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((count / total) * 100)}%`;
}

function pctNum(conf: number): number {
  return Math.round(conf * 100);
}

function formatClassification(cls: string | undefined): string {
  if (!cls) return '—';
  return cls.replace(/_/g, ' ');
}

function toggleDoc(id: string): void {
  expandedDoc.value = expandedDoc.value === id ? null : id;
}

// ── Job polling ───────────────────────────────────────────────────────────

async function loadJob(): Promise<void> {
  try {
    job.value = await legalJobsService.getJob(props.jobId, props.orgSlug, props.context?.userId);
  } catch {
    // propagate as null — caller can see job is missing
  }
}

// ── SSE + history merge ───────────────────────────────────────────────────

function dedupeKey(e: ObservabilityEvent): string {
  if (e.id != null) return `db:${e.id}`;
  return `live:${e.hook_event_type}:${e.timestamp ?? 0}`;
}

function mergeEvents(incoming: ObservabilityEvent[]): void {
  const seen = new Set(events.value.map(dedupeKey));
  for (const e of incoming) {
    if (!e.hook_event_type) continue;
    const key = dedupeKey(e);
    if (!seen.has(key)) {
      events.value.push(e);
      seen.add(key);
    }
  }
  events.value.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : (a.timestamp ?? 0);
    const tb = b.created_at ? new Date(b.created_at).getTime() : (b.timestamp ?? 0);
    return ta - tb;
  });
}

async function loadHistory(): Promise<void> {
  try {
    const hist = await legalJobsService.getJobEvents(props.jobId, props.orgSlug, props.context?.userId);
    mergeEvents(hist);
  } catch {
    // no history yet
  }
}

function startSSE(): void {
  if (!job.value?.conversation_id) return;
  stopSSE();
  const es = legalJobsService.openEventStream(job.value.conversation_id);
  eventSource = es;
  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data as string) as ObservabilityEvent;
      mergeEvents([data]);
    } catch {
      // malformed frame — ignore
    }
  };
}

function stopSSE(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function startPoll(): void {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    await loadJob();
    if (!isProcessing.value && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }, 3000);
}

function stopPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onMounted(async () => {
  await loadJob();
  await loadHistory();
  if (isProcessing.value) {
    startSSE();
    startPoll();
  }
});

onUnmounted(() => {
  stopSSE();
  stopPoll();
});
</script>

<style scoped>
.dr-view {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.dr-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0 12px;
}

.dr-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dr-title-group h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.dr-status {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--ion-color-medium-tint);
  color: var(--ion-color-medium-contrast);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.dr-status.processing { background: var(--ion-color-warning-tint); color: var(--ion-color-warning-shade); }
.dr-status.completed  { background: var(--ion-color-success-tint); color: var(--ion-color-success-shade); }
.dr-status.failed     { background: var(--ion-color-danger-tint);  color: var(--ion-color-danger-shade); }
.dr-status.queued     { background: var(--ion-color-medium-tint);  color: var(--ion-color-medium-shade); }

.dr-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.dr-progress-bar-wrap {
  height: 4px;
  background: var(--ion-color-light);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.dr-progress-bar {
  height: 100%;
  background: var(--ion-color-primary);
  transition: width 0.4s ease;
}

.dr-tabs {
  margin-bottom: 16px;
}

.dr-content {
  min-height: 200px;
}

/* ── Overview tab ── */
.overview-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dr-card {
  background: var(--ion-card-background, var(--ion-color-light));
  border-radius: 8px;
  padding: 16px;
}

.dr-card h3 {
  margin: 0 0 12px;
  font-size: 1rem;
  font-weight: 600;
}

.matter-row {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.875rem;
}

.matter-label {
  color: var(--ion-color-medium);
  min-width: 60px;
}

.ingestion-stats,
.coding-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  padding: 2px 0;
}

.stat-label {
  color: var(--ion-color-medium);
}

.stat-value.failed {
  color: var(--ion-color-danger);
  font-weight: 600;
}

.event-feed {
  border-top: 1px solid var(--ion-color-light-shade);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

.event-icon {
  color: var(--ion-color-success);
  font-weight: bold;
  flex-shrink: 0;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.stat-cell {
  background: var(--ion-color-light);
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-cell-label {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  text-transform: capitalize;
}

.stat-cell-value {
  font-size: 1.25rem;
  font-weight: 600;
}

/* Relevance breakdown bars */
.breakdown-section {
  margin-top: 12px;
  border-top: 1px solid var(--ion-color-light-shade);
  padding-top: 10px;
}

.breakdown-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ion-color-medium);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.breakdown-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.breakdown-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
}

.breakdown-name {
  min-width: 130px;
  color: var(--ion-color-medium-shade);
}

.bar-wrap {
  flex: 1;
  height: 8px;
  background: var(--ion-color-light-shade);
  border-radius: 4px;
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease;
}

.bar-relevant      { background: var(--ion-color-success); }
.bar-not-relevant  { background: var(--ion-color-medium); }
.bar-potential     { background: var(--ion-color-warning); }

.breakdown-count {
  min-width: 24px;
  text-align: right;
  font-weight: 600;
}

.privilege-badge,
.hot-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px;
  border-radius: 6px;
  font-size: 0.875rem;
}

.privilege-badge { background: rgba(var(--ion-color-warning-rgb), 0.1); }
.hot-badge       { background: rgba(var(--ion-color-danger-rgb), 0.1); }

.complete-card,
.error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 24px;
}

.dr-placeholder {
  text-align: center;
  padding: 48px 16px;
  color: var(--ion-color-medium);
}

/* ── Document Browser tab ── */
.documents-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.browser-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.browser-search {
  flex: 1;
  min-width: 200px;
  --padding-start: 0;
}

.browser-filter {
  min-width: 140px;
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.875rem;
}

.browser-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.table-header {
  display: grid;
  grid-template-columns: 2fr 100px 130px 150px 50px;
  padding: 8px 12px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ion-color-medium);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--ion-color-light);
  border-radius: 6px;
}

.table-row {
  background: var(--ion-card-background, var(--ion-color-light));
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  overflow: hidden;
}

.table-row:hover { background: var(--ion-color-light-shade); }
.table-row.failed { border-left: 3px solid var(--ion-color-danger); }

.row-summary {
  display: grid;
  grid-template-columns: 2fr 100px 130px 150px 50px;
  padding: 10px 12px;
  font-size: 0.875rem;
  align-items: center;
}

.expand-icon {
  margin-right: 6px;
  font-size: 0.9rem;
  vertical-align: middle;
}

.col-rel.relevant           { color: var(--ion-color-success); }
.col-rel.not_relevant       { color: var(--ion-color-medium); }
.col-rel.potentially_relevant { color: var(--ion-color-warning); }

.col-priv.not_privileged       { color: var(--ion-color-success); }
.col-priv.potentially_privileged { color: var(--ion-color-warning); }
.col-priv.privileged           { color: var(--ion-color-danger); }

.row-detail {
  padding: 0 12px 14px 32px;
  border-top: 1px solid var(--ion-color-light-shade);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 0.8rem;
}

.detail-error {
  color: var(--ion-color-danger);
  padding: 8px 0;
}

.detail-summary {
  color: var(--ion-color-medium-shade);
  font-style: italic;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.detail-label {
  color: var(--ion-color-medium);
}

.detail-conf {
  color: var(--ion-color-medium);
  font-size: 0.75rem;
}

.detail-reasoning {
  color: var(--ion-color-medium-shade);
  margin-left: 8px;
  line-height: 1.5;
}

.detail-criteria {
  color: var(--ion-color-medium);
  font-size: 0.75rem;
  margin-left: 8px;
}

.issue-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: 8px;
}

.issue-chip {
  background: var(--ion-color-light-shade);
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 0.75rem;
}

/* Relevance / privilege class colours in detail */
.relevant           { color: var(--ion-color-success); }
.not_relevant       { color: var(--ion-color-medium); }
.potentially_relevant { color: var(--ion-color-warning); }
.not_privileged       { color: var(--ion-color-success); }
.potentially_privileged { color: var(--ion-color-warning); }
.privileged           { color: var(--ion-color-danger); }
</style>
