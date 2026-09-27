<template>
  <div v-if="verdicts.length" class="guards">
    <div v-for="v in verdicts" :key="v.rubric" :class="['guard', `guard--${v.decision}`]">
      <span class="guard-label">Jev · {{ label(v.rubric) }}</span>
      <span class="guard-decision">{{ DECISIONS[v.decision] }}</span>
      <span v-if="v.reason" class="guard-reason">{{ v.reason }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

interface Verdict {
  rubric: string;
  decision: 'pass' | 'review' | 'block';
  reason: string | null;
}

const props = defineProps<{ metadata?: Record<string, unknown> }>();

const DECISIONS: Record<Verdict['decision'], string> = { pass: 'Passed', review: 'Needs a look', block: 'Flagged' };

/** The agent's Jev guard verdicts (output.metadata.guards), when it has guards. */
const verdicts = computed<Verdict[]>(() => {
  const guards = props.metadata?.guards;
  if (!Array.isArray(guards)) return [];
  return guards.filter(
    (g): g is Verdict =>
      typeof g === 'object' && g !== null && typeof g.rubric === 'string' && ['pass', 'review', 'block'].includes(g.decision),
  );
});

function label(rubric: string): string {
  return rubric.replace(/-/g, ' ');
}
</script>

<style scoped>
.guards { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.guard { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 12px; padding: 4px 8px; border-left: 3px solid var(--ion-color-medium); background: var(--ion-color-light); }
.guard--pass { border-left-color: var(--ion-color-success); }
.guard--review { border-left-color: var(--ion-color-warning); }
.guard--block { border-left-color: var(--ion-color-danger); }
.guard-label { color: var(--ion-color-medium); text-transform: capitalize; }
.guard-decision { font-weight: 600; }
.guard--block .guard-decision { color: var(--ion-color-danger); }
.guard--review .guard-decision { color: var(--ion-color-warning-shade); }
.guard--pass .guard-decision { color: var(--ion-color-success); }
.guard-reason { color: var(--ion-color-medium); }
</style>
