<template>
  <ion-modal :is-open="open" @did-dismiss="$emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>HITL Review — {{ jobId ?? '' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="$emit('close')">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="loading" class="state">Loading review payload…</div>
      <div v-else-if="error" class="state error">{{ error }}</div>
      <template v-else-if="job">
        <section class="section">
          <h3>Documents</h3>
          <ul>
            <li v-for="doc in reviewPayload?.documentsSummary ?? []" :key="doc.name">
              {{ doc.name }}
              <span v-if="doc.type" class="muted">({{ doc.type }})</span>
              — {{ doc.length }} chars
            </li>
          </ul>
        </section>

        <section v-if="reviewPayload?.synthesis" class="section">
          <h3>Synthesis</h3>
          <pre class="payload">{{ formatJson(reviewPayload.synthesis) }}</pre>
        </section>

        <section class="section">
          <h3>Specialist Outputs</h3>
          <div
            v-for="[key, output] in specialistEntries"
            :key="key"
            class="specialist"
          >
            <label>
              <strong>{{ key }}</strong>
              <textarea
                :value="editedJson[key] ?? formatJson(output)"
                rows="6"
                @input="onSpecialistEdit(key, $event)"
              />
            </label>
          </div>
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

          <div v-if="decision === 'reject' || decision === 'modify'" class="feedback">
            <label>
              Feedback
              <textarea
                v-model="feedback"
                rows="3"
                placeholder="Tell the specialists what to address on re-run…"
              />
            </label>
          </div>

          <div v-if="submitError" class="state error">{{ submitError }}</div>

          <ion-button
            expand="block"
            color="primary"
            :disabled="!canSubmit || submitting"
            @click="submit"
          >
            {{ submitting ? 'Submitting…' : 'Submit decision' }}
          </ion-button>
        </section>
      </template>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
/**
 * LegalJobReviewModal
 *
 * Opened when a reviewer clicks an `awaiting_review` job in the activity
 * list. Reads the review payload straight from GET /jobs/:id (the API
 * augments the response with specialistOutputs + synthesis read from the
 * LangGraph checkpointer), lets the reviewer pick approve / reject +
 * feedback / modify + edited outputs, then POSTs to /jobs/:id/review.
 *
 * No graph work runs on the HTTP thread — the API simply records the
 * decision and flips the row back to `queued`; the worker picks it up on
 * the next tick and resumes the compiled graph via Command({ resume }).
 */
import { computed, ref, watch } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
} from '@ionic/vue';
import {
  legalJobsService,
  type AgentJobRow,
  type ExecutionContextLike,
  type ReviewDecisionPayload,
} from '../legalJobsService';

const props = defineProps<{
  open: boolean;
  jobId: string | null;
  orgSlug: string;
  context: ExecutionContextLike | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'reviewed', payload: { jobId: string }): void;
}>();

const job = ref<AgentJobRow | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const submitError = ref<string | null>(null);
const submitting = ref(false);

const decision = ref<'approve' | 'reject' | 'modify'>('approve');
const feedback = ref('');
const editedJson = ref<Record<string, string>>({});

const reviewPayload = computed(() => job.value?.reviewPayload);

const specialistEntries = computed<Array<[string, unknown]>>(() => {
  const outputs = reviewPayload.value?.specialistOutputs ?? {};
  return Object.entries(outputs);
});

const canSubmit = computed(() => {
  if (!props.context || !props.jobId) return false;
  if (decision.value === 'reject' && !feedback.value.trim()) return false;
  return true;
});

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function onSpecialistEdit(key: string, event: Event): void {
  const target = event.target as HTMLTextAreaElement;
  editedJson.value[key] = target.value;
}

watch(
  () => [props.open, props.jobId] as const,
  async ([open, id]) => {
    if (!open || !id) {
      job.value = null;
      error.value = null;
      submitError.value = null;
      decision.value = 'approve';
      feedback.value = '';
      editedJson.value = {};
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      job.value = await legalJobsService.getJob(id, props.orgSlug);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

async function submit(): Promise<void> {
  if (!props.context || !props.jobId) return;
  submitError.value = null;
  submitting.value = true;

  let payload: ReviewDecisionPayload;
  if (decision.value === 'approve') {
    payload = { decision: 'approve' };
  } else if (decision.value === 'reject') {
    payload = { decision: 'reject', feedback: feedback.value.trim() };
  } else {
    // modify — parse edited JSON for each specialist the reviewer touched.
    const editedOutputs: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(editedJson.value)) {
      try {
        editedOutputs[key] = JSON.parse(raw);
      } catch (e) {
        submitError.value = `Specialist "${key}" has invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
        submitting.value = false;
        return;
      }
    }
    payload = {
      decision: 'modify',
      editedOutputs,
      feedback: feedback.value.trim() || undefined,
    };
  }

  try {
    await legalJobsService.review(props.jobId, props.context, payload);
    emit('reviewed', { jobId: props.jobId });
    emit('close');
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.state {
  padding: 24px;
  color: var(--ion-color-medium);
}
.state.error {
  color: var(--ion-color-danger);
}
.section {
  padding: 16px 24px;
  border-bottom: 1px solid var(--ion-color-step-150);
}
.section h3 {
  margin: 0 0 8px 0;
}
.payload {
  background: var(--ion-color-step-50);
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  max-height: 240px;
  overflow: auto;
}
.specialist {
  margin-bottom: 12px;
}
.specialist textarea,
.feedback textarea {
  width: 100%;
  font-family: var(--ion-font-family, monospace);
  font-size: 12px;
  padding: 8px;
  border: 1px solid var(--ion-color-step-200);
  border-radius: 4px;
}
.decision-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.muted {
  color: var(--ion-color-medium);
}
</style>
