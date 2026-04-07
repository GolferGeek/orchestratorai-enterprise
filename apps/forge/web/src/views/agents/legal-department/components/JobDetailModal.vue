<template>
  <ion-modal :is-open="open" @did-dismiss="$emit('close')" class="job-detail-modal">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ jobTitle }}</ion-title>
        <ion-buttons slot="end">
          <ion-badge :color="statusColor" v-if="job">{{ job.status }}</ion-badge>
          <ion-button @click="$emit('close')">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="!job && loadError" class="error-state">
        <ion-icon :icon="alertCircleOutline" color="danger" />
        <p>{{ loadError }}</p>
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

        <!-- Source section (Phase 5 wires in the original file viewer) -->
        <section class="card">
          <div class="card-header">
            <h3>Source</h3>
          </div>
          <div class="source-fallback">
            <pre class="extracted-text">{{ extractedText }}</pre>
            <div class="hint">
              Original file inline rendering lands in Phase 5; this is the
              extracted text the worker fed into the analysis.
            </div>
          </div>
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
          <StageLadder v-if="manifest && stages.length > 0" :stages="stages" />

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

        <!-- Final report -->
        <section class="card" v-if="finalReportMarkdown">
          <div class="card-header">
            <h3>Final Report</h3>
          </div>
          <ReportMarkdown :markdown="finalReportMarkdown" />
        </section>
      </div>
    </ion-content>
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
} from '@ionic/vue';
import { alertCircleOutline } from 'ionicons/icons';
import {
  legalJobsService,
  type AgentJobRow,
  type ObservabilityEvent,
} from '../legalJobsService';
import { useJobEventStream } from '../composables/useJobEventStream';
import { useWorkflowPresentation } from '../composables/useWorkflowPresentation';
import ReportMarkdown from './ReportMarkdown.vue';
import StageLadder from './StageLadder.vue';

const props = defineProps<{
  open: boolean;
  jobId: string | null;
  orgSlug: string;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

type StreamHandle = ReturnType<typeof useJobEventStream>;

const job = ref<AgentJobRow | null>(null);
const loadError = ref<string | null>(null);
const showRawEvents = ref(false);

// Per-workflow presentation manifest. Loaded once per session, shared
// across modal opens. The legal-department slug is hardcoded for now —
// when other agents adopt the modal, this becomes a prop.
const { manifest, stagesFromEvents } =
  useWorkflowPresentation('legal-department');

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
    default:
      return 'medium';
  }
});

const extractedText = computed(() => {
  const data = job.value?.input as { data?: { content?: string } } | undefined;
  return data?.data?.content ?? '(no extracted text on this job)';
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

function formatTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString();
}

async function loadJob(id: string): Promise<void> {
  loadError.value = null;
  try {
    job.value = await legalJobsService.getJob(id, props.orgSlug);
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
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
</style>
