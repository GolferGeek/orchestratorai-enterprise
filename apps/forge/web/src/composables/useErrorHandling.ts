import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useErrorStore, type AppError } from '@/stores/errorStore';

export interface ErrorHandlingOptions {
  showToast?: boolean;
  autoRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  component?: string;
}

export function useErrorHandling(options: ErrorHandlingOptions = {}) {
  const router = useRouter();
  const errorStore = useErrorStore();
  
  const isHandlingError = ref(false);
  const retryCount = ref(0);

  // Computed
  const hasActiveErrors = computed(() => errorStore.unresolvedErrors.length > 0);
  const criticalErrors = computed(() => 
    errorStore.unresolvedErrors.filter(e => e.severity === 'critical')
  );

  /**
   * Handle an error with user-friendly messaging and recovery options
   */
  const handleError = async (
    error: Error | AppError | Record<string, unknown>,
    context?: {
      operation?: string;
      url?: string;
      userId?: string;
      sessionId?: string;
      additionalContext?: Record<string, unknown>;
    }
  ): Promise<void> => {
    isHandlingError.value = true;

    try {
      // Convert to AppError if needed
      let appError: Error;

      if (error instanceof Error) {
        appError = error;
      } else if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        appError = new Error(error.message);
        if ('stack' in error && typeof error.stack === 'string') {
          appError.stack = error.stack;
        }
        if ('name' in error && typeof error.name === 'string') {
          appError.name = error.name;
        } else {
          appError.name = 'ApplicationError';
        }
      } else {
        appError = new Error(String(error));
        appError.name = 'UnknownError';
      }

      // Add to error store
      await errorStore.addError(appError, {
        component: options.component,
        url: context?.url || window.location.pathname,
        userId: context?.userId,
        sessionId: context?.sessionId,
        additionalContext: {
          ...(context?.operation ? { operation: context.operation } : {}),
          ...context?.additionalContext
        }
      });

      // Auto-retry logic for network/API errors
      if (options.autoRetry && shouldRetry(appError) && retryCount.value < (options.maxRetries || 3)) {
        retryCount.value++;
        await new Promise(resolve => setTimeout(resolve, options.retryDelay || 1000));
        
        // Return without showing error to user if we're retrying
        return;
      }

    } catch (handlingError) {
      console.error('Failed to handle error:', handlingError);
    } finally {
      isHandlingError.value = false;
    }
  };

  /**
   * Handle API errors specifically
   */
  const handleApiError = async (
    error: Record<string, unknown>,
    context?: {
      method?: string;
      url?: string;
      requestData?: Record<string, unknown>;
      operation?: string;
    }
  ): Promise<void> => {
    const apiError = new Error(getApiErrorMessage(error));
    apiError.name = 'ApiError';
    apiError.stack = typeof error.stack === 'string' ? error.stack : undefined;

    const errorResponse = error.response as { status?: number; statusText?: string; data?: unknown } | undefined;

    await handleError(apiError, {
      operation: context?.operation || `${context?.method} ${context?.url}`,
      url: context?.url,
      additionalContext: {
        status: errorResponse?.status,
        statusText: errorResponse?.statusText,
        method: context?.method,
        requestData: context?.requestData,
        responseData: errorResponse?.data
      }
    });
  };

  /**
   * Handle network errors specifically
   */
  const handleNetworkError = async (
    error: Record<string, unknown>,
    context?: {
      operation?: string;
      url?: string;
    }
  ): Promise<void> => {
    const networkError = new Error(
      `Network connection failed${context?.operation ? ` during ${context.operation}` : ''}`
    );
    networkError.name = 'NetworkError';

    await handleError(networkError, {
      operation: context?.operation || 'Network request',
      url: context?.url,
      additionalContext: {
        networkError: true,
        offline: !navigator.onLine
      }
    });
  };

  /**
   * Show a user-friendly error message
   */
  const showErrorMessage = (
    message: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    actions?: Array<{
      label: string;
      handler: () => void;
    }>
  ): void => {
    const displayError = new Error(message);
    displayError.name = 'UserMessage';
    
    handleError(displayError, {
      operation: 'User notification',
      additionalContext: {
        severity,
        userMessage: true,
        actions
      }
    });
  };

  /**
   * Clear all errors for the current component
   */
  const clearErrors = (): void => {
    if (options.component) {
      // Clear errors specific to this component
      const componentErrors = errorStore.errors.filter(e => e.component === options.component);
      componentErrors.forEach(error => {
        errorStore.resolveError(error.id);
      });
    }
  };

  /**
   * Retry a failed operation
   */
  const retryOperation = async (callback: () => Promise<void> | void): Promise<boolean> => {
    try {
      isHandlingError.value = true;
      await callback();
      retryCount.value = 0; // Reset retry count on success
      return true;
    } catch (error) {
      await handleError(error as Error, {
        operation: 'Retry operation'
      });
      return false;
    } finally {
      isHandlingError.value = false;
    }
  };

  /**
   * Navigate with error handling
   */
  const safeNavigate = async (path: string): Promise<boolean> => {
    try {
      await router.push(path);
      return true;
    } catch (error) {
      await handleError(error as Error, {
        operation: `Navigate to ${path}`,
        additionalContext: { navigationPath: path }
      });
      return false;
    }
  };

  /**
   * Wrap an async operation with error handling
   */
  const withErrorHandling = <T>(
    operation: () => Promise<T>,
    operationName?: string
  ) => {
    return async (): Promise<T | null> => {
      try {
        isHandlingError.value = true;
        const result = await operation();
        retryCount.value = 0; // Reset on success
        return result;
      } catch (error) {
        await handleError(error as Error, {
          operation: operationName || 'Async operation'
        });
        return null;
      } finally {
        isHandlingError.value = false;
      }
    };
  };

  // Helper functions
  const shouldRetry = (error: Error): boolean => {
    // Retry network errors and 5xx server errors
    return (
      error.name === 'NetworkError' ||
      error.name === 'ApiError' ||
      error.message.includes('Network') ||
      error.message.includes('5')
    );
  };

  const getApiErrorMessage = (error: Record<string, unknown>): string => {
    const errorResponse = error.response as { status?: number; data?: { message?: string } } | undefined;
    const status = errorResponse?.status;

    if (!errorResponse) {
      return 'Network connection failed - please check your internet connection';
    }

    switch (status) {
      case 401:
        return 'Your session has expired - please sign in again';
      case 403:
        return 'Access denied - you don\'t have permission for this action';
      case 404:
        return 'The requested resource was not found';
      case 429:
        return 'Too many requests - please wait a moment and try again';
      case 500:
        return 'Server error - our team has been notified and is working on it';
      case 502:
      case 503:
      case 504:
        return 'Service temporarily unavailable - please try again in a few minutes';
      default:
        return errorResponse?.data?.message || `Request failed (${status})`;
    }
  };

  return {
    // State
    isHandlingError,
    hasActiveErrors,
    criticalErrors,
    retryCount,
    
    // Methods
    handleError,
    handleApiError,
    handleNetworkError,
    showErrorMessage,
    clearErrors,
    retryOperation,
    safeNavigate,
    withErrorHandling
  };
}
