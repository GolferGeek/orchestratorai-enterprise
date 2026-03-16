/**
 * Prediction Store - State + Synchronous Mutations Only
 *
 * Manages state for the Prediction Dashboard (Phase 10).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  Prediction,
  PredictionUniverse,
  PredictionTarget,
  PredictionSnapshot,
  PredictionStrategy,
} from '@/services/predictionDashboardService';

interface PredictionFilters {
  universeId: string | null;
  targetId: string | null;
  status: 'all' | 'active' | 'resolved' | 'expired' | 'cancelled';
  domain: string | null;
  outcome: 'correct' | 'incorrect' | 'pending' | null;
}

interface PredictionState {
  // Core entities
  universes: PredictionUniverse[];
  targets: PredictionTarget[];
  predictions: Prediction[];
  strategies: PredictionStrategy[];

  // Selected items
  selectedUniverseId: string | null;
  selectedPredictionId: string | null;
  selectedTargetId: string | null;

  // Detail data
  currentSnapshot: PredictionSnapshot | null;

  // Filters
  filters: PredictionFilters;

  // Pagination
  page: number;
  pageSize: number;
  totalCount: number;

  // Loading/error state
  isLoading: boolean;
  isLoadingSnapshot: boolean;
  error: string | null;
}

export const usePredictionStore = defineStore('prediction', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<PredictionState>({
    universes: [],
    targets: [],
    predictions: [],
    strategies: [],
    selectedUniverseId: null,
    selectedPredictionId: null,
    selectedTargetId: null,
    currentSnapshot: null,
    filters: {
      universeId: null,
      targetId: null,
      status: 'all',
      domain: null,
      outcome: null,
    },
    page: 1,
    pageSize: 20,
    totalCount: 0,
    isLoading: false,
    isLoadingSnapshot: false,
    error: null,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const universes = computed(() => state.value.universes);
  const targets = computed(() => state.value.targets);
  const predictions = computed(() => state.value.predictions);
  const strategies = computed(() => state.value.strategies);
  const selectedUniverseId = computed(() => state.value.selectedUniverseId);
  const selectedPredictionId = computed(() => state.value.selectedPredictionId);
  const selectedTargetId = computed(() => state.value.selectedTargetId);
  const currentSnapshot = computed(() => state.value.currentSnapshot);
  const filters = computed(() => state.value.filters);
  const page = computed(() => state.value.page);
  const pageSize = computed(() => state.value.pageSize);
  const totalCount = computed(() => state.value.totalCount);
  const isLoading = computed(() => state.value.isLoading);
  const isLoadingSnapshot = computed(() => state.value.isLoadingSnapshot);
  const error = computed(() => state.value.error);

  // Derived state
  const selectedUniverse = computed(() =>
    state.value.universes.find((u) => u.id === state.value.selectedUniverseId)
  );

  const selectedPrediction = computed(() =>
    state.value.predictions.find((p) => p.id === state.value.selectedPredictionId)
  );

  const selectedTarget = computed(() =>
    state.value.targets.find((t) => t.id === state.value.selectedTargetId)
  );

  const filteredPredictions = computed(() => {
    let result = state.value.predictions;

    if (state.value.filters.universeId) {
      result = result.filter((p) => p.universeId === state.value.filters.universeId);
    }

    if (state.value.filters.targetId) {
      result = result.filter((p) => p.targetId === state.value.filters.targetId);
    }

    if (state.value.filters.status !== 'all') {
      result = result.filter((p) => p.status === state.value.filters.status);
    }

    if (state.value.filters.domain) {
      result = result.filter((p) => p.domain === state.value.filters.domain);
    }

    // Apply outcome filter (correct/incorrect/pending)
    if (state.value.filters.outcome) {
      result = result.filter((p) => {
        const outcomeValue = p.outcomeValue;

        // Pending: no outcome value yet
        if (state.value.filters.outcome === 'pending') {
          return outcomeValue === null || outcomeValue === undefined;
        }

        // Must have an outcome value to be correct or incorrect
        if (outcomeValue === null || outcomeValue === undefined) {
          return false;
        }

        // Determine if direction was correct based on outcomeValue
        const actualDirection = outcomeValue > 0 ? 'up' : outcomeValue < 0 ? 'down' : 'flat';
        const wasCorrect = p.direction === actualDirection;

        return state.value.filters.outcome === 'correct' ? wasCorrect : !wasCorrect;
      });
    }

    return result;
  });

  const activePredictions = computed(() =>
    state.value.predictions.filter((p) => p.status === 'active')
  );

  const resolvedPredictions = computed(() =>
    state.value.predictions.filter((p) => p.status === 'resolved')
  );

  const universesByDomain = computed(() => {
    const grouped: Record<string, PredictionUniverse[]> = {};
    for (const universe of state.value.universes) {
      if (!grouped[universe.domain]) {
        grouped[universe.domain] = [];
      }
      grouped[universe.domain].push(universe);
    }
    return grouped;
  });

  const targetsByUniverse = computed(() => {
    const grouped: Record<string, PredictionTarget[]> = {};
    for (const target of state.value.targets) {
      if (!grouped[target.universeId]) {
        grouped[target.universeId] = [];
      }
      grouped[target.universeId].push(target);
    }
    return grouped;
  });

  const totalPages = computed(() =>
    Math.ceil(state.value.totalCount / state.value.pageSize)
  );

  const hasMore = computed(() => state.value.page < totalPages.value);

  // LLM Agreement stats
  const llmAgreementStats = computed(() => {
    const predictions = state.value.predictions.filter(
      (p) => p.llmEnsembleResults
    );

    let fullAgreement = 0;
    let partialAgreement = 0;
    let noAgreement = 0;

    for (const p of predictions) {
      const results = p.llmEnsembleResults;
      if (!results) continue;

      const directions = [
        results.gold?.direction,
        results.silver?.direction,
        results.bronze?.direction,
      ].filter(Boolean);

      const uniqueDirections = new Set(directions);

      if (uniqueDirections.size === 1 && directions.length >= 2) {
        fullAgreement++;
      } else if (uniqueDirections.size === 2 && directions.length === 3) {
        partialAgreement++;
      } else {
        noAgreement++;
      }
    }

    return { fullAgreement, partialAgreement, noAgreement };
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getUniverseById(id: string): PredictionUniverse | undefined {
    return state.value.universes.find((u) => u.id === id);
  }

  function getTargetById(id: string): PredictionTarget | undefined {
    return state.value.targets.find((t) => t.id === id);
  }

  function getPredictionById(id: string): Prediction | undefined {
    return state.value.predictions.find((p) => p.id === id);
  }

  function getStrategyById(id: string): PredictionStrategy | undefined {
    return state.value.strategies.find((s) => s.id === id);
  }

  function getTargetsForUniverse(universeId: string): PredictionTarget[] {
    const targets = state.value?.targets;
    if (!Array.isArray(targets)) {
      return [];
    }
    return targets.filter((t) => t.universeId === universeId);
  }

  function getPredictionsForTarget(targetId: string): Prediction[] {
    return state.value.predictions.filter((p) => p.targetId === targetId);
  }

  // ============================================================================
  // MUTATIONS (Synchronous Only)
  // ============================================================================

  function setLoading(loading: boolean) {
    state.value.isLoading = loading;
  }

  function setLoadingSnapshot(loading: boolean) {
    state.value.isLoadingSnapshot = loading;
  }

  function setError(error: string | null) {
    state.value.error = error;
  }

  function clearError() {
    state.value.error = null;
  }

  // Universe mutations
  function setUniverses(universes: PredictionUniverse[]) {
    state.value.universes = universes;
  }

  function addUniverse(universe: PredictionUniverse) {
    const idx = state.value.universes.findIndex((u) => u.id === universe.id);
    if (idx >= 0) {
      state.value.universes[idx] = universe;
    } else {
      state.value.universes.push(universe);
    }
  }

  function updateUniverse(id: string, updates: Partial<PredictionUniverse>) {
    const idx = state.value.universes.findIndex((u) => u.id === id);
    if (idx >= 0) {
      state.value.universes[idx] = { ...state.value.universes[idx], ...updates };
    }
  }

  function removeUniverse(id: string) {
    state.value.universes = state.value.universes.filter((u) => u.id !== id);
    if (state.value.selectedUniverseId === id) {
      state.value.selectedUniverseId = null;
    }
  }

  // Target mutations
  function setTargets(targets: PredictionTarget[]) {
    state.value.targets = targets;
  }

  function addTarget(target: PredictionTarget) {
    const idx = state.value.targets.findIndex((t) => t.id === target.id);
    if (idx >= 0) {
      state.value.targets[idx] = target;
    } else {
      state.value.targets.push(target);
    }
  }

  function updateTarget(id: string, updates: Partial<PredictionTarget>) {
    const idx = state.value.targets.findIndex((t) => t.id === id);
    if (idx >= 0) {
      state.value.targets[idx] = { ...state.value.targets[idx], ...updates };
    }
  }

  function removeTarget(id: string) {
    state.value.targets = state.value.targets.filter((t) => t.id !== id);
    if (state.value.selectedTargetId === id) {
      state.value.selectedTargetId = null;
    }
  }

  // Prediction mutations
  function setPredictions(predictions: Prediction[]) {
    state.value.predictions = predictions;
  }

  function addPrediction(prediction: Prediction) {
    const idx = state.value.predictions.findIndex((p) => p.id === prediction.id);
    if (idx >= 0) {
      state.value.predictions[idx] = prediction;
    } else {
      state.value.predictions.unshift(prediction);
    }
  }

  function updatePrediction(id: string, updates: Partial<Prediction>) {
    const idx = state.value.predictions.findIndex((p) => p.id === id);
    if (idx >= 0) {
      state.value.predictions[idx] = { ...state.value.predictions[idx], ...updates };
    }
  }

  // Strategy mutations
  function setStrategies(strategies: PredictionStrategy[]) {
    state.value.strategies = strategies;
  }

  // Selection mutations
  function selectUniverse(id: string | null) {
    state.value.selectedUniverseId = id;
    // Update filter when selecting
    state.value.filters.universeId = id;
  }

  function selectPrediction(id: string | null) {
    state.value.selectedPredictionId = id;
    // Clear snapshot when changing selection
    if (id !== state.value.selectedPredictionId) {
      state.value.currentSnapshot = null;
    }
  }

  function selectTarget(id: string | null) {
    state.value.selectedTargetId = id;
    state.value.filters.targetId = id;
  }

  // Snapshot mutations
  function setSnapshot(snapshot: PredictionSnapshot | null) {
    state.value.currentSnapshot = snapshot;
  }

  // Filter mutations
  function setFilters(filters: Partial<PredictionFilters>) {
    state.value.filters = { ...state.value.filters, ...filters };
  }

  function clearFilters() {
    state.value.filters = {
      universeId: null,
      targetId: null,
      status: 'all',
      domain: null,
      outcome: null,
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
      universes: [],
      targets: [],
      predictions: [],
      strategies: [],
      selectedUniverseId: null,
      selectedPredictionId: null,
      selectedTargetId: null,
      currentSnapshot: null,
      filters: {
        universeId: null,
        targetId: null,
        status: 'all',
        domain: null,
        outcome: null,
      },
      page: 1,
      pageSize: 20,
      totalCount: 0,
      isLoading: false,
      isLoadingSnapshot: false,
      error: null,
    };
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    universes,
    targets,
    predictions,
    strategies,
    selectedUniverseId,
    selectedPredictionId,
    selectedTargetId,
    currentSnapshot,
    filters,
    page,
    pageSize,
    totalCount,
    isLoading,
    isLoadingSnapshot,
    error,

    // Derived state
    selectedUniverse,
    selectedPrediction,
    selectedTarget,
    filteredPredictions,
    activePredictions,
    resolvedPredictions,
    universesByDomain,
    targetsByUniverse,
    totalPages,
    hasMore,
    llmAgreementStats,

    // Getters (functions)
    getUniverseById,
    getTargetById,
    getPredictionById,
    getStrategyById,
    getTargetsForUniverse,
    getPredictionsForTarget,

    // Mutations
    setLoading,
    setLoadingSnapshot,
    setError,
    clearError,
    setUniverses,
    addUniverse,
    updateUniverse,
    removeUniverse,
    setTargets,
    addTarget,
    updateTarget,
    removeTarget,
    setPredictions,
    addPrediction,
    updatePrediction,
    setStrategies,
    selectUniverse,
    selectPrediction,
    selectTarget,
    setSnapshot,
    setFilters,
    clearFilters,
    setPage,
    setPageSize,
    setTotalCount,
    resetState,
  };
});
