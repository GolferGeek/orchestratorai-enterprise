<template>
  <ion-modal :is-open="open" @did-dismiss="$emit('close')" css-class="estimate-modal">
    <ion-header>
      <ion-toolbar>
        <ion-title>Cost Estimate</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="$emit('close')">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="estimate-content">
      <div class="estimate-body">

        <!-- Estimate Summary -->
        <section class="estimate-section">
          <h3 class="section-title">Simulation Summary</h3>
          <div class="stat-row">
            <span class="stat-label">Simulations:</span>
            <span class="stat-value">{{ estimate.simulationCount }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Estimated LLM calls:</span>
            <span class="stat-value">{{ estimate.estimatedLlmCalls.toLocaleString() }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Tokens per call (est.):</span>
            <span class="stat-value">{{ estimate.estimatedTokensPerCall.toLocaleString() }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Total tokens (est.):</span>
            <span class="stat-value">{{ estimate.estimatedTotalTokens.toLocaleString() }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Estimated cost:</span>
            <span class="stat-value">
              {{ estimate.estimatedCostUsd === null ? 'Free (local model)' : `$${estimate.estimatedCostUsd.toFixed(2)} USD` }}
            </span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Estimated duration:</span>
            <span class="stat-value">{{ formatDuration(estimate.estimatedDurationHours) }}</span>
          </div>
        </section>

        <!-- Duration Warning -->
        <div v-if="estimate.warning" class="warning-banner">
          <strong>Note:</strong> {{ estimate.warning }}
        </div>

        <!-- Disclaimer -->
        <section class="disclaimer-section">
          <div class="disclaimer-header">
            <ion-icon :icon="alertCircleOutline" color="warning" />
            <span class="disclaimer-title">Analytical Tool Disclaimer</span>
          </div>
          <p class="disclaimer-text">
            Trial simulation is an analytical tool that approximates outcome distributions based on
            systematic parameter variation. It is not a prediction of trial outcomes. Results should
            be used to inform strategy decisions, not replace legal judgment. The accuracy of
            simulations depends heavily on the quality and completeness of the case record provided.
          </p>
          <p class="disclaimer-text">
            This tool does not constitute legal advice. Consult qualified legal counsel before making
            decisions based on simulation results.
          </p>
        </section>

        <!-- Consent Checkbox -->
        <ion-item lines="none" class="consent-item">
          <ion-checkbox v-model="consented" slot="start" />
          <ion-label class="ion-text-wrap">
            I understand this is an experimental analytical tool and not a prediction of trial
            outcomes. Results should not replace legal judgment.
          </ion-label>
        </ion-item>

        <!-- Launch Button -->
        <div class="launch-actions">
          <ion-button
            expand="block"
            :disabled="!consented || submitting"
            @click="handleLaunch"
          >
            <ion-spinner v-if="submitting" name="crescent" slot="start" />
            {{ submitting ? 'Launching…' : 'Launch Simulation' }}
          </ion-button>
          <p v-if="submitError" class="field-error">{{ submitError }}</p>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonCheckbox,
  IonIcon,
  IonSpinner,
} from '@ionic/vue';
import { alertCircleOutline } from 'ionicons/icons';
import { legalJobsService } from '../legalJobsService';
import type { ExecutionContextLike } from '../legalJobsService';
import type { CostEstimateOutput } from './types';

const props = defineProps<{
  open: boolean;
  estimate: CostEstimateOutput;
  context: ExecutionContextLike;
  caseRecord: Record<string, unknown>;
}>();

const emit = defineEmits<{
  close: [];
  queued: [jobId: string];
}>();

const consented = ref(false);
const submitting = ref(false);
const submitError = ref('');

function formatDuration(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `~${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `~${h} hour${h !== 1 ? 's' : ''}`;
  return `~${h}h ${m}m`;
}

async function handleLaunch() {
  if (!consented.value) return;
  submitting.value = true;
  submitError.value = '';
  try {
    const ctx = {
      ...props.context,
      conversationId: crypto.randomUUID(),
    };
    const content = JSON.stringify({
      jobType: 'monte-carlo-trial-simulator',
      input: props.caseRecord,
    });
    const result = await legalJobsService.enqueueJsonJob(ctx, content);
    emit('queued', result.jobId);
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Failed to launch simulation';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.estimate-content {
  --padding-bottom: 32px;
}
.estimate-body {
  max-width: 600px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.estimate-section {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  padding: 16px;
}
.section-title {
  margin: 0 0 12px;
  font-size: 1rem;
  font-weight: 600;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--ion-color-light);
}
.stat-row:last-child {
  border-bottom: none;
}
.stat-label {
  color: var(--ion-color-medium);
  font-size: 0.875rem;
}
.stat-value {
  font-weight: 500;
}
.warning-banner {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 0.875rem;
}
.disclaimer-section {
  background: var(--ion-color-light);
  border-radius: 8px;
  padding: 16px;
  border-left: 4px solid var(--ion-color-warning);
}
.disclaimer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.disclaimer-title {
  font-weight: 600;
  font-size: 0.9rem;
}
.disclaimer-text {
  font-size: 0.85rem;
  color: var(--ion-color-medium-shade);
  margin: 0 0 8px;
  line-height: 1.5;
}
.disclaimer-text:last-child {
  margin-bottom: 0;
}
.consent-item {
  --padding-start: 0;
  margin-top: 4px;
}
.launch-actions {
  margin-top: 4px;
}
.field-error {
  color: var(--ion-color-danger);
  font-size: 0.8rem;
  margin: 6px 0 0;
  text-align: center;
}
</style>
