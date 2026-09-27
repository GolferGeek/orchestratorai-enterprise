<template>
  <ol class="activity">
    <li v-for="(event, index) in shown" :key="index" :class="['event', `event--${severity(event)}`]">
      <span class="time">{{ time(event.timestamp) }}</span>
      <span class="type">{{ label(event.hook_event_type) }}</span>
      <span class="message">{{ event.message ?? '' }}</span>
    </li>
    <li v-if="shown.length === 0" class="empty">No activity yet.</li>
  </ol>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { WorkflowStreamEvent } from './workflowRunsClient';

const props = defineProps<{ events: WorkflowStreamEvent[] }>();

/** Newest first. */
const shown = computed(() => [...props.events].reverse());

function time(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function label(type: string): string {
  return type.replace(/^langgraph\./, '').replace(/^agent\./, '').replace(/[._]/g, ' ');
}

function severity(event: WorkflowStreamEvent): 'error' | 'info' {
  return /failed|error/.test(event.hook_event_type) ? 'error' : 'info';
}
</script>

<style scoped>
.activity { list-style: none; margin: 0; padding: 0; font-size: 13px; }
.event { display: grid; grid-template-columns: 90px 170px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--ion-color-light-shade); }
.event--error .type, .event--error .message { color: var(--ion-color-danger); }
.time { color: var(--ion-color-medium); font-variant-numeric: tabular-nums; }
.type { font-weight: 600; text-transform: capitalize; }
.empty { color: var(--ion-color-medium); padding: 8px 0; }
@media (max-width: 640px) { .event { grid-template-columns: 1fr; } }
</style>
