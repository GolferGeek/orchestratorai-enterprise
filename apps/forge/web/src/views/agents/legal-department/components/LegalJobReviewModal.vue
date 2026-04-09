<template>
  <ion-modal :is-open="open" @did-dismiss="$emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>HITL Review — {{ jobId ?? '' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="$emit('close')">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="loading" class="state">Loading review payload…</div>
      <div v-else-if="error" class="state error">{{ error }}</div>
      <template v-else-if="job">

        <!-- Tab strip — only shown when the job has a redline output -->
        <div v-if="reviewPayload?.redlineOutput" class="review-tabs">
          <ion-segment v-model="activeTab">
            <ion-segment-button value="risk">Risk Assessment</ion-segment-button>
            <ion-segment-button value="redline">Redlined Contract</ion-segment-button>
          </ion-segment>
        </div>

        <!-- Redline tab -->
        <div v-if="activeTab === 'redline' && reviewPayload?.redlineOutput" class="redline-tab">
          <div class="redline-summary">
            <span class="redline-summary-item">
              Total clauses: <strong>{{ reviewPayload.redlineOutput.totalClauses }}</strong>
            </span>
            <span class="redline-summary-item">
              Flagged: <strong>{{ reviewPayload.redlineOutput.flaggedClauses }}</strong>
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
            <template v-for="(doc, i) in reviewPayload?.documentsSummary ?? []" :key="doc.name">
              <div v-if="activeDocIndex === i" class="doc-detail-card">
                <span class="doc-name">{{ doc.name }}</span>
                <span v-if="doc.type" class="muted">&nbsp;({{ doc.type }})</span>
                <span class="muted">&nbsp;— {{ doc.length.toLocaleString() }} chars</span>
              </div>
            </template>
          </div>
          <!-- Fallback: only one document, show as plain list -->
          <ul v-if="(reviewPayload?.documentsSummary ?? []).length <= 1">
            <li v-for="doc in reviewPayload?.documentsSummary ?? []" :key="doc.name">
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
                <span v-if="f.specialist" class="finding-source">{{ f.specialist }}:</span>
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
                   captured thinking content (Phase 4 reasoning capture).
                   Hidden entirely when reasoningSpecialistKeys does not
                   include this specialist's key. -->
              <details
                v-if="reasoningSpecialistKeys.includes(key)"
                class="reasoning-accordion"
                @toggle="(e) => (e.target as HTMLDetailsElement).open && onReasoningExpand(key)"
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
                  >{{ reasoningContentCache[key] }}</pre>
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

          <div v-if="decision === 'reject' || decision === 'modify'" class="feedback">
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

        </template><!-- end risk assessment tab -->
      </template>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
/**
 * LegalJobReviewModal
 *
 * Opened when a reviewer clicks an `awaiting_review` job in the activity
 * list. Reads the review payload straight from GET /jobs/:id (the API
 * augments the response with specialistOutputs + synthesis read from the
 * LangGraph checkpointer), lets the reviewer pick approve / reject +
 * feedback / modify + edited outputs, then POSTs to /jobs/:id/review.
 *
 * No graph work runs on the HTTP thread — the API simply records the
 * decision and flips the row back to `queued`; the worker picks it up on
 * the next tick and resumes the compiled graph via Command({ resume }).
 */
import {
  computed,
  ref,
  watch,
  h,
  defineComponent,
  type PropType,
  type VNode,
} from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonBadge,
} from '@ionic/vue';
import {
  legalJobsService,
  type AgentJobRow,
  type ExecutionContextLike,
  type ReviewDecisionPayload,
  type ClauseDecision,
} from '../legalJobsService';
import RedlineViewer from './RedlineViewer.vue';

// ────────────────────────────────────────────────────────────────────────
// Specialist output renderer
// ────────────────────────────────────────────────────────────────────────
// Specialists return loosely-typed JSON whose shape varies (contract has
// clauses + parties, compliance has risks + frameworks, etc.). Rather
// than ship eight bespoke renderers, walk the object recursively and
// produce a readable nested view: scalars become text, arrays become
// bullet lists, objects become labeled sections. Falls back to a JSON
// pre-block for anything we can't pretty-print (extremely deep or cyclic).
//
// Internal noise we suppress at the top level: any key starting with `_`
// or matching __noise (timestamps, raw model echoes) so reviewers see
// only the substantive findings.
const NOISE_KEYS = new Set([
  'rawResponse',
  'raw_response',
  'systemPrompt',
  'system_prompt',
  'prompt',
  'modelMetadata',
  'model_metadata',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
  'timestamp',
]);

function humanizeKey(key: string): string {
  // contract → Contract; risk_level → Risk Level; keyFindings → Key Findings
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isVisibleKey(key: string): boolean {
  return !key.startsWith('_') && !NOISE_KEYS.has(key);
}

const SpecialistView = defineComponent({
  name: 'SpecialistView',
  props: {
    output: {
      type: null as unknown as PropType<unknown>,
      required: true,
    },
    depth: { type: Number, default: 0 },
  },
  setup(props) {
    const MAX_DEPTH = 5;

    function renderValue(value: unknown, depth: number): VNode {
      if (depth > MAX_DEPTH) {
        return h('pre', { class: 'payload' }, JSON.stringify(value, null, 2));
      }
      if (value === null || value === undefined) {
        return h('span', { class: 'muted' }, '—');
      }
      if (typeof value === 'string') {
        return h('span', value);
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return h('span', String(value));
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return h('span', { class: 'muted' }, '(empty)');
        }
        return h(
          'ul',
          { class: 'specialist-list' },
          value.map((item, i) =>
            h('li', { key: i }, [renderValue(item, depth + 1)]),
          ),
        );
      }
      if (isPlainObject(value)) {
        const entries = Object.entries(value).filter(([k]) => isVisibleKey(k));
        if (entries.length === 0) {
          return h('span', { class: 'muted' }, '(empty)');
        }
        return h(
          'div',
          { class: 'specialist-object' },
          entries.map(([k, v]) =>
            h('div', { key: k, class: 'specialist-field' }, [
              h('span', { class: 'specialist-key' }, humanizeKey(k) + ':'),
              h(
                'div',
                { class: 'specialist-value' },
                [renderValue(v, depth + 1)],
              ),
            ]),
          ),
        );
      }
      return h('pre', { class: 'payload' }, JSON.stringify(value, null, 2));
    }

    return () => renderValue(props.output, props.depth);
  },
});

function specialistLabel(key: string): string {
  // contract → Contract Specialist; real_estate → Real Estate Specialist
  return humanizeKey(key) + ' Specialist';
}

// Pull a riskLevel out of a specialist output if one is present at the
// top level. Different specialists use different field names, so try
// the common ones in order. Returns null if nothing matches.
function specialistRiskLevel(output: unknown): string | null {
  if (!isPlainObject(output)) return null;
  const candidates = [
    'riskLevel',
    'risk_level',
    'overallRisk',
    'overall_risk',
    'severity',
  ];
  for (const k of candidates) {
    const v = output[k];
    if (typeof v === 'string') return v;
    if (isPlainObject(v) && typeof v.level === 'string') return v.level;
  }
  return null;
}

const props = defineProps<{
  open: boolean;
  jobId: string | null;
  orgSlug: string;
  context: ExecutionContextLike | null;
}>();

// ────────────────────────────────────────────────────────────────────────
// Reasoning accordion state (Phase 4)
// ────────────────────────────────────────────────────────────────────────

/** Specialist keys that have captured thinking content for this job. */
const reasoningSpecialistKeys = ref<string[]>([]);

/** Per-specialist thinking content cache — keyed by specialist key. */
const reasoningContentCache = ref<Record<string, string>>({});

/** Per-specialist loading state while fetching reasoning content. */
const reasoningLoading = ref<Record<string, boolean>>({});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'reviewed', payload: { jobId: string }): void;
}>();

const job = ref<AgentJobRow | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const submitError = ref<string | null>(null);
const submitting = ref(false);

/** Index of the currently selected document tab (multi-doc jobs). */
const activeDocIndex = ref(0);

/** Active tab in the review modal — 'risk' or 'redline'. */
const activeTab = ref<'risk' | 'redline'>('risk');

/** Per-clause decisions collected from the RedlineViewer (Phase 4). */
const clauseDecisions = ref<Record<string, ClauseDecision>>({});

const decision = ref<'approve' | 'reject' | 'modify'>('approve');
const feedback = ref('');
const editedJson = ref<Record<string, string>>({});

const reviewPayload = computed(() => job.value?.reviewPayload);

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
    case 'critical': return 'danger';
    case 'high': return 'warning';
    case 'medium': return 'tertiary';
    case 'low': return 'primary';
    case 'acceptable': return 'success';
    default: return 'medium';
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

function formatRecommendation(r: unknown): string {
  if (typeof r === 'string') return r;
  if (isPlainObject(r)) {
    if (typeof r.recommendation === 'string') return r.recommendation;
    if (typeof r.text === 'string') return r.text;
    if (typeof r.description === 'string') return r.description;
  }
  try {
    return JSON.stringify(r);
  } catch {
    return String(r);
  }
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function onSpecialistEdit(key: string, event: Event): void {
  const target = event.target as HTMLTextAreaElement;
  editedJson.value[key] = target.value;
}

watch(
  () => [props.open, props.jobId] as const,
  async ([open, id]) => {
    if (!open || !id) {
      job.value = null;
      error.value = null;
      submitError.value = null;
      decision.value = 'approve';
      feedback.value = '';
      editedJson.value = {};
      activeDocIndex.value = 0;
      activeTab.value = 'risk';
      clauseDecisions.value = {};
      // Clear reasoning state on close
      reasoningSpecialistKeys.value = [];
      reasoningContentCache.value = {};
      reasoningLoading.value = {};
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      job.value = await legalJobsService.getJob(id, props.orgSlug);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }

    // Probe which specialists have reasoning content. Run in parallel with
    // the job load — failures are non-fatal (the accordions just won't show).
    try {
      reasoningSpecialistKeys.value = await legalJobsService.getReasoningForJob(
        id,
        props.orgSlug,
      );
    } catch {
      // Non-fatal — reasoning accordions are a progressive enhancement.
      // The reviewer can still complete their HITL decision without them.
      reasoningSpecialistKeys.value = [];
    }
  },
  { immediate: true },
);

/**
 * Called when a reasoning accordion is toggled open.  Fetches the thinking
 * content on demand the first time; subsequent expansions use the cache.
 */
async function onReasoningExpand(specialistKey: string): Promise<void> {
  if (!props.jobId) return;
  // Already fetched — use cache
  if (reasoningContentCache.value[specialistKey] !== undefined) return;
  // Guard against concurrent fetches for the same key
  if (reasoningLoading.value[specialistKey]) return;

  reasoningLoading.value = { ...reasoningLoading.value, [specialistKey]: true };
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
    // Store an error marker so repeated opens don't retry infinitely.
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
      emit('close');
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
    emit('close');
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
/*
 * Theme contract: every color references an Ionic theme variable so the
 * modal reads correctly in light AND dark mode. The Forge web shell uses
 * Ionic's stepped palette where --ion-background-color and --ion-text-color
 * flip per scheme automatically; the --ion-color-step-* variables ride the
 * same flip. Using these instead of hex literals prevents the dark-mode
 * legibility regression that shipped in the first cut of this modal.
 */
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
.payload {
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--ion-color-step-200);
  white-space: pre-wrap;
  word-break: break-word;
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
.specialist-object {
  display: block;
}
.specialist-field {
  margin: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.specialist-key {
  color: var(--ion-color-medium);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.specialist-value {
  color: var(--ion-text-color);
  padding-left: 8px;
}
.specialist-list {
  margin: 4px 0 4px 0;
  padding-left: 18px;
  color: var(--ion-text-color);
}
.specialist-list li {
  margin: 2px 0;
}
.modify-hint {
  margin-bottom: 12px;
  font-size: 13px;
}

/* ── Reasoning accordion (Phase 4) ── */
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
  background: color-mix(in srgb, var(--ion-color-tertiary, #5260ff) 5%, var(--ion-background-color));
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
