/**
 * Marketing Swarm Store - State + Synchronous Mutations Only
 *
 * Architecture: Stores contain ONLY state and synchronous mutations
 * For async operations, use marketingSwarmService
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  MarketingContentType,
  MarketingAgent,
  SwarmTask,
  SwarmOutput,
  SwarmEvaluation,
  QueueItem,
  RankedResult,
  SwarmPhase,
  MarketingSwarmUIState,
  AgentCardState,
  SwarmOutputPhase2,
  SwarmEvaluationPhase2,
  RankingEntry,
  FinalistInfo,
} from '@/types/marketing-swarm';

interface MarketingSwarmState {
  // Configuration data (from database)
  contentTypes: MarketingContentType[];
  agents: MarketingAgent[];
  // Note: LLM models are now fetched from /llm/models endpoint
  // and selected directly in the UI, not from agent_llm_configs

  // Current task state
  currentTaskId: string | null;
  currentTask: SwarmTask | null;
  executionQueue: QueueItem[];
  outputs: SwarmOutput[];
  evaluations: SwarmEvaluation[];
  rankedResults: RankedResult[];

  // Phase 2: Enhanced state for dual-track execution
  phase2Outputs: Map<string, SwarmOutputPhase2>;
  phase2Evaluations: Map<string, SwarmEvaluationPhase2>;
  initialRankings: RankingEntry[];
  finalRankings: RankingEntry[];
  finalists: FinalistInfo[];
  currentPhaseOverride: SwarmPhase | null;
  sseConnected: boolean;
  totalOutputsCount: number;
  completedOutputsCount: number;
  completedInitialEvalsCount: number;
  completedFinalEvalsCount: number;

  // UI state
  uiState: MarketingSwarmUIState;
  agentCardStates: Map<string, AgentCardState>;

  // Loading/error state
  isLoading: boolean;
  isExecuting: boolean;
  error: string | null;
}

export const useMarketingSwarmStore = defineStore('marketingSwarm', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<MarketingSwarmState>({
    contentTypes: [],
    agents: [],
    currentTaskId: null,
    currentTask: null,
    executionQueue: [],
    outputs: [],
    evaluations: [],
    rankedResults: [],
    // Phase 2 state
    phase2Outputs: new Map(),
    phase2Evaluations: new Map(),
    initialRankings: [],
    finalRankings: [],
    finalists: [],
    currentPhaseOverride: null,
    sseConnected: false,
    totalOutputsCount: 0,
    completedOutputsCount: 0,
    completedInitialEvalsCount: 0,
    completedFinalEvalsCount: 0,
    uiState: {
      currentView: 'config',
      showDetailedEvaluations: false,
    },
    agentCardStates: new Map(),
    isLoading: false,
    isExecuting: false,
    error: null,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const contentTypes = computed(() => state.value.contentTypes);
  const agents = computed(() => state.value.agents);
  const currentTaskId = computed(() => state.value.currentTaskId);
  const currentTask = computed(() => state.value.currentTask);
  const executionQueue = computed(() => state.value.executionQueue);
  const outputs = computed(() => state.value.outputs);
  const evaluations = computed(() => state.value.evaluations);
  const rankedResults = computed(() => state.value.rankedResults);
  const uiState = computed(() => state.value.uiState);
  const isLoading = computed(() => state.value.isLoading);
  const isExecuting = computed(() => state.value.isExecuting);
  const error = computed(() => state.value.error);

  // Filtered agents by role
  const writerAgents = computed(() =>
    state.value.agents.filter((a) => a.role === 'writer' && a.isActive)
  );

  const editorAgents = computed(() =>
    state.value.agents.filter((a) => a.role === 'editor' && a.isActive)
  );

  const evaluatorAgents = computed(() =>
    state.value.agents.filter((a) => a.role === 'evaluator' && a.isActive)
  );

  // Note: LLM configs are now fetched from /llm/models endpoint
  // and selected directly in the UI, not from agent_llm_configs table

  // Progress calculation
  const progress = computed(() => {
    const total = state.value.executionQueue.length;
    const completed = state.value.executionQueue.filter(
      (q) => q.status === 'completed' || q.status === 'skipped'
    ).length;
    return {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  // Phase 2: Computed properties
  const phase2Outputs = computed(() => Array.from(state.value.phase2Outputs.values()));
  const phase2Evaluations = computed(() => Array.from(state.value.phase2Evaluations.values()));
  const initialRankings = computed(() => state.value.initialRankings);
  const finalRankings = computed(() => state.value.finalRankings);
  const finalists = computed(() => state.value.finalists);
  const sseConnected = computed(() => state.value.sseConnected);
  const totalOutputsCount = computed(() => state.value.totalOutputsCount);
  const completedOutputsCount = computed(() => state.value.completedOutputsCount);

  // Phase 2: Running cost totals
  const totalCost = computed(() => {
    let cost = 0;
    // Sum costs from outputs (writers/editors)
    for (const output of state.value.phase2Outputs.values()) {
      cost += output.llmMetadata?.cost ?? 0;
    }
    // Sum costs from evaluations
    for (const evaluation of state.value.phase2Evaluations.values()) {
      cost += evaluation.llmMetadata?.cost ?? 0;
    }
    return cost;
  });

  const totalTokens = computed(() => {
    let tokens = 0;
    // Sum tokens from outputs (writers/editors)
    for (const output of state.value.phase2Outputs.values()) {
      tokens += output.llmMetadata?.tokensUsed ?? 0;
    }
    // Sum tokens from evaluations
    for (const evaluation of state.value.phase2Evaluations.values()) {
      tokens += evaluation.llmMetadata?.tokensUsed ?? 0;
    }
    return tokens;
  });

  // Current phase based on queue state or Phase 2 override
  const currentPhase = computed<SwarmPhase>(() => {
    // Phase 2: Use phase override from SSE if available
    if (state.value.currentPhaseOverride) {
      return state.value.currentPhaseOverride;
    }

    if (!state.value.currentTask) return 'initializing';
    if (state.value.currentTask.status === 'failed') return 'failed';
    if (state.value.currentTask.status === 'completed') return 'completed';

    const queue = state.value.executionQueue;
    const processingStep = queue.find((q) => q.status === 'processing');

    if (processingStep) {
      switch (processingStep.stepType) {
        case 'write':
          return 'writing';
        case 'edit':
          return 'editing';
        case 'evaluate':
          return 'evaluating_initial';
      }
    }

    const allCompleted = queue.every(
      (q) => q.status === 'completed' || q.status === 'skipped' || q.status === 'failed'
    );
    if (allCompleted && state.value.rankedResults.length > 0) {
      return 'completed';
    }

    return 'initializing';
  });

  // Best output (highest ranked)
  const bestOutput = computed(() => {
    if (state.value.rankedResults.length === 0) return null;
    const bestResult = state.value.rankedResults[0];
    return state.value.outputs.find((o) => o.id === bestResult.outputId) || null;
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getAgentBySlug(slug: string): MarketingAgent | undefined {
    return state.value.agents.find((a) => a.slug === slug);
  }

  // Note: getLLMConfigsForAgent was removed - LLM models are now
  // fetched from /llm/models endpoint

  function getOutputById(id: string): SwarmOutput | undefined {
    return state.value.outputs.find((o) => o.id === id);
  }

  function getEvaluationsForOutput(outputId: string): SwarmEvaluation[] {
    return state.value.evaluations.filter((e) => e.outputId === outputId);
  }

  function getAverageScoreForOutput(outputId: string): number {
    const evals = getEvaluationsForOutput(outputId);
    if (evals.length === 0) return 0;
    return evals.reduce((sum, e) => sum + e.score, 0) / evals.length;
  }

  function getAgentCardState(agentSlug: string, llmConfigId: string): AgentCardState | undefined {
    return state.value.agentCardStates.get(`${agentSlug}:${llmConfigId}`);
  }

  // Phase 2: Get output by ID from phase2Outputs map
  function getPhase2OutputById(id: string): SwarmOutputPhase2 | undefined {
    return state.value.phase2Outputs.get(id);
  }

  // Phase 2: Get evaluations for an output
  function getPhase2EvaluationsForOutput(outputId: string): SwarmEvaluationPhase2[] {
    return Array.from(state.value.phase2Evaluations.values())
      .filter((e) => e.outputId === outputId);
  }

  // Phase 2: Get the winning output (final_rank === 1)
  function getWinnerOutput(): SwarmOutputPhase2 | undefined {
    return Array.from(state.value.phase2Outputs.values())
      .find((o) => o.finalRank === 1);
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

  function setError(error: string | null) {
    state.value.error = error;
  }

  function clearError() {
    state.value.error = null;
  }

  // Configuration data setters
  function setContentTypes(types: MarketingContentType[]) {
    state.value.contentTypes = types;
  }

  function setAgents(agents: MarketingAgent[]) {
    state.value.agents = agents;
  }

  // Note: setAgentLLMConfigs was removed - LLM models are now
  // fetched from /llm/models endpoint

  // Task state setters
  function setCurrentTask(task: SwarmTask | null) {
    state.value.currentTask = task;
    state.value.currentTaskId = task?.taskId || null;
  }

  function setCurrentTaskId(taskId: string | null) {
    state.value.currentTaskId = taskId;
  }

  function setExecutionQueue(queue: QueueItem[]) {
    state.value.executionQueue = queue;
  }

  function updateQueueItem(itemId: string, updates: Partial<QueueItem>) {
    const index = state.value.executionQueue.findIndex((q) => q.id === itemId);
    if (index >= 0) {
      state.value.executionQueue[index] = {
        ...state.value.executionQueue[index],
        ...updates,
      };
    }
  }

  function setOutputs(outputs: SwarmOutput[]) {
    state.value.outputs = outputs;
  }

  function addOutput(output: SwarmOutput) {
    const existing = state.value.outputs.findIndex((o) => o.id === output.id);
    if (existing >= 0) {
      state.value.outputs[existing] = output;
    } else {
      state.value.outputs.push(output);
    }
  }

  function updateOutput(outputId: string, updates: Partial<SwarmOutput>) {
    const index = state.value.outputs.findIndex((o) => o.id === outputId);
    if (index >= 0) {
      state.value.outputs[index] = {
        ...state.value.outputs[index],
        ...updates,
      };
    }
  }

  function setEvaluations(evaluations: SwarmEvaluation[]) {
    state.value.evaluations = evaluations;
  }

  function addEvaluation(evaluation: SwarmEvaluation) {
    state.value.evaluations.push(evaluation);
  }

  function setRankedResults(results: RankedResult[]) {
    state.value.rankedResults = results;
  }

  // UI state setters
  function setUIView(view: 'config' | 'progress' | 'results') {
    state.value.uiState.currentView = view;
  }

  function setSelectedOutput(outputId: string | undefined) {
    state.value.uiState.selectedOutputId = outputId;
  }

  function setCompareOutputs(outputIds: string[]) {
    state.value.uiState.compareOutputIds = outputIds;
  }

  function setShowDetailedEvaluations(show: boolean) {
    state.value.uiState.showDetailedEvaluations = show;
  }

  function setAgentCardState(agentSlug: string, llmConfigId: string, cardState: AgentCardState) {
    state.value.agentCardStates.set(`${agentSlug}:${llmConfigId}`, cardState);
  }

  function updateAgentCardStatus(
    agentSlug: string,
    llmConfigId: string,
    status: AgentCardState['status']
  ) {
    const key = `${agentSlug}:${llmConfigId}`;
    const existing = state.value.agentCardStates.get(key);
    if (existing) {
      state.value.agentCardStates.set(key, { ...existing, status });
    }
  }

  // ============================================================================
  // PHASE 2: SSE/Dual-Track Mutations
  // ============================================================================

  function setPhase(phase: SwarmPhase) {
    state.value.currentPhaseOverride = phase;
  }

  function setSSEConnected(connected: boolean) {
    state.value.sseConnected = connected;
  }

  function setTotalOutputsCount(count: number) {
    state.value.totalOutputsCount = count;
  }

  function upsertPhase2Output(output: SwarmOutputPhase2) {
    // Coerce PostgreSQL NUMERIC strings to actual numbers
    if (output.initialAvgScore != null) output.initialAvgScore = Number(output.initialAvgScore);
    if (output.finalTotalScore != null) output.finalTotalScore = Number(output.finalTotalScore);
    if (output.initialRank != null) output.initialRank = Number(output.initialRank);
    if (output.finalRank != null) output.finalRank = Number(output.finalRank);
    state.value.phase2Outputs.set(output.id, output);
    // Update completed count
    const approvedCount = Array.from(state.value.phase2Outputs.values())
      .filter((o) => o.status === 'approved' || o.status === 'failed').length;
    state.value.completedOutputsCount = approvedCount;
  }

  function upsertPhase2Evaluation(evaluation: SwarmEvaluationPhase2) {
    // Coerce PostgreSQL NUMERIC strings to actual numbers
    if (evaluation.score != null) evaluation.score = Number(evaluation.score);
    if (evaluation.rank != null) evaluation.rank = Number(evaluation.rank);
    if (evaluation.weightedScore != null) evaluation.weightedScore = Number(evaluation.weightedScore);
    state.value.phase2Evaluations.set(evaluation.id, evaluation);
    // Update completed counts by stage
    const allEvals = Array.from(state.value.phase2Evaluations.values());
    state.value.completedInitialEvalsCount = allEvals
      .filter((e) => e.stage === 'initial' && e.status === 'completed').length;
    state.value.completedFinalEvalsCount = allEvals
      .filter((e) => e.stage === 'final' && e.status === 'completed').length;
  }

  function setInitialRankings(rankings: RankingEntry[]) {
    state.value.initialRankings = rankings;
  }

  function setFinalRankings(rankings: RankingEntry[]) {
    state.value.finalRankings = rankings;
  }

  function setFinalists(finalists: FinalistInfo[]) {
    state.value.finalists = finalists;
  }

  // Reset state
  function resetTaskState() {
    state.value.currentTaskId = null;
    state.value.currentTask = null;
    state.value.executionQueue = [];
    state.value.outputs = [];
    state.value.evaluations = [];
    state.value.rankedResults = [];
    // Phase 2 reset
    state.value.phase2Outputs.clear();
    state.value.phase2Evaluations.clear();
    state.value.initialRankings = [];
    state.value.finalRankings = [];
    state.value.finalists = [];
    state.value.currentPhaseOverride = null;
    state.value.sseConnected = false;
    state.value.totalOutputsCount = 0;
    state.value.completedOutputsCount = 0;
    state.value.completedInitialEvalsCount = 0;
    state.value.completedFinalEvalsCount = 0;
    // UI reset
    state.value.agentCardStates.clear();
    state.value.uiState = {
      currentView: 'config',
      showDetailedEvaluations: false,
    };
    state.value.error = null;
  }

  function clearAll() {
    state.value.contentTypes = [];
    state.value.agents = [];
    resetTaskState();
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    contentTypes,
    agents,
    currentTaskId,
    currentTask,
    executionQueue,
    outputs,
    evaluations,
    rankedResults,
    uiState,
    isLoading,
    isExecuting,
    error,

    // Derived state
    writerAgents,
    editorAgents,
    evaluatorAgents,
    progress,
    currentPhase,
    bestOutput,

    // Phase 2: Derived state
    phase2Outputs,
    phase2Evaluations,
    initialRankings,
    finalRankings,
    finalists,
    sseConnected,
    totalOutputsCount,
    completedOutputsCount,
    totalCost,
    totalTokens,

    // Getters (functions)
    getAgentBySlug,
    getOutputById,
    getEvaluationsForOutput,
    getAverageScoreForOutput,
    getAgentCardState,

    // Phase 2: Getters
    getPhase2OutputById,
    getPhase2EvaluationsForOutput,
    getWinnerOutput,

    // Mutations
    setLoading,
    setExecuting,
    setError,
    clearError,
    setContentTypes,
    setAgents,
    setCurrentTask,
    setCurrentTaskId,
    setExecutionQueue,
    updateQueueItem,
    setOutputs,
    addOutput,
    updateOutput,
    setEvaluations,
    addEvaluation,
    setRankedResults,
    setUIView,
    setSelectedOutput,
    setCompareOutputs,
    setShowDetailedEvaluations,
    setAgentCardState,
    updateAgentCardStatus,
    resetTaskState,
    clearAll,

    // Phase 2: Mutations
    setPhase,
    setSSEConnected,
    setTotalOutputsCount,
    upsertPhase2Output,
    upsertPhase2Evaluation,
    setInitialRankings,
    setFinalRankings,
    setFinalists,
  };
});
