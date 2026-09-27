<template>
  <div class="trace">
    <p v-if="error" class="problem">{{ error }}</p>
    <p v-else-if="!trace" class="hint">Loading the trace...</p>
    <template v-else>
      <p v-if="trace.workUnits.length === 0" class="hint">No steps recorded yet.</p>
      <section v-for="unit in trace.workUnits" :key="unit.workUnitId" class="unit">
        <header class="unit-header">
          <strong>{{ unit.slug }}</strong>
          <span class="pattern">{{ unit.pattern.replace('_', '/') }}</span>
          <span :class="['status', `status--${unit.status}`]">{{ unit.status.replace('_', ' ') }}</span>
          <span v-if="unit.durationMs !== null" class="duration">{{ seconds(unit.durationMs) }}</span>
        </header>
        <p v-if="unit.error" class="problem">{{ unit.error }}</p>
        <ul class="participants">
          <li
            v-for="p in unit.participants"
            :key="p.participantId"
            :class="['participant', { 'participant--selected': selected?.participantId === p.participantId }]"
            @click="select(p.participantId)"
          >
            <span class="stage">{{ p.stage }}</span>
            <span class="agent">{{ p.agentSlug }}</span>
            <span class="model">{{ p.model ?? '' }}</span>
            <span :class="['status', `status--${p.status}`]">{{ p.status }}</span>
          </li>
        </ul>
      </section>

      <section v-if="selected" class="detail">
        <h4>{{ selected.stage }} · {{ selected.agentSlug }} (v{{ selected.agentVersion ?? '?' }})</h4>
        <p class="hint">
          {{ selected.provider }}/{{ selected.model }} · role {{ selected.modelRole ?? '—' }}
          <template v-if="selected.usage">
            · {{ selected.usage.inputTokens ?? '?' }} in / {{ selected.usage.outputTokens ?? '?' }} out
            <template v-if="selected.usage.cost !== null"> · ${{ selected.usage.cost.toFixed(5) }}</template>
          </template>
        </p>
        <p v-if="selected.error" class="problem">{{ selected.error }}</p>
        <h5>Input</h5>
        <pre>{{ show(selected.input) }}</pre>
        <h5>Output</h5>
        <pre>{{ show(selected.output) }}</pre>
        <template v-if="selected.rawOutput">
          <h5>Raw answer (did not match the agent's contract)</h5>
          <pre>{{ selected.rawOutput }}</pre>
        </template>
        <template v-if="selected.usage?.thinking">
          <h5>Reasoning</h5>
          <pre>{{ selected.usage.thinking }}</pre>
        </template>
      </section>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, shallowRef, watch } from 'vue';
import type { ParticipantDetail, RunTrace, TraceRef } from '@orchestrator-ai/transport-types';
import { workflowRunsClient } from './workflowRunsClient';

const props = defineProps<{ slug: string; runId: string; orgSlug: string; version: number }>();

// Read-only views of recursive JSON: shallow refs (no deep unwrapping).
const trace = shallowRef<RunTrace | null>(null);
const selected = shallowRef<ParticipantDetail | null>(null);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  try {
    trace.value = await workflowRunsClient.getTrace(props.slug, props.runId, props.orgSlug);
    error.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function select(participantId: string): Promise<void> {
  try {
    selected.value = await workflowRunsClient.getParticipant(props.slug, props.runId, participantId, props.orgSlug);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function show(ref: TraceRef | null): string {
  if (!ref) return '—';
  const text = typeof ref.value === 'string' ? ref.value : JSON.stringify(ref.value, null, 2);
  return ref.truncated ? `${text}\n[cut for the trace]` : text;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

onMounted(load);
// The parent bumps `version` when the run moves on, so the trace follows it.
watch(() => props.version, load);
</script>

<style scoped>
.trace { display: flex; flex-direction: column; gap: 12px; font-size: 13px; }
.unit { border: 1px solid var(--ion-color-light-shade); padding: 10px 12px; }
.unit-header { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.pattern, .duration, .model, .hint { color: var(--ion-color-medium); }
.participants { list-style: none; margin: 8px 0 0; padding: 0; }
.participant { display: grid; grid-template-columns: 90px 1fr 1fr 80px; gap: 8px; padding: 4px 6px; cursor: pointer; }
.participant:hover, .participant--selected { background: var(--ion-color-light); }
.stage { font-weight: 600; }
.status--failed { color: var(--ion-color-danger); }
.status--completed_partial { color: var(--ion-color-warning-shade); }
.detail { border-top: 2px solid var(--ion-color-light-shade); padding-top: 8px; }
.detail h4 { margin: 0 0 4px; }
pre { white-space: pre-wrap; word-break: break-word; background: var(--ion-color-light); padding: 8px; max-height: 320px; overflow: auto; }
.problem { color: var(--ion-color-danger); }
@media (max-width: 640px) { .participant { grid-template-columns: 1fr 1fr; } }
</style>
