<template>
  <div class="sensitivity-tab">

    <!-- Factor Table -->
    <section class="card">
      <h4 class="card-title">Sensitivity Factors</h4>
      <div v-if="sortedFactors.length === 0" class="empty-note">
        No sensitivity factors computed (need ≥10 simulations per factor split).
      </div>
      <div v-else class="factor-table-wrap">
        <table class="factor-table">
          <thead>
            <tr>
              <th @click="sortBy('factorLabel')" :class="{ active: sortKey === 'factorLabel' }">Factor</th>
              <th @click="sortBy('factorType')" :class="{ active: sortKey === 'factorType' }">Type</th>
              <th @click="sortBy('deltaRate')" :class="{ active: sortKey === 'deltaRate' }">Delta Rate</th>
              <th @click="sortBy('confidenceN')" :class="{ active: sortKey === 'confidenceN' }">N</th>
              <th>Magnitude</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="factor in sortedFactors" :key="factor.factorId">
              <td>{{ factor.factorLabel }}</td>
              <td class="type-cell">{{ factor.factorType }}</td>
              <td :class="deltaClass(factor.deltaRate)">
                {{ factor.deltaRate >= 0 ? '+' : '' }}{{ (factor.deltaRate * 100).toFixed(1) }}%
              </td>
              <td>{{ factor.confidenceN }}</td>
              <td>
                <span class="magnitude-badge" :class="factor.impactMagnitude">
                  {{ magnitudeLabel(factor.impactMagnitude) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Scenario Builder -->
    <section class="card">
      <h4 class="card-title">Scenario Builder</h4>
      <p class="scenario-hint">
        Select conditions to explore how the outcome distribution shifts under specific scenarios.
        Filtering is applied client-side — no API call.
      </p>

      <div v-if="evidenceItems.length > 0" class="scenario-group">
        <p class="group-label">Evidence to Exclude:</p>
        <ion-item v-for="ev in evidenceItems" :key="ev.id" lines="none">
          <ion-checkbox
            :checked="excludedEvidence.has(ev.id)"
            slot="start"
            @ion-change="toggleEvidence(ev.id, $event.detail.checked)"
          />
          <ion-label>Exclude "{{ ev.label }}"</ion-label>
        </ion-item>
      </div>

      <div v-if="witnessItems.length > 0" class="scenario-group">
        <p class="group-label">Low-Credibility Witnesses:</p>
        <ion-item v-for="wit in witnessItems" :key="wit.id" lines="none">
          <ion-checkbox
            :checked="lowCredibilityWitnesses.has(wit.id)"
            slot="start"
            @ion-change="toggleWitness(wit.id, $event.detail.checked)"
          />
          <ion-label>{{ wit.label }} — not credible</ion-label>
        </ion-item>
      </div>

      <div class="scenario-actions">
        <ion-button size="small" @click="applyScenarioFn">Apply Scenario</ion-button>
        <ion-button size="small" fill="outline" @click="resetScenario">Reset</ion-button>
      </div>

      <div v-if="scenarioResult" class="scenario-result">
        <div class="scenario-result-row">
          <span>Scenario ({{ scenarioResult.total }} simulations matched):</span>
          <span class="result-dist">
            Plaintiff {{ (scenarioResult.distribution.plaintiffWinRate * 100).toFixed(1) }}%
            · Defense {{ (scenarioResult.distribution.defenseWinRate * 100).toFixed(1) }}%
            · Mixed {{ (scenarioResult.distribution.mixedRate * 100).toFixed(1) }}%
          </span>
        </div>
        <div class="scenario-result-row baseline">
          <span>Baseline (all simulations):</span>
          <span class="result-dist">
            Plaintiff {{ (result.outcomeDistribution.plaintiffWinRate * 100).toFixed(1) }}%
            · Defense {{ (result.outcomeDistribution.defenseWinRate * 100).toFixed(1) }}%
            · Mixed {{ (result.outcomeDistribution.mixedRate * 100).toFixed(1) }}%
          </span>
        </div>
        <p v-if="scenarioResult.total === 0" class="no-match-note">
          No simulations matched this scenario configuration.
        </p>
      </div>
    </section>

    <!-- Disclaimer -->
    <div class="disclaimer-box">
      <p class="disclaimer-text">{{ result.disclaimerText }}</p>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IonItem, IonLabel, IonCheckbox, IonButton } from '@ionic/vue';
import type { MonteCarloTrialSimulatorResult, ImpactMagnitude } from '../../../../types/monte-carlo.types';
import { applyScenario, computeOutcomeDistribution } from './scenario-builder';

const props = defineProps<{
  result: MonteCarloTrialSimulatorResult;
}>();

type SortKey = 'factorLabel' | 'factorType' | 'deltaRate' | 'confidenceN';

const sortKey = ref<SortKey>('deltaRate');
const sortDir = ref<1 | -1>(-1);

function sortBy(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 1 ? -1 : 1;
  } else {
    sortKey.value = key;
    sortDir.value = key === 'deltaRate' ? -1 : 1;
  }
}

const sortedFactors = computed(() => {
  return [...props.result.sensitivityAnalysis].sort((a, b) => {
    const key = sortKey.value;
    const av = key === 'deltaRate' ? Math.abs(a.deltaRate) : a[key];
    const bv = key === 'deltaRate' ? Math.abs(b.deltaRate) : b[key];
    if (av < bv) return -1 * sortDir.value;
    if (av > bv) return 1 * sortDir.value;
    return 0;
  });
});

function deltaClass(delta: number): string {
  if (delta > 0) return 'delta-positive';
  if (delta < 0) return 'delta-negative';
  return '';
}

function magnitudeLabel(mag: ImpactMagnitude): string {
  switch (mag) {
    case 'high': return 'High';
    case 'medium': return 'Medium';
    case 'low': return 'Low';
    case 'insufficient-data': return 'N<10';
    default: return mag;
  }
}

const evidenceItems = computed(() => {
  const evidence = props.result.sensitivityAnalysis.filter((f) => f.factorType === 'evidence');
  return evidence.map((f) => ({ id: f.factorId, label: f.factorLabel }));
});

const witnessItems = computed(() => {
  const witnesses = props.result.sensitivityAnalysis.filter((f) => f.factorType === 'witness');
  return witnesses.map((f) => ({ id: f.factorId, label: f.factorLabel }));
});

const excludedEvidence = ref(new Set<string>());
const lowCredibilityWitnesses = ref(new Set<string>());

function toggleEvidence(id: string, checked: boolean) {
  const s = new Set(excludedEvidence.value);
  if (checked) s.add(id);
  else s.delete(id);
  excludedEvidence.value = s;
}

function toggleWitness(id: string, checked: boolean) {
  const s = new Set(lowCredibilityWitnesses.value);
  if (checked) s.add(id);
  else s.delete(id);
  lowCredibilityWitnesses.value = s;
}

interface ScenarioResult {
  total: number;
  distribution: ReturnType<typeof computeOutcomeDistribution>;
}

const scenarioResult = ref<ScenarioResult | null>(null);

function applyScenarioFn() {
  const filtered = applyScenario(props.result.simulations, {
    excludedEvidenceIds: [...excludedEvidence.value],
    lowCredibilityWitnessIds: [...lowCredibilityWitnesses.value],
  });
  scenarioResult.value = {
    total: filtered.length,
    distribution: computeOutcomeDistribution(filtered),
  };
}

function resetScenario() {
  excludedEvidence.value = new Set();
  lowCredibilityWitnesses.value = new Set();
  scenarioResult.value = null;
}
</script>

<style scoped>
.sensitivity-tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  padding: 16px;
}
.card-title {
  margin: 0 0 12px;
  font-size: 0.95rem;
  font-weight: 600;
}
.empty-note {
  color: var(--ion-color-medium);
  font-size: 0.875rem;
  text-align: center;
  padding: 12px;
}
.factor-table-wrap {
  overflow-x: auto;
}
.factor-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.factor-table th {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid var(--ion-color-light-shade);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.factor-table th:hover { color: var(--ion-color-primary); }
.factor-table th.active { color: var(--ion-color-primary); font-weight: 700; }
.factor-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ion-color-light);
  vertical-align: middle;
}
.type-cell { color: var(--ion-color-medium); font-size: 0.8rem; }
.delta-positive { color: var(--ion-color-success); font-weight: 600; }
.delta-negative { color: var(--ion-color-danger); font-weight: 600; }
.magnitude-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
}
.magnitude-badge.high { background: var(--ion-color-warning-tint); color: var(--ion-color-warning-shade); }
.magnitude-badge.medium { background: var(--ion-color-warning-tint); color: var(--ion-color-warning-shade); opacity: 0.7; }
.magnitude-badge.low { background: var(--ion-color-light); color: var(--ion-color-medium); }
.magnitude-badge.insufficient-data { background: var(--ion-color-light); color: var(--ion-color-medium); font-style: italic; }
.scenario-hint {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  margin: 0 0 12px;
}
.scenario-group { margin-bottom: 12px; }
.group-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ion-color-medium);
  margin: 0 0 4px 0;
}
.scenario-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.scenario-result {
  margin-top: 14px;
  padding: 12px;
  background: var(--ion-color-light);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.scenario-result-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  flex-wrap: wrap;
  gap: 4px;
}
.scenario-result-row.baseline { color: var(--ion-color-medium); }
.result-dist { font-weight: 500; }
.no-match-note {
  color: var(--ion-color-warning);
  font-size: 0.8rem;
  margin: 0;
}
.disclaimer-box {
  background: var(--ion-color-light);
  border-left: 4px solid var(--ion-color-warning);
  border-radius: 4px;
  padding: 12px 16px;
}
.disclaimer-text {
  font-size: 0.8rem;
  color: var(--ion-color-medium-shade);
  margin: 0;
  font-style: italic;
  line-height: 1.5;
}
</style>
