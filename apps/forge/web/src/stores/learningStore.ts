/**
 * Learning Store - State + Synchronous Mutations Only
 *
 * Manages state for Prediction Learnings (Phase 11).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ============================================================================
// TYPES
// ============================================================================

export type LearningScopeLevel = 'runner' | 'domain' | 'universe' | 'target';
export type LearningType = 'rule' | 'pattern' | 'weight_adjustment' | 'threshold' | 'avoid';
export type LearningSourceType = 'human' | 'ai_suggested' | 'ai_approved';
export type LearningStatus = 'active' | 'superseded' | 'inactive';

// Agent Activity Types (Phase 7 - Agent Self-Modification Notifications)
export type AgentModificationType = 'rule_added' | 'rule_removed' | 'weight_changed' | 'journal_entry' | 'status_change';

export interface AgentActivityItem {
  id: string;
  analystId: string;
  analystName?: string;
  modificationType: AgentModificationType;
  summary: string;
  details: Record<string, unknown>;
  triggerReason: string;
  performanceContext: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

// Learning Session Types (Phase 7 - Bidirectional Learning)
export type ExchangeOutcome = 'adopted' | 'rejected' | 'noted' | 'pending';
export type ExchangeInitiator = 'user' | 'agent';

export interface LearningExchange {
  id: string;
  analystId: string;
  analystName?: string;
  initiatedBy: ExchangeInitiator;
  question: string;
  response: string | null;
  contextDiff: Record<string, unknown>;
  performanceEvidence: Record<string, unknown>;
  outcome: ExchangeOutcome;
  adoptionDetails: Record<string, unknown> | null;
  createdAt: string;
}

export interface ForkComparisonReport {
  analystId: string;
  analystName: string;
  period: string;
  userFork: {
    currentBalance: number;
    totalPnl: number;
    winRate: number;
    winCount: number;
    lossCount: number;
  };
  agentFork: {
    currentBalance: number;
    totalPnl: number;
    winRate: number;
    winCount: number;
    lossCount: number;
  };
  contextDiffs: Array<{
    field: string;
    userValue: string;
    agentValue: string;
  }>;
  divergentPredictions: Array<{
    predictionId: string;
    targetSymbol: string;
    userDirection: string;
    agentDirection: string;
    userConfidence: number;
    agentConfidence: number;
    actualOutcome: string;
  }>;
}

export interface LearningSession {
  isActive: boolean;
  analystId: string | null;
  comparisonReport: ForkComparisonReport | null;
  exchanges: LearningExchange[];
  pendingUserQuestion: string;
}

export interface PredictionLearning {
  id: string;
  title: string;
  scopeLevel: LearningScopeLevel;
  domain: string | null;
  universeId: string | null;
  targetId: string | null;
  analystId: string | null;
  learningType: LearningType;
  content: string;
  sourceType: LearningSourceType;
  status: LearningStatus;
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LearningQueueItem {
  id: string;
  suggestedTitle: string;
  suggestedContent: string;
  suggestedLearningType: LearningType;
  suggestedScopeLevel: LearningScopeLevel;
  suggestedDomain: string | null;
  suggestedUniverseId: string | null;
  suggestedTargetId: string | null;
  suggestedAnalystId: string | null;
  sourceEvaluationId: string | null;
  sourceMissedOpportunityId: string | null;
  confidence: number;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  finalLearningId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

interface LearningFilters {
  scopeLevel: LearningScopeLevel | null;
  learningType: LearningType | null;
  sourceType: LearningSourceType | null;
  status: LearningStatus | null;
  universeId: string | null;
  targetId: string | null;
  analystId: string | null;
}

interface LearningQueueFilters {
  status: 'pending' | 'approved' | 'rejected' | 'modified' | null;
  universeId: string | null;
  targetId: string | null;
}

interface LearningState {
  learnings: PredictionLearning[];
  learningQueue: LearningQueueItem[];
  selectedLearningId: string | null;
  selectedQueueItemId: string | null;
  filters: LearningFilters;
  queueFilters: LearningQueueFilters;
  isLoading: boolean;
  isLoadingQueue: boolean;
  error: string | null;
  // Phase 7: Agent Activity (self-modification notifications)
  agentActivity: AgentActivityItem[];
  isLoadingAgentActivity: boolean;
  // Phase 7: Learning Session (bidirectional learning)
  learningSession: LearningSession;
  isLoadingSession: boolean;
}

export const useLearningStore = defineStore('learning', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<LearningState>({
    learnings: [],
    learningQueue: [],
    selectedLearningId: null,
    selectedQueueItemId: null,
    filters: {
      scopeLevel: null,
      learningType: null,
      sourceType: null,
      status: null,
      universeId: null,
      targetId: null,
      analystId: null,
    },
    queueFilters: {
      status: null,
      universeId: null,
      targetId: null,
    },
    isLoading: false,
    isLoadingQueue: false,
    error: null,
    // Phase 7: Agent Activity
    agentActivity: [],
    isLoadingAgentActivity: false,
    // Phase 7: Learning Session
    learningSession: {
      isActive: false,
      analystId: null,
      comparisonReport: null,
      exchanges: [],
      pendingUserQuestion: '',
    },
    isLoadingSession: false,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const learnings = computed(() => state.value.learnings);
  const learningQueue = computed(() => state.value.learningQueue);
  const selectedLearningId = computed(() => state.value.selectedLearningId);
  const selectedQueueItemId = computed(() => state.value.selectedQueueItemId);
  const filters = computed(() => state.value.filters);
  const queueFilters = computed(() => state.value.queueFilters);
  const isLoading = computed(() => state.value.isLoading);
  const isLoadingQueue = computed(() => state.value.isLoadingQueue);
  const error = computed(() => state.value.error);

  const selectedLearning = computed(() => {
    const learnings = Array.isArray(state.value.learnings) ? state.value.learnings : [];
    return learnings.find((l) => l.id === state.value.selectedLearningId);
  });

  const selectedQueueItem = computed(() => {
    const queue = Array.isArray(state.value.learningQueue) ? state.value.learningQueue : [];
    return queue.find((q) => q.id === state.value.selectedQueueItemId);
  });

  const filteredLearnings = computed(() => {
    let result = Array.isArray(state.value.learnings) ? state.value.learnings : [];

    if (state.value.filters.scopeLevel) {
      result = result.filter((l) => l.scopeLevel === state.value.filters.scopeLevel);
    }

    if (state.value.filters.learningType) {
      result = result.filter((l) => l.learningType === state.value.filters.learningType);
    }

    if (state.value.filters.sourceType) {
      result = result.filter((l) => l.sourceType === state.value.filters.sourceType);
    }

    if (state.value.filters.status) {
      result = result.filter((l) => l.status === state.value.filters.status);
    }

    if (state.value.filters.universeId) {
      result = result.filter((l) => l.universeId === state.value.filters.universeId);
    }

    if (state.value.filters.targetId) {
      result = result.filter((l) => l.targetId === state.value.filters.targetId);
    }

    if (state.value.filters.analystId) {
      result = result.filter((l) => l.analystId === state.value.filters.analystId);
    }

    return result;
  });

  const filteredLearningQueue = computed(() => {
    let result = Array.isArray(state.value.learningQueue) ? state.value.learningQueue : [];

    if (state.value.queueFilters.status) {
      result = result.filter((q) => q.status === state.value.queueFilters.status);
    }

    if (state.value.queueFilters.universeId) {
      result = result.filter((q) => q.suggestedUniverseId === state.value.queueFilters.universeId);
    }

    if (state.value.queueFilters.targetId) {
      result = result.filter((q) => q.suggestedTargetId === state.value.queueFilters.targetId);
    }

    return result;
  });

  const activeLearnings = computed(() => {
    const learnings = Array.isArray(state.value.learnings) ? state.value.learnings : [];
    return learnings.filter((l) => l.status === 'active');
  });

  const pendingQueueItems = computed(() => {
    const queue = Array.isArray(state.value.learningQueue) ? state.value.learningQueue : [];
    return queue.filter((q) => q.status === 'pending');
  });

  const learningsByType = computed(() => {
    const grouped: Record<LearningType, PredictionLearning[]> = {
      rule: [],
      pattern: [],
      weight_adjustment: [],
      threshold: [],
      avoid: [],
    };
    const learnings = Array.isArray(state.value.learnings) ? state.value.learnings : [];
    for (const learning of learnings) {
      grouped[learning.learningType].push(learning);
    }
    return grouped;
  });

  const learningsByScopeLevel = computed(() => {
    const grouped: Record<LearningScopeLevel, PredictionLearning[]> = {
      runner: [],
      domain: [],
      universe: [],
      target: [],
    };
    const learnings = Array.isArray(state.value.learnings) ? state.value.learnings : [];
    for (const learning of learnings) {
      grouped[learning.scopeLevel].push(learning);
    }
    return grouped;
  });

  // Phase 7: Agent Activity computed
  const agentActivity = computed(() => state.value.agentActivity);
  const isLoadingAgentActivity = computed(() => state.value.isLoadingAgentActivity);

  const unacknowledgedAgentActivity = computed(() => {
    const activity = Array.isArray(state.value.agentActivity) ? state.value.agentActivity : [];
    return activity.filter((a) => !a.acknowledged);
  });

  const unacknowledgedActivityCount = computed(() => unacknowledgedAgentActivity.value.length);

  // Phase 7: Learning Session computed
  const learningSession = computed(() => state.value.learningSession);
  const isLoadingSession = computed(() => state.value.isLoadingSession);

  const isLearningSessionActive = computed(() => state.value.learningSession.isActive);

  const sessionComparisonReport = computed(() => state.value.learningSession.comparisonReport);

  const sessionExchanges = computed(() => state.value.learningSession.exchanges);

  const pendingExchanges = computed(() => {
    return state.value.learningSession.exchanges.filter((e) => e.outcome === 'pending');
  });

  const pendingExchangeCount = computed(() => pendingExchanges.value.length);

  // Combined badge count for HITL (unacknowledged activity + pending exchanges)
  const hitlBadgeCount = computed(() => {
    return unacknowledgedActivityCount.value + pendingExchangeCount.value;
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getLearningById(id: string): PredictionLearning | undefined {
    const learnings = Array.isArray(state.value.learnings) ? state.value.learnings : [];
    return learnings.find((l) => l.id === id);
  }

  function getQueueItemById(id: string): LearningQueueItem | undefined {
    const queue = Array.isArray(state.value.learningQueue) ? state.value.learningQueue : [];
    return queue.find((q) => q.id === id);
  }

  function getLearningsForUniverse(universeId: string): PredictionLearning[] {
    const learnings = Array.isArray(state.value.learnings) ? state.value.learnings : [];
    return learnings.filter((l) => l.universeId === universeId);
  }

  function getLearningsForTarget(targetId: string): PredictionLearning[] {
    const learnings = Array.isArray(state.value.learnings) ? state.value.learnings : [];
    return learnings.filter((l) => l.targetId === targetId);
  }

  function getLearningsForAnalyst(analystId: string): PredictionLearning[] {
    const learnings = Array.isArray(state.value.learnings) ? state.value.learnings : [];
    return learnings.filter((l) => l.analystId === analystId);
  }

  // ============================================================================
  // MUTATIONS (Synchronous Only)
  // ============================================================================

  function setLoading(loading: boolean) {
    state.value.isLoading = loading;
  }

  function setLoadingQueue(loading: boolean) {
    state.value.isLoadingQueue = loading;
  }

  function setError(error: string | null) {
    state.value.error = error;
  }

  function clearError() {
    state.value.error = null;
  }

  // Learning mutations
  function setLearnings(learnings: PredictionLearning[]) {
    state.value.learnings = Array.isArray(learnings) ? learnings : [];
  }

  function addLearning(learning: PredictionLearning) {
    if (!Array.isArray(state.value.learnings)) {
      state.value.learnings = [];
    }
    const idx = state.value.learnings.findIndex((l) => l.id === learning.id);
    if (idx >= 0) {
      state.value.learnings[idx] = learning;
    } else {
      state.value.learnings.push(learning);
    }
  }

  function updateLearning(id: string, updates: Partial<PredictionLearning>) {
    const learnings = Array.isArray(state.value.learnings) ? state.value.learnings : [];
    const idx = learnings.findIndex((l) => l.id === id);
    if (idx >= 0) {
      state.value.learnings[idx] = { ...state.value.learnings[idx], ...updates };
    }
  }

  function removeLearning(id: string) {
    const learnings = Array.isArray(state.value.learnings) ? state.value.learnings : [];
    state.value.learnings = learnings.filter((l) => l.id !== id);
    if (state.value.selectedLearningId === id) {
      state.value.selectedLearningId = null;
    }
  }

  // Queue mutations
  function setLearningQueue(queue: LearningQueueItem[]) {
    state.value.learningQueue = Array.isArray(queue) ? queue : [];
  }

  function addQueueItem(item: LearningQueueItem) {
    if (!Array.isArray(state.value.learningQueue)) {
      state.value.learningQueue = [];
    }
    const idx = state.value.learningQueue.findIndex((q) => q.id === item.id);
    if (idx >= 0) {
      state.value.learningQueue[idx] = item;
    } else {
      state.value.learningQueue.push(item);
    }
  }

  function updateQueueItem(id: string, updates: Partial<LearningQueueItem>) {
    const queue = Array.isArray(state.value.learningQueue) ? state.value.learningQueue : [];
    const idx = queue.findIndex((q) => q.id === id);
    if (idx >= 0) {
      state.value.learningQueue[idx] = { ...state.value.learningQueue[idx], ...updates };
    }
  }

  function removeQueueItem(id: string) {
    const queue = Array.isArray(state.value.learningQueue) ? state.value.learningQueue : [];
    state.value.learningQueue = queue.filter((q) => q.id !== id);
    if (state.value.selectedQueueItemId === id) {
      state.value.selectedQueueItemId = null;
    }
  }

  // Selection mutations
  function selectLearning(id: string | null) {
    state.value.selectedLearningId = id;
  }

  function selectQueueItem(id: string | null) {
    state.value.selectedQueueItemId = id;
  }

  // Filter mutations
  function setFilters(filters: Partial<LearningFilters>) {
    state.value.filters = { ...state.value.filters, ...filters };
  }

  function clearFilters() {
    state.value.filters = {
      scopeLevel: null,
      learningType: null,
      sourceType: null,
      status: null,
      universeId: null,
      targetId: null,
      analystId: null,
    };
  }

  function setQueueFilters(filters: Partial<LearningQueueFilters>) {
    state.value.queueFilters = { ...state.value.queueFilters, ...filters };
  }

  function clearQueueFilters() {
    state.value.queueFilters = {
      status: null,
      universeId: null,
      targetId: null,
    };
  }

  // ============================================================================
  // AGENT ACTIVITY MUTATIONS (Phase 7)
  // ============================================================================

  function setLoadingAgentActivity(loading: boolean) {
    state.value.isLoadingAgentActivity = loading;
  }

  function setAgentActivity(activity: AgentActivityItem[]) {
    state.value.agentActivity = Array.isArray(activity) ? activity : [];
  }

  function addAgentActivityItem(item: AgentActivityItem) {
    if (!Array.isArray(state.value.agentActivity)) {
      state.value.agentActivity = [];
    }
    // Add to beginning (most recent first)
    state.value.agentActivity.unshift(item);
  }

  function acknowledgeAgentActivity(id: string) {
    const activity = Array.isArray(state.value.agentActivity) ? state.value.agentActivity : [];
    const idx = activity.findIndex((a) => a.id === id);
    if (idx >= 0) {
      state.value.agentActivity[idx] = {
        ...state.value.agentActivity[idx],
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
      };
    }
  }

  function acknowledgeAllAgentActivity() {
    const now = new Date().toISOString();
    state.value.agentActivity = state.value.agentActivity.map((a) => ({
      ...a,
      acknowledged: true,
      acknowledgedAt: a.acknowledgedAt || now,
    }));
  }

  // ============================================================================
  // LEARNING SESSION MUTATIONS (Phase 7)
  // ============================================================================

  function setLoadingSession(loading: boolean) {
    state.value.isLoadingSession = loading;
  }

  function startLearningSession(analystId: string) {
    state.value.learningSession = {
      isActive: true,
      analystId,
      comparisonReport: null,
      exchanges: [],
      pendingUserQuestion: '',
    };
  }

  function setComparisonReport(report: ForkComparisonReport | null) {
    state.value.learningSession.comparisonReport = report;
  }

  function setSessionExchanges(exchanges: LearningExchange[]) {
    state.value.learningSession.exchanges = Array.isArray(exchanges) ? exchanges : [];
  }

  function addSessionExchange(exchange: LearningExchange) {
    if (!Array.isArray(state.value.learningSession.exchanges)) {
      state.value.learningSession.exchanges = [];
    }
    state.value.learningSession.exchanges.push(exchange);
  }

  function updateExchangeOutcome(
    exchangeId: string,
    outcome: ExchangeOutcome,
    adoptionDetails?: Record<string, unknown>,
  ) {
    const exchanges = state.value.learningSession.exchanges;
    const idx = exchanges.findIndex((e) => e.id === exchangeId);
    if (idx >= 0) {
      state.value.learningSession.exchanges[idx] = {
        ...exchanges[idx],
        outcome,
        adoptionDetails: adoptionDetails || null,
      };
    }
  }

  function setExchangeResponse(exchangeId: string, response: string) {
    const exchanges = state.value.learningSession.exchanges;
    const idx = exchanges.findIndex((e) => e.id === exchangeId);
    if (idx >= 0) {
      state.value.learningSession.exchanges[idx] = {
        ...exchanges[idx],
        response,
      };
    }
  }

  function setPendingUserQuestion(question: string) {
    state.value.learningSession.pendingUserQuestion = question;
  }

  function endLearningSession() {
    state.value.learningSession = {
      isActive: false,
      analystId: null,
      comparisonReport: null,
      exchanges: [],
      pendingUserQuestion: '',
    };
  }

  function resetState() {
    state.value = {
      learnings: [],
      learningQueue: [],
      selectedLearningId: null,
      selectedQueueItemId: null,
      filters: {
        scopeLevel: null,
        learningType: null,
        sourceType: null,
        status: null,
        universeId: null,
        targetId: null,
        analystId: null,
      },
      queueFilters: {
        status: null,
        universeId: null,
        targetId: null,
      },
      isLoading: false,
      isLoadingQueue: false,
      error: null,
      // Phase 7: Agent Activity
      agentActivity: [],
      isLoadingAgentActivity: false,
      // Phase 7: Learning Session
      learningSession: {
        isActive: false,
        analystId: null,
        comparisonReport: null,
        exchanges: [],
        pendingUserQuestion: '',
      },
      isLoadingSession: false,
    };
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    learnings,
    learningQueue,
    selectedLearningId,
    selectedQueueItemId,
    filters,
    queueFilters,
    isLoading,
    isLoadingQueue,
    error,

    // Derived state
    selectedLearning,
    selectedQueueItem,
    filteredLearnings,
    filteredLearningQueue,
    activeLearnings,
    pendingQueueItems,
    learningsByType,
    learningsByScopeLevel,

    // Phase 7: Agent Activity (computed)
    agentActivity,
    isLoadingAgentActivity,
    unacknowledgedAgentActivity,
    unacknowledgedActivityCount,

    // Phase 7: Learning Session (computed)
    learningSession,
    isLoadingSession,
    isLearningSessionActive,
    sessionComparisonReport,
    sessionExchanges,
    pendingExchanges,
    pendingExchangeCount,
    hitlBadgeCount,

    // Getters (functions)
    getLearningById,
    getQueueItemById,
    getLearningsForUniverse,
    getLearningsForTarget,
    getLearningsForAnalyst,

    // Mutations
    setLoading,
    setLoadingQueue,
    setError,
    clearError,
    setLearnings,
    addLearning,
    updateLearning,
    removeLearning,
    setLearningQueue,
    addQueueItem,
    updateQueueItem,
    removeQueueItem,
    selectLearning,
    selectQueueItem,
    setFilters,
    clearFilters,
    setQueueFilters,
    clearQueueFilters,
    resetState,

    // Phase 7: Agent Activity Mutations
    setLoadingAgentActivity,
    setAgentActivity,
    addAgentActivityItem,
    acknowledgeAgentActivity,
    acknowledgeAllAgentActivity,

    // Phase 7: Learning Session Mutations
    setLoadingSession,
    startLearningSession,
    setComparisonReport,
    setSessionExchanges,
    addSessionExchange,
    updateExchangeOutcome,
    setExchangeResponse,
    setPendingUserQuestion,
    endLearningSession,
  };
});
