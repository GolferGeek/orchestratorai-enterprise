/**
 * Source Store - State + Synchronous Mutations Only
 *
 * Manages state for Prediction Sources (Phase 11).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ============================================================================
// TYPES
// ============================================================================

export type SourceScopeLevel = 'runner' | 'domain' | 'universe' | 'target';
export type SourceType = 'web' | 'rss' | 'twitter_search' | 'api';

export interface PredictionSource {
  id: string;
  name: string;
  sourceType: SourceType;
  scopeLevel: SourceScopeLevel;
  domain: string | null;
  universeId: string | null;
  targetId: string | null;
  url: string;
  crawlConfig: {
    frequency: '5min' | '10min' | '15min' | '30min' | '1hour';
    cssSelector?: string;
    waitForElement?: string;
    searchQuery?: string;
    apiEndpoint?: string;
  };
  active: boolean;
  lastCrawledAt: string | null;
  itemsFound: number;
  createdAt: string;
  updatedAt: string;
}

interface SourceFilters {
  scopeLevel: SourceScopeLevel | null;
  sourceType: SourceType | null;
  domain: string | null;
  universeId: string | null;
  active: boolean | null;
}

interface SourceState {
  sources: PredictionSource[];
  selectedSourceId: string | null;
  filters: SourceFilters;
  isLoading: boolean;
  error: string | null;
}

export const useSourceStore = defineStore('source', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<SourceState>({
    sources: [],
    selectedSourceId: null,
    filters: {
      scopeLevel: null,
      sourceType: null,
      domain: null,
      universeId: null,
      active: null,
    },
    isLoading: false,
    error: null,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const sources = computed(() => state.value.sources);
  const selectedSourceId = computed(() => state.value.selectedSourceId);
  const filters = computed(() => state.value.filters);
  const isLoading = computed(() => state.value.isLoading);
  const error = computed(() => state.value.error);

  const selectedSource = computed(() =>
    state.value.sources.find((s) => s.id === state.value.selectedSourceId)
  );

  const filteredSources = computed(() => {
    let result = state.value.sources;

    if (state.value.filters.scopeLevel) {
      result = result.filter((s) => s.scopeLevel === state.value.filters.scopeLevel);
    }

    if (state.value.filters.sourceType) {
      result = result.filter((s) => s.sourceType === state.value.filters.sourceType);
    }

    if (state.value.filters.domain) {
      result = result.filter((s) => s.domain === state.value.filters.domain);
    }

    if (state.value.filters.universeId) {
      result = result.filter((s) => s.universeId === state.value.filters.universeId);
    }

    if (state.value.filters.active !== null) {
      result = result.filter((s) => s.active === state.value.filters.active);
    }

    return result;
  });

  const activeSources = computed(() =>
    state.value.sources.filter((s) => s.active)
  );

  const sourcesByScopeLevel = computed(() => {
    const grouped: Record<SourceScopeLevel, PredictionSource[]> = {
      runner: [],
      domain: [],
      universe: [],
      target: [],
    };
    for (const source of state.value.sources) {
      grouped[source.scopeLevel].push(source);
    }
    return grouped;
  });

  const sourcesByType = computed(() => {
    const grouped: Record<SourceType, PredictionSource[]> = {
      web: [],
      rss: [],
      twitter_search: [],
      api: [],
    };
    for (const source of state.value.sources) {
      grouped[source.sourceType].push(source);
    }
    return grouped;
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getSourceById(id: string): PredictionSource | undefined {
    return state.value.sources.find((s) => s.id === id);
  }

  function getSourcesForUniverse(universeId: string): PredictionSource[] {
    return state.value.sources.filter((s) => s.universeId === universeId);
  }

  function getSourcesForTarget(targetId: string): PredictionSource[] {
    return state.value.sources.filter((s) => s.targetId === targetId);
  }

  function getSourcesForDomain(domain: string): PredictionSource[] {
    return state.value.sources.filter((s) => s.domain === domain);
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

  function setSources(sources: PredictionSource[]) {
    state.value.sources = sources;
  }

  function addSource(source: PredictionSource) {
    const idx = state.value.sources.findIndex((s) => s.id === source.id);
    if (idx >= 0) {
      state.value.sources[idx] = source;
    } else {
      state.value.sources.push(source);
    }
  }

  function updateSource(id: string, updates: Partial<PredictionSource>) {
    const idx = state.value.sources.findIndex((s) => s.id === id);
    if (idx >= 0) {
      state.value.sources[idx] = { ...state.value.sources[idx], ...updates };
    }
  }

  function removeSource(id: string) {
    state.value.sources = state.value.sources.filter((s) => s.id !== id);
    if (state.value.selectedSourceId === id) {
      state.value.selectedSourceId = null;
    }
  }

  function selectSource(id: string | null) {
    state.value.selectedSourceId = id;
  }

  function setFilters(filters: Partial<SourceFilters>) {
    state.value.filters = { ...state.value.filters, ...filters };
  }

  function clearFilters() {
    state.value.filters = {
      scopeLevel: null,
      sourceType: null,
      domain: null,
      universeId: null,
      active: null,
    };
  }

  function resetState() {
    state.value = {
      sources: [],
      selectedSourceId: null,
      filters: {
        scopeLevel: null,
        sourceType: null,
        domain: null,
        universeId: null,
        active: null,
      },
      isLoading: false,
      error: null,
    };
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    sources,
    selectedSourceId,
    filters,
    isLoading,
    error,

    // Derived state
    selectedSource,
    filteredSources,
    activeSources,
    sourcesByScopeLevel,
    sourcesByType,

    // Getters (functions)
    getSourceById,
    getSourcesForUniverse,
    getSourcesForTarget,
    getSourcesForDomain,

    // Mutations
    setLoading,
    setError,
    clearError,
    setSources,
    addSource,
    updateSource,
    removeSource,
    selectSource,
    setFilters,
    clearFilters,
    resetState,
  };
});
