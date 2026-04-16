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
      <template v-else-if="job && jobId">
        <LegalResearchReviewSection
          v-if="branch === 'research'"
          :job="job"
          :job-id="jobId"
          :context="context"
          @reviewed="onReviewed"
        />
        <DealMemoReviewSection
          v-else-if="branch === 'deal-memo'"
          :job="job"
          :job-id="jobId"
          :context="context"
          @reviewed="onReviewed"
        />
        <DocumentAnalysisReviewSection
          v-else
          :job="job"
          :job-id="jobId"
          :org-slug="orgSlug"
          :context="context"
          @reviewed="onReviewed"
        />
      </template>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
/**
 * LegalJobReviewModal — thin dispatcher.
 *
 * Opened when a reviewer clicks an `awaiting_review` job in the activity
 * list. Loads the job once via GET /jobs/:id (the API augments the
 * response with the LangGraph checkpoint's reviewPayload), then renders
 * one of three section components based on job type:
 *
 *   - `legal-research`        → LegalResearchReviewSection
 *   - `deal-memo-generation`  → DealMemoReviewSection
 *   - everything else (document analysis / contract review) → DocumentAnalysisReviewSection
 *
 * Each section owns its own decision UI and POSTs to /jobs/:id/review.
 * No graph work runs on the HTTP thread — the API records the decision
 * and flips the row back to `queued`; the worker resumes the graph on
 * the next tick via Command({ resume }).
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
} from '../legalJobsService';
import LegalResearchReviewSection from './LegalResearchReviewSection.vue';
import DealMemoReviewSection from './DealMemoReviewSection.vue';
import DocumentAnalysisReviewSection from './DocumentAnalysisReviewSection.vue';

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

/** Which review section to render. */
const branch = computed<'research' | 'deal-memo' | 'document-analysis'>(() => {
  const input = job.value?.input as
    | { metadata?: { jobType?: string } }
    | undefined;
  const metaType = input?.metadata?.jobType;
  const rowType = job.value?.job_type;
  if (metaType === 'legal-research' || rowType === 'legal-research') {
    return 'research';
  }
  if (
    metaType === 'deal-memo-generation' ||
    rowType === 'deal-memo-generation' ||
    job.value?.reviewPayload?.gate === 'deal-memo'
  ) {
    return 'deal-memo';
  }
  return 'document-analysis';
});

function onReviewed(payload: { jobId: string }): void {
  emit('reviewed', payload);
  emit('close');
}

watch(
  () => [props.open, props.jobId] as const,
  async ([open, id]) => {
    if (!open || !id) {
      job.value = null;
      error.value = null;
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
</script>

<style scoped>
.state {
  padding: 24px;
  color: var(--ion-color-medium);
}
.state.error {
  color: var(--ion-color-danger);
}
</style>
