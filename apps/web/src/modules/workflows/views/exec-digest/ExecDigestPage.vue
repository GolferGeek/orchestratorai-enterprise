<template>
  <RuntimeWorkflowPage
    slug="exec-digest"
    name="Weekly Exec Digest"
    intro="Each department's week in numbers - workflow runs, agent conversations, reviews waiting on people, model cost - with a paragraph per department and a company summary. It also runs by itself every Friday afternoon."
    route-name="ExecDigest"
    :run-title="title"
    exportable
  >
    <template #form="{ start, busy, blocked, example }">
      <ExecDigestForm :busy="busy" :blocked="!!blocked" :example="example" @start="start" />
    </template>
    <template #result="{ result }">
      <ExecDigestResult :result="result as unknown as ExecDigestRunResult" />
    </template>
  </RuntimeWorkflowPage>
</template>

<script lang="ts" setup>
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { RuntimeWorkflowPage } from '@/modules/workflows/kit';
import ExecDigestForm from './ExecDigestForm.vue';
import ExecDigestResult, { type ExecDigestRunResult } from './ExecDigestResult.vue';

function title(input: JsonValue): string {
  const i = input as { weekEnding?: string | null; organizations?: string[] };
  return `Exec digest${i.weekEnding ? ` - week ending ${i.weekEnding}` : ''}${i.organizations ? ` (${i.organizations.length} departments)` : ''}`;
}
</script>
