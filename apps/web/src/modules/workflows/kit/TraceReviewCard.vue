<template>
  <article :class="['review', `review--${review.status}`]">
    <header class="review-header">
      <strong>Review of {{ review.target.label }}</strong>
      <span class="status">{{ review.status }}</span>
    </header>
    <p v-if="review.notes" class="hint">You asked: {{ review.notes }}</p>
    <p v-if="review.error" class="problem">{{ review.error }}</p>
    <template v-if="review.result">
      <p>{{ review.result.summary }}</p>
      <ul v-if="review.result.concerns.length" class="concerns">
        <li v-for="(concern, i) in review.result.concerns" :key="i">{{ concern }}</li>
      </ul>
      <div v-for="(rec, i) in review.result.recommendations" :key="i" class="recommendation">
        <div>
          <span :class="['priority', `priority--${rec.priority}`]">{{ rec.priority }}</span>
          <span class="kind">{{ KIND_LABELS[rec.kind] }}</span>
          {{ rec.recommendation }}
        </div>
        <p class="hint">{{ rec.rationale }}</p>
        <button v-if="!filed.includes(i)" class="link" :disabled="busy" @click="emit('improve', i)">
          Request this improvement
        </button>
        <span v-else class="hint">Requested</span>
      </div>
      <div v-if="review.result.restartWorthwhile && review.result.restartInstruction" class="restart-suggestion">
        <p class="hint">Worth re-running this step with: “{{ review.result.restartInstruction }}”</p>
        <button v-if="canRestart" class="link" :disabled="busy" @click="emit('restart', review.result.restartInstruction)">
          Re-run this step with this instruction
        </button>
      </div>
      <p class="hint">Reviewer confidence {{ Math.round(review.result.confidence * 100) }}%</p>
    </template>
  </article>
</template>

<script lang="ts" setup>
import type { ImprovementKind, TraceReviewView } from '@orchestrator-ai/transport-types';

defineProps<{ review: TraceReviewView; busy: boolean; canRestart: boolean; filed: number[] }>();
const emit = defineEmits<{ improve: [recommendationIndex: number]; restart: [instruction: string] }>();

const KIND_LABELS: Record<ImprovementKind, string> = { context: 'Prompt', model: 'Model', workflow: 'Workflow' };
</script>

<style scoped>
.review { border: 1px solid var(--ion-color-light-shade); border-left: 3px solid var(--ion-color-primary); padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
.review--failed { border-left-color: var(--ion-color-danger); }
.review p { margin: 0; }
.review-header { display: flex; justify-content: space-between; gap: 8px; }
.status, .kind { font-size: 12px; color: var(--ion-color-medium); }
.concerns { margin: 0; padding-left: 18px; }
.recommendation { padding: 6px 0; border-top: 1px dashed var(--ion-color-light-shade); }
.priority { font-size: 11px; font-weight: 600; text-transform: uppercase; margin-right: 6px; }
.priority--high { color: var(--ion-color-danger); }
.priority--medium { color: var(--ion-color-warning-shade); }
.priority--low { color: var(--ion-color-medium); }
.kind { margin-right: 6px; }
.restart-suggestion { padding-top: 4px; }
.hint { color: var(--ion-color-medium); font-size: 12px; }
.problem { color: var(--ion-color-danger); }
.link { background: none; border: none; padding: 0; color: var(--ion-color-primary); font: inherit; font-size: 12px; cursor: pointer; }
</style>
