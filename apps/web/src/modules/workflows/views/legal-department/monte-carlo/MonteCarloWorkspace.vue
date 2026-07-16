<template>
  <ion-modal :is-open="open" @did-dismiss="$emit('close')" css-class="workspace-modal">
    <ion-header>
      <ion-toolbar>
        <ion-title>Trial Simulation</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="$emit('close')">
            <ion-icon :icon="closeOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment :value="activeTab" @ion-change="activeTab = $event.detail.value as string">
          <ion-segment-button value="progress">
            <ion-label>Progress</ion-label>
          </ion-segment-button>
          <ion-segment-button value="outcomes" :disabled="!hasResult">
            <ion-label>Outcomes</ion-label>
          </ion-segment-button>
          <ion-segment-button value="sensitivity" :disabled="!hasResult">
            <ion-label>Sensitivity</ion-label>
          </ion-segment-button>
          <ion-segment-button value="simulations" :disabled="!hasResult">
            <ion-label>Simulations</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Error state -->
      <div v-if="job?.status === 'failed'" class="error-state">
        <ion-icon :icon="alertCircleOutline" color="danger" size="large" />
        <p>Simulation failed.</p>
        <p v-if="job.error" class="error-message">{{ job.error }}</p>
      </div>

      <template v-else>
        <!-- Progress tab — always visible -->
        <SimulationProgressTab
          v-if="activeTab === 'progress'"
          :result="progressResult"
          :is-running="isRunning"
          :elapsed-ms="elapsedMs"
        />

        <!-- Result tabs — available once completed -->
        <OutcomeDistributionTab
          v-if="activeTab === 'outcomes' && result"
          :result="result"
        />
        <SensitivityAnalysisTab
          v-if="activeTab === 'sensitivity' && result"
          :result="result"
        />
        <SimulationBrowserTab
          v-if="activeTab === 'simulations' && result"
          :result="result"
        />

        <!-- Loading state if tab requires result but result not yet available -->
        <div v-if="activeTab !== 'progress' && !result" class="loading-state">
          <ion-spinner name="crescent" />
          <p>Waiting for simulation to complete…</p>
        </div>
      </template>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
} from '@ionic/vue';
import { closeOutline, alertCircleOutline } from 'ionicons/icons';
import { legalJobsService } from '../legalJobsService';
import type { AgentJobRow } from '../legalJobsService';
import type { MonteCarloTrialSimulatorResult } from '../../../../types/monte-carlo.types';
import SimulationProgressTab from './SimulationProgressTab.vue';
import OutcomeDistributionTab from './OutcomeDistributionTab.vue';
import SensitivityAnalysisTab from './SensitivityAnalysisTab.vue';
import SimulationBrowserTab from './SimulationBrowserTab.vue';

const props = defineProps<{
  open: boolean;
  jobId: string;
  orgSlug: string;
}>();

defineEmits<{ close: [] }>();

const activeTab = ref('progress');
const job = ref<AgentJobRow | null>(null);
const openedAt = ref(Date.now());
let pollTimer: ReturnType<typeof setInterval> | null = null;

const isRunning = computed(
  () => job.value?.status === 'queued' || job.value?.status === 'processing',
);

const elapsedMs = computed(() =>
  job.value?.started_at
    ? Date.now() - new Date(job.value.started_at).getTime()
    : Date.now() - openedAt.value,
);

const result = computed<MonteCarloTrialSimulatorResult | null>(() => {
  if (!job.value?.result) return null;
  return job.value.result as unknown as MonteCarloTrialSimulatorResult;
});

const hasResult = computed(() => !!result.value);

const progressResult = computed<MonteCarloTrialSimulatorResult>(() => {
  if (result.value) return result.value;
  const r = job.value?.result as unknown as Partial<MonteCarloTrialSimulatorResult> | null;
  return {
    simulationsRequested: (job.value?.input?.simulationCount as number | undefined) ?? 0,
    simulationsCompleted: r?.simulationsCompleted ?? 0,
    simulationsFailed: r?.simulationsFailed ?? 0,
    outcomeDistribution: r?.outcomeDistribution ?? {
      plaintiffWins: 0, defenseWins: 0, mixedVerdict: 0,
      plaintiffWinRate: 0, defenseWinRate: 0, mixedRate: 0,
    },
    damagesDistribution: r?.damagesDistribution ?? {
      mean: 0, median: 0, p10: 0, p25: 0, p75: 0, p90: 0, histogram: [], sampleSize: 0,
    },
    expectedValue: r?.expectedValue ?? 0,
    settlementRange: r?.settlementRange ?? { low: 0, high: 0 },
    sensitivityAnalysis: r?.sensitivityAnalysis ?? [],
    strategyRecommendations: r?.strategyRecommendations ?? [],
    simulations: r?.simulations ?? [],
    disclaimerText: r?.disclaimerText ?? '',
    durationMs: r?.durationMs ?? 0,
  };
});

async function loadJob(): Promise<void> {
  if (!props.jobId || !props.orgSlug) return;
  try {
    job.value = await legalJobsService.getJob(props.jobId, props.orgSlug);
  } catch {
    // silently ignore transient errors
  }
}

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(() => {
    if (isRunning.value) {
      void loadJob();
    } else {
      stopPolling();
    }
  }, 5000);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      openedAt.value = Date.now();
      activeTab.value = 'progress';
      void loadJob().then(() => {
        if (isRunning.value) startPolling();
        if (hasResult.value) activeTab.value = 'outcomes';
      });
    } else {
      stopPolling();
    }
  },
  { immediate: true },
);

watch(hasResult, (nowHasResult) => {
  if (nowHasResult && activeTab.value === 'progress') {
    activeTab.value = 'outcomes';
  }
});

onBeforeUnmount(() => stopPolling());
</script>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--ion-color-medium);
}
.error-message {
  font-size: 0.85rem;
  color: var(--ion-color-danger);
  max-width: 400px;
  text-align: center;
}
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--ion-color-medium);
}
</style>
