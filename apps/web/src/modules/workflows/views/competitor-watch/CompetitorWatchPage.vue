<template>
  <RuntimeWorkflowPage
    slug="competitor-watch"
    name="Competitor Watch"
    intro="What changed on the competitor pages you follow, which changes matter (Jev sorts pricing, product, messaging and hiring changes from noise), and a short write-up of the ones that do. It also runs every Monday morning."
    route-name="CompetitorWatch"
    :run-title="title"
    exportable
  >
    <template #form="{ start, busy, blocked, example }">
      <CompetitorWatchForm :busy="busy" :blocked="!!blocked" :example="example" @start="start" />
    </template>
    <template #result="{ result }">
      <CompetitorWatchResult :result="result as unknown as CompetitorWatchRunResult" />
    </template>
  </RuntimeWorkflowPage>
</template>

<script lang="ts" setup>
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { RuntimeWorkflowPage } from '@/modules/workflows/kit';
import CompetitorWatchForm from './CompetitorWatchForm.vue';
import CompetitorWatchResult, { type CompetitorWatchRunResult } from './CompetitorWatchResult.vue';

function title(input: JsonValue): string {
  return (input as { compareWith?: string }).compareWith === 'last-run' ? 'Competitor watch - since the last run' : 'Competitor watch - the last 90 days';
}
</script>
