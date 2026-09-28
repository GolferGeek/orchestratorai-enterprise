<template>
  <ion-page>
    <ion-content class="ion-padding">
      <div class="dr-page">
        <template v-if="flow.run.value">
          <WorkflowRunView
            :run="flow.run.value"
            :events="flow.events.value"
            :busy="flow.busy.value"
            :error="flow.error.value"
            :title="runTitle"
            :actor-context="flow.context.value"
            exportable
            @decide="(reviewId, decision) => flow.submitDecision(reviewId, decision)"
            @cancel="flow.cancel()"
            @restart="restartFrom"
            @open-run="(runId) => router.replace({ name: 'DecisionRisk', query: { conversationId: runId } })"
          >
            <template #result="{ result }">
              <DecisionRiskResult :result="result as unknown as DecisionRiskRunResult" />
            </template>
            <template #review-item="{ item }">
              <div class="mitigation">
                <strong>{{ item.dimension }}</strong>
                <span class="note">effort {{ item.effort }} · dimension would fall to {{ item.residualScore }}</span>
                <p>{{ item.proposal }}</p>
                <p class="note">{{ item.rationale }}</p>
              </div>
            </template>
          </WorkflowRunView>
        </template>

        <template v-else-if="loadingRun">
          <p class="hint">Opening the run...</p>
        </template>

        <section v-else class="new-run">
          <div class="new-run-header">
            <h2>Decision Risk</h2>
            <div>
              <ion-button fill="clear" size="small" @click="briefOpen = true">About this workflow</ion-button>
              <ion-button v-if="canConfigure" fill="clear" size="small" router-link="/app/workflows/decision-risk/admin">Configure</ion-button>
            </div>
          </div>
          <p class="hint">
            State what you are thinking of doing. Ten dimensions assess it independently, a red team contests the
            result, and you review the proposed mitigations before the summary is written.
          </p>
          <p v-if="blocked" class="problem">{{ blocked }}</p>
          <label class="field">
            <span>Proposition</span>
            <textarea v-model="proposition" rows="3" maxlength="4000" placeholder="e.g. Open a second office in Berlin next quarter" :disabled="!!blocked || flow.busy.value" />
          </label>
          <label class="field">
            <span>Context (optional)</span>
            <textarea v-model="background" rows="5" maxlength="20000" placeholder="What the assessors should know: size, constraints, history" :disabled="!!blocked || flow.busy.value" />
          </label>
          <p v-if="flow.error.value" class="problem">{{ flow.error.value }}</p>
          <ion-button :disabled="!!blocked || flow.busy.value || !proposition.trim()" @click="start">
            {{ flow.busy.value ? 'Starting...' : 'Assess the risk' }}
          </ion-button>
        </section>
      </div>
      <BriefModal :open="briefOpen" :slug="SLUG" :org-slug="org" @close="briefOpen = false" @use-example="useExample" />
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonButton, IonContent, IonPage } from '@ionic/vue';
import { useRbacStore } from '@/stores/rbacStore';
import { useWorkflowCatalogStore } from '@/modules/workflows/stores/workflowCatalogStore';
import type { WorkflowShowcaseCase } from '@orchestrator-ai/transport-types';
import { BriefModal, WorkflowRunView, useWorkflowRun } from '@/modules/workflows/kit';
import DecisionRiskResult, { type DecisionRiskRunResult } from './DecisionRiskResult.vue';

const SLUG = 'decision-risk';

const route = useRoute();
const router = useRouter();
const rbacStore = useRbacStore();
const catalog = useWorkflowCatalogStore();
const flow = useWorkflowRun();

const proposition = ref('');
const background = ref('');
const loadingRun = ref(false);
const briefOpen = ref(false);

const org = computed(() => rbacStore.currentOrganization ?? '*');
const canConfigure = computed(() => org.value !== '*' && rbacStore.hasPermission('admin:settings'));
const entry = computed(() => catalog.workflow(SLUG));
const runTitle = computed(() => {
  const input = flow.run.value?.input as { proposition?: string } | null | undefined;
  return input?.proposition ?? 'Decision Risk';
});

/** Why a new run cannot start here, if it cannot. */
const blocked = computed(() => {
  if (org.value === '*') return 'Select an organization to start an assessment.';
  if (!entry.value) return 'Decision Risk is not available in this organization.';
  if (!entry.value.enabled) return 'Decision Risk is disabled in this organization.';
  if (!entry.value.contextModel) return 'An administrator has to choose the models for Decision Risk first.';
  return null;
});

async function start(): Promise<void> {
  const target = entry.value;
  const userId = rbacStore.user?.id;
  if (!target?.contextModel || !userId || blocked.value) return;
  const runId = await flow.start(
    { slug: SLUG, orgSlug: org.value, userId, contextModel: target.contextModel },
    { proposition: proposition.value.trim(), background: background.value.trim() },
  );
  if (!runId) return;
  proposition.value = '';
  background.value = '';
  await router.replace({ name: 'DecisionRisk', query: { conversationId: runId } });
  await catalog.refreshRuns(SLUG);
}

/** Branch a new run from the open one after a step, then show the new run. */
async function restartFrom(workUnitRunId: string, instruction: string): Promise<void> {
  const target = entry.value;
  const userId = rbacStore.user?.id;
  const parent = flow.run.value;
  if (!target?.contextModel || !userId || !parent || blocked.value) return;
  const runId = await flow.restart(
    { slug: SLUG, orgSlug: org.value, userId, contextModel: target.contextModel },
    { runId: parent.runId, workUnitRunId },
    instruction,
  );
  if (!runId) return;
  await router.replace({ name: 'DecisionRisk', query: { conversationId: runId } });
  await catalog.refreshRuns(SLUG);
}

/** Fill the form from a worked example; the person still starts the run. */
function useExample(example: WorkflowShowcaseCase): void {
  const input = example.input as { proposition?: string; background?: string };
  proposition.value = input.proposition ?? '';
  background.value = input.background ?? '';
  briefOpen.value = false;
}

async function sync(): Promise<void> {
  const runId = route.query.conversationId;
  if (typeof runId === 'string' && runId) {
    if (flow.run.value?.runId === runId) return;
    const userId = rbacStore.user?.id;
    if (!userId) return;
    loadingRun.value = true;
    try {
      await flow.open(SLUG, runId, org.value, userId);
    } finally {
      loadingRun.value = false;
    }
  } else {
    flow.reset();
  }
}

watch(() => route.query.conversationId, () => void sync());
// A run opens as the viewer; wait for who that is.
watch(() => rbacStore.user?.id, () => void sync());
// Keep the nav's run list current as the run reaches a result.
watch(
  () => flow.run.value?.status,
  (status, previous) => {
    if (status && status !== previous && (status === 'completed' || status === 'failed')) {
      void catalog.refreshRuns(SLUG);
    }
  },
);
onMounted(sync);
</script>

<style scoped>
.dr-page { max-width: 960px; margin: 0 auto; }
.new-run { display: flex; flex-direction: column; gap: 12px; }
.new-run h2 { margin: 0; }
.new-run-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; }
.field textarea {
  padding: 8px;
  border: 1px solid var(--ion-color-medium-tint);
  background: var(--ion-background-color);
  color: var(--ion-text-color);
  font: inherit;
  font-weight: 400;
}
.hint, .note { color: var(--ion-color-medium); }
.note { font-size: 12px; }
.problem { color: var(--ion-color-danger); margin: 0; }
.mitigation { display: flex; flex-direction: column; gap: 2px; }
.mitigation p { margin: 4px 0 0; }
</style>
