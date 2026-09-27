<template>
  <section class="panel">
    <div class="panel-header">
      <h3>Improvement requests</h3>
      <select v-model="status" class="lifecycle-select" :disabled="busy" @change="load">
        <option v-for="s in FILTERS" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
    </div>
    <p class="hint">
      Proposals from people reading run traces: a prompt to change, a model to swap, or a workflow step to rework.
      Decide each one here; the change itself is made in the agent or the workflow.
    </p>
    <p v-if="error" class="problem">{{ error }}</p>
    <p v-else-if="loading" class="hint">Loading...</p>
    <p v-else-if="requests.length === 0" class="hint">Nothing {{ status === 'all' ? 'yet' : `is ${status}` }}.</p>
    <article v-for="request in requests" :key="request.requestId" class="request">
      <header class="request-header">
        <span class="kind">{{ KIND_LABELS[request.kind] }}</span>
        <strong>{{ request.title }}</strong>
        <span :class="['status', `status--${request.status}`]">{{ request.status }}</span>
      </header>
      <p class="description">{{ request.description }}</p>
      <p class="hint">{{ request.workflowSlug }} · {{ new Date(request.createdAt).toLocaleString() }}</p>
      <p v-if="request.adminNotes" class="notes">Notes: {{ request.adminNotes }}</p>
      <div class="decide">
        <input v-model="notes[request.requestId]" class="note-input" placeholder="Notes for the requester (optional)" :disabled="busy" />
        <ion-button
          v-for="next in nextStatuses(request.status)"
          :key="next"
          size="small"
          fill="outline"
          :color="next === 'rejected' ? 'danger' : 'primary'"
          :disabled="busy"
          @click="decide(request, next)"
        >
          {{ ACTION_LABELS[next] }}
        </ion-button>
      </div>
    </article>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { ImprovementKind, ImprovementRequestView, ImprovementStatus } from '@orchestrator-ai/transport-types';
import { workflowsApiService } from '@/modules/workflows/services/workflows-api.service';

const props = defineProps<{ org: string }>();

const FILTERS: Array<{ value: ImprovementStatus | 'all'; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'done', label: 'Done' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];
const KIND_LABELS: Record<ImprovementKind, string> = { context: 'Prompt', model: 'Model', workflow: 'Workflow' };
const ACTION_LABELS: Record<ImprovementStatus, string> = { open: 'Reopen', accepted: 'Accept', rejected: 'Reject', done: 'Mark done' };

const status = ref<ImprovementStatus | 'all'>('open');
const requests = ref<ImprovementRequestView[]>([]);
const notes = reactive<Record<string, string>>({});
const loading = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

function nextStatuses(current: ImprovementStatus): ImprovementStatus[] {
  if (current === 'open') return ['accepted', 'rejected'];
  if (current === 'accepted') return ['done', 'rejected'];
  return ['open'];
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    requests.value = await workflowsApiService.fetchImprovements(status.value === 'all' ? undefined : status.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function decide(request: ImprovementRequestView, next: ImprovementStatus): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    const typed = notes[request.requestId]?.trim();
    await workflowsApiService.decideImprovement(request.requestId, next, typed ? typed : request.adminNotes);
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
watch(() => props.org, load);
</script>

<style scoped>
.panel-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.request { border: 1px solid var(--ion-color-light-shade); padding: 8px 12px; margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.request p { margin: 0; }
.request-header { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.kind { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--ion-color-medium); }
.status { margin-left: auto; font-size: 12px; color: var(--ion-color-medium); }
.status--accepted, .status--done { color: var(--ion-color-success); }
.status--rejected { color: var(--ion-color-danger); }
.description { white-space: pre-wrap; }
.notes { font-style: italic; }
.decide { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.note-input { flex: 1; min-width: 180px; padding: 6px; border: 1px solid var(--ion-color-medium-tint); background: var(--ion-background-color); color: var(--ion-text-color); font: inherit; }
.lifecycle-select { padding: 4px 6px; background: var(--ion-background-color); color: var(--ion-text-color); border: 1px solid var(--ion-color-medium-tint); }
.hint { color: var(--ion-color-medium); font-size: 13px; }
.problem { color: var(--ion-color-danger); }
</style>
