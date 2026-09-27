<template>
  <div class="digest">
    <p class="week">Week ending {{ result.weekEnding }}</p>
    <ModelProse class="company" :text="result.companySummary" />
    <div class="totals">
      <div><strong>{{ result.totals.workflowRuns }}</strong><span>workflow runs</span></div>
      <div><strong>{{ result.totals.agentConversations }}</strong><span>agent conversations</span></div>
      <div><strong>{{ result.totals.openReviews }}</strong><span>reviews waiting</span></div>
      <div><strong>{{ result.totals.modelCalls }}</strong><span>model calls</span></div>
      <div><strong>{{ usd(result.totals.modelCostUsd) }}</strong><span>model cost</span></div>
    </div>
    <article v-for="d in result.departments" :key="d.organization" class="dept">
      <header>
        <h3>{{ d.organization }}</h3>
        <span class="nums">
          {{ d.activity.workflowRunsTotal }} runs · {{ d.activity.agentConversationsTotal }} conversations ·
          {{ d.activity.openReviews }} waiting · {{ usd(d.activity.modelCostUsd) }}
        </span>
      </header>
      <p class="headline">{{ d.headline }}</p>
      <p>{{ d.summary }}</p>
      <ul v-if="d.watch.length" class="watch">
        <li v-for="(w, i) in d.watch" :key="i">{{ w }}</li>
      </ul>
    </article>
  </div>
</template>

<script lang="ts" setup>
import { ModelProse } from '@/modules/workflows/kit';
/** A completed digest (exec-digest.result.ts). */
export interface ExecDigestRunResult {
  weekEnding: string;
  companySummary: string;
  totals: { workflowRuns: number; agentConversations: number; openReviews: number; modelCalls: number; modelCostUsd: number };
  departments: Array<{
    organization: string;
    headline: string;
    summary: string;
    watch: string[];
    activity: { workflowRunsTotal: number; agentConversationsTotal: number; openReviews: number; modelCostUsd: number };
  }>;
}

defineProps<{ result: ExecDigestRunResult }>();

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}
</script>

<style scoped>
.digest { display: flex; flex-direction: column; gap: 12px; }
.week { margin: 0; color: var(--ion-color-medium); font-size: 13px; }
.company { margin: 0; font-size: 15px; line-height: 1.55; }
.totals { display: flex; gap: 24px; flex-wrap: wrap; padding: 8px 0; }
.totals div { display: flex; flex-direction: column; }
.totals strong { font-size: 22px; }
.totals span { font-size: 12px; color: var(--ion-color-medium); }
.dept { border: 1px solid var(--ion-color-light-shade); padding: 10px 14px; }
.dept header { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: baseline; }
.dept h3 { margin: 0; text-transform: capitalize; font-size: 16px; }
.nums { font-size: 12px; color: var(--ion-color-medium); }
.headline { font-weight: 600; margin: 6px 0 2px; }
.dept p { margin: 4px 0; }
.watch { margin: 4px 0 0; padding-left: 18px; }
</style>
