<template>
  <RuntimeWorkflowPage
    slug="onboarding-plan"
    name="New Hire Onboarding"
    intro="Record a new hire and their plan starts on its own: the first week, 30/60/90 and every account and device to request, following HR policy. The manager approves the requests and each becomes a task."
    route-name="OnboardingPlan"
    :run-title="title"
    exportable
  >
    <template #form="{ start, busy, blocked, example }">
      <OnboardingForm :busy="busy" :blocked="!!blocked" :example="example" @start="start" />
    </template>
    <template #result="{ result }">
      <OnboardingResult :result="result as unknown as OnboardingRunResult" />
    </template>
    <template #review-item="{ item }">
      <div>
        <span class="kind">{{ item.kind }}</span> <strong>{{ item.item }}</strong>
        <p class="meta">{{ item.owner }} · {{ item.neededBy }}</p>
      </div>
    </template>
  </RuntimeWorkflowPage>
</template>

<script lang="ts" setup>
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { RuntimeWorkflowPage } from '@/modules/workflows/kit';
import OnboardingForm from './OnboardingForm.vue';
import OnboardingResult, { type OnboardingRunResult } from './OnboardingResult.vue';

function title(input: JsonValue): string {
  const x = input as { hire?: { fullName?: string }; hireName?: string };
  const name = x.hire?.fullName ?? x.hireName;
  return name ? `Onboarding: ${name}` : 'Onboarding plan';
}
</script>

<style scoped>
.meta { margin: 2px 0 0; font-size: 12px; color: var(--ion-color-medium); }
.kind { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--ion-color-medium); }
</style>
