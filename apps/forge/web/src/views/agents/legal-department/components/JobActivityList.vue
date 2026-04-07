<template>
  <div class="activity-list">
    <div class="list-header">
      <h3>{{ title }}</h3>
      <span class="count" v-if="jobs.length > 0">{{ jobs.length }}</span>
      <div class="spacer" />
      <slot name="header-actions" />
    </div>

    <div v-if="loading && jobs.length === 0" class="empty">
      <ion-spinner name="crescent" />
      <p>Loading jobs…</p>
    </div>

    <div v-else-if="error" class="error">
      <ion-icon :icon="alertCircleOutline" color="danger" />
      <p>{{ error }}</p>
      <ion-button size="small" @click="refresh">Retry</ion-button>
    </div>

    <div v-else-if="jobs.length === 0" class="empty">
      <ion-icon :icon="documentOutline" size="large" color="medium" />
      <p>No jobs yet.</p>
      <p class="hint">{{ emptyHint }}</p>
    </div>

    <ion-list v-else lines="full" class="rows">
      <ion-item
        v-for="job in jobs"
        :key="job.id"
        button
        :detail="false"
        :class="{ selected: selectedId === job.id }"
        @click="handleClick(job)"
      >
        <ion-icon :icon="statusIcon(job.status)" :color="statusColor(job.status)" slot="start" />
        <ion-label>
          <h3>{{ jobTitle(job) }}</h3>
          <p>
            <ion-badge :color="statusColor(job.status)">{{ job.status }}</ion-badge>
            <span v-if="job.current_step" class="step"> · {{ job.current_step }}</span>
            <span class="model"> · {{ job.model }}</span>
          </p>
          <p class="timing">
            <span>{{ formatRelative(job.queued_at) }}</span>
            <span v-if="job.status === 'processing' && job.started_at">
              · running {{ durationSince(job.started_at) }}
            </span>
            <span v-else-if="job.completed_at && job.started_at">
              · took {{ durationBetween(job.started_at, job.completed_at) }}
            </span>
          </p>
        </ion-label>
      </ion-item>
    </ion-list>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import {
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonBadge,
  IonSpinner,
  IonButton,
} from '@ionic/vue';
import {
  alertCircleOutline,
  documentOutline,
  hourglassOutline,
  playCircleOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
} from 'ionicons/icons';
import {
  legalJobsService,
  type AgentJobRow,
  type JobStatus,
} from '../legalJobsService';

const props = defineProps<{
  orgSlug: string;
  title?: string;
  /** Filter the list to a specific capability (e.g. 'document-onboarding'). */
  capabilitySlug?: string;
  selectedId?: string | null;
  pollMs?: number;
  emptyHint?: string;
}>();

const emit = defineEmits<{
  (e: 'select', job: AgentJobRow): void;
  (e: 'update', jobs: AgentJobRow[]): void;
}>();

const jobs = ref<AgentJobRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const title = computed(() => props.title ?? 'Activity');
const emptyHint = computed(
  () => props.emptyHint ?? 'Start a new job to see it appear here.',
);

async function refresh(): Promise<void> {
  if (!props.orgSlug) return;
  loading.value = true;
  error.value = null;
  try {
    const rows = await legalJobsService.listJobs(props.orgSlug, { limit: 100 });
    const filtered = props.capabilitySlug
      ? rows.filter((j) => {
          const data = (j.input as { data?: { capabilitySlug?: string } })?.data;
          return data?.capabilitySlug === props.capabilitySlug;
        })
      : rows;
    jobs.value = filtered;
    emit('update', filtered);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function handleClick(job: AgentJobRow): void {
  emit('select', job);
}

function jobTitle(job: AgentJobRow): string {
  const data = job.input as { data?: { filename?: string; content?: string } };
  if (data?.data?.filename) return data.data.filename;
  const content = data?.data?.content;
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim().slice(0, 60) + (content.length > 60 ? '…' : '');
  }
  return `Job ${job.id.slice(0, 8)}`;
}

function statusIcon(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return hourglassOutline;
    case 'processing':
      return playCircleOutline;
    case 'completed':
      return checkmarkCircleOutline;
    case 'failed':
      return closeCircleOutline;
  }
}

function statusColor(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return 'medium';
    case 'processing':
      return 'primary';
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const secs = Math.floor((now - then) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function durationSince(iso: string): string {
  const elapsed = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return formatDurationSec(elapsed);
}

function durationBetween(startIso: string, endIso: string): string {
  const secs = Math.floor(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000,
  );
  return formatDurationSec(secs);
}

function formatDurationSec(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

onMounted(() => {
  void refresh();
  const interval = props.pollMs ?? 5000;
  pollTimer = setInterval(() => {
    void refresh();
  }, interval);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

watch(
  () => [props.orgSlug, props.capabilitySlug],
  () => void refresh(),
);

defineExpose({ refresh });
</script>

<style scoped>
.activity-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  overflow: auto;
}

.list-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.list-header h3 {
  margin: 0;
  font-weight: 600;
}

.count {
  font-size: 0.9em;
  color: var(--ion-color-medium);
  background: var(--ion-color-step-100);
  padding: 2px 8px;
  border-radius: 10px;
}

.spacer {
  flex: 1;
}

.empty,
.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  text-align: center;
  color: var(--ion-color-medium);
}

.empty .hint {
  font-size: 0.85em;
}

.rows ion-item.selected {
  --background: var(--ion-color-primary-tint);
  --color: var(--ion-color-primary-contrast);
}

.step {
  color: var(--ion-color-primary);
}

.model {
  color: var(--ion-color-medium);
}

.timing {
  font-size: 0.8em;
  color: var(--ion-color-medium);
}
</style>
