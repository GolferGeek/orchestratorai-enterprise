/**
 * Learning Promotion Store - State + Synchronous Mutations Only
 *
 * Manages state for Learning Promotion workflow (Phase 5 Step 3).
 * For async operations, use learningPromotionService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  PromotionCandidate,
  ValidationResult,
  BacktestResult,
  PromotionHistory,
  PromotionStats,
} from '@/services/learningPromotionService';

// ============================================================================
// STATE INTERFACE
// ============================================================================

interface LearningPromotionState {
  candidates: PromotionCandidate[];
  selectedCandidate: PromotionCandidate | null;
  validationResult: ValidationResult | null;
  backtestResult: BacktestResult | null;
  promotionHistory: PromotionHistory[];
  stats: PromotionStats | null;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// STORE DEFINITION
// ============================================================================

export const useLearningPromotionStore = defineStore('learningPromotion', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<LearningPromotionState>({
    candidates: [],
    selectedCandidate: null,
    validationResult: null,
    backtestResult: null,
    promotionHistory: [],
    stats: null,
    isLoading: false,
    error: null,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const candidates = computed(() => state.value.candidates);
  const selectedCandidate = computed(() => state.value.selectedCandidate);
  const validationResult = computed(() => state.value.validationResult);
  const backtestResult = computed(() => state.value.backtestResult);
  const promotionHistory = computed(() => state.value.promotionHistory);
  const stats = computed(() => state.value.stats);
  const isLoading = computed(() => state.value.isLoading);
  const error = computed(() => state.value.error);

  const readyCandidates = computed(() =>
    state.value.candidates.filter((c) => c.readyForPromotion)
  );

  const pendingCandidates = computed(() =>
    state.value.candidates.filter((c) => !c.readyForPromotion)
  );

  const isBacktestPassing = computed(() => state.value.backtestResult?.passed ?? false);

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function candidateById(id: string): PromotionCandidate | undefined {
    return state.value.candidates.find((c) => c.id === id);
  }

  // ============================================================================
  // MUTATIONS (Synchronous Only)
  // ============================================================================

  function setLoading(loading: boolean) {
    state.value.isLoading = loading;
  }

  function setError(error: string | null) {
    state.value.error = error;
  }

  function clearError() {
    state.value.error = null;
  }

  function setCandidates(candidates: PromotionCandidate[]) {
    state.value.candidates = candidates;
  }

  function setSelectedCandidate(candidate: PromotionCandidate | null) {
    state.value.selectedCandidate = candidate;
  }

  function setValidationResult(result: ValidationResult | null) {
    state.value.validationResult = result;
  }

  function setBacktestResult(result: BacktestResult | null) {
    state.value.backtestResult = result;
  }

  function setPromotionHistory(history: PromotionHistory[]) {
    state.value.promotionHistory = history;
  }

  function setStats(stats: PromotionStats | null) {
    state.value.stats = stats;
  }

  function addPromotionHistory(entry: PromotionHistory) {
    const idx = state.value.promotionHistory.findIndex((h) => h.id === entry.id);
    if (idx >= 0) {
      state.value.promotionHistory[idx] = entry;
    } else {
      state.value.promotionHistory.unshift(entry);
    }
  }

  function removeCandidate(id: string) {
    state.value.candidates = state.value.candidates.filter((c) => c.id !== id);
    if (state.value.selectedCandidate?.id === id) {
      state.value.selectedCandidate = null;
      state.value.validationResult = null;
      state.value.backtestResult = null;
    }
  }

  function clearSelection() {
    state.value.selectedCandidate = null;
    state.value.validationResult = null;
    state.value.backtestResult = null;
  }

  function resetState() {
    state.value = {
      candidates: [],
      selectedCandidate: null,
      validationResult: null,
      backtestResult: null,
      promotionHistory: [],
      stats: null,
      isLoading: false,
      error: null,
    };
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    candidates,
    selectedCandidate,
    validationResult,
    backtestResult,
    promotionHistory,
    stats,
    isLoading,
    error,

    // Derived state
    readyCandidates,
    pendingCandidates,
    isBacktestPassing,

    // Getters (functions)
    candidateById,

    // Mutations
    setLoading,
    setError,
    clearError,
    setCandidates,
    setSelectedCandidate,
    setValidationResult,
    setBacktestResult,
    setPromotionHistory,
    setStats,
    addPromotionHistory,
    removeCandidate,
    clearSelection,
    resetState,
  };
});
