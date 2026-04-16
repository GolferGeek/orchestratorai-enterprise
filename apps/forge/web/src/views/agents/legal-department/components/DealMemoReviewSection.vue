<template>
  <div class="memo-review">
    <section class="section">
      <h3>
        Deal Memo Review
        <span v-if="memoDealStructure" class="muted memo-deal-tag">
          ({{ formatStructure(memoDealStructure) }})
        </span>
      </h3>
      <p class="muted">
        Approve to finalize. Reject to re-draft all five sections with
        feedback. Modify to edit individual sections inline.
      </p>
    </section>

    <section v-if="memoSectionDraftEntries.length" class="section">
      <h3>Sections</h3>
      <details
        v-for="[id, draft] in memoSectionDraftEntries"
        :key="`memo-${id}`"
        class="memo-section"
        open
      >
        <summary>
          <strong>{{ memoSectionLabel(id) }}</strong>
          <span class="muted">
            — {{ draft.citations?.length ?? 0 }} citation{{
              (draft.citations?.length ?? 0) === 1 ? '' : 's'
            }}
          </span>
        </summary>
        <template v-if="decision !== 'modify'">
          <pre class="memo-draft">{{ draft.draft }}</pre>
        </template>
        <template v-else>
          <textarea
            class="memo-draft-edit"
            rows="10"
            :value="memoEditedDrafts[id] ?? draft.draft"
            @input="onMemoSectionEdit(id, $event)"
          />
        </template>
      </details>
    </section>

    <section v-if="memoMarkdownPreview" class="section">
      <h3>Synthesized Memo (preview)</h3>
      <ReportMarkdown :markdown="memoMarkdownPreview" />
    </section>

    <section class="section">
      <h3>Decision</h3>
      <div class="decision-tabs">
        <ion-button
          :color="decision === 'approve' ? 'success' : 'medium'"
          :fill="decision === 'approve' ? 'solid' : 'outline'"
          @click="decision = 'approve'"
        >
          Approve
        </ion-button>
        <ion-button
          :color="decision === 'reject' ? 'danger' : 'medium'"
          :fill="decision === 'reject' ? 'solid' : 'outline'"
          @click="decision = 'reject'"
        >
          Reject
        </ion-button>
        <ion-button
          :color="decision === 'modify' ? 'warning' : 'medium'"
          :fill="decision === 'modify' ? 'solid' : 'outline'"
          @click="decision = 'modify'"
        >
          Modify
        </ion-button>
      </div>

      <div
        v-if="decision === 'reject' || decision === 'modify'"
        class="feedback"
      >
        <label>
          Feedback
          <textarea
            v-model="feedback"
            rows="3"
            placeholder="Tell the drafters what to address on re-run…"
          />
        </label>
      </div>

      <div v-if="submitError" class="state error">{{ submitError }}</div>

      <ion-button
        expand="block"
        color="primary"
        :disabled="!canSubmit || submitting"
        @click="submitDecision"
      >
        {{ submitting ? 'Submitting…' : 'Submit decision' }}
      </ion-button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonButton } from '@ionic/vue';
import {
  legalJobsService,
  type AgentJobRow,
  type ExecutionContextLike,
  type ReviewDecisionPayload,
} from '../legalJobsService';
import ReportMarkdown from './ReportMarkdown.vue';
import { humanizeKey } from './legal-review.utils';

const props = defineProps<{
  job: AgentJobRow;
  jobId: string;
  context: ExecutionContextLike | null;
}>();

const emit = defineEmits<{
  (e: 'reviewed', payload: { jobId: string }): void;
}>();

const reviewPayload = computed(() => props.job.reviewPayload);

const memoSectionDraftsValue = computed(() => {
  const drafts = (reviewPayload.value?.sectionDrafts ?? {}) as Record<
    string,
    { draft: string; citations: unknown[] }
  >;
  return drafts;
});

const memoSectionDraftEntries = computed<
  Array<[string, { draft: string; citations: unknown[] }]>
>(() => {
  const order = [
    'reps-warranties',
    'indemnification',
    'disclosure-schedules',
    'conditions-precedent',
    'covenants',
  ];
  const drafts = memoSectionDraftsValue.value;
  return order
    .filter((id) => !!drafts[id])
    .map(
      (id) =>
        [id, drafts[id]] as [string, { draft: string; citations: unknown[] }],
    );
});

const memoMarkdownPreview = computed<string | null>(() => {
  const v = reviewPayload.value?.memoMarkdown;
  return typeof v === 'string' && v.length > 0 ? v : null;
});

const memoDealStructure = computed<string | null>(
  () => (reviewPayload.value?.dealStructure as string | undefined) ?? null,
);

const decision = ref<'approve' | 'reject' | 'modify'>('approve');
const feedback = ref('');
/** Per-section markdown edits made by the reviewer in modify mode. */
const memoEditedDrafts = ref<Record<string, string>>({});
const submitError = ref<string | null>(null);
const submitting = ref(false);

function memoSectionLabel(id: string): string {
  switch (id) {
    case 'reps-warranties':
      return 'Representations & Warranties';
    case 'indemnification':
      return 'Indemnification';
    case 'disclosure-schedules':
      return 'Disclosure Schedules';
    case 'conditions-precedent':
      return 'Conditions Precedent';
    case 'covenants':
      return 'Covenants';
    default:
      return humanizeKey(id);
  }
}

function formatStructure(s: string): string {
  switch (s) {
    case 'stock-purchase':
      return 'Stock Purchase';
    case 'asset-purchase':
      return 'Asset Purchase';
    case 'merger':
      return 'Merger';
    default:
      return s;
  }
}

function onMemoSectionEdit(id: string, event: Event): void {
  const target = event.target as HTMLTextAreaElement;
  memoEditedDrafts.value = { ...memoEditedDrafts.value, [id]: target.value };
}

const canSubmit = computed(() => {
  if (!props.context || !props.jobId) return false;
  if (decision.value === 'reject' && !feedback.value.trim()) return false;
  return true;
});

async function submitDecision(): Promise<void> {
  if (!props.context || !props.jobId) return;
  submitError.value = null;
  submitting.value = true;

  let payload: ReviewDecisionPayload;
  if (decision.value === 'approve') {
    payload = { decision: 'approve' };
  } else if (decision.value === 'reject') {
    payload = { decision: 'reject', feedback: feedback.value.trim() };
  } else {
    // modify — gather only sections the reviewer actually edited and ship
    // them back as { draft, citations } pairs. Existing citations are
    // preserved verbatim; the drafter can rewrite the prose only.
    const drafts = memoSectionDraftsValue.value;
    const editedOutputs: Record<
      string,
      { draft: string; citations: unknown[] }
    > = {};
    for (const [id, edited] of Object.entries(memoEditedDrafts.value)) {
      const original = drafts[id];
      if (!original) continue;
      const trimmed = edited.trim();
      if (!trimmed) continue;
      if (trimmed === original.draft.trim()) continue;
      editedOutputs[id] = { draft: edited, citations: original.citations };
    }
    if (Object.keys(editedOutputs).length === 0) {
      submitError.value =
        'Modify selected but no section was edited. Edit at least one section or pick Approve / Reject.';
      submitting.value = false;
      return;
    }
    payload = {
      decision: 'modify',
      editedOutputs,
      ...(feedback.value.trim() ? { feedback: feedback.value.trim() } : {}),
    };
  }

  try {
    await legalJobsService.review(props.jobId, props.context, payload);
    emit('reviewed', { jobId: props.jobId });
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.memo-review {
  display: flex;
  flex-direction: column;
}

.section {
  padding: 16px 24px;
  border-bottom: 1px solid var(--ion-color-step-200);
  color: var(--ion-text-color);
}
.section h3 {
  margin: 0 0 8px 0;
  color: var(--ion-text-color);
}

.state {
  padding: 24px;
  color: var(--ion-color-medium);
}
.state.error {
  color: var(--ion-color-danger);
}

.muted {
  color: var(--ion-color-medium);
}

.memo-deal-tag {
  font-weight: 400;
  margin-left: 6px;
  font-size: 0.85em;
}

.memo-section {
  margin: 8px 0;
  border: 1px solid var(--ion-color-step-200);
  border-radius: 6px;
  padding: 8px 12px;
  background: var(--ion-background-color);
}

.memo-section summary {
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  color: var(--ion-text-color);
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.memo-draft {
  margin: 8px 0 0;
  padding: 10px 12px;
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
  border: 1px solid var(--ion-color-step-200);
  border-radius: 4px;
  font-family: var(--ion-font-family, monospace);
  font-size: 12.5px;
  line-height: 1.55;
  max-height: 360px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.memo-draft-edit {
  width: 100%;
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
  border: 1px solid var(--ion-color-step-300);
  border-radius: 4px;
  font-family: var(--ion-font-family, monospace);
  font-size: 12.5px;
  line-height: 1.55;
  resize: vertical;
}

.memo-draft-edit:focus {
  outline: none;
  border-color: var(--ion-color-primary);
}

.decision-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.feedback label {
  display: block;
  color: var(--ion-text-color);
  font-size: 13px;
  margin-bottom: 4px;
}

.feedback textarea {
  width: 100%;
  font-family: var(--ion-font-family, monospace);
  font-size: 12px;
  padding: 8px;
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
  border: 1px solid var(--ion-color-step-300);
  border-radius: 4px;
  margin-top: 4px;
}
</style>
