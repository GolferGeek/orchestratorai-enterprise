<template>
  <span class="in-row-ticker" :class="{ 'in-row-ticker--queued': queuedOnly }">
    <span class="ticker-icon" aria-hidden="true">{{ icon }}</span>
    <span class="ticker-label">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import { useJobEventStream } from '../composables/useJobEventStream';
import { useWorkflowPresentation } from '../composables/useWorkflowPresentation';
import type { StageState } from '@orchestrator-ai/transport-types';

const props = defineProps<{
  jobId: string;
  conversationId: string;
  orgSlug: string;
  callerUserId?: string;
  /** Job status — when 'queued', show a queued state without opening SSE. */
  status: 'queued' | 'processing' | 'completed' | 'failed';
}>();

const queuedOnly = computed(() => props.status === 'queued');

// Don't open the stream for queued jobs — wait until they actually
// transition to processing (the parent list will pass an updated row).
const { manifest, stagesFromEvents } =
  useWorkflowPresentation('legal-department');

let streamHandle: ReturnType<typeof useJobEventStream> | null = null;

watch(
  () => [props.jobId, props.conversationId, props.status],
  () => {
    // Tear down any existing stream when the row changes job (shouldn't
    // happen in practice — each row mounts its own ticker — but be safe).
    if (streamHandle) {
      streamHandle.cleanup();
      streamHandle = null;
    }
    if (props.status !== 'processing') return;
    streamHandle = useJobEventStream({
      jobId: props.jobId,
      conversationId: props.conversationId,
      orgSlug: props.orgSlug,
      callerUserId: props.callerUserId,
    });
  },
  { immediate: true },
);

onUnmounted(() => {
  if (streamHandle) streamHandle.cleanup();
});

const stages = computed<StageState[]>(() => {
  if (!streamHandle || !manifest.value) return [];
  return stagesFromEvents(streamHandle.events.value);
});

const activeStage = computed<StageState | null>(() => {
  // Last active stage in walker order.
  for (let i = stages.value.length - 1; i >= 0; i--) {
    if (stages.value[i]!.state === 'active') return stages.value[i]!;
  }
  // Fall back to first non-pending non-skipped stage that hasn't completed
  for (const s of stages.value) {
    if (s.state === 'active') return s;
  }
  return null;
});

const label = computed(() => {
  if (props.status === 'queued') return 'Queued';
  if (props.status === 'completed') return 'Completed';
  if (props.status === 'failed') return 'Failed';
  if (activeStage.value) return activeStage.value.label;
  // Processing but no stage matched yet — show a generic placeholder
  return 'Working…';
});

const icon = computed(() => {
  if (props.status === 'queued') return '⏳';
  if (props.status === 'completed') return '✓';
  if (props.status === 'failed') return '✗';
  return '⟳';
});
</script>

<style scoped>
.in-row-ticker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  color: var(--ion-color-primary);
  font-weight: 500;
}

.in-row-ticker--queued {
  color: var(--ion-color-medium);
}

.ticker-icon {
  display: inline-block;
}

.in-row-ticker:not(.in-row-ticker--queued) .ticker-icon {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
