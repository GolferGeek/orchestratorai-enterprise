<template>
  <div class="browser-tab">

    <!-- Filters -->
    <div class="filter-bar">
      <ion-select
        v-model="verdictFilter"
        interface="popover"
        placeholder="All"
        class="filter-select"
      >
        <ion-select-option value="all">All</ion-select-option>
        <ion-select-option value="plaintiff">Plaintiff wins</ion-select-option>
        <ion-select-option value="defense">Defense wins</ion-select-option>
        <ion-select-option value="mixed">Mixed</ion-select-option>
        <ion-select-option value="failed">Failed</ion-select-option>
      </ion-select>

      <ion-select
        v-model="sortField"
        interface="popover"
        class="filter-select"
      >
        <ion-select-option value="index">Sort: # (default)</ion-select-option>
        <ion-select-option value="damages-desc">Sort: Damages ↓</ion-select-option>
        <ion-select-option value="verdict">Sort: Verdict A–Z</ion-select-option>
      </ion-select>

      <span class="count-note">{{ filteredSims.length }} shown</span>
    </div>

    <!-- Simulation Table -->
    <div class="sim-list">
      <div
        v-for="sim in filteredSims"
        :key="sim.simulationId"
        class="sim-row"
        @click="toggleExpand(sim.simulationId)"
      >
        <div class="sim-summary">
          <span class="sim-num">#{{ sim.simulationIndex + 1 }}</span>
          <span class="verdict-badge" :class="sim.error ? 'failed' : sim.verdict">
            {{ sim.error ? 'Failed' : capitalize(sim.verdict) }}
          </span>
          <span class="damages-col">
            {{ sim.damagesAwarded != null ? formatCurrency(sim.damagesAwarded) : '—' }}
          </span>
          <span class="factors-col">
            {{ sim.keyFactors.slice(0, 2).join(', ') || (sim.error ? truncate(sim.error, 50) : '—') }}
          </span>
          <span class="duration-col">{{ (sim.durationMs / 1000).toFixed(1) }}s</span>
          <ion-icon
            :icon="expandedIds.has(sim.simulationId) ? chevronUpOutline : chevronDownOutline"
            class="expand-icon"
          />
        </div>

        <!-- Transcript Expansion -->
        <div v-if="expandedIds.has(sim.simulationId)" class="transcript" @click.stop>
          <div v-if="sim.error" class="transcript-error">
            <strong>Error:</strong> {{ sim.error }}
          </div>
          <template v-else>
            <!-- Parameters -->
            <div class="transcript-section">
              <div class="section-label">Parameters</div>
              <p class="transcript-para">
                Jury sympathy: {{ sim.parameters.juryComposition.attitudeBiases.plaintiffSympathy.toFixed(2) }}
                · Judge strictness: {{ sim.parameters.judgeCharacteristics.strictnessOnEvidence.toFixed(2) }}
                · Admitted evidence: {{ admittedCount(sim) }}
              </p>
            </div>
            <!-- Opening Arguments -->
            <div class="transcript-section">
              <div class="section-label">Opening Arguments</div>
              <div class="argument-block">
                <span class="arg-side">Plaintiff:</span>
                <p class="transcript-para">{{ sim.transcript.openingArguments.plaintiff || '—' }}</p>
              </div>
              <div class="argument-block">
                <span class="arg-side">Defense:</span>
                <p class="transcript-para">{{ sim.transcript.openingArguments.defense || '—' }}</p>
              </div>
            </div>
            <!-- Evidence Phase -->
            <div class="transcript-section">
              <div class="section-label">Evidence Phase</div>
              <div v-for="ev in sim.transcript.evidencePhase" :key="ev.evidenceId" class="evidence-entry">
                <span class="ev-admitted" :class="ev.admitted ? 'admitted' : 'excluded'">
                  {{ ev.admitted ? 'Admitted' : 'Excluded' }}
                </span>
                <span class="ev-desc">{{ ev.description }}</span>
                <p v-if="ev.ruling" class="ev-ruling">Ruling: {{ ev.ruling }}</p>
                <p v-if="ev.juryImpact" class="ev-impact">Impact: {{ ev.juryImpact }}</p>
              </div>
            </div>
            <!-- Closing Arguments -->
            <div class="transcript-section">
              <div class="section-label">Closing Arguments</div>
              <div class="argument-block">
                <span class="arg-side">Plaintiff:</span>
                <p class="transcript-para">{{ sim.transcript.closingArguments.plaintiff || '—' }}</p>
              </div>
              <div class="argument-block">
                <span class="arg-side">Defense:</span>
                <p class="transcript-para">{{ sim.transcript.closingArguments.defense || '—' }}</p>
              </div>
            </div>
            <!-- Jury Deliberation -->
            <div class="transcript-section">
              <div class="section-label">Jury Deliberation</div>
              <p class="transcript-para">{{ sim.transcript.juryDeliberation || '—' }}</p>
            </div>
            <!-- Verdict -->
            <div class="transcript-section">
              <div class="section-label">Verdict</div>
              <span class="verdict-badge lg" :class="sim.verdict">{{ capitalize(sim.verdict) }}</span>
              <div v-if="sim.claimResults.length > 0" class="claim-results">
                <div v-for="cr in sim.claimResults" :key="cr.claimId" class="claim-row">
                  <span class="claim-id">{{ cr.claimId }}</span>
                  <span :class="cr.liable ? 'liable' : 'not-liable'">{{ cr.liable ? 'Liable' : 'Not Liable' }}</span>
                </div>
              </div>
              <p v-if="sim.damagesAwarded != null" class="damages-awarded">
                Damages awarded: {{ formatCurrency(sim.damagesAwarded) }}
              </p>
              <p class="disclaimer-text">{{ disclaimerText }}</p>
            </div>
          </template>
        </div>
      </div>

      <div v-if="filteredSims.length === 0" class="empty-note">
        No simulations match the current filter.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IonSelect, IonSelectOption, IonIcon } from '@ionic/vue';
import { chevronDownOutline, chevronUpOutline } from 'ionicons/icons';
import type { MonteCarloTrialSimulatorResult, SimulationResult } from '../../../../types/monte-carlo.types';

const props = defineProps<{
  result: MonteCarloTrialSimulatorResult;
}>();

const verdictFilter = ref('all');
const sortField = ref('index');
const expandedIds = ref(new Set<string>());

const disclaimerText = props.result.disclaimerText;

const filteredSims = computed(() => {
  let sims = [...props.result.simulations];

  if (verdictFilter.value !== 'all') {
    if (verdictFilter.value === 'failed') {
      sims = sims.filter((s) => !!s.error);
    } else {
      sims = sims.filter((s) => !s.error && s.verdict === verdictFilter.value);
    }
  }

  if (sortField.value === 'damages-desc') {
    sims.sort((a, b) => (b.damagesAwarded ?? 0) - (a.damagesAwarded ?? 0));
  } else if (sortField.value === 'verdict') {
    sims.sort((a, b) => a.verdict.localeCompare(b.verdict));
  } else {
    sims.sort((a, b) => a.simulationIndex - b.simulationIndex);
  }

  return sims;
});

function toggleExpand(id: string) {
  const s = new Set(expandedIds.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expandedIds.value = s;
}

function admittedCount(sim: SimulationResult): number {
  return Object.values(sim.parameters.evidenceAdmissibility).filter(Boolean).length;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toLocaleString()}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
</script>

<style scoped>
.browser-tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.filter-select {
  max-width: 180px;
  font-size: 0.875rem;
}
.count-note {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin-left: auto;
}
.sim-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sim-row {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 6px;
  overflow: hidden;
}
.sim-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  background: var(--ion-background-color);
  flex-wrap: wrap;
}
.sim-summary:hover { background: var(--ion-color-light); }
.sim-num {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  min-width: 28px;
}
.verdict-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
}
.verdict-badge.plaintiff { background: var(--ion-color-success-tint); color: var(--ion-color-success-shade); }
.verdict-badge.defense { background: var(--ion-color-danger-tint); color: var(--ion-color-danger-shade); }
.verdict-badge.mixed { background: var(--ion-color-warning-tint); color: var(--ion-color-warning-shade); }
.verdict-badge.failed { background: var(--ion-color-medium-tint); color: var(--ion-color-medium-shade); }
.verdict-badge.lg { font-size: 0.9rem; padding: 4px 12px; margin-bottom: 8px; display: inline-block; }
.damages-col {
  font-size: 0.85rem;
  min-width: 70px;
  font-weight: 500;
}
.factors-col {
  flex: 1;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.duration-col {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  min-width: 40px;
  text-align: right;
}
.expand-icon {
  color: var(--ion-color-medium);
  flex-shrink: 0;
}
.transcript {
  border-top: 1px solid var(--ion-color-light-shade);
  padding: 14px;
  background: var(--ion-color-light);
  cursor: default;
}
.transcript-error {
  color: var(--ion-color-danger);
  font-size: 0.875rem;
}
.transcript-section {
  margin-bottom: 14px;
}
.transcript-section:last-child { margin-bottom: 0; }
.section-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ion-color-medium);
  margin-bottom: 6px;
  border-bottom: 1px solid var(--ion-color-light-shade);
  padding-bottom: 4px;
}
.transcript-para {
  font-size: 0.85rem;
  margin: 0;
  line-height: 1.5;
  white-space: pre-wrap;
}
.argument-block {
  margin-bottom: 8px;
}
.arg-side {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ion-color-medium);
  display: block;
  margin-bottom: 2px;
}
.evidence-entry {
  margin-bottom: 8px;
  padding-left: 8px;
  border-left: 3px solid var(--ion-color-light-shade);
}
.ev-admitted {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 700;
  margin-bottom: 2px;
}
.ev-admitted.admitted { background: var(--ion-color-success-tint); color: var(--ion-color-success-shade); }
.ev-admitted.excluded { background: var(--ion-color-danger-tint); color: var(--ion-color-danger-shade); }
.ev-desc { font-size: 0.85rem; font-weight: 500; margin-left: 6px; }
.ev-ruling, .ev-impact { font-size: 0.8rem; color: var(--ion-color-medium); margin: 2px 0 0; }
.claim-results {
  margin: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.claim-row {
  display: flex;
  gap: 10px;
  font-size: 0.8rem;
}
.claim-id { color: var(--ion-color-medium); }
.liable { color: var(--ion-color-danger); font-weight: 600; }
.not-liable { color: var(--ion-color-success); font-weight: 600; }
.damages-awarded {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 6px 0;
}
.disclaimer-text {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  font-style: italic;
  margin: 8px 0 0;
  line-height: 1.4;
}
.empty-note {
  text-align: center;
  padding: 32px;
  color: var(--ion-color-medium);
  font-size: 0.875rem;
}
</style>
