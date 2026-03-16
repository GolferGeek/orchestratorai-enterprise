/**
 * Test Price Data Store - State + Synchronous Mutations Only
 *
 * Manages state for the Test Price Timeline (Phase 3 SCR-004).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { TestPriceData } from '@/services/predictionDashboardService';

interface TestPriceDataFilters {
  scenarioId: string | null;
  symbol: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface TestPriceDataState {
  // Price data list
  priceData: TestPriceData[];

  // Selected price point
  selectedPriceId: string | null;

  // Currently selected symbol for timeline view
  selectedSymbol: string | null;

  // Filters
  filters: TestPriceDataFilters;

  // Pagination
  page: number;
  pageSize: number;
  totalCount: number;

  // Loading/error state
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

export const useTestPriceDataStore = defineStore('testPriceData', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<TestPriceDataState>({
    priceData: [],
    selectedPriceId: null,
    selectedSymbol: null,
    filters: {
      scenarioId: null,
      symbol: null,
      startDate: null,
      endDate: null,
    },
    page: 1,
    pageSize: 100, // Higher default for price data
    totalCount: 0,
    isLoading: false,
    isSaving: false,
    error: null,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const priceData = computed(() => state.value.priceData);
  const selectedPriceId = computed(() => state.value.selectedPriceId);
  const selectedSymbol = computed(() => state.value.selectedSymbol);
  const filters = computed(() => state.value.filters);
  const page = computed(() => state.value.page);
  const pageSize = computed(() => state.value.pageSize);
  const totalCount = computed(() => state.value.totalCount);
  const isLoading = computed(() => state.value.isLoading);
  const isSaving = computed(() => state.value.isSaving);
  const error = computed(() => state.value.error);

  // Derived state
  const selectedPrice = computed(() =>
    state.value.priceData.find((p) => p.id === state.value.selectedPriceId)
  );

  const filteredPriceData = computed(() => {
    let result = state.value.priceData;

    if (state.value.filters.scenarioId) {
      result = result.filter((p) => p.scenario_id === state.value.filters.scenarioId);
    }

    if (state.value.filters.symbol) {
      result = result.filter((p) => p.symbol === state.value.filters.symbol);
    }

    if (state.value.filters.startDate) {
      result = result.filter((p) => p.price_date >= state.value.filters.startDate!);
    }

    if (state.value.filters.endDate) {
      result = result.filter((p) => p.price_date <= state.value.filters.endDate!);
    }

    return result;
  });

  // Price data sorted by date (ascending for charts)
  const sortedPriceData = computed(() =>
    [...filteredPriceData.value].sort(
      (a, b) => new Date(a.price_date).getTime() - new Date(b.price_date).getTime()
    )
  );

  // Price data for selected symbol (timeline view)
  const selectedSymbolPriceData = computed(() => {
    if (!state.value.selectedSymbol) return [];
    return sortedPriceData.value.filter((p) => p.symbol === state.value.selectedSymbol);
  });

  // Grouped by symbol
  const priceDataBySymbol = computed(() => {
    const grouped: Record<string, TestPriceData[]> = {};
    for (const price of state.value.priceData) {
      if (!grouped[price.symbol]) {
        grouped[price.symbol] = [];
      }
      grouped[price.symbol].push(price);
    }
    // Sort each group by date
    for (const symbol of Object.keys(grouped)) {
      grouped[symbol].sort(
        (a, b) => new Date(a.price_date).getTime() - new Date(b.price_date).getTime()
      );
    }
    return grouped;
  });

  // Unique symbols (T_ prefixed test symbols)
  const uniqueSymbols = computed(() => {
    const symbols = new Set<string>();
    for (const price of state.value.priceData) {
      symbols.add(price.symbol);
    }
    return Array.from(symbols).sort();
  });

  // Latest price per symbol
  const latestPriceBySymbol = computed(() => {
    const latest: Record<string, TestPriceData> = {};
    for (const price of state.value.priceData) {
      if (!latest[price.symbol] || price.price_date > latest[price.symbol].price_date) {
        latest[price.symbol] = price;
      }
    }
    return latest;
  });

  const totalPages = computed(() =>
    Math.ceil(state.value.totalCount / state.value.pageSize)
  );

  const hasMore = computed(() => state.value.page < totalPages.value);

  // Stats
  const stats = computed(() => ({
    totalPrices: state.value.priceData.length,
    uniqueSymbols: uniqueSymbols.value.length,
    dateRange: {
      earliest: sortedPriceData.value[0]?.price_date || null,
      latest: sortedPriceData.value[sortedPriceData.value.length - 1]?.price_date || null,
    },
  }));

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getPriceById(id: string): TestPriceData | undefined {
    return state.value.priceData.find((p) => p.id === id);
  }

  function getPricesBySymbol(symbol: string): TestPriceData[] {
    return state.value.priceData
      .filter((p) => p.symbol === symbol)
      .sort((a, b) => new Date(a.price_date).getTime() - new Date(b.price_date).getTime());
  }

  function getPricesByScenarioId(scenarioId: string): TestPriceData[] {
    return state.value.priceData.filter((p) => p.scenario_id === scenarioId);
  }

  function getLatestPrice(symbol: string): TestPriceData | undefined {
    return latestPriceBySymbol.value[symbol];
  }

  function getPricesByDateRange(
    symbol: string,
    startDate: string,
    endDate: string
  ): TestPriceData[] {
    return state.value.priceData
      .filter(
        (p) =>
          p.symbol === symbol && p.price_date >= startDate && p.price_date <= endDate
      )
      .sort((a, b) => new Date(a.price_date).getTime() - new Date(b.price_date).getTime());
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

  // Price data mutations
  function setPriceData(priceData: TestPriceData[]) {
    state.value.priceData = priceData;
  }

  function addPriceData(price: TestPriceData) {
    const idx = state.value.priceData.findIndex((p) => p.id === price.id);
    if (idx >= 0) {
      state.value.priceData[idx] = price;
    } else {
      state.value.priceData.push(price);
    }
  }

  function addPriceDataBulk(prices: TestPriceData[]) {
    for (const price of prices) {
      addPriceData(price);
    }
  }

  function updatePriceData(id: string, updates: Partial<TestPriceData>) {
    const idx = state.value.priceData.findIndex((p) => p.id === id);
    if (idx >= 0) {
      state.value.priceData[idx] = { ...state.value.priceData[idx], ...updates };
    }
  }

  function removePriceData(id: string) {
    state.value.priceData = state.value.priceData.filter((p) => p.id !== id);
    if (state.value.selectedPriceId === id) {
      state.value.selectedPriceId = null;
    }
  }

  function removePriceDataBySymbol(symbol: string) {
    state.value.priceData = state.value.priceData.filter((p) => p.symbol !== symbol);
  }

  function removePriceDataByScenario(scenarioId: string) {
    state.value.priceData = state.value.priceData.filter(
      (p) => p.scenario_id !== scenarioId
    );
  }

  // Selection mutations
  function selectPrice(id: string | null) {
    state.value.selectedPriceId = id;
  }

  function selectSymbol(symbol: string | null) {
    state.value.selectedSymbol = symbol;
    // Also set the symbol filter
    state.value.filters.symbol = symbol;
  }

  // Filter mutations
  function setFilters(filters: Partial<TestPriceDataFilters>) {
    state.value.filters = { ...state.value.filters, ...filters };
  }

  function setScenarioFilter(scenarioId: string | null) {
    state.value.filters.scenarioId = scenarioId;
  }

  function setSymbolFilter(symbol: string | null) {
    state.value.filters.symbol = symbol;
  }

  function setDateRangeFilter(startDate: string | null, endDate: string | null) {
    state.value.filters.startDate = startDate;
    state.value.filters.endDate = endDate;
  }

  function clearFilters() {
    state.value.filters = {
      scenarioId: null,
      symbol: null,
      startDate: null,
      endDate: null,
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
      priceData: [],
      selectedPriceId: null,
      selectedSymbol: null,
      filters: {
        scenarioId: null,
        symbol: null,
        startDate: null,
        endDate: null,
      },
      page: 1,
      pageSize: 100,
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
    priceData,
    selectedPriceId,
    selectedSymbol,
    filters,
    page,
    pageSize,
    totalCount,
    isLoading,
    isSaving,
    error,

    // Derived state
    selectedPrice,
    filteredPriceData,
    sortedPriceData,
    selectedSymbolPriceData,
    priceDataBySymbol,
    uniqueSymbols,
    latestPriceBySymbol,
    totalPages,
    hasMore,
    stats,

    // Getters (functions)
    getPriceById,
    getPricesBySymbol,
    getPricesByScenarioId,
    getLatestPrice,
    getPricesByDateRange,

    // Mutations
    setLoading,
    setSaving,
    setError,
    clearError,
    setPriceData,
    addPriceData,
    addPriceDataBulk,
    updatePriceData,
    removePriceData,
    removePriceDataBySymbol,
    removePriceDataByScenario,
    selectPrice,
    selectSymbol,
    setFilters,
    setScenarioFilter,
    setSymbolFilter,
    setDateRangeFilter,
    clearFilters,
    setPage,
    setPageSize,
    setTotalCount,
    resetState,
  };
});
