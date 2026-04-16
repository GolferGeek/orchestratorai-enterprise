<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="parentLink" />
        </ion-buttons>
        <ion-title>Deal Memo</ion-title>
        <ion-buttons slot="end">
          <ion-button
            v-if="memoStatus === 'awaiting_review'"
            color="warning"
            @click="reviewOpen = true"
          >
            Review
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="memo-shell">
        <!-- Left: status + stage ladder -->
        <aside class="memo-stages">
          <div class="memo-summary">
            <h3>Memo {{ memoJobId.slice(0, 8) }}</h3>
            <div class="memo-meta">
              <span
                class="memo-status"
                :class="`status-${memoStatus ?? 'unknown'}`"
                >{{ memoStatus ?? 'loading' }}</span
              >
              <span v-if="dealStructure" class="memo-deal">{{
                structureLabel(dealStructure)
              }}</span>
            </div>
            <p v-if="lastMessage" class="memo-message">{{ lastMessage }}</p>
            <p v-if="errorMessage" class="memo-error">{{ errorMessage }}</p>
          </div>

          <StageLadder
            class="stages"
            :stages="stages"
            :thinking-states="thinkingStates"
          />
        </aside>

        <!-- Right: tab strip + per-section content -->
        <section class="memo-content">
          <ion-segment v-model="activeTab" class="memo-tabs" scrollable>
            <ion-segment-button
              v-for="tab in TABS"
              :key="tab.id"
              :value="tab.id"
            >
              <ion-label>{{ tab.label }}</ion-label>
            </ion-segment-button>
          </ion-segment>

          <div class="memo-tab-body">
            <DealMemoSectionTab
              v-if="activeTab !== 'full-memo'"
              :title="activeTabLabel"
              :draft="activeSectionDraft"
              :citations="activeSectionCitations"
              :document-index="parentDocumentIndex"
              :risk-matrix="parentRiskMatrix"
              :deal-breaker-flags="parentDealBreakerFlags"
              :pending-label="memoStatus === 'processing' ? 'In progress' : ''"
            />

            <div v-else class="full-memo">
              <div class="full-memo-actions">
                <ion-button
                  size="small"
                  fill="outline"
                  :disabled="!isCompleted || downloading === 'md'"
                  @click="onDownload('md')"
                >
                  <ion-spinner v-if="downloading === 'md'" name="dots" />
                  <span v-else>Download Markdown</span>
                </ion-button>
                <ion-button
                  size="small"
                  color="primary"
                  :disabled="!isCompleted || downloading === 'docx'"
                  @click="onDownload('docx')"
                >
                  <ion-spinner v-if="downloading === 'docx'" name="dots" />
                  <span v-else>Download DOCX</span>
                </ion-button>
                <span v-if="!isCompleted" class="full-memo-hint">
                  Downloads enable once the memo is approved + finalized.
                </span>
                <span v-if="downloadError" class="full-memo-error">{{
                  downloadError
                }}</span>
              </div>
              <!-- renderedMemo is DOMPurify-sanitized in the computed below -->
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-if="memoMarkdown" class="full-memo-body" v-html="renderedMemo"></div>
              <div v-else class="full-memo-placeholder">
                The full memo will appear here once synthesis completes.
              </div>
            </div>
          </div>
        </section>
      </div>
    </ion-content>

    <LegalJobReviewModal
      :open="reviewOpen"
      :job-id="memoJobId"
      :org-slug="orgSlug ?? ''"
      :context="reviewContext"
      @close="onReviewClosed"
      @reviewed="onReviewSubmitted"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
} from '@ionic/vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useRbacStore } from '../../../stores/rbacStore';
import StageLadder from './components/StageLadder.vue';
import DealMemoSectionTab from './components/DealMemoSectionTab.vue';
import LegalJobReviewModal from './components/LegalJobReviewModal.vue';
import { useJobEventStream } from './composables/useJobEventStream';
import { useThinkingStates } from './composables/useThinkingStates';
import {
  legalJobsService,
  type AgentJobRow,
  type CitationRef,
  type DealMemoSectionId,
  type DealStructure,
  type ExecutionContextLike,
  type JobStatus,
} from './legalJobsService';
import type { StageState } from '@orchestrator-ai/transport-types';

interface DealMemoTab {
  id: DealMemoSectionId | 'full-memo';
  label: string;
}

const SECTION_IDS: DealMemoSectionId[] = [
  'reps-warranties',
  'indemnification',
  'disclosure-schedules',
  'conditions-precedent',
  'covenants',
];

/** Tab labels (kept short for the segment strip). */
const SECTION_LABELS: Record<DealMemoSectionId, string> = {
  'reps-warranties': 'Representations & Warranties',
  indemnification: 'Indemnification',
  'disclosure-schedules': 'Disclosure Schedules',
  'conditions-precedent': 'Conditions Precedent',
  covenants: 'Covenants',
};

/**
 * Heading text the synthesizer writes into the full memo for each section.
 * Mirrors `SECTION_TITLES` in the API's
 * `workflows/deal-memo/nodes/shared/section-constants.ts` — keep in sync.
 * Used for slicing per-section prose out of the memoMarkdown for completed
 * jobs (where the per-section drafts aren't surfaced separately).
 */
const SECTION_MEMO_HEADINGS: Record<DealMemoSectionId, string> = {
  'reps-warranties': 'Representations & Warranties',
  indemnification: 'Indemnification',
  'disclosure-schedules': 'Disclosure Schedules',
  'conditions-precedent': 'Conditions Precedent to Closing',
  covenants: 'Covenants',
};

/**
 * Extract a single section's prose from the synthesized memoMarkdown for
 * completed memos (where the per-section drafts aren't surfaced separately
 * — they were stitched into the full memo during synthesis).
 *
 * The synthesizer emits headings like "## 1. Representations & Warranties"
 * in canonical SECTION_ORDER. We split the document on H2 boundaries and
 * find the section whose heading text matches the requested label.
 */
function extractSectionFromMemo(
  memoMarkdown: string,
  sectionLabel: string,
): string | null {
  const lines = memoMarkdown.split('\n');
  let captureFrom = -1;
  let captureUntil = lines.length;
  // Match `## <number>. <title>` (numbering is added by the synthesizer)
  const labelRe = new RegExp(
    `^##\\s+\\d+\\.\\s+${sectionLabel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`,
  );
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (captureFrom === -1) {
      if (labelRe.test(line)) captureFrom = i + 1;
    } else if (
      /^##\s+\d+\./.test(line) ||
      /^#\s+References\s*$/.test(line)
    ) {
      captureUntil = i;
      break;
    }
  }
  if (captureFrom === -1) return null;
  return lines.slice(captureFrom, captureUntil).join('\n').trim();
}

const TABS: DealMemoTab[] = [
  ...SECTION_IDS.map((id) => ({ id, label: SECTION_LABELS[id] })),
  { id: 'full-memo', label: 'Full Memo' },
];

interface MemoStage {
  id: string;
  label: string;
  startStep?: string;
  completeStep?: string;
  isReview?: boolean;
}

const STAGE_DEFS: MemoStage[] = [
  {
    id: 'intake',
    label: 'Hydrate parent DD state',
    startStep: 'deal_memo_intake_start',
    completeStep: 'deal_memo_intake_complete',
  },
  {
    id: 'reps-warranties',
    label: 'Draft: Representations & Warranties',
    startStep: 'deal_memo_section_reps_warranties_start',
    completeStep: 'deal_memo_section_reps_warranties_complete',
  },
  {
    id: 'indemnification',
    label: 'Draft: Indemnification',
    startStep: 'deal_memo_section_indemnification_start',
    completeStep: 'deal_memo_section_indemnification_complete',
  },
  {
    id: 'disclosure-schedules',
    label: 'Draft: Disclosure Schedules',
    startStep: 'deal_memo_section_disclosure_schedules_start',
    completeStep: 'deal_memo_section_disclosure_schedules_complete',
  },
  {
    id: 'conditions-precedent',
    label: 'Draft: Conditions Precedent',
    startStep: 'deal_memo_section_conditions_precedent_start',
    completeStep: 'deal_memo_section_conditions_precedent_complete',
  },
  {
    id: 'covenants',
    label: 'Draft: Covenants',
    startStep: 'deal_memo_section_covenants_start',
    completeStep: 'deal_memo_section_covenants_complete',
  },
  {
    id: 'synthesize',
    label: 'Stitch full memo',
    startStep: 'deal_memo_synthesis_start',
    completeStep: 'deal_memo_synthesis_complete',
  },
  {
    id: 'review',
    label: 'Attorney review',
    startStep: 'deal_memo_hitl_start',
    completeStep: 'deal_memo_hitl_complete',
    isReview: true,
  },
  {
    id: 'finalize',
    label: 'Finalize artifacts',
    startStep: 'deal_memo_finalize_start',
    completeStep: 'deal_memo_finalize_artifacts',
  },
];

const route = useRoute();
const rbac = useRbacStore();

const parentJobId = computed(() => String(route.params.parentJobId ?? ''));
const memoJobId = computed(() => String(route.params.memoJobId ?? ''));

const orgSlug = computed(() => {
  const active = rbac.currentOrganization;
  if (active && active !== '*') return active;
  return 'legal';
});

const reviewContext = computed<ExecutionContextLike | null>(() => {
  if (!orgSlug.value || orgSlug.value === '*') return null;
  return {
    orgSlug: orgSlug.value,
    userId: rbac.user?.id ?? '',
    conversationId: memoConversationId.value ?? '',
    agentSlug: 'legal-department',
    agentType: 'langgraph',
    provider: memoProvider.value ?? 'ollama',
    model: memoModel.value ?? 'gemma4:e4b',
  };
});

const parentLink = computed(() =>
  `/forge/agents/legal-department/due-diligence?jobId=${encodeURIComponent(parentJobId.value)}`,
);

const job = ref<AgentJobRow | null>(null);
const memoConversationId = computed(() => job.value?.conversation_id ?? null);
const memoProvider = computed(() => job.value?.provider ?? null);
const memoModel = computed(() => job.value?.model ?? null);
const memoStatus = computed<JobStatus | null>(() => job.value?.status ?? null);
const lastMessage = computed(() => job.value?.last_message ?? null);
const errorMessage = computed(() => job.value?.error ?? null);
const isCompleted = computed(() => memoStatus.value === 'completed');

const dealStructure = computed<DealStructure | null>(() => {
  const data = job.value?.input?.data as Record<string, unknown> | undefined;
  return (data?.dealStructure as DealStructure | undefined) ?? null;
});

const activeTab = ref<DealMemoTab['id']>('reps-warranties');

const sectionDrafts = ref<Record<DealMemoSectionId, { draft: string; citations: CitationRef[] }>>(
  {} as Record<DealMemoSectionId, { draft: string; citations: CitationRef[] }>,
);
const memoMarkdown = ref<string | null>(null);
const sectionCitations = ref<Record<DealMemoSectionId, CitationRef[]>>(
  {} as Record<DealMemoSectionId, CitationRef[]>,
);

const parentDocumentIndex = ref<Array<Record<string, unknown>>>([]);
const parentRiskMatrix = ref<{ cells?: Array<Record<string, unknown>> } | undefined>(
  undefined,
);
const parentDealBreakerFlags = ref<Array<Record<string, unknown>>>([]);

const reviewOpen = ref(false);
const downloading = ref<'md' | 'docx' | null>(null);
const downloadError = ref<string | null>(null);

type StreamHandle = ReturnType<typeof useJobEventStream>;
const streamHandle = shallowRef<StreamHandle | null>(null);
const events = computed(() => streamHandle.value?.events.value ?? []);

const stages = computed<StageState[]>(() => {
  const completedSteps = new Set<string>();
  const startedSteps = new Set<string>();
  const startedTimes: Record<string, string> = {};
  const completedTimes: Record<string, string> = {};

  for (const ev of events.value) {
    const step = ev.step ?? '';
    if (!step) continue;
    if (step.endsWith('_start')) {
      startedSteps.add(step);
      if (!startedTimes[step] && ev.created_at) startedTimes[step] = ev.created_at;
    }
    if (step.endsWith('_complete') || step.endsWith('_artifacts')) {
      completedSteps.add(step);
      if (!completedTimes[step] && ev.created_at)
        completedTimes[step] = ev.created_at;
    }
  }

  const failedTerminal = memoStatus.value === 'failed';

  return STAGE_DEFS.map<StageState>((stage, idx) => {
    const startSeen = stage.startStep
      ? startedSteps.has(stage.startStep)
      : false;
    const completeSeen = stage.completeStep
      ? completedSteps.has(stage.completeStep)
      : false;

    let state: StageState['state'] = 'pending';
    if (completeSeen) state = 'done';
    else if (startSeen) state = 'active';

    // The review stage is a special HITL gate — it's "active" while the
    // memo is awaiting review and "done" once the reviewer submits a
    // decision (which fires deal_memo_hitl_complete).
    if (stage.isReview) {
      if (memoStatus.value === 'awaiting_review') state = 'active';
      else if (completeSeen || isPostReview(idx, completedSteps)) state = 'done';
    }

    if (failedTerminal && state !== 'done') {
      // Mark the first non-done stage as failed; the rest stay pending.
      const firstNonDone = STAGE_DEFS.findIndex((_, i) => {
        const s = STAGE_DEFS[i];
        return !(s.completeStep && completedSteps.has(s.completeStep));
      });
      if (idx === firstNonDone) state = 'failed';
    }

    return {
      id: stage.id,
      label: stage.label,
      state,
      startedAt: stage.startStep ? startedTimes[stage.startStep] : undefined,
      completedAt: stage.completeStep
        ? completedTimes[stage.completeStep]
        : undefined,
      errorMessage: state === 'failed' ? errorMessage.value ?? undefined : undefined,
    };
  });
});

function isPostReview(reviewIdx: number, completedSteps: Set<string>): boolean {
  // If a later stage's complete step was seen, the review must have been done.
  for (let j = reviewIdx + 1; j < STAGE_DEFS.length; j++) {
    const cs = STAGE_DEFS[j].completeStep;
    if (cs && completedSteps.has(cs)) return true;
  }
  return false;
}

const thinkingStates = useThinkingStates(events, stages);

const activeTabLabel = computed(() => {
  const t = TABS.find((x) => x.id === activeTab.value);
  return t?.label ?? '';
});

const activeSectionDraft = computed<string | null>(() => {
  if (activeTab.value === 'full-memo') return null;
  const sectionId = activeTab.value as DealMemoSectionId;
  // Prefer the in-flight draft from the HITL checkpoint when available
  // (during awaiting_review, after a reject/modify, etc.). Otherwise fall
  // back to extracting the section from the synthesized memo for completed
  // jobs where only memoMarkdown is persisted.
  const inFlight = sectionDrafts.value[sectionId]?.draft;
  if (inFlight) return inFlight;
  if (memoMarkdown.value) {
    const extracted = extractSectionFromMemo(
      memoMarkdown.value,
      SECTION_MEMO_HEADINGS[sectionId],
    );
    if (extracted) return extracted;
  }
  return null;
});

const activeSectionCitations = computed<CitationRef[]>(() => {
  if (activeTab.value === 'full-memo') return [];
  const sectionId = activeTab.value as DealMemoSectionId;
  return (
    sectionDrafts.value[sectionId]?.citations ??
    sectionCitations.value[sectionId] ??
    []
  );
});

const renderedMemo = computed<string>(() => {
  if (!memoMarkdown.value) return '';
  const html = marked.parse(memoMarkdown.value, { async: false }) as string;
  return DOMPurify.sanitize(html);
});

function structureLabel(s: DealStructure): string {
  switch (s) {
    case 'stock-purchase':
      return 'Stock Purchase';
    case 'asset-purchase':
      return 'Asset Purchase';
    case 'merger':
      return 'Merger';
    default:
      return s;
  }
}

async function loadJob(): Promise<void> {
  if (!memoJobId.value || !orgSlug.value) return;
  try {
    job.value = await legalJobsService.getJob(memoJobId.value, orgSlug.value);
    // The HITL payload, when present, carries section drafts + citations
    // from the LangGraph checkpoint. For completed jobs we'll overlay the
    // finalized result below in loadFinalizedMemo().
    const rp = job.value.reviewPayload;
    if (rp?.sectionDrafts) {
      sectionDrafts.value = rp.sectionDrafts as Record<
        DealMemoSectionId,
        { draft: string; citations: CitationRef[] }
      >;
    }
    if (rp?.memoMarkdown) memoMarkdown.value = rp.memoMarkdown;
    if (rp?.sectionCitations) {
      sectionCitations.value = rp.sectionCitations as Record<
        DealMemoSectionId,
        CitationRef[]
      >;
    }
  } catch (err) {
    console.error('[DealMemoWorkspace] loadJob failed', err);
  }
}

async function loadFinalizedMemo(): Promise<void> {
  if (!isCompleted.value) return;
  try {
    const data = await legalJobsService.getDealMemo(
      memoJobId.value,
      orgSlug.value,
    );
    memoMarkdown.value = data.memoMarkdown;
    sectionCitations.value = data.sectionCitations as Record<
      DealMemoSectionId,
      CitationRef[]
    >;
  } catch (err) {
    console.error('[DealMemoWorkspace] loadFinalizedMemo failed', err);
  }
}

async function loadParentRoom(): Promise<void> {
  if (!parentJobId.value || !orgSlug.value) return;
  try {
    const [docs, risk] = await Promise.all([
      legalJobsService.fetchDocumentIndex(parentJobId.value, orgSlug.value),
      legalJobsService.fetchRiskMatrix(parentJobId.value, orgSlug.value),
    ]);
    parentDocumentIndex.value = docs.documentIndex;
    parentRiskMatrix.value = risk.riskMatrix as {
      cells?: Array<Record<string, unknown>>;
    };
    parentDealBreakerFlags.value = risk.dealBreakerFlags;
  } catch (err) {
    console.error('[DealMemoWorkspace] loadParentRoom failed', err);
  }
}

function startStream(): void {
  stopStream();
  if (!memoConversationId.value) return;
  streamHandle.value = useJobEventStream({
    jobId: memoJobId.value,
    conversationId: memoConversationId.value,
    orgSlug: orgSlug.value,
  });
}

function stopStream(): void {
  if (streamHandle.value) {
    streamHandle.value.cleanup();
    streamHandle.value = null;
  }
}

// React to incoming events (mirrors the SSE handler from the legacy modal):
// when stage-transition steps land, refresh the job + finalized memo so the
// UI catches up without a manual reload.
watch(events, (list) => {
  const last = list[list.length - 1];
  const step = last?.step;
  if (!step) return;
  if (step === 'deal_memo_hitl_start' || step === 'deal_memo_hitl_complete') {
    void loadJob();
  } else if (step === 'deal_memo_finalize_artifacts') {
    void loadJob().then(loadFinalizedMemo);
  }
});

async function onDownload(format: 'md' | 'docx'): Promise<void> {
  downloading.value = format;
  downloadError.value = null;
  try {
    const blob = await legalJobsService.downloadDealMemo(
      memoJobId.value,
      orgSlug.value,
      format,
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deal-memo-${memoJobId.value}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    downloadError.value = err instanceof Error ? err.message : String(err);
  } finally {
    downloading.value = null;
  }
}

function onReviewClosed(): void {
  reviewOpen.value = false;
}

async function onReviewSubmitted(): Promise<void> {
  reviewOpen.value = false;
  // Reviewer submitted — refresh job, the worker will resume the graph
  // and SSE events will continue updating the stage ladder.
  await loadJob();
}

onMounted(async () => {
  await loadJob();
  await loadParentRoom();
  if (isCompleted.value) await loadFinalizedMemo();
  startStream();
});

onUnmounted(() => {
  stopStream();
});

// If the user navigates between memo workspaces without unmounting (rare —
// router push usually forces a remount), re-bootstrap.
watch(
  () => [memoJobId.value, parentJobId.value, orgSlug.value],
  async ([newMemo, _newParent, newOrg]) => {
    if (!newMemo || !newOrg) return;
    stopStream();
    sectionDrafts.value = {} as Record<
      DealMemoSectionId,
      { draft: string; citations: CitationRef[] }
    >;
    memoMarkdown.value = null;
    sectionCitations.value = {} as Record<DealMemoSectionId, CitationRef[]>;
    await loadJob();
    await loadParentRoom();
    if (isCompleted.value) await loadFinalizedMemo();
    startStream();
  },
);

// Refresh the memo body when status flips to completed.
watch(isCompleted, (next) => {
  if (next) void loadFinalizedMemo();
});
</script>

<style scoped>
.memo-shell {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
  max-width: 1400px;
  margin: 0 auto;
}

.memo-stages {
  border-right: 1px solid var(--ion-color-step-150);
  background: var(--ion-color-step-50);
  padding: 16px;
  overflow-y: auto;
}

.memo-summary {
  margin-bottom: 16px;
}

.memo-summary h3 {
  margin: 0 0 4px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ion-text-color);
  font-family: var(--ion-font-family, monospace);
}

.memo-meta {
  display: flex;
  gap: 8px;
  font-size: 0.78em;
}

.memo-status {
  text-transform: capitalize;
  color: var(--ion-color-medium);
  font-weight: 600;
}
.memo-status.status-completed {
  color: var(--ion-color-success);
}
.memo-status.status-failed {
  color: var(--ion-color-danger);
}
.memo-status.status-awaiting_review {
  color: var(--ion-color-warning);
}
.memo-status.status-processing,
.memo-status.status-queued {
  color: var(--ion-color-primary);
}

.memo-deal {
  color: var(--ion-color-medium);
}

.memo-message {
  margin: 6px 0 0;
  font-size: 0.78em;
  color: var(--ion-color-medium);
}

.memo-error {
  margin: 6px 0 0;
  font-size: 0.78em;
  color: var(--ion-color-danger);
}

.stages {
  margin-top: 12px;
}

.memo-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.memo-tabs {
  --background: var(--ion-color-step-50);
  border-bottom: 1px solid var(--ion-color-step-150);
}

.memo-tab-body {
  flex: 1;
  overflow: hidden;
}

.full-memo {
  height: 100%;
  overflow-y: auto;
  padding: 16px 24px;
}

.full-memo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.full-memo-hint {
  font-size: 0.8em;
  color: var(--ion-color-medium);
}

.full-memo-error {
  font-size: 0.85em;
  color: var(--ion-color-danger);
}

.full-memo-body {
  font-size: 0.92rem;
  line-height: 1.65;
  color: var(--ion-text-color);
}

.full-memo-body :deep(h1) {
  font-size: 1.4rem;
  margin: 18px 0 10px;
}
.full-memo-body :deep(h2) {
  font-size: 1.15rem;
  margin: 16px 0 8px;
}
.full-memo-body :deep(h3) {
  font-size: 1rem;
  margin: 12px 0 6px;
}
.full-memo-body :deep(p) {
  margin: 8px 0;
}
.full-memo-body :deep(table) {
  border-collapse: collapse;
  margin: 10px 0;
}
.full-memo-body :deep(th),
.full-memo-body :deep(td) {
  border: 1px solid var(--ion-color-step-200);
  padding: 4px 8px;
  font-size: 0.88em;
}
.full-memo-body :deep(blockquote) {
  border-left: 3px solid var(--ion-color-step-300);
  padding: 6px 12px;
  color: var(--ion-color-medium);
  margin: 8px 0;
}

.full-memo-placeholder {
  font-size: 0.9em;
  color: var(--ion-color-medium);
  font-style: italic;
  padding: 24px 0;
}

@media (max-width: 900px) {
  .memo-shell {
    grid-template-columns: 1fr;
  }
  .memo-stages {
    border-right: none;
    border-bottom: 1px solid var(--ion-color-step-150);
  }
}
</style>
