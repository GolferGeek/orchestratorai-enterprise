/**
 * Test Target Mirror Store - State + Synchronous Mutations Only
 *
 * Manages state for the Targets & Mirrors view (Phase 3 SCR-002).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  TestTargetMirror,
  TestTargetMirrorWithTarget,
} from '@/services/predictionDashboardService';

interface TestTargetMirrorState {
  // Mirrors list (may include target details)
  mirrors: TestTargetMirrorWithTarget[];

  // Selected mirror
  selectedMirrorId: string | null;

  // Pagination
  page: number;
  pageSize: number;
  totalCount: number;

  // Loading/error state
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

export const useTestTargetMirrorStore = defineStore('testTargetMirror', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<TestTargetMirrorState>({
    mirrors: [],
    selectedMirrorId: null,
    page: 1,
    pageSize: 50,
    totalCount: 0,
    isLoading: false,
    isSaving: false,
    error: null,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const mirrors = computed(() => state.value.mirrors);
  const selectedMirrorId = computed(() => state.value.selectedMirrorId);
  const page = computed(() => state.value.page);
  const pageSize = computed(() => state.value.pageSize);
  const totalCount = computed(() => state.value.totalCount);
  const isLoading = computed(() => state.value.isLoading);
  const isSaving = computed(() => state.value.isSaving);
  const error = computed(() => state.value.error);

  // Derived state
  const selectedMirror = computed(() =>
    state.value.mirrors.find((m) => m.id === state.value.selectedMirrorId)
  );

  // Mirrors with target details
  const mirrorsWithTargets = computed(() =>
    state.value.mirrors.filter((m) => m.production_target)
  );

  // Map of production target ID to mirror
  const mirrorsByProductionTargetId = computed(() => {
    const map: Record<string, TestTargetMirrorWithTarget> = {};
    for (const mirror of state.value.mirrors) {
      map[mirror.production_target_id] = mirror;
    }
    return map;
  });

  // Map of test symbol to mirror
  const mirrorsByTestSymbol = computed(() => {
    const map: Record<string, TestTargetMirrorWithTarget> = {};
    for (const mirror of state.value.mirrors) {
      map[mirror.test_symbol] = mirror;
    }
    return map;
  });

  // List of all test symbols
  const testSymbols = computed(() =>
    state.value.mirrors.map((m) => m.test_symbol).sort()
  );

  // List of all production target IDs
  const productionTargetIds = computed(() =>
    state.value.mirrors.map((m) => m.production_target_id)
  );

  const totalPages = computed(() =>
    Math.ceil(state.value.totalCount / state.value.pageSize)
  );

  const hasMore = computed(() => state.value.page < totalPages.value);

  // Stats
  const stats = computed(() => ({
    totalMirrors: state.value.mirrors.length,
    withTargetDetails: mirrorsWithTargets.value.length,
  }));

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getMirrorById(id: string): TestTargetMirrorWithTarget | undefined {
    return state.value.mirrors.find((m) => m.id === id);
  }

  function getMirrorByProductionTargetId(
    targetId: string
  ): TestTargetMirrorWithTarget | undefined {
    return state.value.mirrors.find((m) => m.production_target_id === targetId);
  }

  function getMirrorByTestSymbol(symbol: string): TestTargetMirrorWithTarget | undefined {
    return state.value.mirrors.find((m) => m.test_symbol === symbol);
  }

  function hasProductionTargetMirror(targetId: string): boolean {
    return state.value.mirrors.some((m) => m.production_target_id === targetId);
  }

  function getTestSymbolForTarget(targetId: string): string | undefined {
    const mirror = getMirrorByProductionTargetId(targetId);
    return mirror?.test_symbol;
  }

  function getProductionTargetIdForTestSymbol(symbol: string): string | undefined {
    const mirror = getMirrorByTestSymbol(symbol);
    return mirror?.production_target_id;
  }

  // ============================================================================
  // MUTATIONS (Synchronous Only)
  // ============================================================================

  function setLoading(loading: boolean) {
    state.value.isLoading = loading;
  }

  function setSaving(saving: boolean) {
    state.value.isSaving = saving;
  }

  function setError(error: string | null) {
    state.value.error = error;
  }

  function clearError() {
    state.value.error = null;
  }

  // Mirror mutations
  function setMirrors(mirrors: TestTargetMirrorWithTarget[]) {
    state.value.mirrors = mirrors;
  }

  function addMirror(mirror: TestTargetMirrorWithTarget | TestTargetMirror) {
    const idx = state.value.mirrors.findIndex((m) => m.id === mirror.id);
    if (idx >= 0) {
      state.value.mirrors[idx] = mirror as TestTargetMirrorWithTarget;
    } else {
      state.value.mirrors.push(mirror as TestTargetMirrorWithTarget);
    }
  }

  function updateMirror(id: string, updates: Partial<TestTargetMirrorWithTarget>) {
    const idx = state.value.mirrors.findIndex((m) => m.id === id);
    if (idx >= 0) {
      state.value.mirrors[idx] = { ...state.value.mirrors[idx], ...updates };
    }
  }

  function removeMirror(id: string) {
    state.value.mirrors = state.value.mirrors.filter((m) => m.id !== id);
    if (state.value.selectedMirrorId === id) {
      state.value.selectedMirrorId = null;
    }
  }

  // Selection mutations
  function selectMirror(id: string | null) {
    state.value.selectedMirrorId = id;
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
      mirrors: [],
      selectedMirrorId: null,
      page: 1,
      pageSize: 50,
      totalCount: 0,
      isLoading: false,
      isSaving: false,
      error: null,
    };
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    mirrors,
    selectedMirrorId,
    page,
    pageSize,
    totalCount,
    isLoading,
    isSaving,
    error,

    // Derived state
    selectedMirror,
    mirrorsWithTargets,
    mirrorsByProductionTargetId,
    mirrorsByTestSymbol,
    testSymbols,
    productionTargetIds,
    totalPages,
    hasMore,
    stats,

    // Getters (functions)
    getMirrorById,
    getMirrorByProductionTargetId,
    getMirrorByTestSymbol,
    hasProductionTargetMirror,
    getTestSymbolForTarget,
    getProductionTargetIdForTestSymbol,

    // Mutations
    setLoading,
    setSaving,
    setError,
    clearError,
    setMirrors,
    addMirror,
    updateMirror,
    removeMirror,
    selectMirror,
    setPage,
    setPageSize,
    setTotalCount,
    resetState,
  };
});
