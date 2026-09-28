<template>
  <ul class="facets">
    <li v-for="f in shown" :key="f.key" :title="reasons?.[f.key] ?? ''">
      <span class="label">{{ f.label }}</span>
      <span class="bar"><span class="fill" :class="tone(scores[f.key]!.score)" :style="{ width: `${Math.round(scores[f.key]!.score * 100)}%` }" /></span>
      <span class="value">{{ Math.round(scores[f.key]!.score * 100) }}</span>
    </li>
  </ul>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { FacetRef } from './swarmApi';

/** A draft's score on each facet (0-1), as bars. */
const props = defineProps<{ facets: FacetRef[]; scores: Record<string, { score: number }>; reasons?: Record<string, string> }>();
const shown = computed(() => props.facets.filter((f) => props.scores[f.key]));
const tone = (score: number) => (score >= 0.7 ? 'good' : score >= 0.4 ? 'mid' : 'low');
</script>

<style scoped>
.facets { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 2px 12px; font-size: 12px; }
.facets li { display: grid; grid-template-columns: 110px 1fr 26px; align-items: center; gap: 6px; }
.label { color: var(--ion-color-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar { height: 6px; background: var(--ion-color-light-shade); }
.fill { display: block; height: 100%; }
.good { background: var(--ion-color-success); }
.mid { background: var(--ion-color-warning); }
.low { background: var(--ion-color-danger); }
.value { text-align: right; font-variant-numeric: tabular-nums; }
</style>
