/**
 * Tool Request Store - State + Synchronous Mutations Only
 *
 * Manages state for Tool Wishlist (Phase 11).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ============================================================================
// TYPES
// ============================================================================

export type ToolRequestType = 'source' | 'integration' | 'feature';
export type ToolRequestPriority = 'low' | 'medium' | 'high';
export type ToolRequestStatus = 'wishlist' | 'planned' | 'in_progress' | 'done' | 'rejected';

export interface ToolRequest {
  id: string;
  universeId: string;
  universeName: string;
  targetId?: string;
  targetName?: string;
  requestType: ToolRequestType;
  title: string;
  description: string;
  priority: ToolRequestPriority;
  status: ToolRequestStatus;
  sourceType?: string;
  sourceMissedOpportunityId?: string;
  statusNotes?: string;
  createdAt: string;
  updatedAt: string;
}

interface ToolRequestFilters {
  universeId: string | null;
  targetId: string | null;
  requestType: ToolRequestType | null;
  status: ToolRequestStatus | null;
  priority: ToolRequestPriority | null;
}

interface ToolRequestState {
  requests: ToolRequest[];
  selectedRequestId: string | null;
  filters: ToolRequestFilters;
  page: number;
  pageSize: number;
  totalCount: number;
  isLoading: boolean;
  error: string | null;
}

export const useToolRequestStore = defineStore('toolRequest', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<ToolRequestState>({
    requests: [],
    selectedRequestId: null,
    filters: {
      universeId: null,
      targetId: null,
      requestType: null,
      status: null,
      priority: null,
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

  const requests = computed(() => state.value.requests);
  const selectedRequestId = computed(() => state.value.selectedRequestId);
  const filters = computed(() => state.value.filters);
  const page = computed(() => state.value.page);
  const pageSize = computed(() => state.value.pageSize);
  const totalCount = computed(() => state.value.totalCount);
  const isLoading = computed(() => state.value.isLoading);
  const error = computed(() => state.value.error);

  const selectedRequest = computed(() =>
    state.value.requests.find((r) => r.id === state.value.selectedRequestId)
  );

  const filteredRequests = computed(() => {
    let result = state.value.requests;

    if (state.value.filters.universeId) {
      result = result.filter((r) => r.universeId === state.value.filters.universeId);
    }

    if (state.value.filters.targetId) {
      result = result.filter((r) => r.targetId === state.value.filters.targetId);
    }

    if (state.value.filters.requestType) {
      result = result.filter((r) => r.requestType === state.value.filters.requestType);
    }

    if (state.value.filters.status) {
      result = result.filter((r) => r.status === state.value.filters.status);
    }

    if (state.value.filters.priority) {
      result = result.filter((r) => r.priority === state.value.filters.priority);
    }

    return result;
  });

  const activeRequests = computed(() =>
    state.value.requests.filter((r) => !['done', 'rejected'].includes(r.status))
  );

  const wishlistRequests = computed(() =>
    state.value.requests.filter((r) => r.status === 'wishlist')
  );

  const requestsByStatus = computed(() => {
    const grouped: Record<ToolRequestStatus, ToolRequest[]> = {
      wishlist: [],
      planned: [],
      in_progress: [],
      done: [],
      rejected: [],
    };
    for (const request of state.value.requests) {
      grouped[request.status].push(request);
    }
    return grouped;
  });

  const requestsByType = computed(() => {
    const grouped: Record<ToolRequestType, ToolRequest[]> = {
      source: [],
      integration: [],
      feature: [],
    };
    for (const request of state.value.requests) {
      grouped[request.requestType].push(request);
    }
    return grouped;
  });

  const requestsByPriority = computed(() => {
    const grouped: Record<ToolRequestPriority, ToolRequest[]> = {
      high: [],
      medium: [],
      low: [],
    };
    for (const request of state.value.requests) {
      grouped[request.priority].push(request);
    }
    return grouped;
  });

  const totalPages = computed(() =>
    Math.ceil(state.value.totalCount / state.value.pageSize)
  );

  const hasMore = computed(() => state.value.page < totalPages.value);

  // Stats
  const requestStats = computed(() => {
    const total = state.value.requests.length;
    const wishlist = state.value.requests.filter((r) => r.status === 'wishlist').length;
    const planned = state.value.requests.filter((r) => r.status === 'planned').length;
    const inProgress = state.value.requests.filter((r) => r.status === 'in_progress').length;
    const done = state.value.requests.filter((r) => r.status === 'done').length;
    const rejected = state.value.requests.filter((r) => r.status === 'rejected').length;
    const highPriority = state.value.requests.filter((r) => r.priority === 'high').length;

    return {
      total,
      wishlist,
      planned,
      inProgress,
      done,
      rejected,
      highPriority,
      completionRate: total > 0 ? (done / total) * 100 : 0,
    };
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getRequestById(id: string): ToolRequest | undefined {
    return state.value.requests.find((r) => r.id === id);
  }

  function getRequestsForUniverse(universeId: string): ToolRequest[] {
    return state.value.requests.filter((r) => r.universeId === universeId);
  }

  function getRequestsForTarget(targetId: string): ToolRequest[] {
    return state.value.requests.filter((r) => r.targetId === targetId);
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

  function setRequests(requests: ToolRequest[]) {
    state.value.requests = requests;
  }

  function addRequest(request: ToolRequest) {
    const idx = state.value.requests.findIndex((r) => r.id === request.id);
    if (idx >= 0) {
      state.value.requests[idx] = request;
    } else {
      state.value.requests.unshift(request);
    }
  }

  function updateRequest(id: string, updates: Partial<ToolRequest>) {
    const idx = state.value.requests.findIndex((r) => r.id === id);
    if (idx >= 0) {
      state.value.requests[idx] = { ...state.value.requests[idx], ...updates };
    }
  }

  function removeRequest(id: string) {
    state.value.requests = state.value.requests.filter((r) => r.id !== id);
    if (state.value.selectedRequestId === id) {
      state.value.selectedRequestId = null;
    }
  }

  function selectRequest(id: string | null) {
    state.value.selectedRequestId = id;
  }

  function _setSelectedRequestId(id: string | null) {
    state.value.selectedRequestId = id;
  }

  function setFilters(filters: Partial<ToolRequestFilters>) {
    state.value.filters = { ...state.value.filters, ...filters };
  }

  function clearFilters() {
    state.value.filters = {
      universeId: null,
      targetId: null,
      requestType: null,
      status: null,
      priority: null,
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
      requests: [],
      selectedRequestId: null,
      filters: {
        universeId: null,
        targetId: null,
        requestType: null,
        status: null,
        priority: null,
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
    requests,
    selectedRequestId,
    filters,
    page,
    pageSize,
    totalCount,
    isLoading,
    error,

    // Derived state
    selectedRequest,
    filteredRequests,
    activeRequests,
    wishlistRequests,
    requestsByStatus,
    requestsByType,
    requestsByPriority,
    totalPages,
    hasMore,
    requestStats,

    // Getters (functions)
    getRequestById,
    getRequestsForUniverse,
    getRequestsForTarget,

    // Mutations
    setLoading,
    setError,
    clearError,
    setRequests,
    addRequest,
    updateRequest,
    removeRequest,
    selectRequest,
    setFilters,
    clearFilters,
    setPage,
    setPageSize,
    setTotalCount,
    resetState,
  };
});
