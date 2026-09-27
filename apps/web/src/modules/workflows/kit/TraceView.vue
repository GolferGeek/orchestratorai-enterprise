<template>
  <div class="trace">
    <p v-if="error" class="problem">{{ error }}</p>
    <p v-else-if="!trace" class="hint">Loading the trace...</p>
    <template v-else>
      <section v-if="reviews.length || askingReview" class="reviews">
        <form v-if="askingReview" class="review-form" @submit.prevent="requestReview">
          <strong>Ask the reviewer about {{ askingReview.label }}</strong>
          <p class="hint">
            The workflow's reviewer agent reads this step's inputs, outputs and instructions and says what would make it
            better. It takes a few seconds.
          </p>
          <textarea v-model="reviewNotes" rows="2" maxlength="2000" placeholder="What looks wrong? (optional)" />
          <div class="restart-actions">
            <ion-button type="submit" size="small" :disabled="reviewBusy">
              {{ reviewBusy ? 'Reviewing…' : 'Review' }}
            </ion-button>
            <ion-button fill="clear" size="small" color="medium" :disabled="reviewBusy" @click="askingReview = null">
              Cancel
            </ion-button>
          </div>
        </form>
        <p v-if="reviewError" class="problem">{{ reviewError }}</p>
        <TraceReviewCard
          v-for="review in [...reviews].reverse()"
          :key="review.reviewId"
          :review="review"
          :busy="reviewBusy"
          :can-restart="restartableUnit(review) !== null"
          :filed="filed[review.reviewId] ?? []"
          @improve="(index) => fileImprovement(review, index)"
          @restart="(text) => emit('restart', restartableUnit(review)!, text)"
        />
      </section>

      <p v-if="trace.workUnits.length === 0" class="hint">No steps recorded yet.</p>
      <section v-for="unit in trace.workUnits" :key="unit.workUnitId" class="unit">
        <header class="unit-header">
          <strong>{{ unit.slug }}</strong>
          <span class="pattern">{{ unit.pattern.replace('_', '/') }}</span>
          <span :class="['status', `status--${unit.status}`]">{{ unit.status.replace('_', ' ') }}</span>
          <span v-if="unit.durationMs !== null" class="duration">{{ seconds(unit.durationMs) }}</span>
          <button
            v-if="context && unit.status !== 'running'"
            class="restart-link"
            :disabled="reviewBusy"
            @click="askReview({ type: 'work_unit', id: unit.workUnitId, label: unit.slug })"
          >
            Review this step
          </button>
          <button
            v-if="unit.restart.eligible && restartingFrom !== unit.workUnitId"
            class="restart-link"
            :disabled="busy"
            @click="restartingFrom = unit.workUnitId"
          >
            Restart from here
          </button>
        </header>
        <p v-if="unit.error" class="problem">{{ unit.error }}</p>
        <form v-if="restartingFrom === unit.workUnitId" class="restart-form" @submit.prevent="submitRestart(unit.workUnitId)">
          <p class="hint">
            A new run keeps everything up to the end of this step and runs the rest again, with the organization's
            current models. This run is not changed.
          </p>
          <label>
            <span>Instruction for the agents (optional)</span>
            <textarea v-model="instruction" rows="3" maxlength="4000" placeholder="e.g. Weigh regulatory timing heavily" />
          </label>
          <div class="restart-actions">
            <ion-button type="submit" size="small" :disabled="busy">Start the new run</ion-button>
            <ion-button fill="clear" size="small" color="medium" @click="restartingFrom = null">Cancel</ion-button>
          </div>
        </form>
        <ul class="participants">
          <li
            v-for="p in unit.participants"
            :key="p.participantId"
            :class="['participant', { 'participant--selected': selected?.participantId === p.participantId }]"
            @click="select(p.participantId)"
          >
            <span class="stage">{{ p.stage }}</span>
            <span class="agent">{{ p.agentSlug }}</span>
            <span class="model">{{ p.model ?? '' }}</span>
            <span :class="['status', `status--${p.status}`]">{{ p.status }}</span>
          </li>
        </ul>
      </section>

      <section v-if="selected" class="detail">
        <h4>
          {{ selected.stage }} · {{ selected.agentSlug }} (v{{ selected.agentVersion ?? '?' }})
          <button
            v-if="context"
            class="restart-link"
            :disabled="reviewBusy"
            @click="askReview({ type: 'participant', id: selected.participantId, label: `${selected.agentSlug} (${selected.stage})` })"
          >
            Review this call
          </button>
        </h4>
        <p class="hint">
          {{ selected.provider }}/{{ selected.model }} · role {{ selected.modelRole ?? '—' }}
          <template v-if="selected.usage">
            · {{ selected.usage.inputTokens ?? '?' }} in / {{ selected.usage.outputTokens ?? '?' }} out
            <template v-if="selected.usage.cost !== null"> · ${{ selected.usage.cost.toFixed(5) }}</template>
          </template>
        </p>
        <p v-if="selected.error" class="problem">{{ selected.error }}</p>
        <h5>Input</h5>
        <pre>{{ show(selected.input) }}</pre>
        <h5>Output</h5>
        <pre>{{ show(selected.output) }}</pre>
        <template v-if="selected.rawOutput">
          <h5>Raw answer (did not match the agent's contract)</h5>
          <pre>{{ selected.rawOutput }}</pre>
        </template>
        <template v-if="selected.usage?.thinking">
          <h5>Reasoning</h5>
          <pre>{{ selected.usage.thinking }}</pre>
        </template>
      </section>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, shallowRef, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type {
  ExecutionContext,
  ParticipantDetail,
  RunTrace,
  TraceRef,
  TraceReviewTargetType,
  TraceReviewView,
} from '@orchestrator-ai/transport-types';
import TraceReviewCard from './TraceReviewCard.vue';
import { workflowRunsClient } from './workflowRunsClient';

const props = defineProps<{
  slug: string;
  runId: string;
  orgSlug: string;
  version: number;
  busy?: boolean;
  /** The run's context; reviews and improvement requests are invoked on it. Without it the trace is read-only. */
  context?: ExecutionContext;
}>();
const emit = defineEmits<{ restart: [workUnitRunId: string, instruction: string] }>();

const restartingFrom = ref<string | null>(null);
const instruction = ref('');

function submitRestart(workUnitRunId: string): void {
  emit('restart', workUnitRunId, instruction.value);
}

// Read-only views of recursive JSON: shallow refs (no deep unwrapping).
const trace = shallowRef<RunTrace | null>(null);
const selected = shallowRef<ParticipantDetail | null>(null);
const error = ref<string | null>(null);

const reviews = shallowRef<TraceReviewView[]>([]);
const askingReview = ref<{ type: TraceReviewTargetType; id: string; label: string } | null>(null);
const reviewNotes = ref('');
const reviewBusy = ref(false);
const reviewError = ref<string | null>(null);
/** Recommendations already filed as improvement requests, per review. */
const filed = ref<Record<string, number[]>>({});

function askReview(target: { type: TraceReviewTargetType; id: string; label: string }): void {
  askingReview.value = target;
  reviewNotes.value = '';
  reviewError.value = null;
}

async function requestReview(): Promise<void> {
  const target = askingReview.value;
  if (!target || !props.context) return;
  reviewBusy.value = true;
  reviewError.value = null;
  try {
    const result = await workflowRunsClient.invoke(props.context, {
      action: 'trace.review',
      runId: props.runId,
      target: { type: target.type, id: target.id },
      ...(reviewNotes.value.trim() ? { notes: reviewNotes.value.trim() } : {}),
    });
    askingReview.value = null;
    if (result.traceReview) reviews.value = [...reviews.value, result.traceReview];
  } catch (err) {
    reviewError.value = err instanceof Error ? err.message : String(err);
    // A failed review is recorded too; show it with its reason.
    reviews.value = await workflowRunsClient.getTraceReviews(props.slug, props.runId, props.orgSlug);
  } finally {
    reviewBusy.value = false;
  }
}

async function fileImprovement(review: TraceReviewView, index: number): Promise<void> {
  const rec = review.result?.recommendations[index];
  if (!rec || !props.context) return;
  reviewBusy.value = true;
  reviewError.value = null;
  try {
    await workflowRunsClient.invoke(props.context, {
      action: 'improvement.request',
      runId: props.runId,
      traceReviewId: review.reviewId,
      kind: rec.kind,
      title: rec.recommendation.length > 120 ? `${rec.recommendation.slice(0, 119)}…` : rec.recommendation,
      description: `${rec.recommendation}\n\nWhy: ${rec.rationale}\n\nFrom a review of ${review.target.label}.`,
    });
    filed.value = { ...filed.value, [review.reviewId]: [...(filed.value[review.reviewId] ?? []), index] };
  } catch (err) {
    reviewError.value = err instanceof Error ? err.message : String(err);
  } finally {
    reviewBusy.value = false;
  }
}

/**
 * Where to restart so the reviewed step runs again: the latest restartable
 * step before it (a restart resumes after its step). None when nothing before
 * it can restart.
 */
function restartableUnit(review: TraceReviewView): string | null {
  const units = trace.value?.workUnits ?? [];
  const index = units.findIndex((u) =>
    review.target.type === 'work_unit'
      ? u.workUnitId === review.target.id
      : u.participants.some((p) => p.participantId === review.target.id),
  );
  for (let i = index - 1; i >= 0; i--) {
    if (units[i]!.restart.eligible) return units[i]!.workUnitId;
  }
  return null;
}

async function load(): Promise<void> {
  try {
    const [loaded, loadedReviews] = await Promise.all([
      workflowRunsClient.getTrace(props.slug, props.runId, props.orgSlug),
      workflowRunsClient.getTraceReviews(props.slug, props.runId, props.orgSlug),
    ]);
    trace.value = loaded;
    reviews.value = loadedReviews;
    error.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function select(participantId: string): Promise<void> {
  try {
    selected.value = await workflowRunsClient.getParticipant(props.slug, props.runId, participantId, props.orgSlug);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function show(ref: TraceRef | null): string {
  if (!ref) return '—';
  const text = typeof ref.value === 'string' ? ref.value : JSON.stringify(ref.value, null, 2);
  return ref.truncated ? `${text}\n[cut for the trace]` : text;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

onMounted(load);
// The parent bumps `version` when the run moves on, so the trace follows it.
watch(() => props.version, load);
</script>

<style scoped>
.trace { display: flex; flex-direction: column; gap: 12px; font-size: 13px; }
.unit { border: 1px solid var(--ion-color-light-shade); padding: 10px 12px; }
.unit-header { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.pattern, .duration, .model, .hint { color: var(--ion-color-medium); }
.participants { list-style: none; margin: 8px 0 0; padding: 0; }
.participant { display: grid; grid-template-columns: 90px 1fr 1fr 80px; gap: 8px; padding: 4px 6px; cursor: pointer; }
.participant:hover, .participant--selected { background: var(--ion-color-light); }
.stage { font-weight: 600; }
.status--failed { color: var(--ion-color-danger); }
.status--completed_partial { color: var(--ion-color-warning-shade); }
.detail { border-top: 2px solid var(--ion-color-light-shade); padding-top: 8px; }
.detail h4 { margin: 0 0 4px; }
pre { white-space: pre-wrap; word-break: break-word; background: var(--ion-color-light); padding: 8px; max-height: 320px; overflow: auto; }
.problem { color: var(--ion-color-danger); }
.reviews { display: flex; flex-direction: column; gap: 8px; }
.review-form { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; background: var(--ion-color-light); }
.review-form textarea { padding: 6px; border: 1px solid var(--ion-color-medium-tint); background: var(--ion-background-color); color: var(--ion-text-color); font: inherit; }
.review-form .hint { margin: 0; }
.restart-link + .restart-link { margin-left: 12px; }
.detail h4 .restart-link { margin-left: 12px; font-size: 12px; font-weight: 400; }
.restart-link { margin-left: auto; background: none; border: none; padding: 0; color: var(--ion-color-primary); font: inherit; cursor: pointer; }
.restart-form { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; padding: 8px 10px; background: var(--ion-color-light); }
.restart-form label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; }
.restart-form textarea { padding: 6px; border: 1px solid var(--ion-color-medium-tint); background: var(--ion-background-color); color: var(--ion-text-color); font: inherit; font-weight: 400; }
.restart-form .hint { margin: 0; }
.restart-actions { display: flex; gap: 4px; }
@media (max-width: 640px) { .participant { grid-template-columns: 1fr 1fr; } }
</style>
