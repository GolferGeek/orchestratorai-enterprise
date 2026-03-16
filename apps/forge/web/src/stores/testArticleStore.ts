/**
 * Test Article Store - State + Synchronous Mutations Only
 *
 * Manages state for the Synthetic Articles Library (Phase 3 SCR-003).
 * For async operations, use predictionDashboardService.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { TestArticle } from '@/services/predictionDashboardService';

type ArticleSentiment = 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'all';

interface TestArticleFilters {
  scenarioId: string | null;
  targetSymbol: string | null;
  sentiment: ArticleSentiment;
  isProcessed: boolean | null;
}

interface TestArticleState {
  // Articles list
  articles: TestArticle[];

  // Selected article
  selectedArticleId: string | null;

  // Filters
  filters: TestArticleFilters;

  // Pagination
  page: number;
  pageSize: number;
  totalCount: number;

  // Loading/error state
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

export const useTestArticleStore = defineStore('testArticle', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<TestArticleState>({
    articles: [],
    selectedArticleId: null,
    filters: {
      scenarioId: null,
      targetSymbol: null,
      sentiment: 'all',
      isProcessed: null,
    },
    page: 1,
    pageSize: 20,
    totalCount: 0,
    isLoading: false,
    isSaving: false,
    error: null,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const articles = computed(() => state.value.articles);
  const selectedArticleId = computed(() => state.value.selectedArticleId);
  const filters = computed(() => state.value.filters);
  const page = computed(() => state.value.page);
  const pageSize = computed(() => state.value.pageSize);
  const totalCount = computed(() => state.value.totalCount);
  const isLoading = computed(() => state.value.isLoading);
  const isSaving = computed(() => state.value.isSaving);
  const error = computed(() => state.value.error);

  // Derived state
  const selectedArticle = computed(() =>
    state.value.articles.find((a) => a.id === state.value.selectedArticleId)
  );

  const filteredArticles = computed(() => {
    let result = state.value.articles;

    if (state.value.filters.scenarioId) {
      result = result.filter((a) => a.scenario_id === state.value.filters.scenarioId);
    }

    if (state.value.filters.targetSymbol) {
      result = result.filter((a) =>
        a.target_symbols.includes(state.value.filters.targetSymbol!)
      );
    }

    if (state.value.filters.sentiment !== 'all') {
      result = result.filter((a) => a.sentiment === state.value.filters.sentiment);
    }

    if (state.value.filters.isProcessed !== null) {
      result = result.filter((a) => a.is_processed === state.value.filters.isProcessed);
    }

    return result;
  });

  const unprocessedArticles = computed(() =>
    state.value.articles.filter((a) => !a.is_processed)
  );

  const processedArticles = computed(() =>
    state.value.articles.filter((a) => a.is_processed)
  );

  const articlesByScenario = computed(() => {
    const grouped: Record<string, TestArticle[]> = {};
    for (const article of state.value.articles) {
      if (!grouped[article.scenario_id]) {
        grouped[article.scenario_id] = [];
      }
      grouped[article.scenario_id].push(article);
    }
    return grouped;
  });

  const uniqueTargetSymbols = computed(() => {
    const symbols = new Set<string>();
    for (const article of state.value.articles) {
      for (const symbol of article.target_symbols) {
        symbols.add(symbol);
      }
    }
    return Array.from(symbols).sort();
  });

  const totalPages = computed(() =>
    Math.ceil(state.value.totalCount / state.value.pageSize)
  );

  const hasMore = computed(() => state.value.page < totalPages.value);

  // Stats
  const stats = computed(() => ({
    total: state.value.articles.length,
    processed: processedArticles.value.length,
    unprocessed: unprocessedArticles.value.length,
    bullish: state.value.articles.filter((a) => a.sentiment === 'bullish').length,
    bearish: state.value.articles.filter((a) => a.sentiment === 'bearish').length,
    neutral: state.value.articles.filter((a) => a.sentiment === 'neutral').length,
    mixed: state.value.articles.filter((a) => a.sentiment === 'mixed').length,
  }));

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getArticleById(id: string): TestArticle | undefined {
    return state.value.articles.find((a) => a.id === id);
  }

  function getArticlesByScenarioId(scenarioId: string): TestArticle[] {
    return state.value.articles.filter((a) => a.scenario_id === scenarioId);
  }

  function getArticlesByTargetSymbol(symbol: string): TestArticle[] {
    return state.value.articles.filter((a) => a.target_symbols.includes(symbol));
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

  // Article mutations
  function setArticles(articles: TestArticle[]) {
    state.value.articles = articles;
  }

  function addArticle(article: TestArticle) {
    const idx = state.value.articles.findIndex((a) => a.id === article.id);
    if (idx >= 0) {
      state.value.articles[idx] = article;
    } else {
      state.value.articles.unshift(article);
    }
  }

  function addArticles(articles: TestArticle[]) {
    for (const article of articles) {
      addArticle(article);
    }
  }

  function updateArticle(id: string, updates: Partial<TestArticle>) {
    const idx = state.value.articles.findIndex((a) => a.id === id);
    if (idx >= 0) {
      state.value.articles[idx] = { ...state.value.articles[idx], ...updates };
    }
  }

  function removeArticle(id: string) {
    state.value.articles = state.value.articles.filter((a) => a.id !== id);
    if (state.value.selectedArticleId === id) {
      state.value.selectedArticleId = null;
    }
  }

  function markProcessed(id: string, isProcessed: boolean = true) {
    updateArticle(id, { is_processed: isProcessed });
  }

  // Selection mutations
  function selectArticle(id: string | null) {
    state.value.selectedArticleId = id;
  }

  // Filter mutations
  function setFilters(filters: Partial<TestArticleFilters>) {
    state.value.filters = { ...state.value.filters, ...filters };
  }

  function setScenarioFilter(scenarioId: string | null) {
    state.value.filters.scenarioId = scenarioId;
  }

  function setTargetSymbolFilter(symbol: string | null) {
    state.value.filters.targetSymbol = symbol;
  }

  function setSentimentFilter(sentiment: ArticleSentiment) {
    state.value.filters.sentiment = sentiment;
  }

  function setProcessedFilter(isProcessed: boolean | null) {
    state.value.filters.isProcessed = isProcessed;
  }

  function clearFilters() {
    state.value.filters = {
      scenarioId: null,
      targetSymbol: null,
      sentiment: 'all',
      isProcessed: null,
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
      articles: [],
      selectedArticleId: null,
      filters: {
        scenarioId: null,
        targetSymbol: null,
        sentiment: 'all',
        isProcessed: null,
      },
      page: 1,
      pageSize: 20,
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
    articles,
    selectedArticleId,
    filters,
    page,
    pageSize,
    totalCount,
    isLoading,
    isSaving,
    error,

    // Derived state
    selectedArticle,
    filteredArticles,
    unprocessedArticles,
    processedArticles,
    articlesByScenario,
    uniqueTargetSymbols,
    totalPages,
    hasMore,
    stats,

    // Getters (functions)
    getArticleById,
    getArticlesByScenarioId,
    getArticlesByTargetSymbol,

    // Mutations
    setLoading,
    setSaving,
    setError,
    clearError,
    setArticles,
    addArticle,
    addArticles,
    updateArticle,
    removeArticle,
    markProcessed,
    selectArticle,
    setFilters,
    setScenarioFilter,
    setTargetSymbolFilter,
    setSentimentFilter,
    setProcessedFilter,
    clearFilters,
    setPage,
    setPageSize,
    setTotalCount,
    resetState,
  };
});
