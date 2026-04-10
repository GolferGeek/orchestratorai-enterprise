<template>
  <ion-modal :is-open="open" @did-dismiss="$emit('close')">
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>Review Stress Test</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">Close</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <div v-if="loading" class="state">
          <ion-spinner />
          Loading stress test for review...
        </div>

        <div v-else-if="error" class="state error">{{ error }}</div>

        <div v-else-if="submitting" class="state">
          <ion-spinner />
          Submitting review decision...
        </div>

        <template v-else-if="stressTestReport">
          <StressTestReport
            :report="stressTestReport"
            :interactive="true"
            @fortify="onFortify"
            @approve-without="onApproveWithout"
            @rerun="onRerun"
          />
        </template>

        <div v-else class="state">
          No stress test report available for review.
        </div>
      </ion-content>
    </ion-page>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
  IonModal,
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonSpinner,
} from '@ionic/vue';
import StressTestReport from './StressTestReport.vue';
import { legalJobsService } from '../legalJobsService';
import type { ExecutionContextLike } from '../legalJobsService';

const props = defineProps<{
  open: boolean;
  jobId: string | null;
  orgSlug: string;
  context: ExecutionContextLike | null;
}>();

const emit = defineEmits<{
  close: [];
  reviewed: [payload: { jobId: string }];
}>();

const loading = ref(false);
const submitting = ref(false);
const error = ref<string | null>(null);
const job = ref<Record<string, unknown> | null>(null);

const stressTestReport = computed(() => {
  const result = job.value?.result as Record<string, unknown> | null;
  if (!result) return null;
  // The report may be at different paths depending on the job result shape
  return (
    (result.stressTestReport as Record<string, unknown> | null) ??
    (result.output as Record<string, unknown> | null)?.stressTestReport ??
    null
  );
});

watch(
  () => [props.open, props.jobId],
  async ([open, jobId]) => {
    if (!open || !jobId) return;
    loading.value = true;
    error.value = null;
    try {
      const fetched = await legalJobsService.getJob(
        jobId as string,
        props.orgSlug,
      );
      job.value = fetched as unknown as Record<string, unknown>;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  },
);

async function submitDecision(decision: Record<string, unknown>) {
  if (!props.jobId || !props.context) return;
  submitting.value = true;
  error.value = null;
  try {
    await legalJobsService.review(props.jobId, props.context, decision);
    emit('reviewed', { jobId: props.jobId });
    emit('close');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}

function onFortify(acceptedIds: string[]) {
  void submitDecision({
    decision: 'approve',
    type: 'approve-and-fortify',
    acceptedRecommendations: acceptedIds,
  });
}

function onApproveWithout() {
  void submitDecision({
    decision: 'approve',
    type: 'approve-without-fortification',
  });
}

function onRerun() {
  void submitDecision({
    decision: 'reject',
    type: 'reject-and-rerun',
    feedback: 'Re-run the adversarial debate with additional guidance.',
  });
}
</script>

<style scoped>
.state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 24px;
  color: var(--ion-color-medium);
}

.state.error {
  color: var(--ion-color-danger);
}
</style>
