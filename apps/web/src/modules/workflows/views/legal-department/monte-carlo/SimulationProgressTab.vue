<template>
  <div class="progress-tab">
    <div class="counts-card">
      <div class="count-row">
        <span class="count-label">Total Requested</span>
        <span class="count-value">{{ result.simulationsRequested }}</span>
      </div>
      <div class="count-row">
        <span class="count-label">Completed</span>
        <span class="count-value success">{{ result.simulationsCompleted }}</span>
      </div>
      <div class="count-row" v-if="result.simulationsFailed > 0">
        <span class="count-label">Failed</span>
        <span class="count-value danger">{{ result.simulationsFailed }}</span>
      </div>
    </div>

    <div class="progress-bar-wrap">
      <div class="progress-bar-track">
        <div
          class="progress-bar-fill"
          :class="{ animated: isRunning }"
          :style="{ width: `${completionPct}%` }"
        />
      </div>
      <span class="progress-pct-label">{{ completionPct }}%</span>
    </div>

    <div v-if="isRunning" class="running-state">
      <ion-spinner name="crescent" />
      <p>Simulations running… {{ doneCount }}/{{ result.simulationsRequested }}</p>
      <p v-if="estimatedRemaining" class="sub">~{{ estimatedRemaining }} remaining</p>
    </div>
    <div v-else-if="result.simulationsCompleted > 0" class="done-state">
      <div class="verdict-bars">
        <div class="verdict-bar-row">
          <span class="bar-label">Plaintiff</span>
          <div class="bar-track">
            <div
              class="bar-fill plaintiff"
              :style="{ width: `${(result.outcomeDistribution.plaintiffWinRate * 100).toFixed(1)}%` }"
            />
          </div>
          <span class="bar-pct">{{ (result.outcomeDistribution.plaintiffWinRate * 100).toFixed(1) }}%</span>
        </div>
        <div class="verdict-bar-row">
          <span class="bar-label">Defense</span>
          <div class="bar-track">
            <div
              class="bar-fill defense"
              :style="{ width: `${(result.outcomeDistribution.defenseWinRate * 100).toFixed(1)}%` }"
            />
          </div>
          <span class="bar-pct">{{ (result.outcomeDistribution.defenseWinRate * 100).toFixed(1) }}%</span>
        </div>
        <div class="verdict-bar-row">
          <span class="bar-label">Mixed</span>
          <div class="bar-track">
            <div
              class="bar-fill mixed"
              :style="{ width: `${(result.outcomeDistribution.mixedRate * 100).toFixed(1)}%` }"
            />
          </div>
          <span class="bar-pct">{{ (result.outcomeDistribution.mixedRate * 100).toFixed(1) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonSpinner } from '@ionic/vue';
import type { MonteCarloTrialSimulatorResult } from '../../../../types/monte-carlo.types';

const props = defineProps<{
  result: MonteCarloTrialSimulatorResult;
  isRunning: boolean;
  elapsedMs?: number;
}>();

const doneCount = computed(
  () => props.result.simulationsCompleted + props.result.simulationsFailed,
);
const completionPct = computed(() =>
  props.result.simulationsRequested === 0
    ? 0
    : Math.round((doneCount.value / props.result.simulationsRequested) * 100),
);

const estimatedRemaining = computed(() => {
  if (!props.isRunning || !props.elapsedMs || doneCount.value === 0) return null;
  const msPerSim = props.elapsedMs / doneCount.value;
  const remaining = props.result.simulationsRequested - doneCount.value;
  const ms = msPerSim * remaining;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'less than a minute';
  return `~${minutes} min`;
});
</script>

<style scoped>
.progress-tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.counts-card {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  overflow: hidden;
}
.count-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--ion-color-light);
}
.count-row:last-child {
  border-bottom: none;
}
.count-label {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}
.count-value {
  font-weight: 600;
  font-size: 1rem;
}
.count-value.success { color: var(--ion-color-success); }
.count-value.danger { color: var(--ion-color-danger); }
.progress-bar-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.progress-bar-track {
  flex: 1;
  height: 12px;
  background: var(--ion-color-light);
  border-radius: 6px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--ion-color-primary);
  border-radius: 6px;
  transition: width 0.4s ease;
}
.progress-bar-fill.animated {
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.progress-pct-label {
  font-size: 0.875rem;
  font-weight: 600;
  min-width: 40px;
  text-align: right;
}
.running-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  color: var(--ion-color-medium);
}
.running-state .sub {
  font-size: 0.85rem;
}
.done-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.verdict-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.verdict-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bar-label {
  width: 70px;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  text-align: right;
}
.bar-track {
  flex: 1;
  height: 20px;
  background: var(--ion-color-light);
  border-radius: 4px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease;
}
.bar-fill.plaintiff { background: var(--ion-color-success); }
.bar-fill.defense { background: var(--ion-color-danger); }
.bar-fill.mixed { background: var(--ion-color-warning); }
.bar-pct {
  width: 50px;
  font-size: 0.85rem;
  font-weight: 600;
}
</style>
