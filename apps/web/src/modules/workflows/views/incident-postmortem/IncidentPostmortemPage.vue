<template>
  <RuntimeWorkflowPage
    slug="incident-postmortem"
    name="Incident Postmortem"
    intro="Paste the incident's timeline and notes. Jev rates the severity, a blameless postmortem is drafted, you approve the action items, and each becomes a task in your tracker."
    route-name="IncidentPostmortem"
    :run-title="title"
    exportable
  >
    <template #form="{ start, busy, blocked, example }">
      <IncidentPostmortemForm :busy="busy" :blocked="!!blocked" :example="example" @start="start" />
    </template>
    <template #result="{ result }">
      <IncidentPostmortemResult :result="result as unknown as PostmortemRunResult" />
    </template>
    <template #review-item="{ item }">
      <div>
        <span :class="['prio', `prio--${item.priority}`]">{{ item.priority }}</span> <strong>{{ item.title }}</strong>
        <p class="meta">{{ item.owner }} · {{ item.due }}</p>
        <p class="meta">{{ item.why }}</p>
      </div>
    </template>
  </RuntimeWorkflowPage>
</template>

<script lang="ts" setup>
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { RuntimeWorkflowPage } from '@/modules/workflows/kit';
import IncidentPostmortemForm from './IncidentPostmortemForm.vue';
import IncidentPostmortemResult, { type PostmortemRunResult } from './IncidentPostmortemResult.vue';

function title(input: JsonValue): string {
  return `Postmortem: ${(input as { title?: string }).title ?? ''}`;
}
</script>

<style scoped>
.meta { margin: 2px 0 0; font-size: 12px; color: var(--ion-color-medium); }
.prio { font-size: 11px; font-weight: 600; text-transform: uppercase; }
.prio--high { color: var(--ion-color-danger); }
.prio--medium { color: var(--ion-color-warning-shade); }
</style>
