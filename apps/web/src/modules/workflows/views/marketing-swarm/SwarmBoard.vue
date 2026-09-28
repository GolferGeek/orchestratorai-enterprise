<template>
  <section class="board">
    <p class="hint">
      Round {{ board.cycle + 1 }} of {{ board.maxEditCycles + 1 }} ·
      editors: <span v-for="(e, i) in board.editors" :key="e.slug">{{ e.name }} (≥ {{ Math.round(e.threshold * 100) }}){{ i < board.editors.length - 1 ? ', ' : '' }}</span>
    </p>
    <article v-for="d in board.drafts" :key="d.writer" class="draft" :class="`draft--${d.status}`">
      <header>
        <strong>{{ d.name }}</strong>
        <span class="model">{{ d.model }}</span>
        <span class="status">{{ STATUS[d.status] }}{{ d.version > 1 ? ` · version ${d.version}` : '' }}</span>
      </header>
      <p v-if="d.error" class="problem">{{ d.error }}</p>
      <div v-if="Object.keys(d.editors).length" class="verdicts">
        <span v-for="e in board.editors" :key="e.slug" class="verdict" :class="d.editors[e.slug]?.pass ? 'pass' : 'short'">
          {{ e.name }} {{ Math.round((d.editors[e.slug]?.score ?? 0) * 100) }}
        </span>
      </div>
      <FacetBars v-if="Object.keys(d.scores).length" :facets="board.facets" :scores="d.scores" />
      <details v-if="d.text">
        <summary>Draft</summary>
        <p class="text">{{ d.text }}</p>
      </details>
    </article>
    <template v-if="board.standings">
      <h3>Standings</h3>
      <StandingsTable :standings="board.standings" :evaluators="board.evaluators" :writers="board.drafts.map((d) => ({ slug: d.writer, name: d.name }))" />
    </template>
  </section>
</template>

<script lang="ts" setup>
import FacetBars from './FacetBars.vue';
import StandingsTable from './StandingsTable.vue';
import type { SwarmBoard } from './swarmApi';

/** The swarm while it runs: each draft, its facet scores, the editors' verdicts, then the standings. */
defineProps<{ board: SwarmBoard }>();
const STATUS: Record<SwarmBoard['drafts'][number]['status'], string> = {
  writing: 'Writing',
  scoring: 'Scoring',
  revising: 'Going back for a rewrite',
  approved: 'Approved by every editor',
  final: 'Final',
  failed: 'Failed',
};
</script>

<style scoped>
.board { display: flex; flex-direction: column; gap: 12px; }
.hint { color: var(--ion-color-medium); margin: 0; font-size: 13px; }
.draft { border: 1px solid var(--ion-color-light-shade); border-left-width: 4px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.draft--approved, .draft--final { border-left-color: var(--ion-color-success); }
.draft--revising { border-left-color: var(--ion-color-warning); }
.draft--failed { border-left-color: var(--ion-color-danger); }
.draft--writing, .draft--scoring { border-left-color: var(--ion-color-primary); }
header { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.model, .status { font-size: 12px; color: var(--ion-color-medium); }
.verdicts { display: flex; gap: 6px; flex-wrap: wrap; }
.verdict { font-size: 11px; padding: 1px 6px; border: 1px solid; }
.pass { color: var(--ion-color-success-shade); }
.short { color: var(--ion-color-warning-shade); }
.problem { color: var(--ion-color-danger); margin: 0; }
.text { white-space: pre-wrap; margin: 6px 0 0; font-size: 13px; line-height: 1.5; }
summary { cursor: pointer; font-size: 12px; color: var(--ion-color-medium); }
h3 { margin: 8px 0 0; font-size: 15px; }
</style>
