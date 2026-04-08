<template>
  <ul class="stage-ladder">
    <li
      v-for="stage in stages"
      :key="stage.id"
      class="stage"
      :class="stageClass(stage)"
      :aria-label="ariaLabel(stage)"
    >
      <span class="stage-icon" aria-hidden="true">{{ icon(stage, thinkingStates?.[stage.id]) }}</span>
      <div class="stage-body">
        <div class="stage-label">{{ stage.label }}</div>
        <div
          v-if="thinkingStates?.[stage.id] && stage.state === 'active'"
          class="stage-thinking-badge"
          :class="`stage-thinking-badge--${thinkingStates[stage.id]}`"
        >
          {{ thinkingPhaseLabel(thinkingStates[stage.id]) }}
        </div>
        <div v-if="stage.description" class="stage-description">{{ stage.description }}</div>
        <div v-if="stage.errorMessage" class="stage-error">{{ stage.errorMessage }}</div>
      </div>
      <span v-if="duration(stage)" class="stage-duration">{{ duration(stage) }}</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { StageState } from '@orchestrator-ai/transport-types';
import type { ThinkingPhase, ThinkingStateMap } from '../composables/useThinkingStates';

defineProps<{
  stages: StageState[];
  /** Optional overlay map from stage id to reasoning/writing sub-state. */
  thinkingStates?: ThinkingStateMap;
}>();

function stageClass(stage: StageState): string {
  return `stage--${stage.state}`;
}

function icon(stage: StageState, thinkingPhase?: ThinkingPhase): string {
  if (stage.state === 'active' && thinkingPhase === 'reasoning') return '🧠';
  if (stage.state === 'active' && thinkingPhase === 'writing') return '✍️';
  switch (stage.state) {
    case 'done':
      return '✓';
    case 'active':
      return '⟳';
    case 'failed':
      return '✗';
    case 'skipped':
      return '—';
    default:
      return '○';
  }
}

function thinkingPhaseLabel(phase: ThinkingPhase | undefined): string {
  if (phase === 'reasoning') return 'reasoning…';
  if (phase === 'writing') return 'writing…';
  return '';
}

function ariaLabel(stage: StageState): string {
  return `${stage.label}, ${stage.state}`;
}

function duration(stage: StageState): string | null {
  if (!stage.startedAt) return null;
  const start = new Date(stage.startedAt).getTime();
  const end = stage.completedAt
    ? new Date(stage.completedAt).getTime()
    : null;
  if (!end) return null;
  const secs = Math.max(0, Math.round((end - start) / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  return `${m}m ${secs % 60}s`;
}
</script>

<style scoped>
.stage-ladder {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stage {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-step-100);
}

.stage-icon {
  font-size: 1.1em;
  width: 22px;
  text-align: center;
  flex-shrink: 0;
}

.stage-body {
  flex: 1;
  min-width: 0;
}

.stage-label {
  font-weight: 600;
  font-size: 0.95em;
}

.stage-description {
  font-size: 0.8em;
  color: var(--ion-color-medium);
  margin-top: 2px;
}

.stage-error {
  font-size: 0.85em;
  color: var(--ion-color-danger);
  margin-top: 4px;
}

.stage-duration {
  font-size: 0.78em;
  color: var(--ion-color-medium);
  flex-shrink: 0;
}

/* Thinking phase sub-indicator (Phase 4 reasoning capture) */
.stage-thinking-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 10px;
  margin-top: 3px;
  letter-spacing: 0.02em;
}

.stage-thinking-badge--reasoning {
  background: color-mix(in srgb, var(--ion-color-tertiary, #5260ff) 12%, transparent);
  color: var(--ion-color-tertiary, #5260ff);
  border: 1px solid color-mix(in srgb, var(--ion-color-tertiary, #5260ff) 30%, transparent);
}

.stage-thinking-badge--writing {
  background: color-mix(in srgb, var(--ion-color-success, #2dd36f) 12%, transparent);
  color: var(--ion-color-success, #2dd36f);
  border: 1px solid color-mix(in srgb, var(--ion-color-success, #2dd36f) 30%, transparent);
}

/* When a stage is reasoning, override the spinning icon style to not spin
   (the brain emoji looks wrong rotating). */
.stage--active:has(.stage-thinking-badge--reasoning) .stage-icon,
.stage--active:has(.stage-thinking-badge--writing) .stage-icon {
  animation: none;
}

/* Per-state styles */
.stage--pending {
  opacity: 0.55;
}

.stage--pending .stage-icon {
  color: var(--ion-color-medium);
}

.stage--active {
  background: var(--ion-color-primary-tint);
  border-color: var(--ion-color-primary);
}

.stage--active .stage-icon {
  color: var(--ion-color-primary);
  animation: spin 1.5s linear infinite;
  display: inline-block;
}

.stage--done .stage-icon {
  color: var(--ion-color-success);
}

.stage--done {
  background: var(--ion-color-step-50);
}

.stage--failed {
  background: var(--ion-color-danger-tint);
  border-color: var(--ion-color-danger);
}

.stage--failed .stage-icon {
  color: var(--ion-color-danger);
}

.stage--skipped {
  opacity: 0.4;
  border-style: dashed;
}

.stage--skipped .stage-icon {
  color: var(--ion-color-medium);
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
