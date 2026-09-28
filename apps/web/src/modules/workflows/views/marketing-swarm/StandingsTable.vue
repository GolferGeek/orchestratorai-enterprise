<template>
  <table class="standings">
    <tr>
      <th>Place</th><th>Writer</th>
      <th v-for="e in evaluators" :key="e.slug">{{ e.name }}</th>
      <th>Mean place</th>
    </tr>
    <tr v-for="s in standings" :key="s.writer" :class="{ winner: s.writer === winner }">
      <td class="num">{{ s.place }}</td>
      <td>{{ nameOf(s.writer) }}</td>
      <td v-for="e in evaluators" :key="e.slug" class="num">
        {{ s.byEvaluator[e.slug]?.place }} <span class="muted">({{ Math.round((s.byEvaluator[e.slug]?.score ?? 0) * 100) }})</span>
      </td>
      <td class="num">{{ s.averagePlace }}</td>
    </tr>
  </table>
</template>

<script lang="ts" setup>
import type { Standing } from './swarmApi';

/** Each evaluator's place (and score) for each draft; overall by the mean place. */
const props = defineProps<{ standings: Standing[]; evaluators: Array<{ slug: string; name: string }>; writers: Array<{ slug: string; name: string }>; winner?: string | null }>();
const nameOf = (slug: string) => props.writers.find((w) => w.slug === slug)?.name ?? slug;
</script>

<style scoped>
.standings { border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 4px 14px 4px 0; }
th { font-size: 12px; color: var(--ion-color-medium); font-weight: 600; }
.num { font-variant-numeric: tabular-nums; }
.muted { color: var(--ion-color-medium); font-size: 11px; }
.winner td { font-weight: 700; }
</style>
