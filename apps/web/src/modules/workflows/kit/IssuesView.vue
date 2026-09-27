<template>
  <div class="issues">
    <p v-if="error" class="problem">{{ error }}</p>
    <p v-else-if="!ledger" class="hint">Loading the issues...</p>
    <template v-else>
      <p v-if="ledger.summary.total === 0" class="hint">This run has raised no issues.</p>
      <p v-else class="summary">
        {{ ledger.summary.total }} issue{{ ledger.summary.total === 1 ? '' : 's' }},
        {{ ledger.summary.open }} open ·
        <span v-for="status in shownStatuses" :key="status" class="count">
          {{ ledger.summary.byStatus[status] }} {{ STATUS_LABELS[status].toLowerCase() }}
        </span>
      </p>
      <article v-for="issue in ledger.issues" :key="issue.issueId" :class="['issue', `issue--${issue.severity}`]">
        <header class="issue-header">
          <span :class="['severity', `severity--${issue.severity}`]">{{ issue.severity }}</span>
          <strong>{{ issue.title }}</strong>
          <span :class="['status', `status--${issue.status}`]">{{ STATUS_LABELS[issue.status] }}</span>
        </header>
        <p class="finding">{{ issue.finding }}</p>
        <p v-if="issue.recommendedAction" class="action">Recommended: {{ issue.recommendedAction }}</p>
        <p v-if="issue.lastChange.rationale" class="change">{{ issue.lastChange.rationale }}</p>
        <p class="meta">{{ issue.stageSlug }} · {{ issue.lastChange.actor }}</p>
      </article>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { ISSUE_STATUSES, type IssueLedgerView, type IssueStatus } from '@orchestrator-ai/transport-types';
import { workflowRunsClient } from './workflowRunsClient';

const props = defineProps<{ slug: string; runId: string; orgSlug: string; version: number }>();

const STATUS_LABELS: Record<IssueStatus, string> = {
  identified: 'Identified',
  accepted: 'Accepted',
  rejected: 'Rejected',
  addressed: 'Addressed',
  not_addressed: 'Not addressed',
  report_only: 'Report only',
};

const ledger = shallowRef<IssueLedgerView | null>(null);
const error = ref<string | null>(null);
const shownStatuses = computed(() => ISSUE_STATUSES.filter((s) => (ledger.value?.summary.byStatus[s] ?? 0) > 0));

async function load(): Promise<void> {
  try {
    ledger.value = await workflowRunsClient.getIssues(props.slug, props.runId, props.orgSlug);
    error.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

onMounted(load);
// The parent bumps `version` when the run moves on, so the ledger follows it.
watch(() => props.version, load);
</script>

<style scoped>
.issues { display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.summary { margin: 0; color: var(--ion-color-medium); }
.count + .count::before { content: ' · '; }
.issue { border: 1px solid var(--ion-color-light-shade); border-left-width: 4px; padding: 8px 12px; }
.issue--critical { border-left-color: var(--ion-color-danger); }
.issue--high { border-left-color: var(--ion-color-warning); }
.issue--medium { border-left-color: var(--ion-color-primary); }
.issue-header { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.severity { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--ion-color-medium); }
.severity--critical { color: var(--ion-color-danger); }
.severity--high { color: var(--ion-color-warning-shade); }
.status { margin-left: auto; font-size: 12px; color: var(--ion-color-medium); }
.status--accepted, .status--addressed { color: var(--ion-color-success); }
.status--not_addressed { color: var(--ion-color-danger); }
.finding, .action, .change { margin: 6px 0 0; white-space: pre-wrap; }
.change { font-style: italic; }
.meta, .hint { color: var(--ion-color-medium); }
.meta { margin: 6px 0 0; font-size: 12px; }
.problem { color: var(--ion-color-danger); }
</style>
