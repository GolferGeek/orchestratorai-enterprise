<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="$emit('close')"
    @keydown.esc="$emit('close')"
    class="job-detail-modal"
  >
    <!-- The `ion-page` class makes ion-modal lay its slotted content
         out as a full-viewport flex column (header + content). -->
    <div class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ jobTitle }}</ion-title>
          <ion-buttons slot="end">
            <ion-badge :color="statusColor" v-if="job">{{ job.status }}</ion-badge>
            <ion-button
              v-if="job && canCancel"
              color="danger"
              fill="outline"
              size="small"
              @click="handleCancel"
            >
              Cancel Job
            </ion-button>
            <ion-button @click="$emit('close')">Close</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content>
      <div v-if="!job && loadError" class="error-state">
        <ion-icon :icon="alertCircleOutline" color="danger" />
        <h3>{{ loadErrorTitle }}</h3>
        <p>{{ loadError }}</p>
        <ion-button size="small" fill="outline" @click="$emit('close')">Back to list</ion-button>
      </div>

      <div v-else-if="!job" class="loading-state">
        <ion-spinner name="crescent" />
        <p>Loading job…</p>
      </div>

      <div v-else class="modal-body">
        <!-- Meta -->
        <div class="meta">
          <div><strong>Model:</strong> {{ job.model }}</div>
          <div>
            <strong>Conversation:</strong>
            <code>{{ job.conversation_id }}</code>
          </div>
          <div v-if="job.error" class="error">
            <strong>Error:</strong> {{ job.error }}
          </div>
        </div>

        <!-- Source section: original file inline when stored, fallback
             to extracted text when not. -->
        <section class="card">
          <div class="card-header">
            <h3>Source</h3>
            <span v-if="originalFileName" class="count">{{ originalFileName }}</span>
          </div>
          <JobSourceViewer
            :original-file-url="job.originalFileUrl"
            :original-file-name="originalFileName"
            :mime-type="originalMimeType"
            :extracted-text="extractedText"
          />
        </section>

        <!-- Events section (Phase 4 swaps this for a stage ladder) -->
        <section class="card">
          <div class="card-header">
            <h3>Events</h3>
            <span v-if="manifest" class="count">{{ stages.length }} stages</span>
            <span v-else class="count">{{ events.length }} events (no manifest)</span>
            <span class="spacer" />
            <ion-button
              size="small"
              fill="clear"
              @click="showRawEvents = !showRawEvents"
            >
              {{ showRawEvents ? 'Hide raw' : 'Show raw events (debug)' }}
            </ion-button>
          </div>

          <!-- Manifest-driven stage ladder (preferred) -->
          <StageLadder
            v-if="manifest && stages.length > 0"
            :stages="stages"
            :thinking-states="thinkingStates"
          />

          <!-- Fallback: raw event list when no manifest is registered -->
          <div v-else-if="!manifest" class="events-scroll">
            <div v-if="events.length === 0" class="empty">No events captured.</div>
            <div
              v-for="ev in events"
              :key="`${ev.id ?? 'live'}-${ev.created_at ?? ev.timestamp ?? Math.random()}`"
              class="event"
            >
              <span class="event-type">{{ ev.hook_event_type }}</span>
              <span v-if="ev.step" class="event-step">{{ ev.step }}</span>
              <span v-if="ev.message" class="event-message">{{ ev.message }}</span>
              <span class="event-time">{{ formatTime(ev.created_at) }}</span>
            </div>
          </div>

          <!-- Show raw events as a debug toggle even when manifest is loaded -->
          <div v-if="showRawEvents" class="events-scroll debug-raw">
            <div class="debug-header">— raw observability events —</div>
            <div
              v-for="ev in events"
              :key="`raw-${ev.id ?? 'live'}-${ev.created_at ?? ev.timestamp ?? Math.random()}`"
              class="event"
            >
              <span class="event-type">{{ ev.hook_event_type }}</span>
              <span v-if="ev.step" class="event-step">{{ ev.step }}</span>
              <span v-if="ev.message" class="event-message">{{ ev.message }}</span>
              <span class="event-time">{{ formatTime(ev.created_at) }}</span>
            </div>
          </div>
        </section>

        <!-- Legal Research output (memo + research tree) -->
        <template v-if="isResearchJob">
          <section class="card" v-if="researchScope">
            <div class="card-header"><h3>Research Scope</h3></div>
            <p class="scope-text">{{ researchScope }}</p>
          </section>

          <section class="card" v-if="researchMemo">
            <div class="card-header"><h3>Legal Memo</h3></div>
            <ReportMarkdown :markdown="researchMemo" />
          </section>

          <section class="card" v-if="unverifiedCitations.length > 0">
            <div class="card-header">
              <h3>Unverified Citations</h3>
              <ion-badge color="warning">{{ unverifiedCitations.length }}</ion-badge>
            </div>
            <ul class="unverified-list">
              <li v-for="(c, i) in unverifiedCitations" :key="i" class="unverified-item">
                <span class="unverified-source">{{ c.source }}</span>
                <span class="unverified-text">{{ c.text.slice(0, 120) }}{{ c.text.length > 120 ? '…' : '' }}</span>
                <span class="unverified-q muted">from: {{ c.question.slice(0, 80) }}{{ c.question.length > 80 ? '…' : '' }}</span>
              </li>
            </ul>
          </section>

          <section class="card">
            <div class="card-header">
              <h3>Research Tree</h3>
              <span class="count">{{ researchTree.length }} nodes</span>
            </div>
            <ResearchTree :research-tree="researchTree" />
          </section>
        </template>

        <!-- Deposition Prep output -->
        <template v-if="isDepositionPrepJob">
          <section class="card" v-if="preparationOutline">
            <div class="card-header"><h3>Preparation Outline</h3></div>
            <pre class="preparation-outline-pre">{{ JSON.stringify(preparationOutline, null, 2) }}</pre>
          </section>
        </template>

        <!-- Final report / redline output -->
        <section class="card" v-if="!isResearchJob && !isDepositionPrepJob && (finalReportMarkdown || finalRedlineOutput)">
          <div class="card-header">
            <h3>Final Report</h3>
          </div>

          <!-- Tab strip when both report and redline are present -->
          <template v-if="finalReportMarkdown && finalRedlineOutput">
            <ion-segment v-model="reportTab" class="report-segment">
              <ion-segment-button value="report">Risk Assessment</ion-segment-button>
              <ion-segment-button value="redline">Redlined Contract</ion-segment-button>
            </ion-segment>
            <div v-if="reportTab === 'report'">
              <ReportMarkdown :markdown="finalReportMarkdown" />
            </div>
            <div v-else>
              <RedlineViewer
                :clauses="finalRedlineOutput.clauses"
                :clause-decisions="{}"
                :readonly="true"
              />
            </div>
          </template>

          <!-- Only report (no redline) -->
          <template v-else-if="finalReportMarkdown">
            <ReportMarkdown :markdown="finalReportMarkdown" />
          </template>

          <!-- Only redline (no report text) -->
          <template v-else-if="finalRedlineOutput">
            <RedlineViewer
              :clauses="finalRedlineOutput.clauses"
              :clause-decisions="{}"
              :readonly="true"
            />
          </template>
        </section>
      </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, computed, shallowRef } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonBadge,
  IonSpinner,
  IonIcon,
  IonSegment,
  IonSegmentButton,
} from '@ionic/vue';
import { alertCircleOutline } from 'ionicons/icons';
import {
  legalJobsService,
  type AgentJobRow,
  type ObservabilityEvent,
  type RedlineOutput,
} from '../legalJobsService';
import { useJobEventStream } from '../composables/useJobEventStream';
import { useWorkflowPresentation } from '../composables/useWorkflowPresentation';
import { useThinkingStates } from '../composables/useThinkingStates';
import ReportMarkdown from './ReportMarkdown.vue';
import RedlineViewer from './RedlineViewer.vue';
import StageLadder from './StageLadder.vue';
import JobSourceViewer from './JobSourceViewer.vue';
import ResearchTree from './ResearchTree.vue';
import type { LegalResearchResult, ResearchTreeNode } from './research-types';

const props = defineProps<{
  open: boolean;
  jobId: string | null;
  orgSlug: string;
  callerUserId?: string;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

type StreamHandle = ReturnType<typeof useJobEventStream>;

const job = ref<AgentJobRow | null>(null);
const loadError = ref<string | null>(null);
const loadErrorTitle = ref<string>('Failed to load job');
const showRawEvents = ref(false);
const capabilitySlug = computed(() => job.value?.job_type ?? undefined);

// Per-workflow presentation manifest. Loaded once per session, shared
// across modal opens, scoped by capability when a workflow-specific
// manifest exists.
const { manifest, stagesFromEvents } =
  useWorkflowPresentation('legal-department', capabilitySlug);

// Hold the entire composable handle in a shallowRef so the template
// reads `streamHandle.value?.events.value` (Vue auto-unwraps refs in
// templates so the .value at the end is implicit). When the modal opens
// for a new job, we replace the handle wholesale.
const streamHandle = shallowRef<StreamHandle | null>(null);
const events = computed<ObservabilityEvent[]>(
  () => streamHandle.value?.events.value ?? [],
);

const stages = computed(() => {
  if (!manifest.value) return [];
  return stagesFromEvents(events.value);
});

// Thinking sub-state overlay: maps stage id → 'reasoning' | 'writing'.
// Derived entirely from the raw events; does not affect the walker output.
const thinkingStates = useThinkingStates(events, stages);

const jobTitle = computed(() => {
  if (!job.value) return 'Loading…';
  const data = job.value.input as {
    data?: { filename?: string; content?: string };
  };
  if (data?.data?.filename) return data.data.filename;
  const content = data?.data?.content;
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim().slice(0, 80) + (content.length > 80 ? '…' : '');
  }
  return `Job ${job.value.id.slice(0, 8)}`;
});

const statusColor = computed(() => {
  switch (job.value?.status) {
    case 'queued':
      return 'medium';
    case 'processing':
      return 'primary';
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'canceled':
      return 'warning';
    case 'cancel_requested':
      return 'warning';
    default:
      return 'medium';
  }
});

const canCancel = computed(() => {
  const s = job.value?.status;
  return s === 'queued' || s === 'processing' || s === 'awaiting_review' || s === 'review_rejected';
});

async function handleCancel() {
  if (!job.value || !confirm('Cancel this job? This cannot be undone.')) return;
  try {
    const result = await legalJobsService.cancelJob(job.value.id);
    if (result.status === 'cancel_requested') {
      alert('Cancellation requested — job will stop at the next checkpoint.');
    }
    // Refresh job detail
    job.value = await legalJobsService.getJob(job.value.id, props.orgSlug, props.callerUserId);
  } catch (err) {
    alert(`Cancel failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const extractedText = computed(() => {
  const data = job.value?.input as { data?: { content?: string } } | undefined;
  return data?.data?.content ?? '(no extracted text on this job)';
});

const originalFileName = computed<string | undefined>(() => {
  const data = job.value?.input as { data?: { filename?: string } } | undefined;
  return data?.data?.filename;
});

const originalMimeType = computed<string | undefined>(() => {
  const data = job.value?.input as { data?: { mimeType?: string } } | undefined;
  return data?.data?.mimeType;
});

const finalReportMarkdown = computed(() => {
  const result = job.value?.result as {
    response?: string;
    report?: string;
    reportMarkdown?: string;
  } | null;
  if (!result) return null;
  return result.reportMarkdown ?? result.report ?? result.response ?? null;
});

const finalRedlineOutput = computed<RedlineOutput | null>(() => {
  const result = job.value?.result as { redlineOutput?: RedlineOutput } | null;
  return result?.redlineOutput ?? null;
});

const isResearchJob = computed(() => {
  const input = job.value?.input as { metadata?: { jobType?: string } } | undefined;
  return input?.metadata?.jobType === 'legal-research' || job.value?.job_type === 'legal-research';
});

const isDepositionPrepJob = computed(() => {
  const input = job.value?.input as { metadata?: { jobType?: string } } | undefined;
  return input?.metadata?.jobType === 'deposition-prep' || job.value?.job_type === 'deposition-prep';
});

const preparationOutline = computed<Record<string, unknown> | null>(() => {
  if (!isDepositionPrepJob.value) return null;
  const result = job.value?.result as { preparationOutline?: Record<string, unknown> } | null;
  return result?.preparationOutline ?? null;
});

const researchResult = computed<LegalResearchResult | null>(() => {
  if (!isResearchJob.value) return null;
  return (job.value?.result as LegalResearchResult | null) ?? null;
});

const researchTree = computed<ResearchTreeNode[]>(() => {
  return researchResult.value?.researchTree ?? [];
});

const researchMemo = computed<string | null>(() => {
  return researchResult.value?.memo ?? researchResult.value?.report ?? null;
});

const researchScope = computed<string | null>(() => {
  return researchResult.value?.scope ?? null;
});

const unverifiedCitations = computed(() => {
  const tree = researchTree.value;
  const citations: Array<{ question: string; text: string; source: string }> = [];
  for (const node of tree) {
    for (const c of node.citations ?? []) {
      if (!c.verified) {
        citations.push({ question: node.question, text: c.text, source: c.source });
      }
    }
  }
  return citations;
});

/** Active tab in the final report card when both report and redline exist. */
const reportTab = ref<'report' | 'redline'>('report');

function formatTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString();
}

async function loadJob(id: string): Promise<void> {
  loadError.value = null;
  loadErrorTitle.value = 'Failed to load job';
  try {
    job.value = await legalJobsService.getJob(id, props.orgSlug, props.callerUserId);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/404|not found/i.test(raw)) {
      loadErrorTitle.value = 'Job not found';
      loadError.value =
        'This job may have been deleted, or the link is incorrect.';
    } else if (/401|403|forbidden|unauthor/i.test(raw)) {
      loadErrorTitle.value = 'Access denied';
      loadError.value = 'You do not have permission to view this job.';
    } else {
      loadErrorTitle.value = 'Failed to load job';
      loadError.value = 'An unexpected error occurred while loading this job.';
    }
  }
}

watch(
  () => [props.open, props.jobId],
  async ([nowOpen, nowId]) => {
    // Tear down any prior stream when the modal closes or jumps to a
    // different job.
    if (streamHandle.value) {
      streamHandle.value.cleanup();
      streamHandle.value = null;
    }
    job.value = null;
    if (!nowOpen || !nowId) return;

    await loadJob(nowId as string);
    const loaded = job.value as AgentJobRow | null;
    if (loaded) {
      streamHandle.value = useJobEventStream({
        jobId: loaded.id,
        conversationId: loaded.conversation_id,
        orgSlug: props.orgSlug,
        callerUserId: props.callerUserId,
      });
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (streamHandle.value) streamHandle.value.cleanup();
});
</script>

<style scoped>
.job-detail-modal {
  --width: 100%;
  --height: 100%;
  --max-width: 100%;
  --max-height: 100%;
  --backdrop-opacity: 0.6;
  --background: var(--ion-background-color, #fff);
}

/* Layout fill for the inner shell that wraps ion-header + ion-content
   inside the modal. We can't use class="ion-page" here because Ionic
   Vue's IonRouterOutlet scans for `.ion-page` to find route view items
   and would mistake this for a routable page. */
.modal-page-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1100px;
  margin: 0 auto;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 24px;
  color: var(--ion-color-medium);
  text-align: center;
}

.error-state h3 {
  margin: 4px 0 0 0;
  color: var(--ion-color-dark);
  font-size: 1.05em;
}

.meta {
  font-size: 0.9em;
  color: var(--ion-color-medium);
  line-height: 1.7;
}

.meta code {
  font-size: 0.85em;
  background: var(--ion-color-step-100);
  padding: 1px 6px;
  border-radius: 4px;
}

.meta .error {
  color: var(--ion-color-danger);
  margin-top: 6px;
}

.card {
  background: var(--ion-background-color);
  border: 1px solid var(--ion-color-step-150);
  border-radius: 8px;
  padding: 14px 18px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.card-header h3 {
  margin: 0;
  font-size: 0.95em;
}

.card-header .count {
  font-size: 0.8em;
  color: var(--ion-color-medium);
}

.card-header .spacer {
  flex: 1;
}

.source-fallback .extracted-text {
  background: var(--ion-color-step-50);
  padding: 12px 14px;
  border-radius: 6px;
  white-space: pre-wrap;
  font-size: 0.85em;
  max-height: 360px;
  overflow-y: auto;
  margin: 0;
}

.source-fallback .hint {
  font-size: 0.75em;
  color: var(--ion-color-medium);
  margin-top: 8px;
}

.events-scroll {
  max-height: 400px;
  overflow-y: auto;
  font-family: var(--ion-font-family, monospace);
  font-size: 0.8em;
}

.event {
  padding: 4px 0;
  border-bottom: 1px solid var(--ion-color-step-100);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.event-type {
  color: var(--ion-color-primary);
  font-weight: 600;
  min-width: 180px;
}

.event-step {
  color: var(--ion-color-success);
}

.event-message {
  color: var(--ion-color-dark);
  flex: 1;
}

.event-time {
  color: var(--ion-color-medium);
  margin-left: auto;
}

.empty {
  color: var(--ion-color-medium);
  padding: 8px 0;
  font-size: 0.85em;
}

.report-segment {
  margin-bottom: 12px;
}

/* Legal Research styles */
.scope-text {
  margin: 0;
  font-size: 0.9em;
  line-height: 1.6;
  color: var(--ion-color-dark);
  padding: 4px 0;
}

.unverified-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.unverified-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  background: var(--ion-color-warning-tint);
  border-radius: 6px;
  font-size: 0.85em;
  color: #1a1a1a;
}

.unverified-source {
  font-weight: 600;
  color: #6b4c00;
}

.unverified-text {
  color: var(--ion-color-dark);
}

.unverified-q {
  font-size: 0.78em;
  color: var(--ion-color-medium);
}

.muted {
  color: var(--ion-color-medium);
}

.preparation-outline-pre {
  background: var(--ion-color-step-50);
  padding: 12px 14px;
  border-radius: 6px;
  white-space: pre-wrap;
  font-size: 0.82em;
  max-height: 500px;
  overflow-y: auto;
  margin: 0;
  font-family: monospace;
}
</style>
