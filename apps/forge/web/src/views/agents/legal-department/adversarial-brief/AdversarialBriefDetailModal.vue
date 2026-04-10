<template>
  <ion-modal :is-open="open" @did-dismiss="$emit('close')">
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>Stress Test — {{ statusLabel }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">Close</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <div v-if="loading" class="state">
          <ion-spinner />
          Loading stress test results...
        </div>

        <div v-else-if="error" class="state error">{{ error }}</div>

        <template v-else>
          <!-- Stage Ladder (if manifest available) -->
          <div v-if="stages.length > 0" class="stage-section">
            <StageLadder :stages="stages" :thinking-states="{}" />
          </div>

          <!-- Debate Transcript -->
          <div v-if="debateRounds.length > 0" class="debate-section">
            <h3>Debate Transcript</h3>
            <DebateRound
              v-for="round in debateRounds"
              :key="round.round"
              :round="round"
              :initial-collapsed="round.round < debateRounds.length"
            />
          </div>

          <!-- Stress Test Report (read-only) -->
          <div v-if="stressTestReport" class="report-section">
            <h3>Stress Test Report</h3>
            <StressTestReport :report="stressTestReport" :interactive="false" />
          </div>

          <!-- Fortified Brief (if available) -->
          <div v-if="fortifiedBrief" class="diff-section">
            <h3>Fortification</h3>
            <FortificationDiff
              :original="originalBrief"
              :fortified="fortifiedBrief"
            />
          </div>

          <!-- Final Report (markdown) -->
          <div v-if="reportMarkdown" class="markdown-section">
            <h3>Final Report</h3>
            <div class="markdown-content" v-html="reportMarkdown" />
          </div>
        </template>
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
import StageLadder from '../components/StageLadder.vue';
import DebateRound from './DebateRound.vue';
import StressTestReport from './StressTestReport.vue';
import FortificationDiff from './FortificationDiff.vue';
import { legalJobsService } from '../legalJobsService';
import { useJobEventStream } from '../composables/useJobEventStream';
import { useWorkflowPresentation } from '../composables/useWorkflowPresentation';

const props = defineProps<{
  open: boolean;
  jobId: string | null;
  orgSlug: string;
}>();

defineEmits<{ close: [] }>();

const loading = ref(false);
const error = ref<string | null>(null);
const job = ref<Record<string, unknown> | null>(null);

const statusLabel = computed(() => {
  if (!job.value) return '';
  const s = job.value.status as string;
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
});

// Event stream for stage ladder
const {
  events,
  cleanup: cleanupEvents,
} = useJobEventStream();

// Workflow presentation
const { manifest, stagesFromEvents } = useWorkflowPresentation(
  'legal-department/adversarial-brief',
);
const stages = computed(() =>
  manifest.value ? stagesFromEvents(events.value) : [],
);

// Extract structured data from job result
const debateRounds = computed(() => {
  const result = job.value?.result as Record<string, unknown> | null;
  if (!result) return [];
  return (result.debateTranscript ?? result.rounds ?? []) as Array<{
    round: number;
    blueTeamArguments: { defenses: unknown[]; summary: string };
    redTeamAttacks: { attacks: unknown[]; summary: string };
    judgeScoring?: unknown;
  }>;
});

const stressTestReport = computed(() => {
  const result = job.value?.result as Record<string, unknown> | null;
  return (result?.stressTestReport as Record<string, unknown> | null) ?? null;
});

const fortifiedBrief = computed(() => {
  const result = job.value?.result as Record<string, unknown> | null;
  return (result?.fortifiedBrief as string | null) ?? null;
});

const originalBrief = computed(() => {
  const input = job.value?.input as Record<string, unknown> | null;
  const docs = input?.documents as Array<{ content: string }> | null;
  return docs?.map((d) => d.content).join('\n\n') ?? null;
});

const reportMarkdown = computed(() => {
  const result = job.value?.result as Record<string, unknown> | null;
  return (result?.response as string | null) ?? null;
});

watch(
  () => [props.open, props.jobId],
  async ([open, jobId]) => {
    if (!open || !jobId) {
      cleanupEvents();
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const fetched = await legalJobsService.getJob(
        jobId as string,
        props.orgSlug,
      );
      job.value = fetched as unknown as Record<string, unknown>;

      // Load event history for stage ladder
      const conversationId = (fetched as unknown as { conversation_id: string })
        .conversation_id;
      if (conversationId) {
        await events.value; // trigger load
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  },
);
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

.stage-section,
.debate-section,
.report-section,
.diff-section,
.markdown-section {
  padding: 16px;
  border-bottom: 1px solid var(--ion-color-step-150);
}

h3 {
  font-size: 15px;
  margin: 0 0 12px;
  color: var(--ion-text-color);
}

.markdown-content {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
