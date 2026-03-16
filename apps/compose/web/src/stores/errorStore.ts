import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { JsonObject } from '@/types';

// Error types
export interface AppError {
  id: string;
  type: ErrorType;
  message: string;
  details?: string;
  stack?: string;
  timestamp: number;
  component?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  severity: ErrorSeverity;
  context?: JsonObject;
  resolved?: boolean;
  retryCount?: number;
  reportSent?: boolean;
}

export type ErrorType = 
  | 'component' 
  | 'api' 
  | 'network' 
  | 'chunk-load' 
  | 'permission' 
  | 'validation' 
  | 'unknown';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorFilter {
  type?: ErrorType;
  severity?: ErrorSeverity;
  resolved?: boolean;
  timeRange?: {
    start: number;
    end: number;
  };
}

export interface ErrorReportPayload {
  error: AppError;
  userFeedback?: string;
  reproductionSteps?: string;
  expectedBehavior?: string;
}

// Error logging service interface
export interface ErrorLogger {
  log(error: AppError): Promise<void>;
  report(payload: ErrorReportPayload): Promise<void>;
}

export const useErrorStore = defineStore('error', () => {
  // State
  const errors = ref<AppError[]>([]);
  const isLoading = ref(false);
  const globalErrorVisible = ref(false);
  const currentGlobalError = ref<AppError | null>(null);
  const errorLogger = ref<ErrorLogger | null>(null);
  
  // Configuration
  const maxErrors = ref(100); // Maximum number of errors to keep in memory
  const autoReportCritical = ref(true);
  const showNotifications = ref(true);
  
  // Computed
  const errorCount = computed(() => errors.value.length);
  
  const unresolvedErrors = computed(() => 
    errors.value.filter(error => !error.resolved)
  );
  
  const criticalErrors = computed(() => 
    errors.value.filter(error => error.severity === 'critical')
  );
  
  const recentErrors = computed(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return errors.value.filter(error => error.timestamp > oneHourAgo);
  });
  
  const errorsByType = computed(() => {
    const grouped: Record<ErrorType, AppError[]> = {
      component: [],
      api: [],
      network: [],
      'chunk-load': [],
      permission: [],
      validation: [],
      unknown: []
    };
    
    errors.value.forEach(error => {
      grouped[error.type].push(error);
    });
    
    return grouped;
  });
  
  const errorStats = computed(() => ({
    total: errorCount.value,
    unresolved: unresolvedErrors.value.length,
    critical: criticalErrors.value.length,
    recent: recentErrors.value.length,
    byType: Object.entries(errorsByType.value).map(([type, errors]) => ({
      type: type as ErrorType,
      count: errors.length
    }))
  }));
  
  // Actions
  const generateErrorId = (): string => {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };
  
  const determineErrorType = (error: Error): ErrorType => {
    if (error.name === 'ChunkLoadError') return 'chunk-load';
    if (error.name === 'NetworkError' || error.message.includes('fetch')) return 'network';
    if (error.message.includes('API') || error.message.includes('401') || error.message.includes('403')) return 'api';
    if (error.message.includes('permission') || error.message.includes('unauthorized')) return 'permission';
    if (error.message.includes('validation') || error.message.includes('invalid')) return 'validation';
    return 'component';
  };
  
  const determineErrorSeverity = (error: Error, type: ErrorType): ErrorSeverity => {
    // Critical errors that break the app
    if (type === 'chunk-load') return 'critical';
    if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) return 'critical';
    
    // High severity errors
    if (type === 'api' && error.message.includes('401')) return 'high';
    if (type === 'permission') return 'high';
    if (error.message.includes('Cannot read property') || error.message.includes('undefined')) return 'high';
    
    // Medium severity errors
    if (type === 'network') return 'medium';
    if (type === 'validation') return 'medium';
    
    // Default to low
    return 'low';
  };
  
  const addError = async (
    error: Error,
    context?: {
      component?: string;
      url?: string;
      userId?: string;
      sessionId?: string;
      additionalContext?: JsonObject;
    }
  ): Promise<AppError> => {
    // Skip Vue internal errors that cause cascade issues
    const vueInternalPatterns = [
      'emitsOptions',
      'Cannot read properties of null',
      'shouldUpdateComponent',
      'updateComponent',
    ];
    if (vueInternalPatterns.some(pattern => error.message?.includes(pattern))) {
      console.warn('[ErrorStore] Skipping Vue internal error to prevent cascade:', error.message);
      // Return a dummy error object to satisfy the return type
      return {
        id: 'skipped',
        type: 'unknown',
        message: error.message,
        timestamp: Date.now(),
        severity: 'low',
        resolved: true,
      } as AppError;
    }

    const errorType = determineErrorType(error);
    const severity = determineErrorSeverity(error, errorType);
    
    const appError: AppError = {
      id: generateErrorId(),
      type: errorType,
      message: error.message,
      details: error.cause ? String(error.cause) : undefined,
      stack: error.stack,
      timestamp: Date.now(),
      component: context?.component,
      url: context?.url || window.location.href,
      userAgent: navigator.userAgent,
      userId: context?.userId,
      sessionId: context?.sessionId,
      severity,
      context: context?.additionalContext,
      resolved: false,
      retryCount: 0,
      reportSent: false
    };
    
    // Add to errors array using safer mutation
    errors.value = [appError, ...errors.value];
    
    // Trim errors if we exceed max
    if (errors.value.length > maxErrors.value) {
      errors.value = errors.value.slice(0, maxErrors.value);
    }
    
    // Log error if logger is available
    if (errorLogger.value) {
      try {
        await errorLogger.value.log(appError);
      } catch (logError) {
        console.error('Failed to log error:', logError);
      }
    }
    
    // Auto-report critical errors
    if (severity === 'critical' && autoReportCritical.value) {
      await reportError(appError);
    }
    
    // Show global error for critical errors
    if (severity === 'critical' && !currentGlobalError.value) {
      showGlobalError(appError);
    }
    
    console.error('🚨 Error added to store:', appError);
    return appError;
  };
  
  const resolveError = (errorId: string): boolean => {
    const error = errors.value.find(e => e.id === errorId);
    if (error) {
      error.resolved = true;
      error.timestamp = Date.now(); // Update timestamp when resolved
      return true;
    }
    return false;
  };
  
  const removeError = (errorId: string): boolean => {
    const index = errors.value.findIndex(e => e.id === errorId);
    if (index !== -1) {
      errors.value.splice(index, 1);
      return true;
    }
    return false;
  };
  
  const clearErrors = (filter?: ErrorFilter): void => {
    if (!filter) {
      errors.value = [];
      return;
    }
    
    errors.value = errors.value.filter(error => {
      if (filter.type && error.type !== filter.type) return true;
      if (filter.severity && error.severity !== filter.severity) return true;
      if (filter.resolved !== undefined && error.resolved !== filter.resolved) return true;
      if (filter.timeRange) {
        if (error.timestamp < filter.timeRange.start || error.timestamp > filter.timeRange.end) return true;
      }
      return false;
    });
  };
  
  const incrementRetryCount = (errorId: string): void => {
    const error = errors.value.find(e => e.id === errorId);
    if (error) {
      error.retryCount = (error.retryCount || 0) + 1;
    }
  };
  
  const getFilteredErrors = (filter: ErrorFilter): AppError[] => {
    return errors.value.filter(error => {
      if (filter.type && error.type !== filter.type) return false;
      if (filter.severity && error.severity !== filter.severity) return false;
      if (filter.resolved !== undefined && error.resolved !== filter.resolved) return false;
      if (filter.timeRange) {
        if (error.timestamp < filter.timeRange.start || error.timestamp > filter.timeRange.end) return false;
      }
      return true;
    });
  };
  
  const reportError = async (
    error: AppError, 
    userFeedback?: string,
    reproductionSteps?: string,
    expectedBehavior?: string
  ): Promise<boolean> => {
    if (!errorLogger.value) {
      console.warn('No error logger configured');
      return false;
    }
    
    try {
      const payload: ErrorReportPayload = {
        error,
        userFeedback,
        reproductionSteps,
        expectedBehavior
      };
      
      await errorLogger.value.report(payload);
      
      // Mark as reported
      const storedError = errors.value.find(e => e.id === error.id);
      if (storedError) {
        storedError.reportSent = true;
      }
      
      console.log('✅ Error reported successfully:', error.id);
      return true;
    } catch (reportError) {
      console.error('❌ Failed to report error:', reportError);
      return false;
    }
  };
  
  const showGlobalError = (error: AppError): void => {
    currentGlobalError.value = error;
    globalErrorVisible.value = true;
  };
  
  const hideGlobalError = (): void => {
    globalErrorVisible.value = false;
    currentGlobalError.value = null;
  };
  
  const setErrorLogger = (logger: ErrorLogger): void => {
    errorLogger.value = logger;
  };
  
  const updateConfig = (config: {
    maxErrors?: number;
    autoReportCritical?: boolean;
    showNotifications?: boolean;
  }): void => {
    if (config.maxErrors !== undefined) maxErrors.value = config.maxErrors;
    if (config.autoReportCritical !== undefined) autoReportCritical.value = config.autoReportCritical;
    if (config.showNotifications !== undefined) showNotifications.value = config.showNotifications;
  };
  
  // Utility methods
  const getErrorById = (id: string): AppError | undefined => {
    return errors.value.find(error => error.id === id);
  };
  
  const hasUnresolvedCriticalErrors = computed(() => {
    return unresolvedErrors.value.some(error => error.severity === 'critical');
  });
  
  return {
    // State
    errors: computed(() => errors.value),
    isLoading: computed(() => isLoading.value),
    globalErrorVisible: computed(() => globalErrorVisible.value),
    currentGlobalError: computed(() => currentGlobalError.value),
    
    // Computed
    errorCount,
    unresolvedErrors,
    criticalErrors,
    recentErrors,
    errorsByType,
    errorStats,
    hasUnresolvedCriticalErrors,
    
    // Actions
    addError,
    resolveError,
    removeError,
    clearErrors,
    incrementRetryCount,
    getFilteredErrors,
    reportError,
    showGlobalError,
    hideGlobalError,
    setErrorLogger,
    updateConfig,
    getErrorById
  };
});
