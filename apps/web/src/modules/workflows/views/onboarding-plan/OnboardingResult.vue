<template>
  <article class="plan">
    <p class="who">{{ result.hire.fullName }} · {{ result.hire.roleTitle }}, {{ result.hire.team }} · starts {{ result.hire.startDate }} · manager {{ result.hire.managerName }}</p>
    <h3>Welcome</h3>
    <p>{{ result.plan.welcome }}</p>
    <h3>First week</h3>
    <div class="days">
      <div v-for="d in result.plan.firstWeek" :key="d.day" class="day">
        <strong>Day {{ d.day }}</strong>
        <ul><li v-for="(x, i) in d.items" :key="i">{{ x }}</li></ul>
      </div>
    </div>
    <template v-for="section in STAGES" :key="section.key">
      <h3>{{ section.label }}</h3>
      <ul><li v-for="(x, i) in result.plan[section.key]" :key="i">{{ x }}</li></ul>
    </template>
    <h3>Requests</h3>
    <table>
      <tr v-for="r in result.requests" :key="r.key">
        <td class="kind">{{ r.kind }}</td>
        <td>{{ r.item }}<div class="muted">{{ r.owner }} · {{ r.neededBy }}</div></td>
        <td class="muted">{{ r.task ? `${r.task.provider} task ${r.task.id.slice(0, 8)}` : '' }}</td>
      </tr>
    </table>
    <p v-if="result.policySources.length" class="muted">Policy used: {{ result.policySources.join(', ') }}</p>
  </article>
</template>

<script lang="ts" setup>
import type { NewHire } from './newHiresApi';

/** A completed onboarding plan (onboarding.result.ts). */
export interface OnboardingRunResult {
  hire: NewHire;
  plan: {
    welcome: string;
    firstWeek: Array<{ day: number; items: string[] }>;
    plan30: string[];
    plan60: string[];
    plan90: string[];
  };
  requests: Array<{ key: string; kind: string; item: string; owner: string; neededBy: string; task: { provider: string; id: string } | null }>;
  policySources: string[];
}

defineProps<{ result: OnboardingRunResult }>();
const STAGES = [
  { key: 'plan30', label: 'First 30 days' },
  { key: 'plan60', label: 'By 60 days' },
  { key: 'plan90', label: 'By 90 days' },
] as const;
</script>

<style scoped>
.plan { display: flex; flex-direction: column; gap: 4px; max-width: 860px; }
.plan h3 { margin: 12px 0 2px; font-size: 15px; }
.plan p { margin: 0; line-height: 1.55; }
.who { color: var(--ion-color-medium); font-size: 13px; }
.days { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.day ul { font-size: 13px; }
ul { margin: 0; padding-left: 18px; }
table { border-collapse: collapse; font-size: 13px; }
td { padding: 4px 12px 4px 0; vertical-align: top; }
.kind { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--ion-color-medium); }
.muted { color: var(--ion-color-medium); font-size: 12px; }
</style>
