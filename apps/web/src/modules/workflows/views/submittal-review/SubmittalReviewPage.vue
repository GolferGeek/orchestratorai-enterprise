<template>
  <RuntimeWorkflowPage
    slug="submittal-review"
    name="Submittal Review"
    intro="Check a contractor's product submittal against the project specification, requirement by requirement. Jev verifies every quoted piece of evidence; you confirm the findings; the response letter is drafted."
    route-name="SubmittalReview"
    :run-title="title"
    exportable
  >
    <template #form="{ start, upload, busy, blocked, example }">
      <SubmittalReviewForm :busy="busy" :blocked="!!blocked" :example="example" :upload="upload" @start="(input, docs) => start(input, docs)" />
    </template>
    <template #result="{ result }">
      <SubmittalReviewResult :result="result as unknown as SubmittalReviewRunResult" />
    </template>
    <template #review-item="{ item }">
      <div class="finding">
        <strong>{{ item.itemId }}</strong> <span :class="['status', `status--${item.status}`]">{{ item.status }}</span>
        <p>{{ item.requirement }}</p>
        <p v-if="item.evidence" class="evidence">
          "{{ item.evidence }}"
          <span v-if="item.evidenceVerified === false" class="unverified">- Jev did not find this in the submittal</span>
        </p>
        <p class="note">{{ item.note }}</p>
      </div>
    </template>
  </RuntimeWorkflowPage>
</template>

<script lang="ts" setup>
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { RuntimeWorkflowPage } from '@/modules/workflows/kit';
import SubmittalReviewForm from './SubmittalReviewForm.vue';
import SubmittalReviewResult, { type SubmittalReviewRunResult } from './SubmittalReviewResult.vue';

function title(input: JsonValue): string {
  return `Submittal for ${(input as { specSection?: string }).specSection ?? 'a section'}`;
}
</script>

<style scoped>
.finding p { margin: 4px 0 0; }
.status { font-size: 11px; font-weight: 600; text-transform: uppercase; margin-left: 6px; }
.status--deviation, .status--missing { color: var(--ion-color-danger); }
.status--compliant { color: var(--ion-color-success); }
.evidence { font-style: italic; }
.unverified { color: var(--ion-color-danger); font-style: normal; font-weight: 600; }
.note { color: var(--ion-color-medium); }
</style>
