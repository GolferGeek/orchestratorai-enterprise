<template>
  <div class="research-review">
    <!-- ── Review mode: read-only summary + decision buttons ── -->
    <template v-if="reviewMode === 'review'">
      <section class="section" v-if="researchMemo">
        <h3>Legal Memo</h3>
        <ReportMarkdown :markdown="researchMemo" />
      </section>

      <section class="section" v-if="researchTree.length > 0">
        <h3>Research Tree</h3>
        <ResearchTree :research-tree="researchTree" />
      </section>

      <section class="section" v-if="unverifiedCitations.length > 0">
        <h3>
          Unverified Citations
          <ion-badge color="warning" style="margin-left: 6px">{{
            unverifiedCitations.length
          }}</ion-badge>
        </h3>
        <ul class="unverified-list">
          <li
            v-for="(c, i) in unverifiedCitations"
            :key="i"
            class="unverified-item"
          >
            <span class="unverified-source">{{ c.source }}</span>
            <span
              >{{ c.text.slice(0, 140)
              }}{{ c.text.length > 140 ? '…' : '' }}</span
            >
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>Decision</h3>
        <div v-if="submitError" class="state error">{{ submitError }}</div>
        <div class="research-decision-buttons">
          <ion-button
            color="success"
            :disabled="submitting || !context"
            @click="submitResearchApproval"
          >
            {{ submitting ? 'Submitting…' : 'Approve Research' }}
          </ion-button>
          <ion-button
            color="primary"
            fill="outline"
            :disabled="submitting"
            @click="reviewMode = 'deepen'"
          >
            Deepen
          </ion-button>
          <ion-button
            color="warning"
            fill="outline"
            :disabled="submitting"
            @click="reviewMode = 'redirect'"
          >
            Redirect
          </ion-button>
        </div>
      </section>
    </template>

    <!-- ── Deepen mode: select nodes + optional guidance ── -->
    <template v-else-if="reviewMode === 'deepen'">
      <section class="section">
        <div class="hitl-mode-header">
          <h3>Deepen Research</h3>
          <ion-button size="small" fill="clear" @click="cancelHitlMode"
            >Back</ion-button
          >
        </div>
        <p class="hitl-mode-hint">
          Select one or more research nodes to dig deeper into. Optionally add
          guidance to focus the follow-up research.
        </p>
      </section>

      <section class="section" v-if="researchTree.length > 0">
        <h3>Select Nodes to Deepen</h3>
        <ResearchTree
          :research-tree="researchTree"
          :selectable="true"
          :multi-select="true"
          :checked-ids="selectedNodeIds"
          @node-selected="onNodeSelected"
        />
      </section>

      <section class="section">
        <label class="hitl-label">
          Guidance (optional)
          <textarea
            v-model="deepenGuidance"
            rows="3"
            class="hitl-textarea"
            placeholder="Focus on contract clauses related to liability…"
          />
        </label>
      </section>

      <section class="section">
        <div v-if="submitError" class="state error">{{ submitError }}</div>
        <div class="research-decision-buttons">
          <ion-button
            color="primary"
            :disabled="submitting || !context || selectedNodeIds.length === 0"
            @click="submitDeepen"
          >
            {{ submitting ? 'Submitting…' : 'Submit Deepen' }}
          </ion-button>
          <ion-button
            fill="outline"
            color="medium"
            :disabled="submitting"
            @click="cancelHitlMode"
          >
            Cancel
          </ion-button>
        </div>
        <p
          v-if="selectedNodeIds.length === 0"
          class="hitl-validation-hint"
        >
          Select at least one node to deepen.
        </p>
      </section>
    </template>

    <!-- ── Redirect mode: select one node + replacement questions ── -->
    <template v-else-if="reviewMode === 'redirect'">
      <section class="section">
        <div class="hitl-mode-header">
          <h3>Redirect Research</h3>
          <ion-button size="small" fill="clear" @click="cancelHitlMode"
            >Back</ion-button
          >
        </div>
        <p class="hitl-mode-hint">
          Select a single research node to redirect. Enter replacement
          questions (one per line) that will replace the node's current
          question.
        </p>
      </section>

      <section class="section" v-if="researchTree.length > 0">
        <h3>Select Node to Redirect</h3>
        <ResearchTree
          :research-tree="researchTree"
          :selectable="true"
          :multi-select="false"
          :checked-ids="selectedNodeIds"
          @node-selected="onNodeSelected"
        />
      </section>

      <section class="section">
        <label class="hitl-label">
          Replacement Questions (one per line)
          <textarea
            v-model="replacementQuestions"
            rows="4"
            class="hitl-textarea"
            placeholder="What are the indemnification obligations under clause 12?&#10;Does the limitation of liability apply to IP infringement?"
          />
        </label>
      </section>

      <section class="section">
        <div v-if="submitError" class="state error">{{ submitError }}</div>
        <div class="research-decision-buttons">
          <ion-button
            color="warning"
            :disabled="
              submitting ||
              !context ||
              selectedNodeIds.length === 0 ||
              !replacementQuestions.trim()
            "
            @click="submitRedirect"
          >
            {{ submitting ? 'Submitting…' : 'Submit Redirect' }}
          </ion-button>
          <ion-button
            fill="outline"
            color="medium"
            :disabled="submitting"
            @click="cancelHitlMode"
          >
            Cancel
          </ion-button>
        </div>
        <p
          v-if="selectedNodeIds.length === 0 || !replacementQuestions.trim()"
          class="hitl-validation-hint"
        >
          <span v-if="selectedNodeIds.length === 0">Select a node.</span>
          <span v-if="!replacementQuestions.trim()">
            Enter at least one replacement question.</span
          >
        </p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonButton, IonBadge } from '@ionic/vue';
import {
  legalJobsService,
  type AgentJobRow,
  type ExecutionContextLike,
  type ReviewDecisionPayload,
} from '../legalJobsService';
import ReportMarkdown from './ReportMarkdown.vue';
import ResearchTree from './ResearchTree.vue';
import type { LegalResearchResult, ResearchTreeNode } from './research-types';

const props = defineProps<{
  job: AgentJobRow;
  jobId: string;
  context: ExecutionContextLike | null;
}>();

const emit = defineEmits<{
  (e: 'reviewed', payload: { jobId: string }): void;
}>();

const submitError = ref<string | null>(null);
const submitting = ref(false);

const researchResult = computed<LegalResearchResult | null>(() => {
  // At HITL (awaiting_review), the data lives in reviewPayload (from the
  // checkpointer). After completion, it lives in result.
  const rp = props.job.reviewPayload as Record<string, unknown> | undefined;
  if (rp && (rp.memo || rp.researchTree)) {
    return rp as unknown as LegalResearchResult;
  }
  return (props.job.result as LegalResearchResult | null) ?? null;
});

const researchTree = computed<ResearchTreeNode[]>(
  () => researchResult.value?.researchTree ?? [],
);

const researchMemo = computed<string | null>(
  () => researchResult.value?.memo ?? researchResult.value?.report ?? null,
);

const unverifiedCitations = computed(() => {
  const tree = researchTree.value;
  const citations: Array<{ text: string; source: string }> = [];
  for (const node of tree) {
    for (const c of node.citations ?? []) {
      if (!c.verified) {
        citations.push({ text: c.text, source: c.source });
      }
    }
  }
  return citations;
});

// ── Research HITL mode state (Deepen / Redirect) ─────────────────────────
const reviewMode = ref<'review' | 'deepen' | 'redirect'>('review');
const selectedNodeIds = ref<string[]>([]);
const deepenGuidance = ref('');
const replacementQuestions = ref('');

function cancelHitlMode(): void {
  reviewMode.value = 'review';
  selectedNodeIds.value = [];
  deepenGuidance.value = '';
  replacementQuestions.value = '';
  submitError.value = null;
}

function onNodeSelected(nodeId: string): void {
  if (reviewMode.value === 'deepen') {
    const idx = selectedNodeIds.value.indexOf(nodeId);
    if (idx === -1) {
      selectedNodeIds.value = [...selectedNodeIds.value, nodeId];
    } else {
      selectedNodeIds.value = selectedNodeIds.value.filter(
        (id) => id !== nodeId,
      );
    }
  } else if (reviewMode.value === 'redirect') {
    selectedNodeIds.value = selectedNodeIds.value[0] === nodeId ? [] : [nodeId];
  }
}

async function submitResearchApproval(): Promise<void> {
  if (!props.context || !props.jobId) return;
  submitError.value = null;
  submitting.value = true;
  try {
    await legalJobsService.review(props.jobId, props.context, {
      decision: 'approve',
    });
    emit('reviewed', { jobId: props.jobId });
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}

async function submitDeepen(): Promise<void> {
  if (!props.context || !props.jobId) return;
  if (selectedNodeIds.value.length === 0) return;
  submitError.value = null;
  submitting.value = true;
  try {
    const payload: ReviewDecisionPayload = {
      decision: 'deepen',
      targetNodeIds: [...selectedNodeIds.value],
      guidance: deepenGuidance.value.trim() || undefined,
    };
    await legalJobsService.review(props.jobId, props.context, payload);
    emit('reviewed', { jobId: props.jobId });
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}

async function submitRedirect(): Promise<void> {
  if (!props.context || !props.jobId) return;
  if (selectedNodeIds.value.length === 0) return;
  if (!replacementQuestions.value.trim()) return;
  submitError.value = null;
  submitting.value = true;
  try {
    const questions = replacementQuestions.value
      .split('\n')
      .map((q) => q.trim())
      .filter((q) => q.length > 0);
    const payload: ReviewDecisionPayload = {
      decision: 'redirect',
      targetNodeId: selectedNodeIds.value[0],
      replacementQuestions: questions,
    };
    await legalJobsService.review(props.jobId, props.context, payload);
    emit('reviewed', { jobId: props.jobId });
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.research-review {
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section {
  padding: 16px 0;
  border-bottom: 1px solid var(--ion-color-step-200);
  color: var(--ion-text-color);
}
.section h3 {
  margin: 0 0 8px 0;
  color: var(--ion-text-color);
}

.state.error {
  color: var(--ion-color-danger);
}

.unverified-list {
  list-style: none;
  margin: 8px 0 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.unverified-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: var(--ion-color-warning-tint);
  border-radius: 6px;
  font-size: 0.85em;
  color: #1a1a1a;
}

.unverified-source {
  font-weight: 600;
  color: #6b4c00;
  font-size: 0.82em;
}

.research-decision-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.hitl-mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hitl-mode-header h3 {
  margin: 0;
}

.hitl-mode-hint {
  margin: 8px 0 0 0;
  font-size: 13px;
  color: var(--ion-color-medium);
  line-height: 1.5;
}

.hitl-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--ion-text-color);
  font-weight: 600;
}

.hitl-textarea {
  width: 100%;
  font-family: var(--ion-font-family, inherit);
  font-size: 13px;
  padding: 8px;
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
  border: 1px solid var(--ion-color-step-300);
  border-radius: 4px;
  resize: vertical;
}

.hitl-textarea:focus {
  outline: none;
  border-color: var(--ion-color-primary);
}

.hitl-validation-hint {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: var(--ion-color-warning);
}
</style>
