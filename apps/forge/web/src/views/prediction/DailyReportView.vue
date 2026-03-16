<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/app/prediction/dashboard" />
        </ion-buttons>
        <ion-title>Daily Report</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <div class="daily-report-page">
        <section class="actions">
          <button class="btn btn-primary" :disabled="isRunning" @click="runReport">
            {{ isRunning ? 'Running...' : 'Run Daily Report' }}
          </button>
          <button
            class="btn btn-secondary"
            :disabled="!selectedRunId"
            @click="downloadArtifact('markdown')"
          >
            Download Markdown
          </button>
          <button
            class="btn btn-secondary"
            :disabled="!selectedRunId"
            @click="downloadArtifact('json')"
          >
            Download JSON
          </button>
          <span class="hint">Dashboard is primary. OpenClaw actions map to same recommendation IDs.</span>
        </section>
        <section v-if="runError" class="bulk-result error">
          {{ runError }}
        </section>
        <section v-if="bulkResultMessage" class="bulk-result" :class="bulkResultClass">
          {{ bulkResultMessage }}
          <details v-if="failedRecommendationIds.length > 0" class="failure-details">
            <summary>View failures ({{ failedRecommendationIds.length }})</summary>
            <ul>
              <li v-for="id in failedRecommendationIds" :key="id">
                <button class="failed-link" @click="focusRecommendation(id)">
                  <code>{{ id }}</code>
                </button>
              </li>
            </ul>
          </details>
        </section>

        <section class="runs">
          <h2>Recent Runs</h2>
          <div v-if="loadingRuns" class="state">Loading runs...</div>
          <div v-else-if="runs.length === 0" class="state">No runs yet.</div>
          <div v-else class="run-list">
            <button
              v-for="run in runs"
              :key="run.id"
              class="run-item"
              :class="{ selected: selectedRunId === run.id }"
              @click="selectRun(run.id)"
            >
              <div class="row">
                <strong>{{ run.runDate }}</strong>
                <span>{{ run.status }}</span>
              </div>
              <small>
                {{ run.summary.overnightCandidates }} overnight candidates /
                {{ run.summary.recommendations }} recommendations
              </small>
            </button>
          </div>
        </section>

        <section v-if="selectedRun" class="report">
          <h2>Summary</h2>
          <div class="summary-grid">
            <div class="card">
              <label>Threshold</label>
              <strong>{{ selectedRun.summary.overnightMoveThresholdPct }}%</strong>
            </div>
            <div class="card">
              <label>Overnight Moves</label>
              <strong>{{ selectedRun.summary.overnightCandidates }}</strong>
            </div>
            <div class="card">
              <label>Recommendations</label>
              <strong>{{ selectedRun.summary.recommendations }}</strong>
            </div>
          </div>

          <div class="next-action-banner">
            <div class="banner-title">Next Best Action</div>
            <div class="banner-body">
              <span v-if="pendingCount > 0">
                {{ pendingCount }} pending recommendations need review.
              </span>
              <span v-else>
                No pending recommendations. Review applied/escalated outcomes.
              </span>
            </div>
            <div class="banner-actions">
              <button
                class="btn btn-secondary"
                :disabled="pendingCount === 0"
                @click="setRecommendationFilter('pending')"
              >
                Review Pending ({{ pendingCount }})
              </button>
              <button
                class="btn btn-secondary"
                :disabled="applyReadyCount === 0"
                @click="setRecommendationFilter('approved')"
              >
                Apply Ready ({{ applyReadyCount }})
              </button>
              <button
                class="btn btn-secondary"
                :disabled="escalatedCount === 0"
                @click="setRecommendationFilter('escalated')"
              >
                Escalated ({{ escalatedCount }})
              </button>
              <button
                class="btn btn-secondary"
                :disabled="replaySuggestedCount === 0"
                @click="setRecommendationFilter('all')"
              >
                Replay Suggested ({{ replaySuggestedCount }})
              </button>
              <button
                class="btn btn-secondary"
                :disabled="pendingContextUpdateCount === 0 || isBulkApplying"
                @click="bulkApprovePendingContextUpdates"
              >
                {{
                  isBulkApplying
                    ? 'Approving...'
                    : `Approve Pending Context Updates (${pendingContextUpdateCount})`
                }}
              </button>
              <button
                class="btn btn-secondary"
                :disabled="pendingLowConfidenceSourceCount === 0 || isBulkApplying"
                @click="bulkRejectLowConfidenceSources"
              >
                {{
                  isBulkApplying
                    ? 'Rejecting...'
                    : `Reject Low-Confidence Sources (${pendingLowConfidenceSourceCount})`
                }}
              </button>
              <button
                class="btn btn-primary"
                :disabled="approvedApplyEligibleCount === 0 || isBulkApplying"
                @click="bulkApplyApprovedAiInstrumentUpdates"
              >
                {{
                  isBulkApplying
                    ? 'Applying...'
                    : `Apply Approved AI Instrument Updates (${approvedApplyEligibleCount})`
                }}
              </button>
            </div>
          </div>

          <h2>Recommendation Actions</h2>
          <div class="filter-bar">
            <button
              v-for="filter in recommendationFilterOptions"
              :key="`rec-${filter}`"
              class="filter-chip"
              :class="{ active: recommendationFilter === filter }"
              @click="recommendationFilter = filter"
            >
              {{ filter }}
            </button>
          </div>
          <div v-if="recommendations.length === 0" class="state">No recommendations.</div>
          <div v-else-if="filteredRecommendations.length === 0" class="state">
            No recommendations match the selected filter.
          </div>
          <div v-else class="rec-list">
            <article
              v-for="rec in filteredRecommendations"
              :id="`rec-${rec.id}`"
              :key="rec.id"
              class="rec-card"
              :class="{ 'rec-highlight': highlightedRecommendationId === rec.id }"
            >
              <header>
                <strong>{{ rec.title }}</strong>
                <span class="status">{{ rec.status }}</span>
              </header>
              <p>{{ rec.rationale }}</p>
              <small>
                {{ rec.recommendationType }} · {{ rec.scopeLevel }} · confidence {{ Math.round(rec.confidence * 100) }}%
              </small>
              <div v-if="replayMetaByRecommendationId[rec.id]" class="replay-meta">
                <strong>Replay:</strong>
                test {{ replayMetaByRecommendationId[rec.id]!.replayTestId }} ·
                original {{ replayMetaByRecommendationId[rec.id]!.originalAccuracyPct }}% ·
                replay {{ replayMetaByRecommendationId[rec.id]!.replayAccuracyPct }}%
              </div>
              <div class="rec-actions">
                <button class="btn btn-secondary" @click="decide(rec.id, 'approve')">Approve</button>
                <button class="btn btn-primary" @click="decide(rec.id, 'apply')">Apply</button>
                <button class="btn btn-secondary" @click="decide(rec.id, 'replay')">Replay</button>
                <button class="btn btn-secondary" @click="decide(rec.id, 'escalate')">Escalate</button>
                <button class="btn btn-danger" @click="decide(rec.id, 'reject')">Reject</button>
                <button
                  v-if="isFailedRecommendation(rec.id) && lastBulkDecision"
                  class="btn btn-secondary"
                  @click="retryFailedRecommendation(rec.id)"
                >
                  Retry {{ lastBulkDecision }}
                </button>
              </div>
            </article>
          </div>

          <h2>Action Audit Timeline</h2>
          <div class="filter-bar">
            <button
              v-for="filter in timelineFilterOptions"
              :key="`timeline-${filter}`"
              class="filter-chip"
              :class="{ active: timelineFilter === filter }"
              @click="timelineFilter = filter"
            >
              {{ filter }}
            </button>
          </div>
          <div v-if="auditTimeline.length === 0" class="state">
            No recommendation actions recorded yet.
          </div>
          <div v-else-if="filteredAuditTimeline.length === 0" class="state">
            No timeline items match the selected filter.
          </div>
          <div v-else class="timeline">
            <article
              v-for="event in filteredAuditTimeline"
              :key="event.id"
              class="timeline-item"
            >
              <header>
                <strong>{{ event.title }}</strong>
                <span class="status">{{ event.status }}</span>
              </header>
              <small>
                {{ event.actionSource || 'unknown-source' }} ·
                {{ event.actionedBy || 'unknown-user' }} ·
                {{ formatTimestamp(event.actionedAt) }}
              </small>
              <p v-if="event.actionNote" class="timeline-note">{{ event.actionNote }}</p>
            </article>
          </div>

          <h2>Generated HTML Report</h2>
          <iframe
            v-if="selectedRun.reportHtml"
            class="report-frame"
            :srcdoc="selectedRun.reportHtml"
            title="Daily report HTML"
          />
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { useAuthStore } from '@/stores/rbacStore';
import { useAgentsStore } from '@/stores/agentsStore';
import {
  predictionDashboardService,
  type DailyReportRun,
  type DailyReportRecommendation,
} from '@/services/predictionDashboardService';

const isRunning = ref(false);
const loadingRuns = ref(false);
const runError = ref<string | null>(null);
const runs = ref<DailyReportRun[]>([]);
const selectedRun = ref<DailyReportRun | null>(null);
const selectedRunId = ref<string | null>(null);
const recommendations = ref<DailyReportRecommendation[]>([]);
const isBulkApplying = ref(false);
const bulkResultMessage = ref<string | null>(null);
const bulkResultKind = ref<'success' | 'warning' | 'error'>('success');
const failedRecommendationIds = ref<string[]>([]);
const highlightedRecommendationId = ref<string | null>(null);
const lastBulkDecision = ref<'approve' | 'reject' | 'apply' | null>(null);
const recommendationFilter = ref<
  | 'all'
  | 'pending'
  | 'approved'
  | 'actioned'
  | 'applied'
  | 'escalated'
  | 'rejected'
>('pending');
const timelineFilter = ref<
  'all' | 'approved' | 'actioned' | 'applied' | 'escalated' | 'rejected'
>('all');

const recommendationFilterOptions: Array<
  | 'all'
  | 'pending'
  | 'approved'
  | 'actioned'
  | 'applied'
  | 'escalated'
  | 'rejected'
> = [
  'all',
  'pending',
  'approved',
  'actioned',
  'applied',
  'escalated',
  'rejected',
];
const timelineFilterOptions: Array<
  'all' | 'approved' | 'actioned' | 'applied' | 'escalated' | 'rejected'
> = [
  'all',
  'approved',
  'actioned',
  'applied',
  'escalated',
  'rejected',
];

const filteredRecommendations = computed(() =>
  recommendations.value.filter((rec) => {
    if (recommendationFilter.value === 'all') return true;
    if (recommendationFilter.value === 'actioned') return Boolean(rec.actionedAt);
    return rec.status === recommendationFilter.value;
  })
);

const auditTimeline = computed(() =>
  recommendations.value
    .filter((rec) => Boolean(rec.actionedAt))
    .slice()
    .sort((a, b) => {
      const aTime = a.actionedAt ? Date.parse(a.actionedAt) : 0;
      const bTime = b.actionedAt ? Date.parse(b.actionedAt) : 0;
      return bTime - aTime;
    })
);

const filteredAuditTimeline = computed(() =>
  auditTimeline.value.filter((event) => {
    if (timelineFilter.value === 'all') return true;
    if (timelineFilter.value === 'actioned') return Boolean(event.actionedAt);
    return event.status === timelineFilter.value;
  })
);

const pendingCount = computed(
  () => recommendations.value.filter((rec) => rec.status === 'pending').length
);
const applyReadyCount = computed(
  () => recommendations.value.filter((rec) => rec.status === 'approved').length
);
const escalatedCount = computed(
  () => recommendations.value.filter((rec) => rec.status === 'escalated').length
);
const replaySuggestedCount = computed(
  () =>
    recommendations.value.filter(
      (rec) => rec.recommendationType === 'replay_experiment'
    ).length
);
const pendingContextUpdateCount = computed(
  () =>
    recommendations.value.filter(
      (rec) =>
        rec.status === 'pending' && rec.recommendationType === 'context_update'
    ).length
);
const pendingLowConfidenceSourceCount = computed(
  () =>
    recommendations.value.filter(
      (rec) =>
        rec.status === 'pending' &&
        rec.recommendationType === 'source_candidate' &&
        rec.confidence < 0.65
    ).length
);
const approvedApplyEligibleCount = computed(
  () =>
    recommendations.value.filter(
      (rec) =>
        rec.status === 'approved' &&
        rec.recommendationType === 'context_update' &&
        rec.scopeLevel === 'instrument_context' &&
        rec.proposedChange?.context_section === 'ai'
    ).length
);
const replayMetaByRecommendationId = computed(() => {
  const map: Record<
    string,
    { replayTestId: string; replayAccuracyPct: string; originalAccuracyPct: string }
  > = {};
  for (const rec of recommendations.value) {
    if (!rec.actionNote) continue;
    const replayTestId = extractReplayField(rec.actionNote, 'replay_test_id');
    if (!replayTestId) continue;
    map[rec.id] = {
      replayTestId,
      replayAccuracyPct:
        extractReplayField(rec.actionNote, 'replay_accuracy_pct') ?? 'n/a',
      originalAccuracyPct:
        extractReplayField(rec.actionNote, 'original_accuracy_pct') ?? 'n/a',
    };
  }
  return map;
});

async function loadRuns() {
  runError.value = null;
  loadingRuns.value = true;
  try {
    const response = await predictionDashboardService.listDailyReports(20);
    runs.value = response.content ?? [];
    if (!selectedRunId.value && runs.value.length > 0) {
      await selectRun(runs.value[0]!.id);
    }
  } catch (error) {
    runError.value =
      error instanceof Error ? error.message : 'Failed to load daily reports.';
  } finally {
    loadingRuns.value = false;
  }
}

async function runReport() {
  runError.value = null;
  isRunning.value = true;
  try {
    const response = await predictionDashboardService.runDailyReport();
    const runId = response.content?.runId;
    await loadRuns();
    if (runId) {
      await selectRun(runId);
    }
  } catch (error) {
    runError.value =
      error instanceof Error ? error.message : 'Failed to run daily report.';
  } finally {
    isRunning.value = false;
  }
}

async function selectRun(runId: string) {
  selectedRunId.value = runId;
  const response = await predictionDashboardService.getDailyReport(runId);
  selectedRun.value = response.content?.run ?? null;
  recommendations.value = response.content?.recommendations ?? [];
  recommendationFilter.value = recommendations.value.some(
    (rec) => rec.status === 'pending'
  )
    ? 'pending'
    : 'all';
  timelineFilter.value = 'all';
}

async function decide(
  recommendationId: string,
  decision: 'approve' | 'reject' | 'apply' | 'escalate' | 'replay',
) {
  const payload: {
    recommendationId: string;
    decision: 'approve' | 'reject' | 'apply' | 'escalate' | 'replay';
    actionSource?: 'dashboard' | 'openclaw-web' | 'openclaw-phone';
    escalateTo?: 'instrument_context' | 'domain_context' | 'prediction_global_context';
  } = {
    recommendationId,
    decision,
    actionSource: 'dashboard',
  };

  if (decision === 'escalate') {
    const selected = window.prompt(
      'Escalate to scope: instrument_context, domain_context, or prediction_global_context',
      'domain_context'
    );
    if (selected === null) return;
    if (
      selected !== 'instrument_context' &&
      selected !== 'domain_context' &&
      selected !== 'prediction_global_context'
    ) {
      window.alert(
        'Invalid escalate scope. Use instrument_context, domain_context, or prediction_global_context.'
      );
      return;
    }
    payload.escalateTo = selected;
  }

  await predictionDashboardService.decideDailyReportRecommendation(payload);
  if (selectedRunId.value) {
    await selectRun(selectedRunId.value);
  }
}

async function downloadArtifact(artifactType: 'markdown' | 'json') {
  if (!selectedRunId.value) return;
  const response = await predictionDashboardService.getDailyReportArtifact(
    selectedRunId.value,
    artifactType
  );
  const artifact = response.content;
  if (!artifact) return;

  const body =
    typeof artifact.content === 'string'
      ? artifact.content
      : JSON.stringify(artifact.content, null, 2);
  const blob = new Blob([body], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = artifact.filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'n/a';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleString();
}

function setRecommendationFilter(
  filter:
    | 'all'
    | 'pending'
    | 'approved'
    | 'actioned'
    | 'applied'
    | 'escalated'
    | 'rejected'
) {
  recommendationFilter.value = filter;
}

function focusRecommendation(recommendationId: string) {
  recommendationFilter.value = 'all';
  highlightedRecommendationId.value = recommendationId;
  requestAnimationFrame(() => {
    const element = document.getElementById(`rec-${recommendationId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  window.setTimeout(() => {
    if (highlightedRecommendationId.value === recommendationId) {
      highlightedRecommendationId.value = null;
    }
  }, 2200);
}

function isFailedRecommendation(recommendationId: string): boolean {
  return failedRecommendationIds.value.includes(recommendationId);
}

async function retryFailedRecommendation(recommendationId: string) {
  if (!lastBulkDecision.value) return;
  await predictionDashboardService.decideDailyReportRecommendation({
    recommendationId,
    decision: lastBulkDecision.value,
    actionSource: 'dashboard',
    note: `retry-failed: ${lastBulkDecision.value}`,
  });
  if (selectedRunId.value) {
    await selectRun(selectedRunId.value);
    highlightedRecommendationId.value = recommendationId;
  }
}

function extractReplayField(actionNote: string, fieldName: string): string | null {
  const pattern = new RegExp(`${fieldName}=([^;\\s]+)`);
  const match = actionNote.match(pattern);
  return match?.[1] ?? null;
}

async function bulkApprovePendingContextUpdates() {
  const targets = recommendations.value.filter(
    (rec) =>
      rec.status === 'pending' && rec.recommendationType === 'context_update'
  );
  if (targets.length === 0 || !selectedRunId.value) return;

  const confirmed = window.confirm(
    `Approve ${targets.length} pending context_update recommendations?`
  );
  if (!confirmed) return;

  isBulkApplying.value = true;
  lastBulkDecision.value = 'approve';
  clearBulkResult();
  try {
    let successCount = 0;
    let failureCount = 0;
    const failedIds: string[] = [];
    for (const rec of targets) {
      try {
        await predictionDashboardService.decideDailyReportRecommendation({
          recommendationId: rec.id,
          decision: 'approve',
          actionSource: 'dashboard',
          note: 'bulk-approve: pending context updates',
        });
        successCount += 1;
      } catch {
        failureCount += 1;
        failedIds.push(rec.id);
      }
    }
    failedRecommendationIds.value = failedIds;
    await selectRun(selectedRunId.value);
    setBulkResult(
      `Approved ${successCount}/${targets.length} pending context updates${
        failureCount > 0 ? ` (${failureCount} failed)` : ''
      }.`,
      failureCount > 0 ? 'warning' : 'success'
    );
  } finally {
    isBulkApplying.value = false;
  }
}

async function bulkRejectLowConfidenceSources() {
  const targets = recommendations.value.filter(
    (rec) =>
      rec.status === 'pending' &&
      rec.recommendationType === 'source_candidate' &&
      rec.confidence < 0.65
  );
  if (targets.length === 0 || !selectedRunId.value) return;

  const confirmed = window.confirm(
    `Reject ${targets.length} low-confidence source_candidate recommendations (confidence < 65%)?`
  );
  if (!confirmed) return;

  isBulkApplying.value = true;
  lastBulkDecision.value = 'reject';
  clearBulkResult();
  try {
    let successCount = 0;
    let failureCount = 0;
    const failedIds: string[] = [];
    for (const rec of targets) {
      try {
        await predictionDashboardService.decideDailyReportRecommendation({
          recommendationId: rec.id,
          decision: 'reject',
          actionSource: 'dashboard',
          note: 'bulk-reject: low-confidence source candidates',
        });
        successCount += 1;
      } catch {
        failureCount += 1;
        failedIds.push(rec.id);
      }
    }
    failedRecommendationIds.value = failedIds;
    await selectRun(selectedRunId.value);
    setBulkResult(
      `Rejected ${successCount}/${targets.length} low-confidence source candidates${
        failureCount > 0 ? ` (${failureCount} failed)` : ''
      }.`,
      failureCount > 0 ? 'warning' : 'success'
    );
  } finally {
    isBulkApplying.value = false;
  }
}

async function bulkApplyApprovedAiInstrumentUpdates() {
  const targets = recommendations.value.filter(
    (rec) =>
      rec.status === 'approved' &&
      rec.recommendationType === 'context_update' &&
      rec.scopeLevel === 'instrument_context' &&
      rec.proposedChange?.context_section === 'ai'
  );
  if (targets.length === 0 || !selectedRunId.value) return;

  const confirmed = window.confirm(
    `Apply ${targets.length} approved AI-only instrument context updates?`
  );
  if (!confirmed) return;

  isBulkApplying.value = true;
  lastBulkDecision.value = 'apply';
  clearBulkResult();
  try {
    let successCount = 0;
    let failureCount = 0;
    const failedIds: string[] = [];
    for (const rec of targets) {
      try {
        await predictionDashboardService.decideDailyReportRecommendation({
          recommendationId: rec.id,
          decision: 'apply',
          actionSource: 'dashboard',
          note: 'bulk-apply: approved AI-only instrument context updates',
        });
        successCount += 1;
      } catch {
        failureCount += 1;
        failedIds.push(rec.id);
      }
    }
    failedRecommendationIds.value = failedIds;
    await selectRun(selectedRunId.value);
    setBulkResult(
      `Applied ${successCount}/${targets.length} approved AI-only instrument updates${
        failureCount > 0 ? ` (${failureCount} failed)` : ''
      }.`,
      failureCount > 0 ? 'warning' : 'success'
    );
  } finally {
    isBulkApplying.value = false;
  }
}

function clearBulkResult() {
  bulkResultMessage.value = null;
  failedRecommendationIds.value = [];
}

function setBulkResult(
  message: string,
  kind: 'success' | 'warning' | 'error'
) {
  bulkResultMessage.value = message;
  bulkResultKind.value = kind;
}

const bulkResultClass = computed(() => ({
  success: bulkResultKind.value === 'success',
  warning: bulkResultKind.value === 'warning',
  error: bulkResultKind.value === 'error',
}));

const route = useRoute();
const authStore = useAuthStore();
const agentsStore = useAgentsStore();
const defaultAgentSlug = 'us-tech-stocks';
const contextInitialized = ref(false);

function initializeDailyReportContext(): boolean {
  const selectedAgentSlug =
    (route.query.agentSlug as string | undefined) ?? defaultAgentSlug;
  const routeOrgSlug = route.query.orgSlug as string | undefined;

  const matchedAgent = agentsStore.availableAgents.find(
    (agent) => agent.slug === selectedAgentSlug || agent.name === selectedAgentSlug
  );
  const agentOrg = matchedAgent?.organizationSlug;
  const orgSlug = (
    routeOrgSlug && routeOrgSlug !== '*'
      ? routeOrgSlug
      : agentOrg && agentOrg !== '*'
        ? (Array.isArray(agentOrg) ? agentOrg[0] : agentOrg)
        : authStore.currentOrganization && authStore.currentOrganization !== '*'
          ? authStore.currentOrganization
          : null
  );

  if (!orgSlug) {
    runError.value = `Unable to resolve organization context for daily report agent '${selectedAgentSlug}'. Select an organization and retry.`;
    contextInitialized.value = false;
    return false;
  }

  runError.value = null;
  predictionDashboardService.setAgentSlug(selectedAgentSlug);
  predictionDashboardService.setOrgSlug(orgSlug);
  contextInitialized.value = true;
  return true;
}

onMounted(async () => {
  if (initializeDailyReportContext()) {
    await loadRuns();
  }
});

watch(
  [
    () => route.query.orgSlug,
    () => route.query.agentSlug,
    () => authStore.currentOrganization,
    () => agentsStore.availableAgents.length,
  ],
  async () => {
    if (contextInitialized.value) {
      return;
    }
    if (initializeDailyReportContext()) {
      await loadRuns();
    }
  },
);
</script>

<style scoped>
.daily-report-page { padding: 16px; display: grid; gap: 16px; }
.actions { display: flex; align-items: center; gap: 12px; }
.hint { color: #666; font-size: 0.9rem; }
.bulk-result {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}
.bulk-result.success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}
.bulk-result.warning {
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}
.bulk-result.error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}
.failure-details {
  margin-top: 8px;
  border-top: 1px dashed currentColor;
  padding-top: 8px;
}
.failure-details summary {
  cursor: pointer;
  font-weight: 600;
}
.failure-details ul {
  margin: 8px 0 0 18px;
  padding: 0;
}
.failed-link {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
}
.failed-link code {
  color: inherit;
  text-decoration: underline;
}
.runs, .report { background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 12px; }
.run-list { display: grid; gap: 8px; }
.run-item { text-align: left; border: 1px solid #ddd; background: #fafafa; padding: 10px; border-radius: 8px; }
.run-item.selected { border-color: #3b82f6; background: #eff6ff; }
.row { display: flex; justify-content: space-between; }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 12px; }
.card { border: 1px solid #ddd; border-radius: 8px; padding: 10px; display: grid; gap: 4px; }
.card label { color: #666; font-size: 0.85rem; }
.next-action-banner {
  border: 1px solid #dbeafe;
  background: #eff6ff;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 12px;
  display: grid;
  gap: 8px;
}
.banner-title { font-size: 0.85rem; text-transform: uppercase; color: #1e40af; font-weight: 700; }
.banner-body { color: #1f2937; }
.banner-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.rec-list { display: grid; gap: 10px; }
.rec-card { border: 1px solid #ddd; border-radius: 8px; padding: 10px; display: grid; gap: 8px; }
.rec-highlight { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2); }
.rec-card header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.status { text-transform: uppercase; font-size: 0.75rem; color: #555; }
.filter-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.filter-chip { border: 1px solid #c9c9c9; background: #fff; padding: 6px 10px; border-radius: 999px; font-size: 0.8rem; text-transform: lowercase; cursor: pointer; }
.filter-chip.active { background: #2563eb; color: #fff; border-color: #1d4ed8; }
.rec-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.timeline { display: grid; gap: 10px; margin-bottom: 10px; }
.timeline-item { border: 1px solid #ddd; border-radius: 8px; padding: 10px; display: grid; gap: 6px; background: #fafafa; }
.timeline-item header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.timeline-note { margin: 0; color: #444; white-space: pre-wrap; }
.replay-meta {
  font-size: 0.8rem;
  color: #1f2937;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 6px 8px;
}
.report-frame { width: 100%; min-height: 460px; border: 1px solid #ddd; border-radius: 8px; background: #fff; }
.state { color: #666; }

.btn {
  border: 1px solid #c9c9c9;
  background: #f6f6f6;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.btn-primary { background: #2563eb; color: #fff; border-color: #1d4ed8; }
.btn-secondary { background: #fff; }
.btn-danger { background: #dc2626; color: #fff; border-color: #b91c1c; }
</style>

