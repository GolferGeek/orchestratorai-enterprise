<template>
  <div class="detail-panel">
    <div v-if="!jobId" class="empty">
      <ion-icon :icon="documentTextOutline" size="large" color="medium" />
      <p>Select a job to see its details.</p>
    </div>

    <template v-else>
      <div class="header">
        <h2>{{ jobTitle }}</h2>
        <ion-badge :color="statusColor">{{ job?.status ?? '...' }}</ion-badge>
      </div>
      <div class="meta" v-if="job">
        <div><strong>Model:</strong> {{ job.model }}</div>
        <div><strong>Conversation:</strong> <code>{{ job.conversation_id }}</code></div>
        <div v-if="job.current_step"><strong>Step:</strong> {{ job.current_step }}</div>
        <div v-if="job.error" class="error"><strong>Error:</strong> {{ job.error }}</div>
      </div>

      <div class="section">
        <div class="section-header">
          <h3>Events</h3>
          <span class="count">{{ events.length }}</span>
          <span v-if="streaming" class="live">● live</span>
        </div>
        <div class="events-scroll">
          <div v-if="events.length === 0" class="empty-small">
            No events yet.
          </div>
          <div v-for="ev in events" :key="`${ev.id}-${ev.created_at}`" class="event">
            <span class="event-type">{{ ev.hook_event_type }}</span>
            <span v-if="ev.step" class="event-step">{{ ev.step }}</span>
            <span v-if="ev.message" class="event-message">{{ ev.message }}</span>
            <span class="event-time">{{ formatTime(ev.created_at) }}</span>
          </div>
        </div>
      </div>

      <div class="section" v-if="finalReportMarkdown">
        <div class="section-header">
          <h3>Final Report</h3>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="report markdown-body" v-html="finalReportHtml"></div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, computed } from 'vue';
import { IonIcon, IonBadge } from '@ionic/vue';
import { documentTextOutline } from 'ionicons/icons';
import { marked } from 'marked';
import {
  legalJobsService,
  type AgentJobRow,
  type ObservabilityEvent,
} from '../legalJobsService';

const props = defineProps<{
  jobId: string | null;
  orgSlug: string;
}>();

const job = ref<AgentJobRow | null>(null);
const events = ref<ObservabilityEvent[]>([]);
const streaming = ref(false);
const seenIds = new Set<string>();
let eventSource: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

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

const finalReportMarkdown = computed(() => {
  const result = job.value?.result as {
    response?: string;
    report?: string;
    reportMarkdown?: string;
  } | null;
  if (!result) return null;
  return result.reportMarkdown ?? result.report ?? result.response ?? null;
});

const finalReportHtml = computed(() => {
  const md = finalReportMarkdown.value;
  if (!md) return '';
  // `marked` with default options is safe enough for LLM-generated text we
  // render in our own admin UI. Gfm is on by default in v15.
  return marked.parse(md, { async: false }) as string;
});

function dedupeAdd(ev: ObservabilityEvent): void {
  const key = `${ev.id}-${ev.created_at}`;
  if (seenIds.has(key)) return;
  seenIds.add(key);
  events.value.push(ev);
  events.value.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

async function load(id: string): Promise<void> {
  try {
    job.value = await legalJobsService.getJob(id, props.orgSlug);
    const history = await legalJobsService.getJobEvents(id, props.orgSlug);
    events.value = [];
    seenIds.clear();
    for (const ev of history) dedupeAdd(ev);
  } catch (err) {
    console.error('load job detail failed:', err);
  }
}

function openStream(conversationId: string): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  try {
    eventSource = legalJobsService.openEventStream(conversationId);
    streaming.value = true;
    eventSource.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as ObservabilityEvent;
        dedupeAdd(parsed);
      } catch {
        // ignore malformed
      }
    };
    eventSource.onerror = () => {
      streaming.value = false;
    };
  } catch (err) {
    console.error('SSE open failed:', err);
    streaming.value = false;
  }
}

function formatTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString();
}

watch(
  () => props.jobId,
  async (id) => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      streaming.value = false;
    }
    job.value = null;
    events.value = [];
    seenIds.clear();
    if (!id) return;
    await load(id);
    const loaded = job.value as AgentJobRow | null;
    if (loaded) {
      openStream(loaded.conversation_id);
      // While the job is still running, poll the row every 3s so current_step
      // and progress update in the header. When the status transitions to
      // completed or failed, re-fetch the event history one more time so any
      // events that landed late make it into the panel.
      let lastStatus = loaded.status;
      pollTimer = setInterval(() => {
        if (job.value?.status !== 'processing' && job.value?.status !== 'queued') {
          return;
        }
        void legalJobsService
          .getJob(id, props.orgSlug)
          .then(async (row) => {
            job.value = row;
            if (
              (row.status === 'completed' || row.status === 'failed') &&
              lastStatus !== row.status
            ) {
              lastStatus = row.status;
              // Late-arriving events: refresh the history.
              try {
                const history = await legalJobsService.getJobEvents(
                  id,
                  props.orgSlug,
                );
                for (const ev of history) dedupeAdd(ev);
              } catch {
                // ignore
              }
            }
          })
          .catch(() => undefined);
      }, 3000);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (eventSource) eventSource.close();
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  overflow: auto;
  gap: 16px;
  background: var(--ion-color-step-50);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 24px;
  color: var(--ion-color-medium);
  flex: 1;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
}

.header h2 {
  margin: 0;
  font-size: 1.15em;
  word-break: break-word;
  flex: 1;
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

.section {
  background: var(--ion-background-color);
  border: 1px solid var(--ion-color-step-150);
  border-radius: 8px;
  padding: 12px 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.section-header h3 {
  margin: 0;
  font-size: 0.95em;
}

.section-header .count {
  font-size: 0.8em;
  color: var(--ion-color-medium);
}

.section-header .live {
  color: var(--ion-color-success);
  font-size: 0.75em;
  margin-left: auto;
}

.events-scroll {
  max-height: 360px;
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

.empty-small {
  color: var(--ion-color-medium);
  padding: 8px 0;
  font-size: 0.85em;
}

.report {
  background: var(--ion-color-step-50);
  padding: 16px 20px;
  border-radius: 6px;
  font-size: 0.9em;
  max-height: 520px;
  overflow-y: auto;
  margin: 0;
  line-height: 1.55;
}

.markdown-body :deep(h1) {
  font-size: 1.4em;
  font-weight: 700;
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--ion-color-step-200);
}

.markdown-body :deep(h2) {
  font-size: 1.15em;
  font-weight: 700;
  margin: 18px 0 8px;
  color: var(--ion-color-primary);
}

.markdown-body :deep(h3) {
  font-size: 1em;
  font-weight: 600;
  margin: 14px 0 6px;
}

.markdown-body :deep(p) {
  margin: 0 0 10px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 10px;
  padding-left: 22px;
}

.markdown-body :deep(li) {
  margin: 3px 0;
}

.markdown-body :deep(li p) {
  margin: 0;
}

.markdown-body :deep(strong) {
  color: var(--ion-color-dark);
  font-weight: 600;
}

.markdown-body :deep(code) {
  background: var(--ion-color-step-150);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.88em;
}

.markdown-body :deep(pre) {
  background: var(--ion-color-step-100);
  padding: 10px 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.85em;
  margin: 0 0 12px;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--ion-color-primary);
  padding: 2px 0 2px 14px;
  margin: 8px 0;
  color: var(--ion-color-medium);
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0 0 12px;
  font-size: 0.88em;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--ion-color-step-200);
  padding: 6px 10px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--ion-color-step-100);
  font-weight: 600;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--ion-color-step-200);
  margin: 14px 0;
}
</style>
