/**
 * Test Scenario Store - State + Synchronous Mutations Only
 *
 * Manages state for the Test Data Builder UI (Phase 4).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  TestScenario,
  TestScenarioSummary,
  InjectionPoint,
  TestScenarioStatus,
} from '@/services/predictionDashboardService';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface PendingTestData {
  signals: unknown[];
  predictors: unknown[];
  predictions: unknown[];
  outcomes: unknown[];
  learningItems: unknown[];
}

interface TestScenarioFilters {
  status: TestScenarioStatus | 'all';
  targetId: string | null;
}

interface LiveMonitorEvent {
  id: string;
  timestamp: string;
  type: 'signal' | 'predictor' | 'prediction' | 'outcome' | 'evaluation' | 'learning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

// Phase 8: Replay Test Types
type ReplayTestStatus = 'pending' | 'snapshot_created' | 'running' | 'completed' | 'failed' | 'restored';
type RollbackDepth = 'predictions' | 'predictors' | 'signals';

interface ReplayTestResults {
  total_comparisons: number;
  direction_matches: number;
  original_correct_count: number;
  replay_correct_count: number;
  improvements: number;
  original_accuracy_pct: number | null;
  replay_accuracy_pct: number | null;
  accuracy_delta: number | null;
  total_pnl_original: number | null;
  total_pnl_replay: number | null;
  pnl_delta: number | null;
  avg_confidence_diff: number | null;
}

interface ReplayTestSummary {
  id: string;
  organization_slug: string;
  name: string;
  description: string | null;
  status: ReplayTestStatus;
  rollback_depth: RollbackDepth;
  rollback_to: string;
  universe_id: string | null;
  target_ids: string[] | null;
  results: ReplayTestResults | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  // Summary metrics
  total_comparisons: number;
  direction_matches: number;
  original_correct_count: number;
  replay_correct_count: number;
  improvements: number;
  original_accuracy_pct: number | null;
  replay_accuracy_pct: number | null;
  total_pnl_original: number | null;
  total_pnl_replay: number | null;
  total_pnl_improvement: number | null;
  avg_confidence_diff: number | null;
}

interface ReplayAffectedRecords {
  table_name: string;
  record_ids: string[];
  row_count: number;
}

interface ReplayTestState {
  // Replay tests list
  replayTests: ReplayTestSummary[];

  // Selected replay test
  selectedReplayTestId: string | null;

  // Preview data
  previewAffectedRecords: ReplayAffectedRecords[];
  previewTotalRecords: number;

  // Loading states
  isLoadingReplayTests: boolean;
  isRunningReplayTest: boolean;
  isPreviewingReplay: boolean;

  // Modal state
  showCreateReplayModal: boolean;
  showReplayResultsModal: boolean;
}

interface TestScenarioState {
  // Scenarios list
  scenarios: TestScenarioSummary[];

  // Selected/active scenario
  selectedScenarioId: string | null;
  currentScenario: TestScenario | null;

  // Pending data (not yet executed)
  pendingData: PendingTestData;

  // Conversation history for the builder
  conversationHistory: ConversationMessage[];

  // Filters
  filters: TestScenarioFilters;

  // Pagination
  page: number;
  pageSize: number;
  totalCount: number;

  // Loading/error state
  isLoading: boolean;
  isExecuting: boolean;
  isRunningTier: boolean;
  error: string | null;

  // Tier execution status
  lastTierResult: {
    tier: string;
    success: boolean;
    itemsProcessed: number;
    itemsCreated: number;
    errors: string[];
  } | null;

  // Live monitor
  liveMonitorEvents: LiveMonitorEvent[];
  liveMonitorEnabled: boolean;
  liveMonitorMaxEvents: number;

  // Phase 8: Replay tests
  replay: ReplayTestState;
}

export const useTestScenarioStore = defineStore('testScenario', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<TestScenarioState>({
    scenarios: [],
    selectedScenarioId: null,
    currentScenario: null,
    pendingData: {
      signals: [],
      predictors: [],
      predictions: [],
      outcomes: [],
      learningItems: [],
    },
    conversationHistory: [],
    filters: {
      status: 'all',
      targetId: null,
    },
    page: 1,
    pageSize: 20,
    totalCount: 0,
    isLoading: false,
    isExecuting: false,
    isRunningTier: false,
    error: null,
    lastTierResult: null,
    liveMonitorEvents: [],
    liveMonitorEnabled: false,
    liveMonitorMaxEvents: 100,
    // Phase 8: Replay tests
    replay: {
      replayTests: [],
      selectedReplayTestId: null,
      previewAffectedRecords: [],
      previewTotalRecords: 0,
      isLoadingReplayTests: false,
      isRunningReplayTest: false,
      isPreviewingReplay: false,
      showCreateReplayModal: false,
      showReplayResultsModal: false,
    },
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const scenarios = computed(() => state.value.scenarios);
  const selectedScenarioId = computed(() => state.value.selectedScenarioId);
  const currentScenario = computed(() => state.value.currentScenario);
  const pendingData = computed(() => state.value.pendingData);
  const conversationHistory = computed(() => state.value.conversationHistory);
  const filters = computed(() => state.value.filters);
  const page = computed(() => state.value.page);
  const pageSize = computed(() => state.value.pageSize);
  const totalCount = computed(() => state.value.totalCount);
  const isLoading = computed(() => state.value.isLoading);
  const isExecuting = computed(() => state.value.isExecuting);
  const isRunningTier = computed(() => state.value.isRunningTier);
  const error = computed(() => state.value.error);
  const lastTierResult = computed(() => state.value.lastTierResult);
  const liveMonitorEvents = computed(() => state.value.liveMonitorEvents);
  const liveMonitorEnabled = computed(() => state.value.liveMonitorEnabled);

  // Derived state
  const selectedScenario = computed(() =>
    state.value.scenarios.find((s) => s.id === state.value.selectedScenarioId)
  );

  const filteredScenarios = computed(() => {
    let result = state.value.scenarios;

    if (state.value.filters.status !== 'all') {
      result = result.filter((s) => s.status === state.value.filters.status);
    }

    if (state.value.filters.targetId) {
      result = result.filter((s) => s.target_id === state.value.filters.targetId);
    }

    return result;
  });

  const activeScenarios = computed(() =>
    state.value.scenarios.filter((s) => s.status === 'active')
  );

  const runningScenarios = computed(() =>
    state.value.scenarios.filter((s) => s.status === 'running')
  );

  const completedScenarios = computed(() =>
    state.value.scenarios.filter((s) => s.status === 'completed')
  );

  const pendingDataCount = computed(() => {
    const pd = state.value.pendingData;
    return (
      pd.signals.length +
      pd.predictors.length +
      pd.predictions.length +
      pd.outcomes.length +
      pd.learningItems.length
    );
  });

  const hasPendingData = computed(() => pendingDataCount.value > 0);

  const totalPages = computed(() =>
    Math.ceil(state.value.totalCount / state.value.pageSize)
  );

  const hasMore = computed(() => state.value.page < totalPages.value);

  // Stats from scenario summaries
  const totalTestData = computed(() => {
    return state.value.scenarios.reduce((total, s) => {
      const counts = s.data_counts || {};
      return (
        total +
        Object.values(counts).reduce((sum, count) => sum + (count || 0), 0)
      );
    }, 0);
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getScenarioById(id: string): TestScenarioSummary | undefined {
    return state.value.scenarios.find((s) => s.id === id);
  }

  function getScenariosByStatus(status: TestScenarioStatus): TestScenarioSummary[] {
    return state.value.scenarios.filter((s) => s.status === status);
  }

  function getScenarioDataCount(scenarioId: string, table: InjectionPoint): number {
    const scenario = state.value.scenarios.find((s) => s.id === scenarioId);
    return scenario?.data_counts?.[table] || 0;
  }

  // ============================================================================
  // MUTATIONS (Synchronous Only)
  // ============================================================================

  function setLoading(loading: boolean) {
    state.value.isLoading = loading;
  }

  function setExecuting(executing: boolean) {
    state.value.isExecuting = executing;
  }

  function setRunningTier(running: boolean) {
    state.value.isRunningTier = running;
  }

  function setError(error: string | null) {
    state.value.error = error;
  }

  function clearError() {
    state.value.error = null;
  }

  // Scenario mutations
  function setScenarios(scenarios: TestScenarioSummary[]) {
    state.value.scenarios = scenarios;
  }

  function addScenario(scenario: TestScenarioSummary) {
    const idx = state.value.scenarios.findIndex((s) => s.id === scenario.id);
    if (idx >= 0) {
      state.value.scenarios[idx] = scenario;
    } else {
      state.value.scenarios.unshift(scenario);
    }
  }

  function updateScenario(id: string, updates: Partial<TestScenarioSummary>) {
    const idx = state.value.scenarios.findIndex((s) => s.id === id);
    if (idx >= 0) {
      state.value.scenarios[idx] = { ...state.value.scenarios[idx], ...updates };
    }
  }

  function removeScenario(id: string) {
    state.value.scenarios = state.value.scenarios.filter((s) => s.id !== id);
    if (state.value.selectedScenarioId === id) {
      state.value.selectedScenarioId = null;
      state.value.currentScenario = null;
    }
  }

  // Selection mutations
  function selectScenario(id: string | null) {
    state.value.selectedScenarioId = id;
    if (!id) {
      state.value.currentScenario = null;
    }
  }

  function setCurrentScenario(scenario: TestScenario | null) {
    state.value.currentScenario = scenario;
    if (scenario) {
      state.value.selectedScenarioId = scenario.id;
    }
  }

  // Pending data mutations
  function setPendingSignals(signals: unknown[]) {
    state.value.pendingData.signals = signals;
  }

  function addPendingSignal(signal: unknown) {
    state.value.pendingData.signals.push(signal);
  }

  function setPendingPredictors(predictors: unknown[]) {
    state.value.pendingData.predictors = predictors;
  }

  function addPendingPredictor(predictor: unknown) {
    state.value.pendingData.predictors.push(predictor);
  }

  function setPendingPredictions(predictions: unknown[]) {
    state.value.pendingData.predictions = predictions;
  }

  function addPendingPrediction(prediction: unknown) {
    state.value.pendingData.predictions.push(prediction);
  }

  function setPendingOutcomes(outcomes: unknown[]) {
    state.value.pendingData.outcomes = outcomes;
  }

  function addPendingOutcome(outcome: unknown) {
    state.value.pendingData.outcomes.push(outcome);
  }

  function setPendingLearningItems(items: unknown[]) {
    state.value.pendingData.learningItems = items;
  }

  function addPendingLearningItem(item: unknown) {
    state.value.pendingData.learningItems.push(item);
  }

  function clearPendingData() {
    state.value.pendingData = {
      signals: [],
      predictors: [],
      predictions: [],
      outcomes: [],
      learningItems: [],
    };
  }

  // Conversation mutations
  function addConversationMessage(message: ConversationMessage) {
    state.value.conversationHistory.push(message);
  }

  function clearConversationHistory() {
    state.value.conversationHistory = [];
  }

  // Tier result mutations
  function setLastTierResult(result: TestScenarioState['lastTierResult']) {
    state.value.lastTierResult = result;
  }

  function clearLastTierResult() {
    state.value.lastTierResult = null;
  }

  // Live monitor mutations
  function addLiveMonitorEvent(event: Omit<LiveMonitorEvent, 'id' | 'timestamp'>) {
    const newEvent: LiveMonitorEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };
    state.value.liveMonitorEvents.unshift(newEvent);
    // Keep only the last N events
    if (state.value.liveMonitorEvents.length > state.value.liveMonitorMaxEvents) {
      state.value.liveMonitorEvents = state.value.liveMonitorEvents.slice(
        0,
        state.value.liveMonitorMaxEvents
      );
    }
  }

  function clearLiveMonitorEvents() {
    state.value.liveMonitorEvents = [];
  }

  function setLiveMonitorEnabled(enabled: boolean) {
    state.value.liveMonitorEnabled = enabled;
  }

  function toggleLiveMonitor() {
    state.value.liveMonitorEnabled = !state.value.liveMonitorEnabled;
  }

  // Filter mutations
  function setFilters(filters: Partial<TestScenarioFilters>) {
    state.value.filters = { ...state.value.filters, ...filters };
  }

  function clearFilters() {
    state.value.filters = {
      status: 'all',
      targetId: null,
    };
  }

  // Pagination mutations
  function setPage(page: number) {
    state.value.page = page;
  }

  function setPageSize(pageSize: number) {
    state.value.pageSize = pageSize;
  }

  function setTotalCount(count: number) {
    state.value.totalCount = count;
  }

  // Reset
  function resetState() {
    state.value = {
      scenarios: [],
      selectedScenarioId: null,
      currentScenario: null,
      pendingData: {
        signals: [],
        predictors: [],
        predictions: [],
        outcomes: [],
        learningItems: [],
      },
      conversationHistory: [],
      filters: {
        status: 'all',
        targetId: null,
      },
      page: 1,
      pageSize: 20,
      totalCount: 0,
      isLoading: false,
      isExecuting: false,
      isRunningTier: false,
      error: null,
      lastTierResult: null,
      liveMonitorEvents: [],
      liveMonitorEnabled: false,
      liveMonitorMaxEvents: 100,
      // Phase 8: Replay tests
      replay: {
        replayTests: [],
        selectedReplayTestId: null,
        previewAffectedRecords: [],
        previewTotalRecords: 0,
        isLoadingReplayTests: false,
        isRunningReplayTest: false,
        isPreviewingReplay: false,
        showCreateReplayModal: false,
        showReplayResultsModal: false,
      },
    };
  }

  function resetBuilder() {
    state.value.currentScenario = null;
    state.value.selectedScenarioId = null;
    state.value.pendingData = {
      signals: [],
      predictors: [],
      predictions: [],
      outcomes: [],
      learningItems: [],
    };
    state.value.conversationHistory = [];
    state.value.lastTierResult = null;
    state.value.error = null;
    state.value.liveMonitorEvents = [];
  }

  // ============================================================================
  // PHASE 8: REPLAY TEST COMPUTED/GETTERS
  // ============================================================================

  // Helper to safely get replay tests array (guards against null/undefined)
  const getReplayTestsArray = () => state.value.replay?.replayTests ?? [];

  const replayTests = computed(() => getReplayTestsArray());
  const selectedReplayTestId = computed(() => state.value.replay?.selectedReplayTestId ?? null);
  const previewAffectedRecords = computed(() => state.value.replay?.previewAffectedRecords ?? []);
  const previewTotalRecords = computed(() => state.value.replay?.previewTotalRecords ?? 0);
  const isLoadingReplayTests = computed(() => state.value.replay?.isLoadingReplayTests ?? false);
  const isRunningReplayTest = computed(() => state.value.replay?.isRunningReplayTest ?? false);
  const isPreviewingReplay = computed(() => state.value.replay?.isPreviewingReplay ?? false);
  const showCreateReplayModal = computed(() => state.value.replay?.showCreateReplayModal ?? false);
  const showReplayResultsModal = computed(() => state.value.replay?.showReplayResultsModal ?? false);

  const selectedReplayTest = computed(() => {
    const tests = getReplayTestsArray();
    const selectedId = state.value.replay?.selectedReplayTestId;
    return selectedId ? tests.find((t) => t.id === selectedId) : undefined;
  });

  const completedReplayTests = computed(() =>
    getReplayTestsArray().filter((t) => t.status === 'completed')
  );

  const pendingReplayTests = computed(() =>
    getReplayTestsArray().filter((t) => t.status === 'pending' || t.status === 'snapshot_created')
  );

  const runningReplayTest = computed(() =>
    getReplayTestsArray().find((t) => t.status === 'running')
  );

  function getReplayTestById(id: string): ReplayTestSummary | undefined {
    return getReplayTestsArray().find((t) => t.id === id);
  }

  // ============================================================================
  // PHASE 8: REPLAY TEST MUTATIONS
  // ============================================================================

  function setReplayTests(tests: ReplayTestSummary[]) {
    // Guard against null/undefined - always set to an array
    state.value.replay.replayTests = Array.isArray(tests) ? tests : [];
  }

  function addReplayTest(test: ReplayTestSummary) {
    const tests = getReplayTestsArray();
    const idx = tests.findIndex((t) => t.id === test.id);
    if (idx >= 0) {
      state.value.replay.replayTests[idx] = test;
    } else {
      state.value.replay.replayTests = [test, ...tests];
    }
  }

  function updateReplayTest(id: string, updates: Partial<ReplayTestSummary>) {
    const tests = getReplayTestsArray();
    const idx = tests.findIndex((t) => t.id === id);
    if (idx >= 0) {
      state.value.replay.replayTests[idx] = { ...tests[idx], ...updates };
    }
  }

  function removeReplayTest(id: string) {
    state.value.replay.replayTests = getReplayTestsArray().filter((t) => t.id !== id);
    if (state.value.replay.selectedReplayTestId === id) {
      state.value.replay.selectedReplayTestId = null;
    }
  }

  function selectReplayTest(id: string | null) {
    state.value.replay.selectedReplayTestId = id;
  }

  function setPreviewAffectedRecords(records: ReplayAffectedRecords[], totalRecords: number) {
    state.value.replay.previewAffectedRecords = records;
    state.value.replay.previewTotalRecords = totalRecords;
  }

  function clearPreviewAffectedRecords() {
    state.value.replay.previewAffectedRecords = [];
    state.value.replay.previewTotalRecords = 0;
  }

  function setLoadingReplayTests(loading: boolean) {
    state.value.replay.isLoadingReplayTests = loading;
  }

  function setRunningReplayTest(running: boolean) {
    state.value.replay.isRunningReplayTest = running;
  }

  function setPreviewingReplay(previewing: boolean) {
    state.value.replay.isPreviewingReplay = previewing;
  }

  function setShowCreateReplayModal(show: boolean) {
    state.value.replay.showCreateReplayModal = show;
  }

  function setShowReplayResultsModal(show: boolean) {
    state.value.replay.showReplayResultsModal = show;
  }

  function resetReplayState() {
    state.value.replay = {
      replayTests: [],
      selectedReplayTestId: null,
      previewAffectedRecords: [],
      previewTotalRecords: 0,
      isLoadingReplayTests: false,
      isRunningReplayTest: false,
      isPreviewingReplay: false,
      showCreateReplayModal: false,
      showReplayResultsModal: false,
    };
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    scenarios,
    selectedScenarioId,
    currentScenario,
    pendingData,
    conversationHistory,
    filters,
    page,
    pageSize,
    totalCount,
    isLoading,
    isExecuting,
    isRunningTier,
    error,
    lastTierResult,
    liveMonitorEvents,
    liveMonitorEnabled,

    // Derived state
    selectedScenario,
    filteredScenarios,
    activeScenarios,
    runningScenarios,
    completedScenarios,
    pendingDataCount,
    hasPendingData,
    totalPages,
    hasMore,
    totalTestData,

    // Getters (functions)
    getScenarioById,
    getScenariosByStatus,
    getScenarioDataCount,

    // Mutations
    setLoading,
    setExecuting,
    setRunningTier,
    setError,
    clearError,
    setScenarios,
    addScenario,
    updateScenario,
    removeScenario,
    selectScenario,
    setCurrentScenario,
    setPendingSignals,
    addPendingSignal,
    setPendingPredictors,
    addPendingPredictor,
    setPendingPredictions,
    addPendingPrediction,
    setPendingOutcomes,
    addPendingOutcome,
    setPendingLearningItems,
    addPendingLearningItem,
    clearPendingData,
    addConversationMessage,
    clearConversationHistory,
    setLastTierResult,
    clearLastTierResult,
    setFilters,
    clearFilters,
    setPage,
    setPageSize,
    setTotalCount,
    resetState,
    resetBuilder,

    // Live monitor mutations
    addLiveMonitorEvent,
    clearLiveMonitorEvents,
    setLiveMonitorEnabled,
    toggleLiveMonitor,

    // Phase 8: Replay test state (computed)
    replayTests,
    selectedReplayTestId,
    previewAffectedRecords,
    previewTotalRecords,
    isLoadingReplayTests,
    isRunningReplayTest,
    isPreviewingReplay,
    showCreateReplayModal,
    showReplayResultsModal,
    selectedReplayTest,
    completedReplayTests,
    pendingReplayTests,
    runningReplayTest,

    // Phase 8: Replay test getters
    getReplayTestById,

    // Phase 8: Replay test mutations
    setReplayTests,
    addReplayTest,
    updateReplayTest,
    removeReplayTest,
    selectReplayTest,
    setPreviewAffectedRecords,
    clearPreviewAffectedRecords,
    setLoadingReplayTests,
    setRunningReplayTest,
    setPreviewingReplay,
    setShowCreateReplayModal,
    setShowReplayResultsModal,
    resetReplayState,
  };
});
