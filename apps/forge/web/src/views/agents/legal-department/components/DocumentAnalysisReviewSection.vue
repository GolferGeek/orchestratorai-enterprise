<template>
  <div>
    <!-- Tab strip — only shown when the job has a redline output -->
    <div v-if="reviewPayload?.redlineOutput" class="review-tabs">
      <ion-segment v-model="activeTab">
        <ion-segment-button value="risk">Risk Assessment</ion-segment-button>
        <ion-segment-button value="redline">Redlined Contract</ion-segment-button>
      </ion-segment>
    </div>

    <!-- Redline tab -->
    <div
      v-if="activeTab === 'redline' && reviewPayload?.redlineOutput"
      class="redline-tab"
    >
      <div class="redline-summary">
        <span class="redline-summary-item">
          Total clauses:
          <strong>{{ reviewPayload.redlineOutput.totalClauses }}</strong>
        </span>
        <span class="redline-summary-item">
          Flagged:
          <strong>{{ reviewPayload.redlineOutput.flaggedClauses }}</strong>
        </span>
        <span class="redline-summary-item">
          Overall risk:
          <ion-badge :color="redlineOverallRiskColor">
            {{ reviewPayload.redlineOutput.overallRisk }}
          </ion-badge>
        </span>
      </div>

      <RedlineViewer
        :clauses="reviewPayload.redlineOutput.clauses"
        v-model:clause-decisions="clauseDecisions"
        :readonly="false"
      />

      <div class="redline-actions">
        <ion-button color="success" fill="outline" @click="approveAll">
          Approve All
        </ion-button>
      </div>

      <div v-if="submitError" class="state error">{{ submitError }}</div>

      <ion-button
        expand="block"
        color="primary"
        :disabled="submitting"
        @click="submit"
      >
        {{ submitting ? 'Submitting…' : 'Submit clause decisions' }}
      </ion-button>
    </div>

    <!-- Risk assessment tab (existing content, shown when no redline or active tab is 'risk') -->
    <template v-if="!reviewPayload?.redlineOutput || activeTab === 'risk'">
      <section class="section">
        <h3>Documents</h3>
        <!-- Multi-document tab strip: one tab per analyzed document -->
        <div
          v-if="(reviewPayload?.documentsSummary ?? []).length > 1"
          class="doc-tabs"
        >
          <button
            v-for="(doc, i) in reviewPayload?.documentsSummary ?? []"
            :key="doc.name"
            class="doc-tab"
            :class="{ active: activeDocIndex === i }"
            @click="activeDocIndex = i"
          >
            {{ doc.name }}
            <span v-if="doc.type" class="doc-tab-type">({{ doc.type }})</span>
          </button>
        </div>
        <!-- Detail card for selected (or only) document -->
        <div
          v-if="(reviewPayload?.documentsSummary ?? []).length > 0"
          class="doc-detail"
        >
          <template
            v-for="(doc, i) in reviewPayload?.documentsSummary ?? []"
            :key="doc.name"
          >
            <div v-if="activeDocIndex === i" class="doc-detail-card">
              <span class="doc-name">{{ doc.name }}</span>
              <span v-if="doc.type" class="muted">&nbsp;({{ doc.type }})</span>
              <span class="muted"
                >&nbsp;— {{ doc.length.toLocaleString() }} chars</span
              >
            </div>
          </template>
        </div>
        <!-- Fallback: only one document, show as plain list -->
        <ul v-if="(reviewPayload?.documentsSummary ?? []).length <= 1">
          <li
            v-for="doc in reviewPayload?.documentsSummary ?? []"
            :key="doc.name"
          >
            {{ doc.name }}
            <span v-if="doc.type" class="muted">({{ doc.type }})</span>
            — {{ doc.length }} chars
          </li>
        </ul>
      </section>

      <section v-if="synthesis" class="section">
        <h3>Synthesis</h3>
        <p v-if="synthesis.executiveSummary" class="prose">
          {{ synthesis.executiveSummary }}
        </p>

        <div
          v-if="synthesis.overallRisk"
          class="risk-row"
          :class="`risk-${(synthesis.overallRisk.level || 'unknown').toLowerCase()}`"
        >
          <span class="risk-label">Overall risk:</span>
          <strong>{{ synthesis.overallRisk.level || 'unknown' }}</strong>
          <span v-if="synthesis.overallRisk.description" class="risk-desc">
            — {{ synthesis.overallRisk.description }}
          </span>
        </div>

        <div
          v-if="synthesis.keyFindings && synthesis.keyFindings.length"
          class="subsection"
        >
          <h4>Key findings</h4>
          <ul class="findings">
            <li
              v-for="(f, i) in synthesis.keyFindings"
              :key="i"
              :class="`severity-${(f.severity || 'medium').toLowerCase()}`"
            >
              <span v-if="f.specialist" class="finding-source"
                >{{ f.specialist }}:</span
              >
              {{ f.finding || f.description || '(no description)' }}
              <span v-if="f.severity" class="severity-tag">
                {{ f.severity }}
              </span>
            </li>
          </ul>
        </div>

        <div
          v-if="synthesis.recommendations && synthesis.recommendations.length"
          class="subsection"
        >
          <h4>Recommendations</h4>
          <ul>
            <li v-for="(r, i) in synthesis.recommendations" :key="i">
              {{ formatRecommendation(r) }}
            </li>
          </ul>
        </div>

        <div v-if="typeof synthesis.confidence === 'number'" class="meta">
          Confidence: {{ Math.round(synthesis.confidence * 100) }}%
        </div>
      </section>

      <section class="section">
        <h3>Specialist Outputs</h3>
        <p v-if="!specialistEntries.length" class="muted">
          No specialist outputs returned.
        </p>

        <!-- Read mode: pretty rendering. Switch to JSON edit mode by
             selecting the "Modify" decision tab below. -->
        <template v-if="decision !== 'modify'">
          <details
            v-for="[key, specOutput] in specialistEntries"
            :key="`read-${key}`"
            class="specialist-read"
            open
          >
            <summary>
              <strong>{{ specialistLabel(key) }}</strong>
              <span
                v-if="specialistRiskLevel(specOutput)"
                class="severity-tag"
                :class="`severity-${specialistRiskLevel(specOutput)?.toLowerCase()}`"
              >
                {{ specialistRiskLevel(specOutput) }}
              </span>
            </summary>
            <SpecialistView :output="specOutput" />

            <!-- Reasoning accordion — shown only when this specialist has
                 captured thinking content. Hidden entirely when
                 reasoningSpecialistKeys does not include this key. -->
            <details
              v-if="reasoningSpecialistKeys.includes(key)"
              class="reasoning-accordion"
              @toggle="
                (e) =>
                  (e.target as HTMLDetailsElement).open &&
                  onReasoningExpand(key)
              "
            >
              <summary class="reasoning-accordion-summary">
                <span class="reasoning-icon" aria-hidden="true">🧠</span>
                Reasoning
              </summary>
              <div class="reasoning-body">
                <div v-if="reasoningLoading[key]" class="reasoning-loading">
                  Loading reasoning…
                </div>
                <pre
                  v-else-if="reasoningContentCache[key] !== undefined"
                  class="reasoning-pre"
                  >{{ reasoningContentCache[key] }}</pre
                >
              </div>
            </details>
          </details>
        </template>

        <!-- Modify mode: editable JSON textareas, one per specialist.
             Reviewer's edits are validated as JSON on submit. -->
        <template v-else>
          <p class="muted modify-hint">
            Modify mode: edit each specialist's JSON output below. Submitting
            will overwrite the values used by the report generator.
          </p>
          <div
            v-for="[key, specOutput] in specialistEntries"
            :key="`edit-${key}`"
            class="specialist"
          >
            <label>
              <strong>{{ specialistLabel(key) }}</strong>
              <textarea
                :value="editedJson[key] ?? formatJson(specOutput)"
                rows="10"
                @input="onSpecialistEdit(key, $event)"
              />
            </label>
          </div>
        </template>
      </section>

      <section class="section">
        <h3>Decision</h3>
        <div class="decision-tabs">
          <ion-button
            :color="decision === 'approve' ? 'success' : 'medium'"
            :fill="decision === 'approve' ? 'solid' : 'outline'"
            @click="decision = 'approve'"
          >
            Approve
          </ion-button>
          <ion-button
            :color="decision === 'reject' ? 'danger' : 'medium'"
            :fill="decision === 'reject' ? 'solid' : 'outline'"
            @click="decision = 'reject'"
          >
            Reject
          </ion-button>
          <ion-button
            :color="decision === 'modify' ? 'warning' : 'medium'"
            :fill="decision === 'modify' ? 'solid' : 'outline'"
            @click="decision = 'modify'"
          >
            Modify
          </ion-button>
        </div>

        <div
          v-if="decision === 'reject' || decision === 'modify'"
          class="feedback"
        >
          <label>
            Feedback
            <textarea
              v-model="feedback"
              rows="3"
              placeholder="Tell the specialists what to address on re-run…"
            />
          </label>
        </div>

        <div v-if="submitError" class="state error">{{ submitError }}</div>

        <ion-button
          expand="block"
          color="primary"
          :disabled="!canSubmit || submitting"
          @click="submit"
        >
          {{ submitting ? 'Submitting…' : 'Submit decision' }}
        </ion-button>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  IonButton,
  IonBadge,
  IonSegment,
  IonSegmentButton,
} from '@ionic/vue';
import {
  legalJobsService,
  type AgentJobRow,
  type ClauseDecision,
  type ExecutionContextLike,
  type ReviewDecisionPayload,
} from '../legalJobsService';
import RedlineViewer from './RedlineViewer.vue';
import {
  SpecialistView,
  formatJson,
  formatRecommendation,
  specialistLabel,
  specialistRiskLevel,
} from './legal-review.utils';

const props = defineProps<{
  job: AgentJobRow;
  jobId: string;
  orgSlug: string;
  context: ExecutionContextLike | null;
}>();

const emit = defineEmits<{
  (e: 'reviewed', payload: { jobId: string }): void;
}>();

const reviewPayload = computed(() => props.job.reviewPayload);

const submitError = ref<string | null>(null);
const submitting = ref(false);

/** Index of the currently selected document tab (multi-doc jobs). */
const activeDocIndex = ref(0);

/** Active tab in the review modal — 'risk' or 'redline'. */
const activeTab = ref<'risk' | 'redline'>('risk');

/** Per-clause decisions collected from the RedlineViewer. */
const clauseDecisions = ref<Record<string, ClauseDecision>>({});

const decision = ref<'approve' | 'reject' | 'modify'>('approve');
const feedback = ref('');
const editedJson = ref<Record<string, string>>({});

// Reasoning accordion state
/** Specialist keys that have captured thinking content for this job. */
const reasoningSpecialistKeys = ref<string[]>([]);
/** Per-specialist thinking content cache — keyed by specialist key. */
const reasoningContentCache = ref<Record<string, string>>({});
/** Per-specialist loading state while fetching reasoning content. */
const reasoningLoading = ref<Record<string, boolean>>({});

// Typed synthesis accessor — the API returns whatever the graph put on
// state.orchestration.synthesis, so we narrow the loose `unknown` to the
// SynthesisOutput shape the legal-department graph emits. Optional chains
// in the template tolerate any drift in shape between graph runs.
const synthesis = computed(() => {
  const s = reviewPayload.value?.synthesis as
    | {
        executiveSummary?: string;
        overallRisk?: { level?: string; description?: string };
        keyFindings?: Array<{
          specialist?: string;
          finding?: string;
          description?: string;
          severity?: string;
        }>;
        recommendations?: Array<unknown>;
        confidence?: number;
      }
    | undefined;
  return s;
});

const specialistEntries = computed<Array<[string, unknown]>>(() => {
  const outputs = reviewPayload.value?.specialistOutputs ?? {};
  return Object.entries(outputs);
});

const canSubmit = computed(() => {
  if (!props.context || !props.jobId) return false;
  if (decision.value === 'reject' && !feedback.value.trim()) return false;
  return true;
});

const redlineOverallRiskColor = computed(() => {
  const risk = reviewPayload.value?.redlineOutput?.overallRisk;
  switch (risk) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'tertiary';
    case 'low':
      return 'primary';
    case 'acceptable':
      return 'success';
    default:
      return 'medium';
  }
});

/**
 * Set all clause decisions to 'accept' and immediately submit.
 * Called from the "Approve All" button in the redline tab.
 */
async function approveAll(): Promise<void> {
  if (!reviewPayload.value?.redlineOutput) return;
  const all: Record<string, ClauseDecision> = {};
  for (const clause of reviewPayload.value.redlineOutput.clauses) {
    all[clause.clauseId] = { clauseId: clause.clauseId, decision: 'accept' };
  }
  clauseDecisions.value = all;
  await submit();
}

function onSpecialistEdit(key: string, event: Event): void {
  const target = event.target as HTMLTextAreaElement;
  editedJson.value[key] = target.value;
}

/**
 * Probe which specialists have captured reasoning content for this job.
 * Failures are non-fatal — the accordions just won't show.
 */
onMounted(async () => {
  try {
    reasoningSpecialistKeys.value = await legalJobsService.getReasoningForJob(
      props.jobId,
      props.orgSlug,
    );
  } catch {
    reasoningSpecialistKeys.value = [];
  }
});

/**
 * Called when a reasoning accordion is toggled open. Fetches the thinking
 * content on demand the first time; subsequent expansions use the cache.
 */
async function onReasoningExpand(specialistKey: string): Promise<void> {
  if (!props.jobId) return;
  if (reasoningContentCache.value[specialistKey] !== undefined) return;
  if (reasoningLoading.value[specialistKey]) return;

  reasoningLoading.value = {
    ...reasoningLoading.value,
    [specialistKey]: true,
  };
  try {
    const result = await legalJobsService.getReasoningForSpecialist(
      props.jobId,
      props.orgSlug,
      specialistKey,
    );
    reasoningContentCache.value = {
      ...reasoningContentCache.value,
      [specialistKey]: result.thinkingContent,
    };
  } catch (e) {
    reasoningContentCache.value = {
      ...reasoningContentCache.value,
      [specialistKey]: `(Failed to load reasoning: ${e instanceof Error ? e.message : String(e)})`,
    };
  } finally {
    const updated = { ...reasoningLoading.value };
    delete updated[specialistKey];
    reasoningLoading.value = updated;
  }
}

async function submit(): Promise<void> {
  if (!props.context || !props.jobId) return;
  submitError.value = null;
  submitting.value = true;

  // When clause decisions have been recorded (redline tab), use the
  // clause-decisions endpoint instead of the classic decision endpoint.
  const decisions = Object.values(clauseDecisions.value);
  if (decisions.length > 0) {
    try {
      await legalJobsService.reviewWithClauseDecisions(
        props.jobId,
        props.context,
        decisions,
      );
      emit('reviewed', { jobId: props.jobId });
    } catch (e) {
      submitError.value = e instanceof Error ? e.message : String(e);
    } finally {
      submitting.value = false;
    }
    return;
  }

  let payload: ReviewDecisionPayload;
  if (decision.value === 'approve') {
    payload = { decision: 'approve' };
  } else if (decision.value === 'reject') {
    payload = { decision: 'reject', feedback: feedback.value.trim() };
  } else {
    // modify — parse edited JSON for each specialist the reviewer touched.
    const editedOutputs: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(editedJson.value)) {
      try {
        editedOutputs[key] = JSON.parse(raw);
      } catch (e) {
        submitError.value = `Specialist "${key}" has invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
        submitting.value = false;
        return;
      }
    }
    payload = {
      decision: 'modify',
      editedOutputs,
      feedback: feedback.value.trim() || undefined,
    };
  }

  try {
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
.state {
  padding: 24px;
  color: var(--ion-color-medium);
}
.state.error {
  color: var(--ion-color-danger);
}
.section {
  padding: 16px 24px;
  border-bottom: 1px solid var(--ion-color-step-200);
  color: var(--ion-text-color);
}
.section h3 {
  margin: 0 0 8px 0;
  color: var(--ion-text-color);
}
.section ul {
  margin: 0;
  padding-left: 20px;
  color: var(--ion-text-color);
}
.doc-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.doc-tab {
  padding: 4px 12px;
  border: 1px solid var(--ion-color-step-300);
  border-radius: 16px;
  background: transparent;
  cursor: pointer;
  font-size: 0.82em;
  color: var(--ion-text-color);
  transition: background 0.15s;
}
.doc-tab:hover {
  background: var(--ion-color-step-100);
}
.doc-tab.active {
  background: var(--ion-color-primary);
  border-color: var(--ion-color-primary);
  color: #fff;
}
.doc-tab-type {
  font-size: 0.9em;
  opacity: 0.75;
}
.doc-detail-card {
  font-size: 0.88em;
  color: var(--ion-text-color);
  padding: 4px 0;
}
.doc-name {
  font-weight: 600;
}
.specialist {
  margin-bottom: 12px;
}
.specialist label,
.feedback label {
  display: block;
  color: var(--ion-text-color);
  font-size: 13px;
  margin-bottom: 4px;
}
.specialist strong {
  color: var(--ion-text-color);
}
.specialist textarea,
.feedback textarea {
  width: 100%;
  font-family: var(--ion-font-family, monospace);
  font-size: 12px;
  padding: 8px;
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
  border: 1px solid var(--ion-color-step-300);
  border-radius: 4px;
  margin-top: 4px;
}
.specialist textarea:focus,
.feedback textarea:focus {
  outline: none;
  border-color: var(--ion-color-primary);
}
.decision-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.muted {
  color: var(--ion-color-medium);
}

/* ── Synthesis renderer ── */
.prose {
  color: var(--ion-text-color);
  line-height: 1.5;
  margin: 0 0 12px 0;
}
.subsection {
  margin-top: 12px;
}
.subsection h4 {
  margin: 0 0 6px 0;
  color: var(--ion-text-color);
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.75;
}
.subsection ul,
.findings {
  margin: 0;
  padding-left: 20px;
  color: var(--ion-text-color);
}
.findings li {
  margin-bottom: 6px;
}
.finding-source {
  color: var(--ion-color-primary);
  font-weight: 600;
  margin-right: 4px;
}
.severity-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  background: var(--ion-color-step-200);
  color: var(--ion-text-color);
}
.severity-tag.severity-low,
.severity-low .severity-tag {
  background: var(--ion-color-success);
  color: var(--ion-color-success-contrast);
}
.severity-tag.severity-medium,
.severity-medium .severity-tag {
  background: var(--ion-color-warning);
  color: var(--ion-color-warning-contrast);
}
.severity-tag.severity-high,
.severity-tag.severity-critical,
.severity-high .severity-tag,
.severity-critical .severity-tag {
  background: var(--ion-color-danger);
  color: var(--ion-color-danger-contrast);
}
.risk-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--ion-color-step-100);
  margin-bottom: 12px;
  color: var(--ion-text-color);
  border-left: 4px solid var(--ion-color-step-300);
}
.risk-row.risk-low {
  border-left-color: var(--ion-color-success);
}
.risk-row.risk-medium {
  border-left-color: var(--ion-color-warning);
}
.risk-row.risk-high,
.risk-row.risk-critical {
  border-left-color: var(--ion-color-danger);
}
.risk-label {
  color: var(--ion-color-medium);
  font-size: 13px;
}
.risk-desc {
  opacity: 0.85;
}
.meta {
  margin-top: 8px;
  color: var(--ion-color-medium);
  font-size: 12px;
}

/* ── Specialist read-mode ── */
.specialist-read {
  margin-bottom: 10px;
  border: 1px solid var(--ion-color-step-200);
  border-radius: 6px;
  padding: 8px 12px;
  background: var(--ion-background-color);
}
.specialist-read summary {
  cursor: pointer;
  color: var(--ion-text-color);
  font-size: 14px;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.specialist-read[open] summary {
  margin-bottom: 8px;
  border-bottom: 1px solid var(--ion-color-step-200);
  padding-bottom: 6px;
}
.modify-hint {
  margin-bottom: 12px;
  font-size: 13px;
}

/* ── Reasoning accordion ── */
.reasoning-accordion {
  margin-top: 10px;
  border: 1px solid var(--ion-color-step-150);
  border-radius: 6px;
  overflow: hidden;
}
.reasoning-accordion-summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ion-color-medium);
  background: var(--ion-color-step-50);
  user-select: none;
  list-style: none;
}
.reasoning-accordion-summary::-webkit-details-marker {
  display: none;
}
.reasoning-accordion[open] .reasoning-accordion-summary {
  color: var(--ion-text-color);
  border-bottom: 1px solid var(--ion-color-step-150);
}
.reasoning-icon {
  font-size: 15px;
}
.reasoning-body {
  padding: 10px 12px;
  background: color-mix(
    in srgb,
    var(--ion-color-tertiary, #5260ff) 5%,
    var(--ion-background-color)
  );
}
.reasoning-loading {
  font-size: 12px;
  color: var(--ion-color-medium);
  padding: 4px 0;
}
.reasoning-pre {
  margin: 0;
  padding: 8px;
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
  border: 1px solid var(--ion-color-step-200);
  border-radius: 4px;
  font-family: var(--ion-font-family, monospace);
  font-size: 12px;
  line-height: 1.5;
  max-height: 400px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Review tab strip ── */
.review-tabs {
  padding: 12px 24px 0 24px;
}

/* ── Redline tab ── */
.redline-tab {
  padding: 16px 24px;
}
.redline-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--ion-text-color);
}
.redline-summary-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.redline-actions {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0;
}
</style>
