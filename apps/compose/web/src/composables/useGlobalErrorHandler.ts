import { onMounted, onUnmounted, getCurrentInstance, ref, computed } from 'vue';
import { useErrorStore } from '@/stores/errorStore';
import type ErrorLoggerService from '@/services/errorLoggerService';

/**
 * Global Error Handler Composable
 * Provides centralized error handling across the application
 */
export function useGlobalErrorHandler() {
  const errorStore = useErrorStore();
  const instance = getCurrentInstance();

  const errorLoggerService = ref<ErrorLoggerService | null>(null);
  const isProcessingErrors = ref(false);

  // Computed property to check if the error logger service is available
  const isErrorLoggerReady = computed(() => errorLoggerService.value !== null);

  // Set up error logger in the store (lazy import to avoid circular references)
  onMounted(async () => {
    try {
      const imported = await import('@/services/errorLoggerService');

      errorLoggerService.value = imported.errorLoggerService;
      errorStore.setErrorLogger(imported.errorLoggerService);

      // Process retry queue once after service is loaded (not in watchEffect to avoid loops)
      if (errorLoggerService.value && !isProcessingErrors.value) {
        isProcessingErrors.value = true;
        try {
          await errorLoggerService.value.processRetryQueue();
        } catch (err) {
          console.error('Error processing retry queue:', err);
        } finally {
          isProcessingErrors.value = false;
        }
      }
    } catch (err) {
      console.error('Failed to load error logger service:', err);
    }
  });

  /**
   * Handle JavaScript errors globally
   */
  const handleGlobalError = (event: ErrorEvent) => {
    console.error('🚨 Global JavaScript error:', event.error);
    
    // Check if component is still mounted before adding error
    if (instance?.isUnmounted) return;
    
    errorStore.addError(event.error || new Error(event.message), {
      component: 'Global',
      url: event.filename,
      additionalContext: {
        lineno: event.lineno,
        colno: event.colno,
        source: 'window.onerror'
      }
    });
  };

  /**
   * Handle unhandled promise rejections
   */
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    console.error('🚨 Unhandled promise rejection:', event.reason);
    
    // Check if component is still mounted before adding error
    if (instance?.isUnmounted) return;
    
    // Create error from rejection reason
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    
    errorStore.addError(error, {
      component: 'Promise',
      additionalContext: {
        source: 'window.onunhandledrejection',
        reason: String(event.reason)
      }
    });
  };

  /**
   * Handle Vue errors (for composition API)
   */
  const handleVueError = (error: Error, context?: string) => {
    console.error('🚨 Vue error:', error);
    
    errorStore.addError(error, {
      component: instance?.type?.name || instance?.type?.__name || 'Unknown',
      additionalContext: {
        source: 'vue-error-handler',
        context: context ?? null
      }
    });
  };

  /**
   * Handle API errors specifically
   */
  const handleApiError = (error: Error, endpoint?: string, method?: string) => {
    console.error('🚨 API error:', error);
    
    errorStore.addError(error, {
      component: 'API',
      additionalContext: {
        source: 'api-error',
        endpoint: endpoint ?? null,
        method: method ?? null
      }
    });
  };

  /**
   * Handle network errors
   */
  const handleNetworkError = (error: Error, url?: string) => {
    console.error('🚨 Network error:', error);
    
    errorStore.addError(error, {
      component: 'Network',
      additionalContext: {
        source: 'network-error',
        url: url ?? null
      }
    });
  };

  /**
   * Handle chunk loading errors (common with code splitting)
   */
  const handleChunkError = (error: Error) => {
    console.error('🚨 Chunk loading error:', error);
    
    errorStore.addError(error, {
      component: 'ChunkLoader',
      additionalContext: {
        source: 'chunk-error'
      }
    });
  };

  /**
   * Set up global error listeners
   */
  const setupGlobalListeners = () => {
    // JavaScript errors
    window.addEventListener('error', handleGlobalError);
    
    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    // Resource loading errors
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        const element = event.target as HTMLElement;
        const error = new Error(`Failed to load resource: ${element.tagName}`);
        
        errorStore.addError(error, {
          component: 'ResourceLoader',
          additionalContext: {
            source: 'resource-error',
            tagName: element.tagName,
            src: (element as HTMLImageElement).src || (element as HTMLAnchorElement).href
          }
        });
      }
    }, true);
  };

  /**
   * Remove global error listeners
   */
  const removeGlobalListeners = () => {
    window.removeEventListener('error', handleGlobalError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };

  /**
   * Report error with user context
   */
  const reportError = async (
    errorId: string,
    userFeedback?: string,
    reproductionSteps?: string,
    expectedBehavior?: string
  ): Promise<boolean> => {
    const error = errorStore.getErrorById(errorId);
    if (!error) {
      return false;
    }

    try {
      const success = await errorStore.reportError(
        error,
        userFeedback,
        reproductionSteps,
        expectedBehavior
      );

      return success;
    } catch (error) {
      console.error('❌ Failed to report error:', error);
      return false;
    }
  };

  /**
   * Clear old errors (cleanup)
   */
  const clearOldErrors = (olderThanHours: number = 24) => {
    const cutoff = Date.now() - (olderThanHours * 60 * 60 * 1000);

    errorStore.clearErrors({
      timeRange: {
        start: 0,
        end: cutoff
      }
    });
  };

  /**
   * Get error summary for debugging
   */
  const getErrorSummary = () => {
    const stats = errorStore.errorStats;
    
    return {
      ...stats,
      hasUnresolvedCritical: errorStore.hasUnresolvedCriticalErrors,
      recentErrors: errorStore.recentErrors.slice(0, 5), // Last 5 recent errors
      loggerStatus: errorLoggerService.value ? errorLoggerService.value.getRetryQueueStatus() : null
    };
  };

  /**
   * Test error handling (development only)
   */
  const testErrorHandling = () => {
    if (import.meta.env.PROD) {
      return;
    }
    
    // Test synchronous error
    setTimeout(() => {
      throw new Error('Test synchronous error');
    }, 1000);
    
    // Test promise rejection
    setTimeout(() => {
      Promise.reject(new Error('Test promise rejection'));
    }, 2000);
    
    // Test API error simulation
    setTimeout(() => {
      handleApiError(new Error('Test API error'), '/test/endpoint', 'GET');
    }, 3000);
  };

  // Set up listeners on mount
  onMounted(() => {
    setupGlobalListeners();

    // Set up periodic cleanup with guard to prevent infinite loops
    const cleanupInterval = setInterval(async () => {
      clearOldErrors(24); // Clear errors older than 24 hours
      if (errorLoggerService.value && !isProcessingErrors.value) {
        isProcessingErrors.value = true;
        try {
          await errorLoggerService.value.processRetryQueue();
        } catch (err) {
          console.error('Error in periodic cleanup:', err);
        } finally {
          isProcessingErrors.value = false;
        }
      }
    }, 60 * 60 * 1000); // Every hour

    // Store interval for cleanup
    if (instance) {
      (instance as unknown as Record<string, unknown>).cleanupInterval = cleanupInterval;
    }
  });

  // Clean up listeners on unmount
  onUnmounted(() => {
    removeGlobalListeners();
    
    // Clear cleanup interval
    if (instance && (instance as unknown as Record<string, unknown>).cleanupInterval) {
      clearInterval((instance as unknown as Record<string, unknown>).cleanupInterval as NodeJS.Timeout);
    }
  });

  return {
    // Error handling methods
    handleVueError,
    handleApiError,
    handleNetworkError,
    handleChunkError,
    
    // Utility methods
    reportError,
    clearOldErrors,
    getErrorSummary,
    testErrorHandling,
    
    // Store access
    errorStore,
    
    // Service access
    errorLoggerService,
    isErrorLoggerReady
  };
}
