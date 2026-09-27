<template>
  <section class="run-view">
    <header class="run-header">
      <div class="run-title">
        <h2>{{ title }}</h2>
        <span :class="['status', `status--${run.status}`]">{{ statusLabel }}</span>
      </div>
      <ExportMenu
        v-if="exportable && run.status === 'completed'"
        :slug="run.workflowSlug"
        :run-id="run.runId"
        :org-slug="run.context.orgSlug"
      />
      <ion-button v-if="cancellable" fill="outline" color="medium" size="small" :disabled="busy" @click="emit('cancel')">
        Cancel run
      </ion-button>
    </header>

    <p v-if="run.restart" class="lineage">
      Restarted after <strong>{{ run.restart.fromWorkUnitSlug }}</strong> of
      <button class="link" @click="emit('open-run', run.restart.parentRunId)">an earlier run</button>
      <template v-if="run.restart.instruction">, with the instruction “{{ run.restart.instruction }}”</template>
    </p>

    <div v-if="active" class="progress">
      <div class="progress-bar"><div class="progress-fill" :style="{ width: `${run.progress ?? 0}%` }" /></div>
      <span class="progress-text">{{ run.lastMessage ?? run.currentStep ?? 'Queued' }}</span>
    </div>
    <p v-if="run.status === 'failed'" class="problem">This run failed: {{ run.error }}</p>
    <p v-if="error" class="problem">{{ error }}</p>

    <nav class="tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        role="tab"
        :aria-selected="current === tab.id"
        :class="['tab', { 'tab--current': current === tab.id }]"
        @click="current = tab.id"
      >
        {{ tab.label }}<span v-if="tab.id === 'review' && run.review" class="dot" />
      </button>
    </nav>

    <div class="tab-body">
      <template v-if="current === 'result'">
        <slot v-if="run.status === 'completed'" name="result" :result="run.result" />
        <p v-else class="hint">{{ resultHint }}</p>
      </template>
      <template v-else-if="current === 'review'">
        <ReviewPanel
          v-if="run.review"
          :key="run.review.reviewId"
          :review="run.review"
          :busy="busy"
          @decide="(decision) => emit('decide', run.review!.reviewId, decision)"
        >
          <template #item="{ item }"><slot name="review-item" :item="item" /></template>
        </ReviewPanel>
        <p v-else class="hint">Nothing is waiting for you.</p>
      </template>
      <ActivityList v-else-if="current === 'activity'" :events="events" />
      <IssuesView
        v-else-if="current === 'issues'"
        :slug="run.workflowSlug"
        :run-id="run.runId"
        :org-slug="run.context.orgSlug"
        :version="events.length"
      />
      <TraceView
        v-else
        :slug="run.workflowSlug"
        :run-id="run.runId"
        :org-slug="run.context.orgSlug"
        :version="events.length"
        :busy="busy"
        @restart="(workUnitRunId, instruction) => emit('restart', workUnitRunId, instruction)"
      />
    </div>
  </section>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { HumanReviewDecision, WorkflowRunView } from '@orchestrator-ai/transport-types';
import { TERMINAL_WORKFLOW_RUN_STATUSES } from '@orchestrator-ai/transport-types';
import ActivityList from './ActivityList.vue';
import ExportMenu from './ExportMenu.vue';
import IssuesView from './IssuesView.vue';
import ReviewPanel from './ReviewPanel.vue';
import TraceView from './TraceView.vue';
import type { WorkflowStreamEvent } from './workflowRunsClient';

type TabId = 'result' | 'review' | 'issues' | 'activity' | 'trace';

const props = defineProps<{
  run: WorkflowRunView;
  events: WorkflowStreamEvent[];
  busy: boolean;
  error: string | null;
  title: string;
  /** The workflow registers an exporter: offer the completed run's report as a file. */
  exportable?: boolean;
}>();
const emit = defineEmits<{
  decide: [reviewId: string, decision: HumanReviewDecision];
  cancel: [];
  /** Branch a new run from this one after a step (Trace tab). */
  restart: [workUnitRunId: string, instruction: string];
  /** Show another run, e.g. the one this was restarted from. */
  'open-run': [runId: string];
}>();

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'result', label: 'Result' },
  { id: 'review', label: 'Review' },
  { id: 'issues', label: 'Issues' },
  { id: 'activity', label: 'Activity' },
  { id: 'trace', label: 'Trace' },
];

const STATUS_LABELS: Record<WorkflowRunView['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  awaiting_review: 'Waiting for you',
  awaiting_answer: 'Waiting for your answer',
  cancel_requested: 'Canceling',
  canceled: 'Canceled',
  completed: 'Completed',
  failed: 'Failed',
};

const active = computed(() => !TERMINAL_WORKFLOW_RUN_STATUSES.includes(props.run.status) && !props.run.review);
const cancellable = computed(() => ['queued', 'running', 'awaiting_review', 'awaiting_answer'].includes(props.run.status));
const statusLabel = computed(() => STATUS_LABELS[props.run.status]);
const resultHint = computed(() =>
  props.run.status === 'failed' || props.run.status === 'canceled'
    ? 'There is no result for this run.'
    : 'The result appears here when the run completes.',
);

const current = ref<TabId>(props.run.review ? 'review' : props.run.status === 'completed' ? 'result' : 'activity');
// Go where the run needs you: its review when it waits, its result when done.
watch(
  () => [props.run.review?.reviewId, props.run.status] as const,
  ([reviewId, status], [previousReviewId, previousStatus]) => {
    if (reviewId && reviewId !== previousReviewId) current.value = 'review';
    else if (status === 'completed' && previousStatus !== 'completed') current.value = 'result';
  },
);
</script>

<style scoped>
.run-view { display: flex; flex-direction: column; gap: 12px; }
.run-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.run-title { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.run-title h2 { margin: 0; font-size: 20px; }
.status { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--ion-color-medium); }
.status--awaiting_review, .status--awaiting_answer { color: var(--ion-color-warning-shade); }
.status--completed { color: var(--ion-color-success); }
.status--failed { color: var(--ion-color-danger); }
.progress { display: flex; align-items: center; gap: 12px; }
.progress-bar { flex: 0 0 200px; height: 6px; background: var(--ion-color-light-shade); }
.progress-fill { height: 100%; background: var(--ion-color-primary); transition: width 0.3s; }
.progress-text { color: var(--ion-color-medium); font-size: 13px; }
.problem { color: var(--ion-color-danger); margin: 0; }
.lineage { margin: 0; font-size: 13px; color: var(--ion-color-medium); }
.link { background: none; border: none; padding: 0; color: var(--ion-color-primary); font: inherit; cursor: pointer; text-decoration: underline; }
.hint { color: var(--ion-color-medium); }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--ion-color-light-shade); }
.tab { background: none; border: none; padding: 8px 12px; color: var(--ion-color-medium); font: inherit; cursor: pointer; border-bottom: 2px solid transparent; }
.tab--current { color: var(--ion-text-color); border-bottom-color: var(--ion-color-primary); }
.dot { display: inline-block; width: 6px; height: 6px; margin-left: 6px; border-radius: 50%; background: var(--ion-color-warning); vertical-align: middle; }
@media (max-width: 640px) { .progress-bar { flex-basis: 100px; } }
</style>
