<template>
  <div class="risk-agent-pane">
    <!-- Header with Controls -->
    <div class="pane-header">
      <div class="agent-info">
        <h2>Investment Risk Dashboard</h2>
        <div v-if="currentScope" class="scope-info">
          <span class="scope-label">Scope:</span>
          <span class="scope-name">{{ currentScope.name }}</span>
        </div>
      </div>

      <div class="header-controls">
        <!-- LLM Model Selector -->
        <button
          class="control-btn llm-selector-btn"
          @click="showLLMSelector = true"
          title="Change LLM model for analysis"
        >
          {{ currentLLMDisplay }}
        </button>

        <button
          class="control-btn refresh-btn"
          :disabled="isLoading"
          @click="handleRefresh"
        >
          Refresh
        </button>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="error-banner">
      <span class="error-icon">&#9888;</span>
      <span>{{ error }}</span>
      <button class="close-error-btn" @click="clearError">
        &times;
      </button>
    </div>

    <!-- Executive Summary -->
    <div v-if="executiveSummary" class="executive-summary-section">
      <div class="executive-summary-header">
        <div class="header-left">
          <div class="summary-status-badge" :class="executiveSummary.content?.status || 'stable'">
            {{ executiveSummary.content?.status?.toUpperCase() || 'N/A' }}
          </div>
          <h3 class="summary-headline">{{ executiveSummary.content?.headline || 'No summary available' }}</h3>
        </div>
        <div class="header-actions">
          <button
            class="action-btn-small"
            @click="handleOpenScenario('')"
            title="Run what-if scenario analysis"
          >
            🎯 What-If
          </button>
        </div>
      </div>
      <div class="summary-content-grid">
        <div class="summary-findings">
          <h4>KEY FINDINGS</h4>
          <ul>
            <li v-for="(finding, idx) in (executiveSummary.content?.keyFindings || []).slice(0, 4)" :key="idx">
              {{ finding }}
            </li>
          </ul>
        </div>
        <div class="summary-changes">
          <h4>DAILY CHANGES</h4>
          <ul v-if="executiveSummary.content?.riskHighlights?.recentChanges?.length">
            <li
              v-for="(change, idx) in executiveSummary.content.riskHighlights.recentChanges.slice(0, 4)"
              :key="idx"
              :class="{ clickable: change.subjectId }"
              @click="handleDailyChangeClick(change)"
            >
              <span class="change-subject">{{ change.subject }}</span>
              <span :class="['change-indicator', change.direction]">
                {{ change.direction === 'up' ? '↑' : '↓' }}
                {{ formatChangeValue(change.change) }}
              </span>
            </li>
          </ul>
          <p v-else class="no-changes">No recent changes</p>
        </div>
        <div class="summary-recommendations">
          <h4>RECOMMENDATIONS</h4>
          <ul>
            <li v-for="(rec, idx) in (executiveSummary.content?.recommendations || []).slice(0, 3)" :key="idx">
              {{ rec }}
            </li>
          </ul>
        </div>
      </div>
      <div class="summary-meta">
        Generated {{ formatSummaryDate(executiveSummary.generatedAt) }}
      </div>
    </div>
    <div v-else-if="currentScope && !isLoading" class="executive-summary-placeholder">
      <span>No executive summary available.</span>
    </div>

    <!-- Stats Summary -->
    <div class="stats-summary">
      <div class="summary-card">
        <div class="summary-value">{{ stats.totalSubjects }}</div>
        <div class="summary-label">Total Subjects</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">{{ stats.analyzedSubjects }}</div>
        <div class="summary-label">Analyzed</div>
      </div>
      <div class="summary-card">
        <div class="summary-value" :class="{ warning: stats.averageScore > 0.6 }">
          {{ formatScore(stats.averageScore) }}
        </div>
        <div class="summary-label">Avg Risk Score</div>
      </div>
      <div class="summary-card critical" v-if="stats.criticalAlerts > 0">
        <div class="summary-value">{{ stats.criticalAlerts }}</div>
        <div class="summary-label">Critical Alerts</div>
      </div>
      <div class="summary-card warning" v-if="stats.warningAlerts > 0">
        <div class="summary-value">{{ stats.warningAlerts }}</div>
        <div class="summary-label">Warnings</div>
      </div>
      <div class="summary-card" v-if="stats.pendingLearnings > 0">
        <div class="summary-value">{{ stats.pendingLearnings }}</div>
        <div class="summary-label">Pending Learnings</div>
      </div>
    </div>

    <!-- Tabs Navigation -->
    <div class="tabs-nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
      </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Overview Tab - Radar Chart and Subject List -->
      <div v-if="activeTab === 'overview'" class="overview-tab">
        <div class="overview-layout">
          <!-- Sidebar with subject list -->
          <RiskSidebar
            :subjects="subjects"
            :composite-scores="compositeScores"
            :selected-subject-id="selectedSubject?.subject?.id"
            @select="handleSelectSubject"
            @add-subject="showCreateSubjectModal = true"
          />

          <!-- Main content - Radar or Detail -->
          <div class="main-content">
            <template v-if="selectedSubject && selectedSubject.subject">
              <RiskDetailView
                :subject="selectedSubject.subject"
                :composite-score="selectedSubject.compositeScore"
                :assessments="selectedSubject.assessments"
                :debate="selectedSubject.debate"
                :alerts="selectedSubject.alerts"
                :is-analyzing="isAnalyzing"
                :is-debating="isDebating"
                @analyze="handleAnalyzeSubject"
                @trigger-debate="handleTriggerDebateForSubject"
                @view-history="handleViewHistory"
                @add-to-compare="handleAddToCompare"
              />
            </template>
            <template v-else>
              <div class="empty-selection">
                <p>Select a subject from the sidebar to view risk analysis details.</p>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Analytics Tab -->
      <div v-if="activeTab === 'analytics'" class="analytics-tab">
        <div class="tab-placeholder">
          <h3>Analytics</h3>
          <p>Advanced analytics and trend analysis coming soon.</p>
        </div>
      </div>

      <!-- Alerts Tab -->
      <div v-if="activeTab === 'alerts'" class="alerts-tab">
        <AlertsComponent
          :alerts="alerts"
          @acknowledge="handleAcknowledgeAlert"
        />
      </div>

      <!-- Dimensions Tab -->
      <div v-if="activeTab === 'dimensions'" class="dimensions-tab">
        <DimensionsComponent
          :dimensions="dimensions"
          :scope-id="currentScope?.id"
          @dimension-updated="handleDimensionUpdated"
        />
      </div>

      <!-- Debates Tab -->
      <div v-if="activeTab === 'debates'" class="debates-tab">
        <div class="tab-placeholder">
          <h3>Debates</h3>
          <p>Configure Red Team vs Blue Team adversarial debate contexts for risk assessment validation.</p>
        </div>
      </div>

      <!-- Learnings Tab -->
      <div v-if="activeTab === 'learnings'" class="learnings-tab">
        <LearningsComponent
          :learnings="pendingLearnings"
          @approve="handleApproveLearning"
          @reject="handleRejectLearning"
        />
      </div>

      <!-- Settings Tab -->
      <div v-if="activeTab === 'settings'" class="settings-tab">
        <SettingsComponent
          :scope="currentScope"
          :scopes="scopes"
          @select-scope="handleSelectScope"
          @update-scope="handleUpdateScope"
        />
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>

    <!-- Create Subject Modal -->
    <CreateSubjectModal
      ref="createSubjectModalRef"
      :is-open="showCreateSubjectModal"
      :scope-id="currentScope?.id || null"
      @close="showCreateSubjectModal = false"
      @create="handleCreateSubject"
    />

    <!-- Scenario/What-If Modal -->
    <ScenarioModal
      :is-visible="showScenarioModal"
      :scope-id="currentScope?.id || null"
      :dimensions="dimensions"
      @close="showScenarioModal = false"
    />

    <!-- History Modal -->
    <HistoryModal
      :is-visible="showHistoryModal"
      :subject-id="historySubjectId"
      :subject-name="historySubjectName"
      @close="showHistoryModal = false"
    />

    <!-- Compare Modal -->
    <CompareModal
      :is-visible="showCompareModal"
      :subjects="subjects"
      :composite-scores="compositeScores"
      @close="showCompareModal = false"
    />

    <!-- Analysis Progress Modal -->
    <AnalysisProgressModal
      ref="analysisProgressRef"
      :is-visible="showAnalysisProgress"
      :subject-identifier="analysisSubjectIdentifier"
      :task-id="analysisTaskId"
      :mode="analysisMode"
      @close="handleAnalysisProgressClose"
      @cancel="handleAnalysisProgressCancel"
    />

    <!-- LLM Selector Modal -->
    <LLMSelectorModal
      :is-open="showLLMSelector"
      @close="showLLMSelector = false"
      @select="handleLLMSelection"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRiskDashboardStore } from '@/stores/riskDashboardStore';
import { riskDashboardService } from '@/services/riskDashboardService';
import RiskSidebar from './RiskSidebar.vue';
import RiskDetailView from './RiskDetailView.vue';
import AlertsComponent from './AlertsComponent.vue';
import DimensionsComponent from './DimensionsComponent.vue';
import LearningsComponent from './LearningsComponent.vue';
import SettingsComponent from './SettingsComponent.vue';
import CreateSubjectModal from '@/views/risk/components/CreateSubjectModal.vue';
import ScenarioModal from './ScenarioModal.vue';
import HistoryModal from './HistoryModal.vue';
import CompareModal from './CompareModal.vue';
import AnalysisProgressModal from './AnalysisProgressModal.vue';
import LLMSelectorModal from '@/components/LLMSelectorModal.vue';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { useLLMPreferencesStore } from '@/stores/llmPreferencesStore';
import type { CreateSubjectRequest, RiskDimension, ExecutiveSummary } from '@/types/risk-agent';

// LocalStorage key for Risk dashboard LLM preference
const RISK_LLM_STORAGE_KEY = 'risk-dashboard-llm';

interface RiskLLMPreference {
  provider: string;
  model: string;
}

interface Props {
  conversation?: { id: string; agentName?: string; organizationSlug?: string } | null;
  agent?: { id?: string; slug?: string; name?: string; organizationSlug?: string | string[] } | null;
}

const props = defineProps<Props>();

const store = useRiskDashboardStore();
const executionContextStore = useExecutionContextStore();
const llmStore = useLLMPreferencesStore();

// UI State
const activeTab = ref('overview');
const showCreateSubjectModal = ref(false);
const showScenarioModal = ref(false);
const showHistoryModal = ref(false);
const historySubjectId = ref<string | null>(null);
const historySubjectName = ref('');
const showCompareModal = ref(false);
const createSubjectModalRef = ref<InstanceType<typeof CreateSubjectModal> | null>(null);
const showLLMSelector = ref(false);

// Analysis Progress Modal State
const showAnalysisProgress = ref(false);
const analysisSubjectIdentifier = ref('');
const analysisTaskId = ref<string | undefined>(undefined);
const analysisMode = ref<'analysis' | 'debate' | 'summary'>('analysis');
const analysisProgressRef = ref<InstanceType<typeof AnalysisProgressModal> | null>(null);
const isDebating = ref(false);

// Executive Summary State
const executiveSummary = ref<ExecutiveSummary | null>(null);

// Transform snake_case API response to camelCase for ExecutiveSummary
function transformExecutiveSummary(data: Record<string, unknown>): ExecutiveSummary {
  return {
    id: data.id as string,
    scopeId: (data.scopeId ?? data.scope_id) as string,
    summaryType: (data.summaryType ?? data.summary_type) as 'daily' | 'weekly' | 'ad-hoc',
    content: data.content as ExecutiveSummary['content'],
    generatedAt: (data.generatedAt ?? data.generated_at) as string,
    expiresAt: (data.expiresAt ?? data.expires_at) as string | null,
  };
}


// Computed from store
const currentScope = computed(() => store.currentScope);
const scopes = computed(() => store.scopes);
const subjects = computed(() => store.subjects);
const compositeScores = computed(() => store.compositeScores);
const selectedSubject = computed(() => store.selectedSubject);
const dimensions = computed(() => store.dimensions);
const alerts = computed(() => store.alerts);
const pendingLearnings = computed(() => store.pendingLearnings);
const stats = computed(() => store.stats);
const isLoading = computed(() => store.isLoading);
const isAnalyzing = computed(() => store.isAnalyzing);
const error = computed(() => store.error);

// LLM display for header
const currentLLMDisplay = computed(() => {
  const provider = llmStore.selectedProvider || executionContextStore.contextOrNull?.provider;
  const model = llmStore.selectedModel || executionContextStore.contextOrNull?.model;
  if (provider && model) {
    // Shorten model name for display
    const shortModel = model.split('/').pop() || model;
    return `${provider} - ${shortModel}`;
  }
  return 'Select Model';
});

// Tabs with dynamic badges
const tabs = computed(() => [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'alerts', label: 'Alerts', badge: alerts.value.length > 0 ? alerts.value.length : undefined },
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'debates', label: 'Debates' },
  { id: 'learnings', label: 'Learnings', badge: pendingLearnings.value.length > 0 ? pendingLearnings.value.length : undefined },
  { id: 'settings', label: 'Settings' },
]);

// Formatting helpers
function normalizeScore(score: number): number {
  if (isNaN(score) || score === null || score === undefined) return 0;
  return score > 1 ? score / 100 : score;
}

function formatScore(score: number): string {
  if (isNaN(score) || score === null || score === undefined) return '0%';
  const normalized = normalizeScore(score);
  return (normalized * 100).toFixed(0) + '%';
}

function formatSummaryDate(dateString?: string): string {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

function formatChangeValue(change: number): string {
  // Handle various scales the LLM might return:
  // - 0.05 = 5% (0-1 scale)
  // - 5 = 5% (0-100 scale)
  // - 500 = 5% (LLM mistakenly multiplied by 100)
  // - 50000 = 5% (LLM multiplied by 10000)
  let normalized = Math.abs(change);

  // If value is unreasonably large, divide down
  while (normalized > 200) {
    normalized = normalized / 100;
  }

  // If value is in 0-1 range, convert to percentage
  if (normalized <= 1) {
    normalized = normalized * 100;
  }

  return normalized.toFixed(1) + '%';
}

// Event handlers
async function handleRefresh() {
  store.setLoading(true);
  store.clearError();
  try {
    // Load scopes first
    const scopesResponse = await riskDashboardService.listScopes({ isActive: true });
    if (scopesResponse.content) {
      store.setScopes(scopesResponse.content);

      // If no current scope, select the first one
      if (!currentScope.value && scopesResponse.content.length > 0) {
        await handleSelectScope(scopesResponse.content[0].id);
      } else if (currentScope.value) {
        // Reload current scope data
        await loadScopeData(currentScope.value.id);
      }
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to refresh data');
  } finally {
    store.setLoading(false);
  }
}

async function loadScopeData(scopeId: string) {
  // Load all scope data in parallel for better performance
  const [subjectsResponse, scoresResponse, dimensionsResponse, alertsResponse, learningsResponse, statsResponse, summaryResponse] = await Promise.all([
    riskDashboardService.listSubjects({ scopeId, isActive: true }),
    riskDashboardService.listCompositeScores({ scopeId }),
    riskDashboardService.listDimensions(scopeId),
    riskDashboardService.listAlerts({ scopeId, unacknowledgedOnly: true }),
    riskDashboardService.listLearnings({ scopeId, status: 'pending' }),
    riskDashboardService.getDashboardStats(scopeId),
    riskDashboardService.getLatestSummary(scopeId),
  ]);

  if (subjectsResponse.content) {
    store.setSubjects(subjectsResponse.content);
  }

  if (scoresResponse.content) {
    store.setCompositeScores(scoresResponse.content);
  }

  if (dimensionsResponse.content) {
    store.setDimensions(dimensionsResponse.content);
  }

  if (alertsResponse.content) {
    store.setAlerts(alertsResponse.content);
  }

  if (learningsResponse.content) {
    store.setPendingLearnings(learningsResponse.content);
  }

  // Set stats from API response
  if (statsResponse.content) {
    store.setStats(statsResponse.content);
  }

  // Set executive summary (transform snake_case to camelCase)
  if (summaryResponse.content) {
    executiveSummary.value = transformExecutiveSummary(summaryResponse.content as unknown as Record<string, unknown>);
  } else {
    executiveSummary.value = null;
  }
}

async function handleSelectScope(scopeId: string) {
  const scope = scopes.value.find(s => s.id === scopeId);
  if (scope) {
    store.setCurrentScope(scope);
    store.setSelectedSubject(null);
    await loadScopeData(scopeId);
  }
}

function handleDailyChangeClick(change: { subject: string; subjectId?: string; change: number; direction: string }) {
  console.log('[RiskAgentPane] Daily change clicked:', change);
  if (change.subjectId) {
    handleSelectSubject(change.subjectId);
  } else {
    console.warn('[RiskAgentPane] No subjectId for change:', change.subject);
    store.setError(`Cannot navigate to ${change.subject} - no subject ID available`);
  }
}

async function handleSelectSubject(subjectId: string) {
  console.log('[RiskAgentPane] handleSelectSubject called with:', subjectId);
  if (!subjectId) {
    console.warn('[RiskAgentPane] No subjectId provided');
    return;
  }

  // Switch to overview tab to show the subject detail
  activeTab.value = 'overview';

  store.setLoading(true);
  store.clearError();
  try {
    const response = await riskDashboardService.getSubjectDetail(subjectId);
    if (response.content) {
      const raw = response.content as {
        subject?: unknown;
        compositeScore?: unknown;
        assessments?: unknown[];
        debate?: unknown;
        alerts?: unknown[];
        evaluations?: unknown[];
      };
      // API may return subject: null when subject fetch fails - use subject from sidebar list if available
      if (!raw.subject) {
        const fromList = subjects.value.find((s) => s.id === subjectId);
        if (fromList) {
          raw.subject = fromList;
        }
      }
      // Normalize to SelectedSubjectState shape - ensure no undefined props for RiskDetailView
      store.setSelectedSubject({
        subject: raw.subject ?? null,
        compositeScore: raw.compositeScore ?? null,
        assessments: Array.isArray(raw.assessments) ? raw.assessments : [],
        debate: raw.debate ?? null,
        alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
        evaluations: Array.isArray(raw.evaluations) ? raw.evaluations : [],
      });
    } else {
      store.setError(`Subject detail returned no content. Response: ${JSON.stringify(response).substring(0, 200)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.setError(`Failed to load subject: ${msg}`);
  } finally {
    store.setLoading(false);
  }
}

async function handleAnalyzeSubject(subjectId: string) {
  const subject = subjects.value.find(s => s.id === subjectId);
  analysisSubjectIdentifier.value = subject?.identifier || subject?.name || subjectId;

  const taskId = crypto.randomUUID();
  analysisTaskId.value = taskId;
  analysisMode.value = 'analysis';
  showAnalysisProgress.value = true;
  store.setAnalyzing(true);
  store.clearError();

  if (analysisProgressRef.value) {
    analysisProgressRef.value.handleProgressEvent({
      step: 'initializing',
      message: `Starting analysis for ${analysisSubjectIdentifier.value}`,
      progress: 5,
    });
  }

  try {
    const response = await riskDashboardService.analyzeSubject(subjectId, { forceRefresh: true, taskId });

    if (!response.success) {
      const responseAny = response as { error?: { message?: string }; metadata?: { reason?: string } };
      const errorMsg = responseAny.error?.message || responseAny.metadata?.reason || 'Analysis failed';
      analysisProgressRef.value?.setError(errorMsg);
      store.setError(errorMsg);
      return;
    }

    const content = response.content as unknown as Record<string, unknown> | null;
    if (content) {
      const noDataAvailable = (content.noDataAvailable ?? content.no_data_available ?? false) as boolean;
      const noDataReason = (content.noDataReason ?? content.no_data_reason ?? '') as string;

      if (noDataAvailable) {
        analysisProgressRef.value?.setNoData(noDataReason || `No recent market data available for ${analysisSubjectIdentifier.value}`);
        return;
      }

      const overallScore = (content.overallScore ?? content.overall_score ?? 0) as number;
      const confidence = (content.confidence ?? 0) as number;
      const assessmentCount = (content.assessmentCount ?? content.assessment_count ?? 0) as number;
      const debateTriggered = (content.debateTriggered ?? content.debate_triggered ?? false) as boolean;

      analysisProgressRef.value?.setComplete({
        overallScore,
        confidence,
        assessmentCount,
        debateTriggered,
      });

      await handleSelectSubject(subjectId);
      if (currentScope.value) {
        const scoresResponse = await riskDashboardService.listCompositeScores({ scopeId: currentScope.value.id });
        if (scoresResponse.content) {
          store.setCompositeScores(scoresResponse.content);
        }
      }
    } else {
      analysisProgressRef.value?.setError('Analysis returned no content');
      store.setError('Analysis returned no content');
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Analysis failed';
    analysisProgressRef.value?.setError(errorMsg);
    store.setError(errorMsg);
  } finally {
    store.setAnalyzing(false);
  }
}

async function handleTriggerDebateForSubject(subjectId: string) {
  const compositeScore = selectedSubject.value?.compositeScore;
  if (!compositeScore) {
    store.setError('No composite score available for debate. Please run analysis first.');
    return;
  }

  const subject = subjects.value.find(s => s.id === subjectId);
  analysisSubjectIdentifier.value = subject?.identifier || subject?.name || subjectId;

  const taskId = crypto.randomUUID();
  analysisTaskId.value = taskId;
  analysisMode.value = 'debate';
  showAnalysisProgress.value = true;
  isDebating.value = true;
  store.clearError();

  if (analysisProgressRef.value) {
    analysisProgressRef.value.handleProgressEvent({
      step: 'debate-starting',
      message: `Starting Red vs Blue debate for ${analysisSubjectIdentifier.value}`,
      progress: 5,
    });
  }

  try {
    const result = await riskDashboardService.triggerDebate(subjectId, { taskId });

    if (!result.success) {
      const errorMsg = result.error?.message || 'Failed to trigger debate';
      analysisProgressRef.value?.setError(errorMsg);
      store.setError(errorMsg);
      return;
    }

    const debate = result.content as unknown as Record<string, unknown> | null;
    if (debate && analysisProgressRef.value) {
      const scoreAdjustment = (debate.scoreAdjustment ?? debate.score_adjustment ?? 0) as number;
      const baseScore = selectedSubject.value?.compositeScore?.score ?? 0;
      const finalScore = baseScore + scoreAdjustment;
      const displayScore = finalScore > 1 ? finalScore : finalScore * 100;

      analysisProgressRef.value.setComplete({
        overallScore: displayScore,
        confidence: 0,
        assessmentCount: 3,
        debateTriggered: true,
      });
    }

    await handleSelectSubject(subjectId);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to trigger debate';
    analysisProgressRef.value?.setError(errorMsg);
    store.setError(errorMsg);
  } finally {
    isDebating.value = false;
  }
}

function handleAnalysisProgressClose() {
  showAnalysisProgress.value = false;
  analysisSubjectIdentifier.value = '';
  analysisTaskId.value = undefined;
  analysisMode.value = 'analysis';
}

function handleAnalysisProgressCancel() {
  showAnalysisProgress.value = false;
  store.setAnalyzing(false);
  isDebating.value = false;
}

function handleOpenScenario(_subjectId: string) {
  if (!currentScope.value) {
    store.setError('No scope selected');
    return;
  }

  // Open the scenario modal - it uses the scope's dimensions for configuration
  showScenarioModal.value = true;
}

function handleViewHistory(subjectId: string) {
  // Find the subject to get its name
  const subject = subjects.value.find(s => s.id === subjectId);
  historySubjectId.value = subjectId;
  historySubjectName.value = subject?.name || subject?.identifier || 'Subject';
  showHistoryModal.value = true;
}

function handleAddToCompare(subjectId: string) {
  // Add to comparison set and open compare modal
  const comparisonSet = store.comparisonSubjectIds || [];
  if (!comparisonSet.includes(subjectId)) {
    store.addToComparison(subjectId);
  }

  // Open the compare modal
  showCompareModal.value = true;
}

async function handleAcknowledgeAlert(alertId: string) {
  try {
    await riskDashboardService.acknowledgeAlert(alertId);
    store.removeAlert(alertId);
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to acknowledge alert');
  }
}

async function handleApproveLearning(learningId: string) {
  try {
    await riskDashboardService.approveLearning(learningId);
    store.removePendingLearning(learningId);
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to approve learning');
  }
}

async function handleRejectLearning(learningId: string) {
  try {
    await riskDashboardService.rejectLearning(learningId);
    store.removePendingLearning(learningId);
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to reject learning');
  }
}

async function handleUpdateScope(updates: Record<string, unknown>) {
  if (!currentScope.value) return;

  try {
    const response = await riskDashboardService.updateScope(currentScope.value.id, updates);
    if (response.content) {
      store.updateScope(currentScope.value.id, response.content);
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to update scope');
  }
}

async function handleCreateSubject(params: CreateSubjectRequest) {
  createSubjectModalRef.value?.setSubmitting(true);

  try {
    const response = await riskDashboardService.createSubject(params);

    if (response.success && response.content) {
      store.addSubject(response.content);
      showCreateSubjectModal.value = false;
      // Reload scope data to get updated stats
      if (currentScope.value) {
        await loadScopeData(currentScope.value.id);
      }
    } else {
      createSubjectModalRef.value?.setError('Failed to create subject');
    }
  } catch (err) {
    createSubjectModalRef.value?.setError(err instanceof Error ? err.message : 'Failed to create subject');
  }
}

function handleDimensionUpdated(dimension: RiskDimension) {
  // Update the dimension in the store
  store.updateDimension(dimension.id, dimension);
}

function clearError() {
  store.clearError();
}

// LLM Selector handlers
function handleLLMSelection(provider: string, model: string) {
  showLLMSelector.value = false;
  llmStore.setPreferences(provider, model);
  // Save selection to localStorage for persistence
  const pref: RiskLLMPreference = { provider, model };
  localStorage.setItem(RISK_LLM_STORAGE_KEY, JSON.stringify(pref));
  // Update execution context so the selection is used in API calls
  executionContextStore.setLLM(provider, model);
}

// Load saved LLM preference from localStorage
function loadSavedLLMPreference() {
  const saved = localStorage.getItem(RISK_LLM_STORAGE_KEY);
  if (saved) {
    try {
      const pref: RiskLLMPreference = JSON.parse(saved);
      if (pref.provider && pref.model && executionContextStore.isInitialized) {
        executionContextStore.setLLM(pref.provider, pref.model);
      }
    } catch {
      // Invalid JSON, ignore
    }
  }
}

// Helper to extract org from agent (handles array or string)
function getAgentOrg(): string | null {
  const agentOrg = props.agent?.organizationSlug;
  if (Array.isArray(agentOrg)) {
    return agentOrg[0] || null;
  }
  return agentOrg || null;
}

// Initialize on mount
onMounted(async () => {
  // Priority: agent's org > conversation's org
  // The agent knows what org it belongs to
  const agentOrg = getAgentOrg();
  const conversationOrg = props.conversation?.organizationSlug;
  const effectiveOrg = agentOrg || conversationOrg;

  if (effectiveOrg) {
    console.log('[RiskAgentPane] Setting org:', effectiveOrg, '(agent:', agentOrg, ', conversation:', conversationOrg, ')');
    riskDashboardService.setOrgSlug(effectiveOrg);
  }
  if (props.agent?.slug) {
    riskDashboardService.setAgentSlug(props.agent.slug);
  }

  // Generate a dashboard conversation ID for this session
  // This prevents creating multiple conversations for parallel API calls
  const dashboardConvId = crypto.randomUUID();
  riskDashboardService.setDashboardConversationId(dashboardConvId);
  console.log('[RiskAgentPane] Set dashboard conversation ID:', dashboardConvId);

  // Load saved LLM preference
  loadSavedLLMPreference();

  handleRefresh();
});

// Watch for agent/conversation changes
watch(
  [() => props.agent?.slug, () => props.agent?.organizationSlug, () => props.conversation?.organizationSlug],
  ([agentSlug, agentOrg, conversationOrg]) => {
    // Priority: agent's org > conversation's org
    const effectiveAgentOrg = Array.isArray(agentOrg) ? agentOrg[0] : agentOrg;
    const effectiveOrg = effectiveAgentOrg || conversationOrg;

    if (effectiveOrg) {
      console.log('[RiskAgentPane] Setting org:', effectiveOrg, '(agent:', effectiveAgentOrg, ', conversation:', conversationOrg, ')');
      riskDashboardService.setOrgSlug(effectiveOrg);
    }
    if (agentSlug) {
      riskDashboardService.setAgentSlug(agentSlug);
      // Reset conversation ID when switching agents so each gets its own session
      const newConvId = crypto.randomUUID();
      riskDashboardService.setDashboardConversationId(newConvId);
      console.log('[RiskAgentPane] Reset dashboard conversation ID for new agent:', newConvId);
    }
    if (agentSlug || effectiveOrg) {
      handleRefresh();
    }
  }
);
</script>

<style scoped>
.risk-agent-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  background: var(--ion-background-color, #f5f5f5);
  color: var(--ion-text-color, #333);
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--ion-card-background, #fff);
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.agent-info h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
}

.scope-info {
  font-size: 0.875rem;
  color: var(--ion-color-medium, #666);
}

.scope-label {
  margin-right: 0.25rem;
}

.header-controls {
  display: flex;
  gap: 0.5rem;
}

.control-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.analyze-btn {
  background: color-mix(in srgb, var(--ion-color-primary, #a87c4f) 70%, transparent);
  color: white;
}

.analyze-btn:hover:not(:disabled) {
  background: var(--ion-color-primary, #a87c4f);
}

.refresh-btn {
  background: var(--ion-color-light, #f4f5f8);
  color: var(--ion-text-color, #333);
}

.refresh-btn:hover:not(:disabled) {
  background: var(--ion-color-light-shade, #d7d8da);
}

/* Dark mode: light gray button needs dark text for legibility */
html.ion-palette-dark .risk-agent-pane .refresh-btn {
  color: #1a1a1a;
}

html.ion-palette-dark .risk-agent-pane .refresh-btn:hover:not(:disabled) {
  color: #1a1a1a;
}

.llm-selector-btn {
  background: var(--ion-card-background, #fff);
  color: var(--ion-text-color, #333);
  border: 1px solid var(--ion-border-color, #e0e0e0);
  font-size: 0.8125rem;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.llm-selector-btn:hover {
  background: var(--ion-color-light, #f4f5f8);
  border-color: var(--ion-color-primary, #3880ff);
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--ion-color-danger-tint, #ff9999);
  color: var(--ion-color-danger-contrast, #fff);
}

.error-icon {
  font-size: 1.25rem;
}

.close-error-btn {
  margin-left: auto;
  background: transparent;
  border: none;
  color: inherit;
  font-size: 1.25rem;
  cursor: pointer;
}

.stats-summary {
  display: flex;
  gap: 1rem;
  padding: 1rem;
}

.summary-card {
  flex: 0 0 auto;
  min-width: 100px;
  padding: 0.75rem 1rem;
  background: var(--ion-card-background, #fff);
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.summary-card.critical {
  background: var(--ion-color-danger-muted-bg, #f5d5d5);
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.summary-card.warning {
  background: var(--ion-color-warning-muted-bg, #f5e6d5);
  color: var(--ion-color-warning-muted-contrast, #8b6644);
}

.summary-value {
  font-size: 1.5rem;
  font-weight: 600;
}

.summary-value.warning {
  color: var(--ion-color-warning, #ffc409);
}

.summary-label {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  margin-top: 0.25rem;
}

.tabs-nav {
  display: flex;
  gap: 0;
  padding: 0 1rem;
  background: var(--ion-card-background, #fff);
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.tab-btn {
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--ion-color-medium, #666);
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
}

.tab-btn:hover {
  color: var(--ion-text-color, #333);
}

.tab-btn.active {
  color: var(--ion-color-primary, #3880ff);
  border-bottom-color: var(--ion-color-primary, #3880ff);
}

.tab-badge {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.125rem 0.5rem;
  background: var(--ion-color-danger, #eb445a);
  color: white;
  border-radius: 10px;
  font-size: 0.75rem;
}

.tab-content {
  flex: 0 0 auto;
  padding: 1rem;
}

.overview-layout {
  display: flex;
  gap: 1rem;
  min-height: 60vh;
}

.main-content {
  flex: 1;
  min-width: 0;
}

.empty-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--ion-color-medium, #666);
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  z-index: 100;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--ion-border-color, #e0e0e0);
  border-top-color: var(--ion-color-primary, #3880ff);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Executive Summary Section */
.executive-summary-section {
  margin: 1rem;
  padding: 1rem;
  background: linear-gradient(135deg, var(--ion-card-background, #fff) 0%, var(--ion-color-light-shade, #f7ede7) 100%);
  border-radius: 12px;
  border: 1px solid var(--ion-border-color, #e0e0e0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

html.ion-palette-dark .risk-agent-pane .executive-summary-section,
html[data-theme="dark"] .risk-agent-pane .executive-summary-section {
  background: linear-gradient(135deg, var(--dark-bg-tertiary) 0%, var(--dark-bg-quaternary) 100%);
  border-color: var(--dark-border-subtle);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.executive-summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.executive-summary-header .header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.executive-summary-header .header-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.summary-status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  flex-shrink: 0;
}

.summary-status-badge.critical { background: var(--ion-color-danger-muted-bg, #f5d5d5); color: var(--ion-color-danger-muted-contrast, #8b4444); }
.summary-status-badge.high { background: var(--ion-color-warning-muted-bg, #f5e6d5); color: var(--ion-color-warning-muted-contrast, #8b6644); }
.summary-status-badge.medium { background: var(--ion-color-medium-muted-bg, #f5f0d5); color: var(--ion-color-medium-muted-contrast, #7a7344); }
.summary-status-badge.low { background: var(--ion-color-success-muted-bg, #d5e8d5); color: var(--ion-color-success-muted-contrast, #447744); }
.summary-status-badge.stable { background: rgba(21, 128, 61, 0.15); color: #166534; }

.summary-headline {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ion-text-color, #333);
}

.action-btn-small {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: var(--ion-color-light, #f4f5f8);
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ion-text-color, #333);
  transition: all 0.2s;
  white-space: nowrap;
}

.action-btn-small:hover:not(:disabled) {
  background: var(--ion-color-medium-tint, #e8e8e8);
  border-color: var(--ion-color-medium, #999);
}

.action-btn-small:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

html.ion-palette-dark .risk-agent-pane .action-btn-small,
html[data-theme="dark"] .risk-agent-pane .action-btn-small {
  background: var(--dark-bg-secondary);
  border-color: var(--dark-border-primary);
  color: var(--dark-text-secondary);
}

html.ion-palette-dark .risk-agent-pane .action-btn-small:hover:not(:disabled),
html[data-theme="dark"] .risk-agent-pane .action-btn-small:hover:not(:disabled) {
  background: var(--dark-bg-quaternary);
  border-color: var(--dark-accent-primary-light);
}

.spinner-tiny {
  width: 12px;
  height: 12px;
  border: 2px solid var(--ion-border-color, #e0e0e0);
  border-top-color: var(--ion-color-primary, #3880ff);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.summary-content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 1024px) {
  .summary-content-grid {
    grid-template-columns: 1fr 1fr;
  }
  .summary-changes {
    grid-column: span 2;
  }
}

@media (max-width: 768px) {
  .summary-content-grid {
    grid-template-columns: 1fr;
  }
  .summary-changes {
    grid-column: span 1;
  }
}

.summary-findings h4,
.summary-changes h4,
.summary-recommendations h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ion-color-medium, #666);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.summary-findings ul,
.summary-recommendations ul {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  line-height: 1.6;
}

.summary-changes ul {
  margin: 0;
  padding-left: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  list-style: none;
}

.summary-findings li,
.summary-changes li,
.summary-recommendations li {
  margin-bottom: 0.25rem;
  color: var(--ion-text-color, #333);
}

.summary-changes li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-left: 0;
  list-style: none;
}

.summary-changes .change-subject {
  font-weight: 500;
}

.summary-changes .change-indicator {
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.summary-changes .change-indicator.up {
  color: var(--ion-color-danger-muted-contrast, #8b4444);
  background: var(--ion-color-danger-muted-bg, #f5d5d5);
}

.summary-changes .change-indicator.down {
  color: var(--ion-color-success-muted-contrast, #447744);
  background: var(--ion-color-success-muted-bg, #d5e8d5);
}

.summary-changes .no-changes {
  margin: 0;
  font-style: italic;
  color: var(--ion-color-medium, #999);
}

.summary-changes li.clickable {
  cursor: pointer;
  transition: background-color 0.15s ease;
  padding: 0.25rem 0.5rem;
  margin: 0 -0.5rem;
  border-radius: 4px;
}

.summary-changes li.clickable:hover {
  background-color: var(--ion-color-light, #f4f5f8);
}

.summary-changes li.clickable .change-subject {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.summary-meta {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  text-align: right;
}

.executive-summary-placeholder {
  margin: 1rem;
  padding: 1.5rem;
  background: var(--ion-card-background, #fff);
  border-radius: 12px;
  border: 1px dashed var(--ion-border-color, #e0e0e0);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: var(--ion-color-medium, #666);
}

.generate-summary-btn {
  padding: 0.5rem 1rem;
  background: var(--ion-color-primary, #3880ff);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.generate-summary-btn:hover:not(:disabled) {
  background: var(--ion-color-primary-shade, #3171e0);
}

.generate-summary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tab-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  color: var(--ion-color-medium, #666);
}

.tab-placeholder h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: var(--ion-text-color, #333);
}

.tab-placeholder p {
  margin: 0;
  font-size: 0.875rem;
}
</style>
