<template>
  <ion-modal :is-open="open" @did-dismiss="emit('close')" class="deposition-workspace-modal">
    <ion-header>
      <ion-toolbar>
        <ion-title>Deposition Preparation</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="briefOpen = true">Benefits</ion-button>
          <ion-button fill="clear" @click="emit('close')">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
      <div class="privilege-banner">
        Attorney work product — privileged under applicable law — not subject to production in
        discovery
      </div>
      <ion-toolbar>
        <ion-segment :value="activeTab" @ion-change="onTabChange">
          <ion-segment-button value="outline">
            <ion-label>Preparation Outline</ion-label>
          </ion-segment-button>
          <ion-segment-button value="cross-exam">
            <ion-label>Predicted Cross-Exam</ion-label>
          </ion-segment-button>
          <ion-segment-button value="simulation">
            <ion-label>Simulation</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="workspace-content">
      <!-- Loading state -->
      <div v-if="loading" class="loading-state">
        <ion-spinner />
        <p>Loading deposition preparation...</p>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
      </div>

      <!-- Outline tab -->
      <div v-else-if="activeTab === 'outline'" class="tab-content">
        <div v-if="!job" class="empty-tab">No job loaded.</div>
        <div v-else-if="job.status === 'processing' || job.status === 'queued'" class="processing-state">
          <ion-spinner />
          <p>Preparing deposition outline...</p>
        </div>
        <div v-else-if="job.status === 'failed'" class="failed-state">
          <p>Job failed: {{ job.result?.error ?? 'Unknown error' }}</p>
        </div>
        <PreparationOutlineView
          v-else-if="preparationOutline"
          :outline="preparationOutline"
        />
        <div v-else class="empty-tab">No preparation outline available for this job.</div>
      </div>

      <!-- Cross-exam tab -->
      <div v-else-if="activeTab === 'cross-exam'" class="tab-content">
        <div v-if="!crossExamJob" class="empty-tab">
          <p>No predicted cross-examination job found.</p>
          <p class="hint">Submit a "Predicted Cross-Exam" job to see predicted questions here.</p>
        </div>
        <div
          v-else-if="crossExamJob.status === 'processing' || crossExamJob.status === 'queued'"
          class="processing-state"
        >
          <ion-spinner />
          <p>Predicting cross-examination questions...</p>
        </div>
        <div v-else-if="crossExamJob.status === 'failed'" class="failed-state">
          <p>Job failed: {{ crossExamJob.result?.error ?? 'Unknown error' }}</p>
        </div>
        <PredictedCrossExamView
          v-else-if="predictedQuestions"
          :questions="predictedQuestions"
          :coaching="answerCoaching"
          :opposing-perspective="opposingPerspective"
        />
        <div v-else class="empty-tab">No predicted cross-exam results available.</div>
      </div>

      <!-- Simulation tab -->
      <div v-else-if="activeTab === 'simulation'" class="tab-content">
        <SimulationView
          :context="simulationContext"
          :case-facts="caseFacts"
          :witness-background="witnessBackground"
          :prior-statements="priorStatements"
          :org-slug="props.orgSlug"
          :caller-user-id="props.callerUserId"
          :simulation-job-id="props.simulationJobId ?? null"
        />
      </div>
    </ion-content>

    <BriefModal
      :open="briefOpen"
      agent-slug="legal-department"
      :capability-slug="activeBriefCapability"
      @close="briefOpen = false"
    />
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  IonLabel,
} from '@ionic/vue';
import { legalJobsService, type AgentJobRow, type ExecutionContextLike } from '../legalJobsService';
import PredictedCrossExamView from './PredictedCrossExamView.vue';
import SimulationView from './SimulationView.vue';
import PreparationOutlineView from './PreparationOutlineView.vue';
import BriefModal from '../components/BriefModal.vue';
import type { PreparationOutline } from './deposition-prep.types';

interface PredictedQuestion {
  category: 'opening' | 'core-substance' | 'confrontation' | 'trap';
  question: string;
  expectedFollowup?: string;
}

interface AnswerCoachingEntry {
  answerFramework: string;
  dangerZones: string[];
  followupHandling: string;
  dontRecallAssessment: 'safe' | 'dangerous' | 'context-dependent';
}

interface OpposingPerspective {
  depositionGoals: string[];
  availableDocuments: string[];
  witnessVulnerabilities: string[];
}

const props = defineProps<{
  open: boolean;
  outlineJobId: string | null;
  crossExamJobId?: string | null;
  simulationJobId?: string | null;
  orgSlug: string;
  callerUserId?: string;
  /** Case context forwarded to SimulationView for starting new simulations */
  caseFacts?: string;
  witnessBackground?: string;
  priorStatements?: string;
  /** Full execution context for simulation enqueue */
  executionContext?: ExecutionContextLike;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const activeTab = ref<'outline' | 'cross-exam' | 'simulation'>('outline');
const briefOpen = ref(false);
const job = ref<AgentJobRow | null>(null);
const crossExamJob = ref<AgentJobRow | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

function onTabChange(ev: CustomEvent): void {
  activeTab.value = ev.detail.value as 'outline' | 'cross-exam' | 'simulation';
}

const simulationContext = computed(
  (): ExecutionContextLike =>
    props.executionContext ?? {
      orgSlug: props.orgSlug,
      userId: props.callerUserId ?? '',
      conversationId: '',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:e4b',
    },
);

const activeBriefCapability = computed(() =>
  activeTab.value === 'outline' ? 'deposition-prep' : 'cross-exam-simulation',
);

const preparationOutline = computed(
  () =>
    ((job.value?.result as Record<string, unknown> | null)
      ?.preparationOutline as PreparationOutline | null) ?? null,
);

const predictedQuestions = computed(
  () =>
    ((crossExamJob.value?.result as Record<string, unknown> | null)
      ?.predictedQuestions as PredictedQuestion[] | undefined) ?? null,
);

const answerCoaching = computed(
  () =>
    ((crossExamJob.value?.result as Record<string, unknown> | null)
      ?.answerCoaching as Record<number, AnswerCoachingEntry> | undefined) ?? undefined,
);

const opposingPerspective = computed(
  () =>
    ((crossExamJob.value?.result as Record<string, unknown> | null)
      ?.opposingPerspective as OpposingPerspective | undefined) ?? undefined,
);

async function loadJobs(): Promise<void> {
  if (!props.orgSlug || (!props.outlineJobId && !props.crossExamJobId)) return;

  loading.value = true;
  error.value = null;

  try {
    if (props.outlineJobId) {
      job.value = await legalJobsService.getJob(
        props.outlineJobId,
        props.orgSlug,
        props.callerUserId,
      );
    }

    if (props.crossExamJobId) {
      crossExamJob.value = await legalJobsService.getJob(
        props.crossExamJobId,
        props.orgSlug,
        props.callerUserId,
      );
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load deposition prep jobs';
  } finally {
    loading.value = false;
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(() => {
    const outlineActive =
      job.value?.status === 'processing' || job.value?.status === 'queued';
    const crossActive =
      props.crossExamJobId &&
      (crossExamJob.value?.status === 'processing' || crossExamJob.value?.status === 'queued');
    if (outlineActive || crossActive) void loadJobs();
    else stopPolling();
  }, 5000);
}

watch(
  () => [props.open, props.outlineJobId, props.crossExamJobId, props.simulationJobId],
  ([open]) => {
    if (open) {
      if (!props.outlineJobId && !props.crossExamJobId && props.simulationJobId) activeTab.value = 'simulation';
      else if (!props.outlineJobId && props.crossExamJobId) activeTab.value = 'cross-exam';
      else activeTab.value = 'outline';
      void loadJobs().then(startPolling);
    } else {
      stopPolling();
      job.value = null;
      crossExamJob.value = null;
      error.value = null;
    }
  },
);

onUnmounted(stopPolling);
</script>

<style scoped>
.deposition-workspace-modal {
  --width: 90vw;
  --max-width: 1000px;
  --height: 90vh;
}

.privilege-banner {
  background: rgba(255, 196, 9, 0.15);
  border-bottom: 1px solid rgba(255, 196, 9, 0.3);
  color: var(--ion-color-warning);
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  padding: 6px 16px;
  letter-spacing: 0.3px;
}

.workspace-content {
  --background: var(--ion-background-color);
}

.tab-content {
  height: 100%;
  overflow-y: auto;
}

.loading-state,
.processing-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
  color: var(--ion-color-medium);
}

.error-state,
.failed-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--ion-color-danger);
}

.empty-tab {
  padding: 40px 20px;
  text-align: center;
  color: var(--ion-color-medium);
}

.empty-tab .hint {
  font-size: 13px;
  margin-top: 8px;
  opacity: 0.7;
}

.outline-json {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  font-family: monospace;
  padding: 16px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  margin: 16px;
  color: rgba(255, 255, 255, 0.8);
  overflow: auto;
}
</style>
