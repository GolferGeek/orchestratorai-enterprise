/**
 * Analyst Store - State + Synchronous Mutations Only
 *
 * Manages state for Prediction Analysts (Phase 11).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ============================================================================
// TYPES
// ============================================================================

export type AnalystScopeLevel = 'runner' | 'domain' | 'universe' | 'target';

export interface TierInstructions {
  gold?: string;
  silver?: string;
  bronze?: string;
}

export interface PredictionAnalyst {
  id: string;
  slug: string;
  name: string;
  perspective: string;
  scopeLevel: AnalystScopeLevel;
  domain: string | null;
  universeId: string | null;
  targetId: string | null;
  defaultWeight: number;
  tierInstructions: TierInstructions;
  learnedPatterns: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnalystTemplate {
  slug: string;
  name: string;
  perspective: string;
  domain: 'stocks' | 'crypto' | 'elections' | 'polymarket';
  defaultWeight: number;
  tierInstructions: TierInstructions;
}

// Phase 7: Fork Comparison Types
export type ForkType = 'user' | 'agent';
export type PortfolioStatus = 'active' | 'warning' | 'probation' | 'suspended';

export interface AnalystPortfolioSummary {
  id: string;
  analystId: string;
  forkType: ForkType;
  initialBalance: number;
  currentBalance: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  winCount: number;
  lossCount: number;
  status: PortfolioStatus;
  statusChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ForkComparison {
  analystId: string;
  analystName: string;
  userFork: AnalystPortfolioSummary | null;
  agentFork: AnalystPortfolioSummary | null;
  performanceDiff: {
    pnlDiff: number;
    winRateDiff: number;
    betterFork: ForkType | null;
  };
}

// Phase 7: Context Version History Types
export interface AnalystContextVersion {
  id: string;
  analystId: string;
  forkType: ForkType;
  versionNumber: number;
  perspective: string;
  tierInstructions: TierInstructions;
  defaultWeight: number;
  agentJournal: string | null;
  changeReason: string;
  changedBy: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface ContextVersionDiff {
  field: string;
  oldValue: string;
  newValue: string;
}

interface AnalystFilters {
  scopeLevel: AnalystScopeLevel | null;
  domain: string | null;
  universeId: string | null;
  active: boolean | null;
}

interface AnalystState {
  analysts: PredictionAnalyst[];
  analystTemplates: AnalystTemplate[];
  selectedAnalystId: string | null;
  filters: AnalystFilters;
  isLoading: boolean;
  error: string | null;
  // Phase 7: Fork Comparison
  forkComparisons: Map<string, ForkComparison>;
  isLoadingForkComparison: boolean;
  // Phase 7: Version History
  versionHistory: AnalystContextVersion[];
  selectedVersionId: string | null;
  isLoadingVersionHistory: boolean;
}

export const useAnalystStore = defineStore('analyst', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<AnalystState>({
    analysts: [],
    analystTemplates: [],
    selectedAnalystId: null,
    filters: {
      scopeLevel: null,
      domain: null,
      universeId: null,
      active: null,
    },
    isLoading: false,
    error: null,
    // Phase 7: Fork Comparison
    forkComparisons: new Map(),
    isLoadingForkComparison: false,
    // Phase 7: Version History
    versionHistory: [],
    selectedVersionId: null,
    isLoadingVersionHistory: false,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const analysts = computed(() => state.value.analysts);
  const analystTemplates = computed(() => state.value.analystTemplates);
  const selectedAnalystId = computed(() => state.value.selectedAnalystId);
  const filters = computed(() => state.value.filters);
  const isLoading = computed(() => state.value.isLoading);
  const error = computed(() => state.value.error);

  const selectedAnalyst = computed(() =>
    state.value.analysts.find((a) => a.id === state.value.selectedAnalystId)
  );

  const filteredAnalysts = computed(() => {
    let result = state.value.analysts;

    if (state.value.filters.scopeLevel) {
      result = result.filter((a) => a.scopeLevel === state.value.filters.scopeLevel);
    }

    if (state.value.filters.domain) {
      result = result.filter((a) => a.domain === state.value.filters.domain);
    }

    if (state.value.filters.universeId) {
      result = result.filter((a) => a.universeId === state.value.filters.universeId);
    }

    if (state.value.filters.active !== null) {
      result = result.filter((a) => a.active === state.value.filters.active);
    }

    return result;
  });

  const activeAnalysts = computed(() =>
    state.value.analysts.filter((a) => a.active)
  );

  const analystsByScopeLevel = computed(() => {
    const grouped: Record<AnalystScopeLevel, PredictionAnalyst[]> = {
      runner: [],
      domain: [],
      universe: [],
      target: [],
    };
    for (const analyst of state.value.analysts) {
      grouped[analyst.scopeLevel].push(analyst);
    }
    return grouped;
  });

  const analystsByDomain = computed(() => {
    const grouped: Record<string, PredictionAnalyst[]> = {};
    for (const analyst of state.value.analysts) {
      if (analyst.domain) {
        if (!grouped[analyst.domain]) {
          grouped[analyst.domain] = [];
        }
        grouped[analyst.domain].push(analyst);
      }
    }
    return grouped;
  });

  const templatesByDomain = computed(() => {
    const grouped: Record<string, AnalystTemplate[]> = {};
    for (const template of state.value.analystTemplates) {
      if (!grouped[template.domain]) {
        grouped[template.domain] = [];
      }
      grouped[template.domain].push(template);
    }
    return grouped;
  });

  // Phase 7: Fork Comparison computed
  const forkComparisons = computed(() => state.value.forkComparisons);
  const isLoadingForkComparison = computed(() => state.value.isLoadingForkComparison);

  const selectedAnalystForkComparison = computed(() => {
    if (!state.value.selectedAnalystId) return null;
    return state.value.forkComparisons.get(state.value.selectedAnalystId) || null;
  });

  // Phase 7: Version History computed
  const versionHistory = computed(() => state.value.versionHistory);
  const selectedVersionId = computed(() => state.value.selectedVersionId);
  const isLoadingVersionHistory = computed(() => state.value.isLoadingVersionHistory);

  const selectedVersion = computed(() =>
    state.value.versionHistory.find((v) => v.id === state.value.selectedVersionId),
  );

  const userForkVersions = computed(() =>
    state.value.versionHistory.filter((v) => v.forkType === 'user'),
  );

  const agentForkVersions = computed(() =>
    state.value.versionHistory.filter((v) => v.forkType === 'agent'),
  );

  const currentUserVersion = computed(() =>
    state.value.versionHistory.find((v) => v.forkType === 'user' && v.isCurrent),
  );

  const currentAgentVersion = computed(() =>
    state.value.versionHistory.find((v) => v.forkType === 'agent' && v.isCurrent),
  );

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getAnalystById(id: string): PredictionAnalyst | undefined {
    return state.value.analysts.find((a) => a.id === id);
  }

  function getAnalystBySlug(slug: string): PredictionAnalyst | undefined {
    return state.value.analysts.find((a) => a.slug === slug);
  }

  function getAnalystsForUniverse(universeId: string): PredictionAnalyst[] {
    return state.value.analysts.filter((a) => a.universeId === universeId);
  }

  function getAnalystsForDomain(domain: string): PredictionAnalyst[] {
    return state.value.analysts.filter((a) => a.domain === domain);
  }

  function getTemplateBySlug(slug: string): AnalystTemplate | undefined {
    return state.value.analystTemplates.find((t) => t.slug === slug);
  }

  function getTemplatesForDomain(domain: string): AnalystTemplate[] {
    return state.value.analystTemplates.filter((t) => t.domain === domain);
  }

  // Phase 7: Fork Comparison getters
  function getForkComparison(analystId: string): ForkComparison | undefined {
    return state.value.forkComparisons.get(analystId);
  }

  // Phase 7: Version History getters
  function getVersionById(versionId: string): AnalystContextVersion | undefined {
    return state.value.versionHistory.find((v) => v.id === versionId);
  }

  function getVersionsByFork(forkType: ForkType): AnalystContextVersion[] {
    return state.value.versionHistory.filter((v) => v.forkType === forkType);
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

  function setAnalysts(analysts: PredictionAnalyst[]) {
    state.value.analysts = analysts;
  }

  function addAnalyst(analyst: PredictionAnalyst) {
    const idx = state.value.analysts.findIndex((a) => a.id === analyst.id);
    if (idx >= 0) {
      state.value.analysts[idx] = analyst;
    } else {
      state.value.analysts.push(analyst);
    }
  }

  function updateAnalyst(id: string, updates: Partial<PredictionAnalyst>) {
    const idx = state.value.analysts.findIndex((a) => a.id === id);
    if (idx >= 0) {
      state.value.analysts[idx] = { ...state.value.analysts[idx], ...updates };
    }
  }

  function removeAnalyst(id: string) {
    state.value.analysts = state.value.analysts.filter((a) => a.id !== id);
    if (state.value.selectedAnalystId === id) {
      state.value.selectedAnalystId = null;
    }
  }

  function setAnalystTemplates(templates: AnalystTemplate[]) {
    state.value.analystTemplates = templates;
  }

  function addAnalystTemplate(template: AnalystTemplate) {
    const idx = state.value.analystTemplates.findIndex((t) => t.slug === template.slug);
    if (idx >= 0) {
      state.value.analystTemplates[idx] = template;
    } else {
      state.value.analystTemplates.push(template);
    }
  }

  function selectAnalyst(id: string | null) {
    state.value.selectedAnalystId = id;
  }

  function setFilters(filters: Partial<AnalystFilters>) {
    state.value.filters = { ...state.value.filters, ...filters };
  }

  function clearFilters() {
    state.value.filters = {
      scopeLevel: null,
      domain: null,
      universeId: null,
      active: null,
    };
  }

  // ============================================================================
  // FORK COMPARISON MUTATIONS (Phase 7)
  // ============================================================================

  function setLoadingForkComparison(loading: boolean) {
    state.value.isLoadingForkComparison = loading;
  }

  function setForkComparison(analystId: string, comparison: ForkComparison) {
    state.value.forkComparisons.set(analystId, comparison);
  }

  function setAllForkComparisons(comparisons: ForkComparison[]) {
    state.value.forkComparisons.clear();
    for (const comparison of comparisons) {
      state.value.forkComparisons.set(comparison.analystId, comparison);
    }
  }

  function clearForkComparisons() {
    state.value.forkComparisons.clear();
  }

  // ============================================================================
  // VERSION HISTORY MUTATIONS (Phase 7)
  // ============================================================================

  function setLoadingVersionHistory(loading: boolean) {
    state.value.isLoadingVersionHistory = loading;
  }

  function setVersionHistory(versions: AnalystContextVersion[]) {
    state.value.versionHistory = Array.isArray(versions) ? versions : [];
  }

  function addVersion(version: AnalystContextVersion) {
    // Mark old current version as not current if this is current
    if (version.isCurrent) {
      state.value.versionHistory = state.value.versionHistory.map((v) =>
        v.forkType === version.forkType && v.isCurrent
          ? { ...v, isCurrent: false }
          : v,
      );
    }
    state.value.versionHistory.push(version);
  }

  function selectVersion(versionId: string | null) {
    state.value.selectedVersionId = versionId;
  }

  function markVersionAsCurrent(versionId: string) {
    const version = state.value.versionHistory.find((v) => v.id === versionId);
    if (!version) return;

    // Mark all same fork versions as not current, then mark target as current
    state.value.versionHistory = state.value.versionHistory.map((v) => {
      if (v.forkType === version.forkType) {
        return { ...v, isCurrent: v.id === versionId };
      }
      return v;
    });
  }

  function clearVersionHistory() {
    state.value.versionHistory = [];
    state.value.selectedVersionId = null;
  }

  function resetState() {
    state.value = {
      analysts: [],
      analystTemplates: [],
      selectedAnalystId: null,
      filters: {
        scopeLevel: null,
        domain: null,
        universeId: null,
        active: null,
      },
      isLoading: false,
      error: null,
      // Phase 7: Fork Comparison
      forkComparisons: new Map(),
      isLoadingForkComparison: false,
      // Phase 7: Version History
      versionHistory: [],
      selectedVersionId: null,
      isLoadingVersionHistory: false,
    };
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    analysts,
    analystTemplates,
    selectedAnalystId,
    filters,
    isLoading,
    error,

    // Derived state
    selectedAnalyst,
    filteredAnalysts,
    activeAnalysts,
    analystsByScopeLevel,
    analystsByDomain,
    templatesByDomain,

    // Phase 7: Fork Comparison (computed)
    forkComparisons,
    isLoadingForkComparison,
    selectedAnalystForkComparison,

    // Phase 7: Version History (computed)
    versionHistory,
    selectedVersionId,
    isLoadingVersionHistory,
    selectedVersion,
    userForkVersions,
    agentForkVersions,
    currentUserVersion,
    currentAgentVersion,

    // Getters (functions)
    getAnalystById,
    getAnalystBySlug,
    getAnalystsForUniverse,
    getAnalystsForDomain,
    getTemplateBySlug,
    getTemplatesForDomain,
    // Phase 7
    getForkComparison,
    getVersionById,
    getVersionsByFork,

    // Mutations
    setLoading,
    setError,
    clearError,
    setAnalysts,
    addAnalyst,
    updateAnalyst,
    removeAnalyst,
    setAnalystTemplates,
    addAnalystTemplate,
    selectAnalyst,
    setFilters,
    clearFilters,
    resetState,

    // Phase 7: Fork Comparison Mutations
    setLoadingForkComparison,
    setForkComparison,
    setAllForkComparisons,
    clearForkComparisons,

    // Phase 7: Version History Mutations
    setLoadingVersionHistory,
    setVersionHistory,
    addVersion,
    selectVersion,
    markVersionAsCurrent,
    clearVersionHistory,
  };
});
