// Store Integration Composables
// Provides reusable patterns for integrating Pinia stores with Vue components

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';

/**
 * Composable for handling store loading states
 */
export function useStoreLoading(...stores: Array<{ isLoading: Ref<boolean> }>) {
  const isAnyLoading = computed(() => {
    return stores.some(store => store.isLoading.value);
  });

  const loadingStates = computed(() => {
    return stores.map(store => store.isLoading.value);
  });

  return {
    isAnyLoading,
    loadingStates,
    isLoading: isAnyLoading // Alias for backwards compatibility
  };
}

/**
 * Composable for handling store error states
 */
export function useStoreErrors(...stores: Array<{ error: Ref<string | null> }>) {
  const hasAnyError = computed(() => {
    return stores.some(store => store.error.value !== null);
  });

  const firstError = computed(() => {
    for (const store of stores) {
      if (store.error.value) {
        return store.error.value;
      }
    }
    return null;
  });

  const allErrors = computed(() => {
    return stores
      .map(store => store.error.value)
      .filter(error => error !== null);
  });

  const clearAllErrors = () => {
    stores.forEach(store => {
      if ('clearError' in store && typeof store.clearError === 'function') {
        (store as { clearError: () => void }).clearError();
      }
    });
  };

  return {
    hasAnyError,
    firstError,
    allErrors,
    clearAllErrors
  };
}

/**
 * Composable for handling store auto-refresh functionality
 */
export function useStoreAutoRefresh(
  refreshFunctions: Array<() => Promise<void> | void>,
  interval: number = 30000, // 30 seconds default
  immediate: boolean = true
) {
  const isAutoRefreshEnabled = ref(true);
  const refreshTimer = ref<NodeJS.Timeout | null>(null);
  const lastRefreshTime = ref<Date | null>(null);

  const startAutoRefresh = () => {
    if (refreshTimer.value) {
      clearInterval(refreshTimer.value);
    }
    
    if (isAutoRefreshEnabled.value) {
      refreshTimer.value = setInterval(async () => {
        try {
          await Promise.all(refreshFunctions.map(fn => fn()));
          lastRefreshTime.value = new Date();
        } catch (error) {
          console.error('Auto-refresh error:', error);
        }
      }, interval);
    }
  };

  const stopAutoRefresh = () => {
    if (refreshTimer.value) {
      clearInterval(refreshTimer.value);
      refreshTimer.value = null;
    }
  };

  const toggleAutoRefresh = () => {
    isAutoRefreshEnabled.value = !isAutoRefreshEnabled.value;
    if (isAutoRefreshEnabled.value) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  };

  const refreshNow = async () => {
    try {
      await Promise.all(refreshFunctions.map(fn => fn()));
      lastRefreshTime.value = new Date();
    } catch (error) {
      console.error('Manual refresh error:', error);
      throw error;
    }
  };

  // Watch for changes in auto-refresh enabled state
  watch(isAutoRefreshEnabled, (enabled) => {
    if (enabled) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });

  // Lifecycle management
  onMounted(() => {
    if (immediate && isAutoRefreshEnabled.value) {
      refreshNow().then(() => {
        startAutoRefresh();
      });
    } else if (isAutoRefreshEnabled.value) {
      startAutoRefresh();
    }
  });

  onUnmounted(() => {
    stopAutoRefresh();
  });

  return {
    isAutoRefreshEnabled,
    lastRefreshTime,
    startAutoRefresh,
    stopAutoRefresh,
    toggleAutoRefresh,
    refreshNow
  };
}

/**
 * Composable for handling store filters with debouncing
 */
export function useStoreFilters<T extends Record<string, unknown>>(
  initialFilters: T,
  applyFilters: (filters: T) => void,
  debounceMs: number = 500
) {
  const filters = ref<T>({ ...initialFilters });
  const debouncedApplyFilters = ref<NodeJS.Timeout | null>(null);

  const updateFilters = (newFilters: Partial<T>) => {
    filters.value = { ...filters.value, ...newFilters };
    triggerFilterUpdate();
  };

  const resetFilters = () => {
    filters.value = { ...initialFilters };
    triggerFilterUpdate();
  };

  const triggerFilterUpdate = () => {
    if (debouncedApplyFilters.value) {
      clearTimeout(debouncedApplyFilters.value);
    }

    debouncedApplyFilters.value = setTimeout(() => {
      applyFilters(filters.value);
    }, debounceMs);
  };

  // Clean up timeout on unmount
  onUnmounted(() => {
    if (debouncedApplyFilters.value) {
      clearTimeout(debouncedApplyFilters.value);
    }
  });

  return {
    filters,
    updateFilters,
    resetFilters,
    triggerFilterUpdate
  };
}

/**
 * Composable for handling store selection state
 */
export function useStoreSelection<T extends { id: string }>(
  items: Ref<T[]>,
  onSelectionChange?: (selectedItems: T[]) => void
) {
  const selectedIds = ref<Set<string>>(new Set());

  const selectedItems = computed(() => {
    return items.value.filter(item => selectedIds.value.has(item.id));
  });

  const isSelected = (id: string) => {
    return selectedIds.value.has(id);
  };

  const selectItem = (id: string) => {
    selectedIds.value.add(id);
    onSelectionChange?.(selectedItems.value);
  };

  const deselectItem = (id: string) => {
    selectedIds.value.delete(id);
    onSelectionChange?.(selectedItems.value);
  };

  const toggleSelection = (id: string) => {
    if (selectedIds.value.has(id)) {
      deselectItem(id);
    } else {
      selectItem(id);
    }
  };

  const selectAll = () => {
    selectedIds.value = new Set(items.value.map(item => item.id));
    onSelectionChange?.(selectedItems.value);
  };

  const deselectAll = () => {
    selectedIds.value.clear();
    onSelectionChange?.(selectedItems.value);
  };

  const isAllSelected = computed(() => {
    return items.value.length > 0 && selectedIds.value.size === items.value.length;
  });

  const isIndeterminate = computed(() => {
    return selectedIds.value.size > 0 && selectedIds.value.size < items.value.length;
  });

  const selectedCount = computed(() => {
    return selectedIds.value.size;
  });

  const hasSelection = computed(() => {
    return selectedIds.value.size > 0;
  });

  return {
    selectedIds,
    selectedItems,
    selectedCount,
    hasSelection,
    isAllSelected,
    isIndeterminate,
    isSelected,
    selectItem,
    deselectItem,
    toggleSelection,
    selectAll,
    deselectAll
  };
}

/**
 * Composable for handling store pagination
 */
export function useStorePagination(
  totalItems: Ref<number>,
  pageSize: Ref<number> = ref(20),
  onPageChange?: (page: number) => void
) {
  const currentPage = ref(1);

  const totalPages = computed(() => {
    return Math.ceil(totalItems.value / pageSize.value);
  });

  const hasNextPage = computed(() => {
    return currentPage.value < totalPages.value;
  });

  const hasPreviousPage = computed(() => {
    return currentPage.value > 1;
  });

  const startIndex = computed(() => {
    return (currentPage.value - 1) * pageSize.value;
  });

  const endIndex = computed(() => {
    return Math.min(startIndex.value + pageSize.value, totalItems.value);
  });

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page;
      onPageChange?.(page);
    }
  };

  const nextPage = () => {
    if (hasNextPage.value) {
      goToPage(currentPage.value + 1);
    }
  };

  const previousPage = () => {
    if (hasPreviousPage.value) {
      goToPage(currentPage.value - 1);
    }
  };

  const setPageSize = (size: number) => {
    pageSize.value = size;
    // Reset to first page when page size changes
    goToPage(1);
  };

  return {
    currentPage,
    totalPages,
    pageSize,
    hasNextPage,
    hasPreviousPage,
    startIndex,
    endIndex,
    goToPage,
    nextPage,
    previousPage,
    setPageSize
  };
}

/**
 * Composable for handling real-time store updates
 */
export function useStoreRealTime(
  enableRealTime: Ref<boolean>,
  updateFunctions: Array<() => Promise<void> | void>,
  interval: number = 5000 // 5 seconds for real-time updates
) {
  const isRealTimeActive = ref(false);
  const realTimeTimer = ref<NodeJS.Timeout | null>(null);
  const lastUpdateTime = ref<Date | null>(null);

  const startRealTime = () => {
    if (!enableRealTime.value) return;

    stopRealTime();
    isRealTimeActive.value = true;

    realTimeTimer.value = setInterval(async () => {
      try {
        await Promise.all(updateFunctions.map(fn => fn()));
        lastUpdateTime.value = new Date();
      } catch (error) {
        console.error('Real-time update error:', error);
      }
    }, interval);
  };

  const stopRealTime = () => {
    if (realTimeTimer.value) {
      clearInterval(realTimeTimer.value);
      realTimeTimer.value = null;
    }
    isRealTimeActive.value = false;
  };

  const toggleRealTime = () => {
    if (isRealTimeActive.value) {
      stopRealTime();
    } else {
      startRealTime();
    }
  };

  // Watch for changes in enableRealTime
  watch(enableRealTime, (enabled) => {
    if (enabled && !isRealTimeActive.value) {
      startRealTime();
    } else if (!enabled && isRealTimeActive.value) {
      stopRealTime();
    }
  });

  // Lifecycle management
  onMounted(() => {
    if (enableRealTime.value) {
      startRealTime();
    }
  });

  onUnmounted(() => {
    stopRealTime();
  });

  return {
    isRealTimeActive,
    lastUpdateTime,
    startRealTime,
    stopRealTime,
    toggleRealTime
  };
}

/**
 * Composable for handling store data export functionality
 */
export function useStoreExport() {
  const isExporting = ref(false);
  const exportError = ref<string | null>(null);

  const exportData = async (
    data: Record<string, unknown>[],
    filename: string,
    format: 'json' | 'csv' | 'excel' = 'json'
  ) => {
    isExporting.value = true;
    exportError.value = null;

    try {
      let blob: Blob;
      let fileExtension: string;

      switch (format) {
        case 'json':
          blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          fileExtension = '.json';
          break;
        case 'csv': {
          const csvContent = convertToCSV(data);
          blob = new Blob([csvContent], { type: 'text/csv' });
          fileExtension = '.csv';
          break;
        }
        case 'excel': {
          // For Excel, we'd typically use a library like xlsx
          // For now, export as CSV with Excel-compatible format
          const excelCsvContent = convertToCSV(data);
          blob = new Blob([excelCsvContent], { type: 'text/csv' });
          fileExtension = '.csv';
          break;
        }
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}${fileExtension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      exportError.value = error instanceof Error ? error.message : 'Export failed';
      throw error;
    } finally {
      isExporting.value = false;
    }
  };

  // Helper function to convert data to CSV
  const convertToCSV = (data: Record<string, unknown>[]): string => {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [];

    // Add header row
    csvRows.push(headers.map(header => `"${header}"`).join(','));

    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  };

  return {
    isExporting,
    exportError,
    exportData
  };
}

/**
 * Composable for handling store search functionality
 */
export function useStoreSearch<T>(
  items: Ref<T[]>,
  searchFields: (keyof T)[],
  debounceMs: number = 300
) {
  const searchQuery = ref('');
  const debouncedSearchQuery = ref('');
  const searchTimer = ref<NodeJS.Timeout | null>(null);

  const filteredItems = computed(() => {
    if (!debouncedSearchQuery.value.trim()) {
      return items.value;
    }

    const query = debouncedSearchQuery.value.toLowerCase().trim();
    
    return items.value.filter(item => {
      return searchFields.some(field => {
        const value = item[field];
        if (value == null) return false;
        return String(value).toLowerCase().includes(query);
      });
    });
  });

  const updateSearch = (query: string) => {
    searchQuery.value = query;
    
    if (searchTimer.value) {
      clearTimeout(searchTimer.value);
    }

    searchTimer.value = setTimeout(() => {
      debouncedSearchQuery.value = query;
    }, debounceMs);
  };

  const clearSearch = () => {
    searchQuery.value = '';
    debouncedSearchQuery.value = '';
    if (searchTimer.value) {
      clearTimeout(searchTimer.value);
    }
  };

  const hasSearchQuery = computed(() => {
    return debouncedSearchQuery.value.trim().length > 0;
  });

  const searchResultCount = computed(() => {
    return filteredItems.value.length;
  });

  // Clean up timer on unmount
  onUnmounted(() => {
    if (searchTimer.value) {
      clearTimeout(searchTimer.value);
    }
  });

  return {
    searchQuery,
    debouncedSearchQuery,
    filteredItems,
    hasSearchQuery,
    searchResultCount,
    updateSearch,
    clearSearch
  };
}

/**
 * Utility function to create a unified store interface
 * Combines multiple stores into a single reactive interface
 */
export function createUnifiedStoreInterface<T extends Record<string, unknown>>(stores: T) {
  const storeKeys = Object.keys(stores);
  
  // Create combined loading state
  const isLoading = computed(() => {
    return storeKeys.some(key => {
      const store = stores[key] as Record<string, unknown>;
      return (store.isLoading as Ref<boolean> | undefined)?.value === true;
    });
  });

  // Create combined error state
  const hasError = computed(() => {
    return storeKeys.some(key => {
      const store = stores[key] as Record<string, unknown>;
      return (store.error as Ref<string | null> | undefined)?.value !== null;
    });
  });

  const firstError = computed(() => {
    for (const key of storeKeys) {
      const store = stores[key] as Record<string, unknown>;
      const errorRef = store.error as Ref<string | null> | undefined;
      if (errorRef?.value) {
        return errorRef.value;
      }
    }
    return null;
  });

  // Create refresh all function
  const refreshAll = async () => {
    const refreshPromises = storeKeys.map(key => {
      const store = stores[key] as Record<string, unknown>;
      if (store.refresh && typeof store.refresh === 'function') {
        return (store.refresh as () => Promise<void> | void)();
      }
      return Promise.resolve();
    });

    await Promise.all(refreshPromises);
  };

  // Create clear all errors function
  const clearAllErrors = () => {
    storeKeys.forEach(key => {
      const store = stores[key] as Record<string, unknown>;
      if (store.clearError && typeof store.clearError === 'function') {
        (store.clearError as () => void)();
      }
    });
  };

  return {
    stores,
    isLoading,
    hasError,
    firstError,
    refreshAll,
    clearAllErrors
  };
}
