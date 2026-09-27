<template>
  <div class="watch">
    <p class="summary">{{ result.summary }}</p>
    <p class="meta">
      {{ result.material.length }} material change(s) · {{ result.noise }} filtered as noise · compared with
      {{ result.compareWith === 'last-run' ? 'the last run' : 'the Internet Archive, about 90 days ago' }}
    </p>
    <article v-for="(c, i) in result.material" :key="i" class="change">
      <header>
        <strong>{{ c.competitor }} · {{ c.page }}</strong>
        <span :class="['type', `type--${c.decision}`]">{{ c.type }}{{ c.decision === 'review' ? ' (maybe)' : '' }}</span>
      </header>
      <p v-if="c.removed.length" class="removed"><span>Before</span>{{ c.removed.join(' ') }}</p>
      <p v-if="c.added.length" class="added"><span>Now</span>{{ c.added.join(' ') }}</p>
      <p v-if="c.reason" class="reason">Jev: {{ c.reason }}</p>
    </article>
    <h4>Pages</h4>
    <table>
      <tr v-for="s in result.sources" :key="s.sourceId">
        <td>{{ s.competitor }} · {{ s.page }}</td>
        <td :class="`status--${s.status}`">{{ s.status }}</td>
        <td class="small">{{ s.status === 'failed' ? s.error : s.baselineFrom ? `vs ${s.baselineFrom.slice(0, 10)}` : 'first capture' }}</td>
      </tr>
    </table>
  </div>
</template>

<script lang="ts" setup>
/** A completed watch (competitor-watch.result.ts). */
export interface CompetitorWatchRunResult {
  compareWith: 'last-run' | 'archive-90-days';
  summary: string;
  noise: number;
  sources: Array<{ sourceId: string; competitor: string; page: string; status: 'compared' | 'baseline' | 'failed'; baselineFrom: string | null; error: string | null }>;
  material: Array<{ competitor: string; page: string; type: string; decision: 'review' | 'block'; reason: string | null; removed: string[]; added: string[] }>;
}

defineProps<{ result: CompetitorWatchRunResult }>();
</script>

<style scoped>
.watch { display: flex; flex-direction: column; gap: 10px; }
.summary { margin: 0; white-space: pre-wrap; line-height: 1.55; }
.meta { margin: 0; font-size: 12px; color: var(--ion-color-medium); }
.change { border: 1px solid var(--ion-color-light-shade); border-left: 3px solid var(--ion-color-primary); padding: 8px 12px; }
.change header { display: flex; justify-content: space-between; gap: 8px; }
.type { font-size: 12px; font-weight: 600; text-transform: capitalize; }
.type--block { color: var(--ion-color-danger); }
.type--review { color: var(--ion-color-warning-shade); }
.change p { margin: 6px 0 0; font-size: 13px; }
.change p span { display: inline-block; min-width: 52px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--ion-color-medium); }
.removed { text-decoration: line-through; color: var(--ion-color-medium); }
.reason { font-style: italic; color: var(--ion-color-medium); }
h4 { margin: 8px 0 0; }
table { font-size: 13px; border-collapse: collapse; }
td { padding: 4px 12px 4px 0; }
.small { font-size: 12px; color: var(--ion-color-medium); }
.status--failed { color: var(--ion-color-danger); }
</style>
