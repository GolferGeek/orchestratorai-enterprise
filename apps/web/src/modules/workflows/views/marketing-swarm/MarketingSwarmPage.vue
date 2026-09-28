<template>
  <RuntimeWorkflowPage
    slug="marketing-swarm"
    name="Marketing Swarm"
    intro="Several writers draft your brief in their own voices and models. Every draft is scored on the same facets, editors send drafts back with coaching until they pass, evaluators rank the finalists, and you pick the winner."
    route-name="MarketingSwarm"
    :run-title="title"
    exportable
  >
    <template #form="{ start, busy, blocked, example }">
      <SwarmForm :busy="busy" :blocked="!!blocked" :example="example" @start="start" />
    </template>
    <template #live="{ live }">
      <SwarmBoard :board="live as unknown as SwarmBoardData" />
    </template>
    <template #result="{ result }">
      <SwarmResult :result="result as unknown as SwarmRunResult" />
    </template>
    <template #review-item="{ item }">
      <div class="finalist">
        <strong>{{ item.place }}. {{ item.writer }}</strong> <span class="meta">{{ item.model }} · mean place {{ item.averagePlace }}</span>
        <p class="meta">
          <span v-for="(v, slug) in item.byEvaluator as Record<string, { place: number; score: number }>" :key="slug">{{ slug.replace('evaluator-', '') }} #{{ v.place }} ({{ Math.round(v.score * 100) }}) </span>
        </p>
        <p class="text">{{ item.text }}</p>
      </div>
    </template>
  </RuntimeWorkflowPage>
</template>

<script lang="ts" setup>
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { RuntimeWorkflowPage } from '@/modules/workflows/kit';
import SwarmBoard from './SwarmBoard.vue';
import SwarmForm from './SwarmForm.vue';
import SwarmResult from './SwarmResult.vue';
import type { SwarmBoard as SwarmBoardData, SwarmRunResult } from './swarmApi';

function title(input: JsonValue): string {
  return (input as { brief?: { topic?: string } }).brief?.topic ?? 'Marketing swarm';
}
</script>

<style scoped>
.meta { margin: 2px 0 0; font-size: 12px; color: var(--ion-color-medium); }
.text { white-space: pre-wrap; margin: 6px 0 0; font-size: 13px; line-height: 1.5; }
</style>
