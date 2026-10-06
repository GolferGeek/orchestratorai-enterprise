<template>
  <ion-page>
    <ion-content class="ion-padding">
      <div class="wf-page">
        <template v-if="flow.run.value">
          <WorkflowRunView
            :run="flow.run.value"
            :events="flow.events.value"
            :busy="flow.busy.value"
            :error="flow.error.value"
            :title="runTitle(flow.run.value.input)"
            :actor-context="flow.context.value"
            :exportable="exportable"
            @decide="(reviewId, decision) => flow.submitDecision(reviewId, decision)"
            @tick="(reviewId, itemId, done) => flow.tickChecklist(reviewId, itemId, done)"
            @cancel="flow.cancel()"
            @restart="restartFrom"
            @open-run="(runId) => router.replace({ name: routeName, query: { conversationId: runId } })"
          >
            <template #result="{ result }"><slot name="result" :result="result" /></template>
            <template v-if="$slots.live" #live="{ live, run }"><slot name="live" :live="live" :run="run" /></template>
            <template #review-item="{ item }"><slot name="review-item" :item="item" /></template>
          </WorkflowRunView>
        </template>

        <p v-else-if="loadingRun" class="hint">Opening the run...</p>

        <section v-else class="new-run">
          <div class="new-run-header">
            <h2>{{ name }}</h2>
            <div>
              <ion-button fill="clear" size="small" @click="briefOpen = true">About this workflow</ion-button>
              <ion-button v-if="canConfigure" fill="clear" size="small" :router-link="`/app/workflows/${slug}/admin`">Configure</ion-button>
            </div>
          </div>
          <p class="hint">{{ intro }}</p>
          <p v-if="blocked" class="problem">{{ blocked }}</p>
          <slot name="form" :start="start" :upload="upload" :busy="flow.busy.value" :blocked="blocked" :example="example" />
          <p v-if="flow.error.value" class="problem">{{ flow.error.value }}</p>
        </section>
      </div>
      <BriefModal :open="briefOpen" :slug="slug" :org-slug="org" @close="briefOpen = false" @use-example="useExample" />
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonButton, IonContent, IonPage } from '@ionic/vue';
import type { JsonValue, WorkflowDocumentRef, WorkflowShowcaseCase } from '@orchestrator-ai/transport-types';
import { useRbacStore } from '@/stores/rbacStore';
import { useWorkflowCatalogStore } from '@/modules/workflows/stores/workflowCatalogStore';
import BriefModal from './BriefModal.vue';
import WorkflowRunView from './WorkflowRunView.vue';
import { useWorkflowRun } from './useWorkflowRun';

/**
 * The page of a workflow on the runtime: a new-run form (the `form` slot),
 * then the run with the kit's tabs, its result (the `result` slot) and review
 * items (`review-item`). It keeps the run in the URL (?conversationId=),
 * opens runs as the viewer, restarts and follows lineage, and offers the
 * brief and its examples. A worked example reaches the form as `example`.
 * A workflow whose run publishes a live snapshot shows it with the `live`
 * slot until the result arrives.
 */
const props = defineProps<{
  slug: string;
  name: string;
  intro: string;
  routeName: string;
  /** The run's title from its input. */
  runTitle: (input: JsonValue) => string;
  exportable?: boolean;
}>();

const route = useRoute();
const router = useRouter();
const rbacStore = useRbacStore();
const catalog = useWorkflowCatalogStore();
const flow = useWorkflowRun();

const loadingRun = ref(false);
const briefOpen = ref(false);
/** The last example picked in the brief; the form copies it into its fields. */
const example = shallowRef<JsonValue | null>(null);

const org = computed(() => rbacStore.currentOrganization ?? '*');
const canConfigure = computed(() => org.value !== '*' && rbacStore.hasPermission('admin:settings'));
const entry = computed(() => catalog.workflow(props.slug));

/** Why a new run cannot start here, if it cannot. */
const blocked = computed(() => {
  if (org.value === '*') return `Select an organization to start ${props.name}.`;
  if (!entry.value) return `${props.name} is not available in this organization.`;
  if (!entry.value.enabled) return `${props.name} is disabled in this organization.`;
  if (!entry.value.contextModel) return `An administrator has to choose the models for ${props.name} first.`;
  return null;
});

function target() {
  const workflow = entry.value;
  const userId = rbacStore.user?.id;
  if (!workflow?.contextModel || !userId || blocked.value) return null;
  return { slug: props.slug, orgSlug: org.value, userId, contextModel: workflow.contextModel };
}

async function start(input: JsonValue, documents: WorkflowDocumentRef[] = []): Promise<boolean> {
  const t = target();
  if (!t) return false;
  const runId = await flow.start(t, input, documents);
  if (!runId) return false;
  await router.replace({ name: props.routeName, query: { conversationId: runId } });
  await catalog.refreshRuns(props.slug);
  return true;
}

/** Upload a document into the next run's conversation; the form passes the ref to `start`. */
async function upload(file: File): Promise<WorkflowDocumentRef | null> {
  const t = target();
  if (!t) return null;
  return (await flow.upload(t, file)) ?? null;
}

async function restartFrom(workUnitRunId: string, instruction: string): Promise<void> {
  const t = target();
  const parent = flow.run.value;
  if (!t || !parent) return;
  const runId = await flow.restart(t, { runId: parent.runId, workUnitRunId }, instruction);
  if (!runId) return;
  await router.replace({ name: props.routeName, query: { conversationId: runId } });
  await catalog.refreshRuns(props.slug);
}

function useExample(chosen: WorkflowShowcaseCase): void {
  example.value = chosen.input;
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
      await flow.open(props.slug, runId, org.value, userId);
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
    if (status && status !== previous && ['completed', 'failed', 'awaiting_review'].includes(status)) {
      void catalog.refreshRuns(props.slug);
    }
  },
);
onMounted(sync);
</script>

<style scoped>
.wf-page { max-width: 1000px; margin: 0 auto; }
.new-run { display: flex; flex-direction: column; gap: 12px; }
.new-run h2 { margin: 0; }
.new-run-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.hint { color: var(--ion-color-medium); }
.problem { color: var(--ion-color-danger); margin: 0; }
</style>
