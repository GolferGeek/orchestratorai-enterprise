<template>
  <article class="swarm-result">
    <section v-if="result.winner" class="winner">
      <h3>Winner: {{ nameOf(result.winner.writer) }}<span v-if="result.winner.edited" class="muted"> (edited by the reviewer)</span></h3>
      <p class="text">{{ result.winner.text }}</p>
    </section>
    <p v-else class="declined">No winner picked: {{ result.declined }}</p>

    <h3>Standings</h3>
    <StandingsTable :standings="result.standings" :evaluators="result.evaluators" :writers="result.writers" :winner="result.winner?.writer ?? null" />

    <h3>Drafts</h3>
    <article v-for="d in result.drafts" :key="d.writer" class="draft">
      <header>
        <strong>{{ nameOf(d.writer) }}</strong>
        <span class="muted">{{ result.writers.find((w) => w.slug === d.writer)?.model }}</span>
        <span v-if="d.error" class="problem">{{ d.error }}</span>
      </header>
      <details v-for="v in d.versions" :key="v.n" :open="v.n === d.versions.length">
        <summary>
          Version {{ v.n }}
          <span v-for="e in result.editors" :key="e.slug" class="verdict" :class="v.editors[e.slug]?.pass ? 'pass' : 'short'">
            {{ e.name }} {{ Math.round((v.editors[e.slug]?.score ?? 0) * 100) }}
          </span>
        </summary>
        <p class="text">{{ v.text }}</p>
        <FacetBars :facets="result.facets" :scores="v.scores" :reasons="Object.fromEntries(Object.entries(v.scores).map(([k, s]) => [k, s.reason]))" />
        <p v-if="v.feedback" class="feedback"><strong>Coach:</strong> {{ v.feedback }}</p>
      </details>
    </article>
    <details class="brief">
      <summary>Brief</summary>
      <p class="text">{{ result.brief }}</p>
    </details>
  </article>
</template>

<script lang="ts" setup>
import FacetBars from './FacetBars.vue';
import StandingsTable from './StandingsTable.vue';
import type { SwarmRunResult } from './swarmApi';

const props = defineProps<{ result: SwarmRunResult }>();
const nameOf = (slug: string) => props.result.writers.find((w) => w.slug === slug)?.name ?? slug;
</script>

<style scoped>
.swarm-result { display: flex; flex-direction: column; gap: 10px; max-width: 900px; }
h3 { margin: 10px 0 2px; font-size: 15px; }
.winner { border-left: 4px solid var(--ion-color-success); padding: 4px 12px; }
.winner h3 { margin-top: 0; }
.declined { color: var(--ion-color-warning-shade); }
.draft { border-top: 1px solid var(--ion-color-light-shade); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
header { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.text { white-space: pre-wrap; margin: 6px 0; font-size: 13px; line-height: 1.55; }
.muted { color: var(--ion-color-medium); font-size: 12px; font-weight: 400; }
.problem { color: var(--ion-color-danger); font-size: 12px; }
summary { cursor: pointer; font-size: 13px; }
.verdict { font-size: 11px; padding: 1px 6px; border: 1px solid; margin-left: 6px; }
.pass { color: var(--ion-color-success-shade); }
.short { color: var(--ion-color-warning-shade); }
.feedback { font-size: 13px; color: var(--ion-color-medium-shade); margin: 4px 0 8px; }
</style>
