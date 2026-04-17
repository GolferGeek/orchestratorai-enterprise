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
      <ion-segment-button value="documents" disabled>
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

        <!-- Classification results (populated after classify-all completes) -->
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

      <!-- Tabs 2-5: stubbed for future phases -->
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
} from '@ionic/vue';
import { checkmarkCircleOutline, alertCircleOutline } from 'ionicons/icons';
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

const activeTab = ref<string>('overview');
const job = ref<AgentJobRow | null>(null);
const events = ref<ObservabilityEvent[]>([]);
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

// ── Job polling ───────────────────────────────────────────────────────────

async function loadJob(): Promise<void> {
  try {
    job.value = await legalJobsService.getJob(props.jobId, props.orgSlug);
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
    // skip the raw SSE "connected" wrapper which has no hook_event_type
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
    const hist = await legalJobsService.getJobEvents(props.jobId, props.orgSlug);
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

.ingestion-stats {
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
</style>
