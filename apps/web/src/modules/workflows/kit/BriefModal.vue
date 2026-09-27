<template>
  <ion-modal :is-open="open" class="brief-modal" @did-dismiss="emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ brief?.title ?? 'About this workflow' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="emit('close')">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p v-if="error" class="problem">{{ error }}</p>
      <p v-else-if="!brief" class="hint">Loading...</p>
      <template v-else>
        <nav class="tabs" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            role="tab"
            :aria-selected="current === tab.id"
            :class="['tab', { 'tab--current': current === tab.id }]"
            @click="select(tab.id)"
          >
            {{ tab.label }}
          </button>
        </nav>

        <article v-if="current === 'overview'" class="markdown" v-html="render(brief.markdown)" />
        <section v-else-if="current === 'examples'" class="examples">
          <p v-if="brief.showcase.length === 0" class="hint">This workflow has no worked examples yet.</p>
          <article v-for="example in brief.showcase" :key="example.caseSlug" class="example">
            <h3>{{ example.title }}</h3>
            <p class="hint">{{ example.summary }}</p>
            <ion-button size="small" @click="emit('use-example', example)">Use this example</ion-button>
          </article>
        </section>
        <template v-else>
          <p v-if="docError" class="problem">{{ docError }}</p>
          <p v-else-if="!docs[current]" class="hint">Loading...</p>
          <article v-else class="markdown" v-html="render(docs[current]!)" />
        </template>
      </template>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/vue';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { WorkflowBrief, WorkflowDocName, WorkflowShowcaseCase } from '@orchestrator-ai/transport-types';
import { workflowDocsClient } from './workflowDocsClient';

type TabId = 'overview' | 'examples' | WorkflowDocName;

const props = defineProps<{ open: boolean; slug: string; orgSlug: string }>();
const emit = defineEmits<{ close: []; 'use-example': [example: WorkflowShowcaseCase] }>();

const DOC_LABELS: Record<WorkflowDocName, string> = { 'user-guide': 'User guide', 'smoke-test': 'Smoke test' };

const brief = shallowRef<WorkflowBrief | null>(null);
const error = ref<string | null>(null);
const docs = reactive<Partial<Record<WorkflowDocName, string>>>({});
const docError = ref<string | null>(null);
const current = ref<TabId>('overview');

const tabs = computed(() => [
  { id: 'overview' as TabId, label: 'Overview' },
  ...(brief.value?.docs ?? []).filter((d) => d === 'user-guide').map((d) => ({ id: d as TabId, label: DOC_LABELS[d] })),
  { id: 'examples' as TabId, label: 'Examples' },
  ...(brief.value?.docs ?? []).filter((d) => d !== 'user-guide').map((d) => ({ id: d as TabId, label: DOC_LABELS[d] })),
]);

function render(markdown: string): string {
  return DOMPurify.sanitize(marked.parse(markdown, { async: false }));
}

async function load(): Promise<void> {
  if (brief.value?.slug === props.slug) return;
  try {
    brief.value = await workflowDocsClient.getBrief(props.slug, props.orgSlug);
    error.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function select(tab: TabId): Promise<void> {
  current.value = tab;
  if (tab === 'overview' || tab === 'examples' || docs[tab]) return;
  try {
    docs[tab] = (await workflowDocsClient.getDoc(props.slug, tab, props.orgSlug)).markdown;
    docError.value = null;
  } catch (err) {
    docError.value = err instanceof Error ? err.message : String(err);
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void load();
  },
  { immediate: true },
);
</script>

<style scoped>
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--ion-color-light-shade); margin-bottom: 12px; flex-wrap: wrap; }
.tab { background: none; border: none; padding: 8px 12px; color: var(--ion-color-medium); font: inherit; cursor: pointer; border-bottom: 2px solid transparent; }
.tab--current { color: var(--ion-text-color); border-bottom-color: var(--ion-color-primary); }
.markdown { line-height: 1.55; font-size: 14px; }
.markdown :deep(h1) { font-size: 20px; }
.markdown :deep(h2) { font-size: 16px; margin-top: 20px; }
.examples { display: flex; flex-direction: column; gap: 12px; }
.example { border: 1px solid var(--ion-color-light-shade); padding: 10px 14px; }
.example h3 { margin: 0 0 4px; font-size: 15px; }
.example p { margin: 0 0 8px; }
.hint { color: var(--ion-color-medium); }
.problem { color: var(--ion-color-danger); }
</style>
