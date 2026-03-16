/**
 * Review Queue Store - State + Synchronous Mutations Only
 *
 * Manages state for HITL Review Queue (Phase 11).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ============================================================================
// TYPES
// ============================================================================

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'modified';
export type SignalDisposition = 'bullish' | 'bearish' | 'neutral';

export interface ReviewQueueItem {
  id: string;
  targetId: string;
  targetName: string;
  targetSymbol: string;
  signalId: string;
  signalContent: string;
  sourceName: string;
  sourceType: string;
  receivedAt: string;
  aiDisposition: SignalDisposition;
  aiStrength: number;
  aiReasoning: string;
  aiConfidence: number;
  status: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  finalDisposition: SignalDisposition | null;
  finalStrength: number | null;
  createdAt: string;
}

interface ReviewQueueFilters {
  status: ReviewStatus | null;
  targetId: string | null;
  universeId: string | null;
  disposition: SignalDisposition | null;
}

interface ReviewQueueState {
  items: ReviewQueueItem[];
  selectedItemId: string | null;
  filters: ReviewQueueFilters;
  page: number;
  pageSize: number;
  totalCount: number;
  isLoading: boolean;
  error: string | null;
}

export const useReviewQueueStore = defineStore('reviewQueue', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<ReviewQueueState>({
    items: [],
    selectedItemId: null,
    filters: {
      status: null,
      targetId: null,
      universeId: null,
      disposition: null,
    },
    page: 1,
    pageSize: 20,
    totalCount: 0,
    isLoading: false,
    error: null,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const items = computed(() => state.value.items);
  const selectedItemId = computed(() => state.value.selectedItemId);
  const filters = computed(() => state.value.filters);
  const page = computed(() => state.value.page);
  const pageSize = computed(() => state.value.pageSize);
  const totalCount = computed(() => state.value.totalCount);
  const isLoading = computed(() => state.value.isLoading);
  const error = computed(() => state.value.error);

  const selectedItem = computed(() =>
    state.value.items.find((i) => i.id === state.value.selectedItemId)
  );

  const filteredItems = computed(() => {
    let result = state.value.items;

    if (state.value.filters.status) {
      result = result.filter((i) => i.status === state.value.filters.status);
    }

    if (state.value.filters.targetId) {
      result = result.filter((i) => i.targetId === state.value.filters.targetId);
    }

    if (state.value.filters.disposition) {
      result = result.filter((i) => i.aiDisposition === state.value.filters.disposition);
    }

    return result;
  });

  const pendingItems = computed(() =>
    state.value.items.filter((i) => i.status === 'pending')
  );

  const pendingCount = computed(() => pendingItems.value.length);

  const itemsByStatus = computed(() => {
    const grouped: Record<ReviewStatus, ReviewQueueItem[]> = {
      pending: [],
      approved: [],
      rejected: [],
      modified: [],
    };
    for (const item of state.value.items) {
      grouped[item.status].push(item);
    }
    return grouped;
  });

  const itemsByTarget = computed(() => {
    const grouped: Record<string, ReviewQueueItem[]> = {};
    for (const item of state.value.items) {
      if (!grouped[item.targetId]) {
        grouped[item.targetId] = [];
      }
      grouped[item.targetId].push(item);
    }
    return grouped;
  });

  const totalPages = computed(() =>
    Math.ceil(state.value.totalCount / state.value.pageSize)
  );

  const hasMore = computed(() => state.value.page < totalPages.value);

  // Stats
  const reviewStats = computed(() => {
    const total = state.value.items.length;
    const approved = state.value.items.filter((i) => i.status === 'approved').length;
    const rejected = state.value.items.filter((i) => i.status === 'rejected').length;
    const modified = state.value.items.filter((i) => i.status === 'modified').length;
    const pending = state.value.items.filter((i) => i.status === 'pending').length;

    return {
      total,
      approved,
      rejected,
      modified,
      pending,
      approvalRate: total > 0 ? ((approved + modified) / total) * 100 : 0,
    };
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getItemById(id: string): ReviewQueueItem | undefined {
    return state.value.items.find((i) => i.id === id);
  }

  function getItemsForTarget(targetId: string): ReviewQueueItem[] {
    return state.value.items.filter((i) => i.targetId === targetId);
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

  function setItems(items: ReviewQueueItem[]) {
    state.value.items = items;
  }

  function addItem(item: ReviewQueueItem) {
    const idx = state.value.items.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      state.value.items[idx] = item;
    } else {
      state.value.items.unshift(item);
    }
  }

  function updateItem(id: string, updates: Partial<ReviewQueueItem>) {
    const idx = state.value.items.findIndex((i) => i.id === id);
    if (idx >= 0) {
      state.value.items[idx] = { ...state.value.items[idx], ...updates };
    }
  }

  function removeItem(id: string) {
    state.value.items = state.value.items.filter((i) => i.id !== id);
    if (state.value.selectedItemId === id) {
      state.value.selectedItemId = null;
    }
  }

  function selectItem(id: string | null) {
    state.value.selectedItemId = id;
  }

  function setFilters(filters: Partial<ReviewQueueFilters>) {
    state.value.filters = { ...state.value.filters, ...filters };
  }

  function clearFilters() {
    state.value.filters = {
      status: null,
      targetId: null,
      universeId: null,
      disposition: null,
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
      items: [],
      selectedItemId: null,
      filters: {
        status: null,
        targetId: null,
        universeId: null,
        disposition: null,
      },
      page: 1,
      pageSize: 20,
      totalCount: 0,
      isLoading: false,
      error: null,
    };
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    items,
    selectedItemId,
    filters,
    page,
    pageSize,
    totalCount,
    isLoading,
    error,

    // Derived state
    selectedItem,
    filteredItems,
    pendingItems,
    pendingCount,
    itemsByStatus,
    itemsByTarget,
    totalPages,
    hasMore,
    reviewStats,

    // Getters (functions)
    getItemById,
    getItemsForTarget,

    // Mutations
    setLoading,
    setError,
    clearError,
    setItems,
    addItem,
    updateItem,
    removeItem,
    selectItem,
    setFilters,
    clearFilters,
    setPage,
    setPageSize,
    setTotalCount,
    resetState,
  };
});
