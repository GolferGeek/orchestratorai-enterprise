<template>
  <div class="dr-result">
    <div class="headline">
      <div class="score-card">
        <span class="label">Risk score</span>
        <span class="value">{{ result.overallScore }}</span>
        <span v-if="result.debate" class="note">
          red team {{ result.debate.adjustment >= 0 ? '+' : '' }}{{ result.debate.adjustment }} (from {{ result.debate.originalScore }})
        </span>
      </div>
      <div v-if="result.residualScore !== null" class="score-card">
        <span class="label">If mitigated</span>
        <span class="value">{{ result.residualScore }}</span>
        <span class="note">{{ result.mitigations.length }} approved mitigation(s)</span>
      </div>
      <div v-if="range" class="score-card">
        <span class="label">Likely range</span>
        <span class="value">{{ Math.round(range.p10) }}–{{ Math.round(range.p90) }}</span>
        <span class="note">{{ Math.round(range.probabilityAboveAlert * 100) }}% chance above {{ range.alertThreshold }}</span>
      </div>
      <div v-if="result.overallConfidence !== null" class="score-card">
        <span class="label">Confidence</span>
        <span class="value">{{ Math.round(result.overallConfidence * 100) }}%</span>
      </div>
    </div>

    <section>
      <h3>Summary</h3>
      <p class="summary">{{ result.executiveSummary }}</p>
    </section>

    <section v-if="result.mitigations.length">
      <h3>Mitigations</h3>
      <ul class="mitigations">
        <li v-for="m in result.mitigations" :key="m.dimensionSlug">
          <strong>{{ dimensionName(m.dimensionSlug) }}</strong> — {{ m.proposal }}
          <span class="note">(effort {{ m.effort }}; this dimension would fall to {{ m.residualScore }})</span>
        </li>
      </ul>
    </section>

    <section>
      <h3>Dimensions</h3>
      <table class="dimensions">
        <thead><tr><th>Dimension</th><th>Score</th><th>Confidence</th><th>Reasoning</th></tr></thead>
        <tbody>
          <tr v-for="d in sortedDimensions" :key="d.slug">
            <td>{{ d.name }}</td>
            <td :class="{ high: d.score >= 60 }">{{ d.score }}</td>
            <td>{{ Math.round(d.confidence * 100) }}%</td>
            <td class="reasoning">{{ d.reasoning }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

/** The shape of a completed decision-risk run's result (decision-risk.handler.ts). */
export interface DecisionRiskRunResult {
  overallScore: number;
  overallConfidence: number | null;
  residualScore: number | null;
  executiveSummary: string;
  dimensions: Array<{ slug: string; name: string; score: number; confidence: number; reasoning: string; evidence: string[] }>;
  debate: { originalScore: number; finalScore: number; adjustment: number } | null;
  mitigations: Array<{ dimensionSlug: string; proposal: string; rationale: string; effort: string; residualScore: number }>;
  monteCarlo: { composite: { p10: number; p90: number; probabilityAboveAlert: number; alertThreshold: number } } | null;
}

const props = defineProps<{ result: DecisionRiskRunResult }>();

const range = computed(() => props.result.monteCarlo?.composite ?? null);
const sortedDimensions = computed(() => [...props.result.dimensions].sort((a, b) => b.score - a.score));

function dimensionName(slug: string): string {
  return props.result.dimensions.find((d) => d.slug === slug)?.name ?? slug;
}
</script>

<style scoped>
.dr-result { display: flex; flex-direction: column; gap: 16px; }
.headline { display: flex; gap: 12px; flex-wrap: wrap; }
.score-card { display: flex; flex-direction: column; min-width: 140px; padding: 10px 14px; border: 1px solid var(--ion-color-light-shade); }
.label { font-size: 12px; text-transform: uppercase; color: var(--ion-color-medium); }
.value { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.note { font-size: 12px; color: var(--ion-color-medium); }
h3 { margin: 0 0 6px; font-size: 15px; }
.summary { margin: 0; line-height: 1.5; white-space: pre-wrap; }
.mitigations { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.dimensions { width: 100%; border-collapse: collapse; font-size: 13px; }
.dimensions th, .dimensions td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--ion-color-light-shade); vertical-align: top; }
.dimensions td:nth-child(2), .dimensions td:nth-child(3) { font-variant-numeric: tabular-nums; white-space: nowrap; }
.high { color: var(--ion-color-danger); font-weight: 600; }
.reasoning { color: var(--ion-color-medium-shade); }
@media (max-width: 640px) { .reasoning { display: none; } }
</style>
