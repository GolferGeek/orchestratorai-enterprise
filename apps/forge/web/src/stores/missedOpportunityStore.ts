/**
 * Missed Opportunity Store - State + Synchronous Mutations Only
 *
 * Manages state for Missed Opportunities (Phase 11).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ============================================================================
// TYPES
// ============================================================================

export type AnalysisStatus = 'pending' | 'analyzed' | 'actioned';
export type MoveDirection = 'up' | 'down';

export interface MissedOpportunity {
  id: string;
  targetId: string;
  targetName: string;
  targetSymbol: string;
  moveStartAt: string;
  moveEndAt: string;
  startValue: number;
  endValue: number;
  movePercent: number;
  direction: MoveDirection;
  discoveredDrivers?: string[];
  signalsWeHad?: Array<{
    id: string;
    content: string;
    reason: string;
  }>;
  sourceGaps?: string[];
  suggestedLearnings?: string[];
  analysisStatus: AnalysisStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface MissedOpportunityAnalysis {
  id: string;
  missedOpportunityId: string;
  drivers: Array<{
    driver: string;
    confidence: number;
    sources: string[];
  }>;
  signalAnalysis: Array<{
    signalId: string;
    reason: string;
    shouldHaveActed: boolean;
  }>;
  sourceRecommendations: Array<{
    sourceType: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  learningRecommendations: Array<{
    title: string;
    content: string;
    learningType: string;
  }>;
  summary: string;
  createdAt: string;
}

interface MissedOpportunityFilters {
  targetId: string | null;
  universeId: string | null;
  analysisStatus: AnalysisStatus | null;
  direction: MoveDirection | null;
  minMovePercent: number | null;
}

interface MissedOpportunityState {
  opportunities: MissedOpportunity[];
  currentAnalysis: MissedOpportunityAnalysis | null;
  selectedOpportunityId: string | null;
  filters: MissedOpportunityFilters;
  page: number;
  pageSize: number;
  totalCount: number;
  isLoading: boolean;
  isLoadingAnalysis: boolean;
  error: string | null;
}

export const useMissedOpportunityStore = defineStore('missedOpportunity', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<MissedOpportunityState>({
    opportunities: [],
    currentAnalysis: null,
    selectedOpportunityId: null,
    filters: {
      targetId: null,
      universeId: null,
      analysisStatus: null,
      direction: null,
      minMovePercent: null,
    },
    page: 1,
    pageSize: 20,
    totalCount: 0,
    isLoading: false,
    isLoadingAnalysis: false,
    error: null,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const opportunities = computed(() => state.value.opportunities);
  const currentAnalysis = computed(() => state.value.currentAnalysis);
  const selectedOpportunityId = computed(() => state.value.selectedOpportunityId);
  const filters = computed(() => state.value.filters);
  const page = computed(() => state.value.page);
  const pageSize = computed(() => state.value.pageSize);
  const totalCount = computed(() => state.value.totalCount);
  const isLoading = computed(() => state.value.isLoading);
  const isLoadingAnalysis = computed(() => state.value.isLoadingAnalysis);
  const error = computed(() => state.value.error);

  const selectedOpportunity = computed(() =>
    state.value.opportunities.find((o) => o.id === state.value.selectedOpportunityId)
  );

  const filteredOpportunities = computed(() => {
    let result = state.value.opportunities;

    if (state.value.filters.targetId) {
      result = result.filter((o) => o.targetId === state.value.filters.targetId);
    }

    if (state.value.filters.analysisStatus) {
      result = result.filter((o) => o.analysisStatus === state.value.filters.analysisStatus);
    }

    if (state.value.filters.direction) {
      result = result.filter((o) => o.direction === state.value.filters.direction);
    }

    if (state.value.filters.minMovePercent !== null) {
      result = result.filter((o) => o.movePercent >= state.value.filters.minMovePercent!);
    }

    return result;
  });

  const pendingAnalysis = computed(() =>
    state.value.opportunities.filter((o) => o.analysisStatus === 'pending')
  );

  const analyzedOpportunities = computed(() =>
    state.value.opportunities.filter((o) => o.analysisStatus === 'analyzed')
  );

  const opportunitiesByTarget = computed(() => {
    const grouped: Record<string, MissedOpportunity[]> = {};
    for (const opp of state.value.opportunities) {
      if (!grouped[opp.targetId]) {
        grouped[opp.targetId] = [];
      }
      grouped[opp.targetId].push(opp);
    }
    return grouped;
  });

  const opportunitiesByDirection = computed(() => {
    const grouped: Record<MoveDirection, MissedOpportunity[]> = {
      up: [],
      down: [],
    };
    for (const opp of state.value.opportunities) {
      grouped[opp.direction].push(opp);
    }
    return grouped;
  });

  const totalPages = computed(() =>
    Math.ceil(state.value.totalCount / state.value.pageSize)
  );

  const hasMore = computed(() => state.value.page < totalPages.value);

  // Stats
  const opportunityStats = computed(() => {
    const opps = Array.isArray(state.value.opportunities) ? state.value.opportunities : [];
    const total = opps.length;
    const avgMovePercent = total > 0
      ? opps.reduce((sum, o) => sum + o.movePercent, 0) / total
      : 0;
    const upMoves = opps.filter((o) => o.direction === 'up').length;
    const downMoves = opps.filter((o) => o.direction === 'down').length;
    const pending = opps.filter((o) => o.analysisStatus === 'pending').length;
    const analyzed = opps.filter((o) => o.analysisStatus === 'analyzed').length;
    const actioned = opps.filter((o) => o.analysisStatus === 'actioned').length;

    return {
      total,
      avgMovePercent,
      upMoves,
      downMoves,
      pending,
      analyzed,
      actioned,
    };
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getOpportunityById(id: string): MissedOpportunity | undefined {
    const opps = Array.isArray(state.value.opportunities) ? state.value.opportunities : [];
    return opps.find((o) => o.id === id);
  }

  function getOpportunitiesForTarget(targetId: string): MissedOpportunity[] {
    const opps = Array.isArray(state.value.opportunities) ? state.value.opportunities : [];
    return opps.filter((o) => o.targetId === targetId);
  }

  // ============================================================================
  // MUTATIONS (Synchronous Only)
  // ============================================================================

  function setLoading(loading: boolean) {
    state.value.isLoading = loading;
  }

  function setLoadingAnalysis(loading: boolean) {
    state.value.isLoadingAnalysis = loading;
  }

  function setError(error: string | null) {
    state.value.error = error;
  }

  function clearError() {
    state.value.error = null;
  }

  function setOpportunities(opportunities: MissedOpportunity[]) {
    state.value.opportunities = Array.isArray(opportunities) ? opportunities : [];
  }

  function addOpportunity(opportunity: MissedOpportunity) {
    if (!Array.isArray(state.value.opportunities)) {
      state.value.opportunities = [];
    }
    const idx = state.value.opportunities.findIndex((o) => o.id === opportunity.id);
    if (idx >= 0) {
      state.value.opportunities[idx] = opportunity;
    } else {
      state.value.opportunities.unshift(opportunity);
    }
  }

  function updateOpportunity(id: string, updates: Partial<MissedOpportunity>) {
    const opps = Array.isArray(state.value.opportunities) ? state.value.opportunities : [];
    const idx = opps.findIndex((o) => o.id === id);
    if (idx >= 0) {
      state.value.opportunities[idx] = { ...state.value.opportunities[idx], ...updates };
    }
  }

  function removeOpportunity(id: string) {
    const opps = Array.isArray(state.value.opportunities) ? state.value.opportunities : [];
    state.value.opportunities = opps.filter((o) => o.id !== id);
    if (state.value.selectedOpportunityId === id) {
      state.value.selectedOpportunityId = null;
      state.value.currentAnalysis = null;
    }
  }

  function setCurrentAnalysis(analysis: MissedOpportunityAnalysis | null) {
    state.value.currentAnalysis = analysis;
  }

  function selectOpportunity(id: string | null) {
    state.value.selectedOpportunityId = id;
    if (!id) {
      state.value.currentAnalysis = null;
    }
  }

  function setFilters(filters: Partial<MissedOpportunityFilters>) {
    state.value.filters = { ...state.value.filters, ...filters };
  }

  function clearFilters() {
    state.value.filters = {
      targetId: null,
      universeId: null,
      analysisStatus: null,
      direction: null,
      minMovePercent: null,
    };
  }

  function setPage(page: number) {
    state.value.page = page;
  }

  function setPageSize(pageSize: number) {
    state.value.pageSize = pageSize;
  }

  function setTotalCount(count: number) {
    state.value.totalCount = count;
  }

  function resetState() {
    state.value = {
      opportunities: [],
      currentAnalysis: null,
      selectedOpportunityId: null,
      filters: {
        targetId: null,
        universeId: null,
        analysisStatus: null,
        direction: null,
        minMovePercent: null,
      },
      page: 1,
      pageSize: 20,
      totalCount: 0,
      isLoading: false,
      isLoadingAnalysis: false,
      error: null,
    };
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    opportunities,
    currentAnalysis,
    selectedOpportunityId,
    filters,
    page,
    pageSize,
    totalCount,
    isLoading,
    isLoadingAnalysis,
    error,

    // Derived state
    selectedOpportunity,
    filteredOpportunities,
    pendingAnalysis,
    analyzedOpportunities,
    opportunitiesByTarget,
    opportunitiesByDirection,
    totalPages,
    hasMore,
    opportunityStats,

    // Getters (functions)
    getOpportunityById,
    getOpportunitiesForTarget,

    // Mutations
    setLoading,
    setLoadingAnalysis,
    setError,
    clearError,
    setOpportunities,
    addOpportunity,
    updateOpportunity,
    removeOpportunity,
    setCurrentAnalysis,
    selectOpportunity,
    setFilters,
    clearFilters,
    setPage,
    setPageSize,
    setTotalCount,
    resetState,
  };
});
