/**
 * Global Validation Store
 * Centralized state management for validation across the application
 */

import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import type { JsonValue } from '@orchestrator-ai/transport-types';
import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationState,
  ValidationHistoryEntry,
  ValidationConfig,
  ValidationEvent,
  ValidationEventHandler,
} from '@/types/validation';

export const useValidationStore = defineStore('validation', () => {
  // =====================================
  // STATE
  // =====================================
  
  const errors = ref<Record<string, ValidationError[]>>({});
  const warnings = ref<Record<string, ValidationWarning[]>>({});
  const isValidating = ref<Record<string, boolean>>({});
  const lastValidated = ref<Record<string, string>>({});
  const validationHistory = ref<ValidationHistoryEntry[]>([]);
  const eventHandlers = ref<ValidationEventHandler[]>([]);
  
  const config = ref<ValidationConfig>({
    strictMode: false,
    sanitizeInputs: true,
    validateOnChange: true,
    validateOnBlur: true,
    debounceMs: 300,
    maxValidationTime: 5000,
    logValidationErrors: true,
    enableAsyncValidation: true,
  });
  
  // =====================================
  // GETTERS
  // =====================================
  
  const totalErrors = computed(() => {
    return Object.values(errors.value).reduce((total, fieldErrors) => total + fieldErrors.length, 0);
  });
  
  const totalWarnings = computed(() => {
    return Object.values(warnings.value).reduce((total, fieldWarnings) => total + fieldWarnings.length, 0);
  });
  
  const isFormValid = computed(() => {
    return totalErrors.value === 0;
  });
  
  const criticalErrors = computed(() => {
    const critical: ValidationError[] = [];
    Object.values(errors.value).forEach(fieldErrors => {
      critical.push(...fieldErrors.filter(error => error.severity === 'critical'));
    });
    return critical;
  });
  
  const isAnyFieldValidating = computed(() => {
    return Object.values(isValidating.value).some(validating => validating);
  });
  
  const validationSummary = computed(() => {
    const summary = {
      totalFields: Object.keys(errors.value).length,
      validFields: Object.entries(errors.value).filter(([_, fieldErrors]) => fieldErrors.length === 0).length,
      invalidFields: Object.entries(errors.value).filter(([_, fieldErrors]) => fieldErrors.length > 0).length,
      totalErrors: totalErrors.value,
      totalWarnings: totalWarnings.value,
      criticalErrors: criticalErrors.value.length,
      isValidating: isAnyFieldValidating.value,
    };
    
    return {
      ...summary,
      validationRate: summary.totalFields > 0 ? (summary.validFields / summary.totalFields) * 100 : 100,
    };
  });
  
  // =====================================
  // ACTIONS
  // =====================================
  
  /**
   * Set validation errors for a field
   */
  function setFieldErrors(field: string, fieldErrors: ValidationError[]): void {
    errors.value[field] = fieldErrors;
    lastValidated.value[field] = new Date().toISOString();
    
    // Emit event
    emitEvent({
      type: fieldErrors.length > 0 ? 'validation:error' : 'validation:complete',
      field,
      timestamp: new Date().toISOString(),
      data: { errors: fieldErrors as unknown as JsonValue }
    });
  }
  
  /**
   * Set validation warnings for a field
   */
  function setFieldWarnings(field: string, fieldWarnings: ValidationWarning[]): void {
    warnings.value[field] = fieldWarnings;
  }
  
  /**
   * Set validating state for a field
   */
  function setFieldValidating(field: string, validating: boolean): void {
    isValidating.value[field] = validating;
    
    if (validating) {
      emitEvent({
        type: 'validation:start',
        field,
        timestamp: new Date().toISOString(),
        data: {}
      });
    }
  }
  
  /**
   * Add validation result to store
   */
  function addValidationResult(field: string, result: ValidationResult, component?: string): void {
    setFieldErrors(field, result.errors);
    setFieldWarnings(field, result.warnings);
    setFieldValidating(field, false);
    
    // Add to history
    const historyEntry: ValidationHistoryEntry = {
      timestamp: new Date().toISOString(),
      field,
      value: result.sanitizedValue as JsonValue,
      result,
      component: component || 'unknown',
      userId: getCurrentUserId(), // Helper function to get current user
    };
    
    addToHistory(historyEntry);
  }
  
  /**
   * Clear errors for a field or all fields
   */
  function clearErrors(field?: string): void {
    if (field) {
      delete errors.value[field];
    } else {
      errors.value = {};
    }
  }
  
  /**
   * Clear warnings for a field or all fields
   */
  function clearWarnings(field?: string): void {
    if (field) {
      delete warnings.value[field];
    } else {
      warnings.value = {};
    }
  }
  
  /**
   * Clear all validation state
   */
  function clearAll(): void {
    errors.value = {};
    warnings.value = {};
    isValidating.value = {};
    lastValidated.value = {};
  }
  
  /**
   * Get errors for a specific field
   */
  function getFieldErrors(field: string): ValidationError[] {
    return errors.value[field] || [];
  }
  
  /**
   * Get warnings for a specific field
   */
  function getFieldWarnings(field: string): ValidationWarning[] {
    return warnings.value[field] || [];
  }
  
  /**
   * Check if a field is valid
   */
  function isFieldValid(field: string): boolean {
    return getFieldErrors(field).length === 0;
  }
  
  /**
   * Check if a field is currently being validated
   */
  function isFieldValidating(field: string): boolean {
    return isValidating.value[field] || false;
  }
  
  /**
   * Get validation status for a field
   */
  function getFieldStatus(field: string) {
    const fieldErrors = getFieldErrors(field);
    const fieldWarnings = getFieldWarnings(field);
    const validating = isFieldValidating(field);
    
    if (validating) return 'validating';
    if (fieldErrors.some(error => error.severity === 'critical')) return 'critical';
    if (fieldErrors.length > 0) return 'error';
    if (fieldWarnings.length > 0) return 'warning';
    return 'valid';
  }
  
  /**
   * Add entry to validation history
   */
  function addToHistory(entry: ValidationHistoryEntry): void {
    validationHistory.value.unshift(entry);
    
    // Keep only last 1000 entries to prevent memory issues
    if (validationHistory.value.length > 1000) {
      validationHistory.value = validationHistory.value.slice(0, 1000);
    }
  }
  
  /**
   * Get validation history for a field
   */
  function getFieldHistory(field: string): ValidationHistoryEntry[] {
    return validationHistory.value.filter(entry => entry.field === field);
  }
  
  /**
   * Get recent validation history
   */
  function getRecentHistory(limit = 50): ValidationHistoryEntry[] {
    return validationHistory.value.slice(0, limit);
  }
  
  /**
   * Clear validation history
   */
  function clearHistory(): void {
    validationHistory.value = [];
  }
  
  /**
   * Update validation configuration
   */
  function updateConfig(newConfig: Partial<ValidationConfig>): void {
    config.value = { ...config.value, ...newConfig };
  }
  
  /**
   * Reset configuration to defaults
   */
  function resetConfig(): void {
    config.value = {
      strictMode: false,
      sanitizeInputs: true,
      validateOnChange: true,
      validateOnBlur: true,
      debounceMs: 300,
      maxValidationTime: 5000,
      logValidationErrors: true,
      enableAsyncValidation: true,
    };
  }
  
  // =====================================
  // EVENT HANDLING
  // =====================================
  
  /**
   * Add event handler
   */
  function addEventListener(handler: ValidationEventHandler): void {
    eventHandlers.value.push(handler);
  }
  
  /**
   * Remove event handler
   */
  function removeEventListener(handler: ValidationEventHandler): void {
    const index = eventHandlers.value.indexOf(handler);
    if (index > -1) {
      eventHandlers.value.splice(index, 1);
    }
  }
  
  /**
   * Emit validation event
   */
  function emitEvent(event: ValidationEvent): void {
    eventHandlers.value.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in validation event handler:', error);
      }
    });
  }
  
  // =====================================
  // ANALYTICS & REPORTING
  // =====================================
  
  /**
   * Get validation analytics
   */
  function getAnalytics() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentHistory = validationHistory.value.filter(
      entry => new Date(entry.timestamp) > oneHourAgo
    );
    
    const totalValidations = recentHistory.length;
    const failedValidations = recentHistory.filter(
      entry => entry.result.errors.length > 0
    ).length;
    
    const averageValidationTime = totalValidations > 0 
      ? recentHistory.reduce((sum, entry) => sum + (entry.result.metadata?.validationTime || 0), 0) / totalValidations
      : 0;
    
    const mostCommonErrors = getErrorFrequency(recentHistory);
    const fieldValidationCounts = getFieldValidationCounts(recentHistory);
    
    return {
      period: 'Last Hour',
      totalValidations,
      failedValidations,
      successRate: totalValidations > 0 ? ((totalValidations - failedValidations) / totalValidations) * 100 : 100,
      averageValidationTime,
      mostCommonErrors,
      fieldValidationCounts,
    };
  }
  
  /**
   * Get error frequency analysis
   */
  function getErrorFrequency(history: ValidationHistoryEntry[]): Record<string, number> {
    const frequency: Record<string, number> = {};
    
    history.forEach(entry => {
      entry.result.errors.forEach(error => {
        frequency[error.code] = (frequency[error.code] || 0) + 1;
      });
    });
    
    return frequency;
  }
  
  /**
   * Get field validation counts
   */
  function getFieldValidationCounts(history: ValidationHistoryEntry[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    history.forEach(entry => {
      counts[entry.field] = (counts[entry.field] || 0) + 1;
    });
    
    return counts;
  }
  
  // =====================================
  // UTILITIES
  // =====================================
  
  /**
   * Export validation state for debugging
   */
  function exportState() {
    return {
      errors: errors.value,
      warnings: warnings.value,
      isValidating: isValidating.value,
      lastValidated: lastValidated.value,
      config: config.value,
      summary: validationSummary.value,
      analytics: getAnalytics(),
    };
  }
  
  /**
   * Import validation state (for testing)
   */
  function importState(state: Partial<ValidationState>): void {
    if (state.errors) errors.value = state.errors;
    if (state.warnings) warnings.value = state.warnings;
    if (state.isValidating) isValidating.value = state.isValidating;
    if (state.lastValidated) lastValidated.value = state.lastValidated;
    if (state.config) config.value = state.config;
  }
  
  return {
    // State
    errors: readonly(errors),
    warnings: readonly(warnings),
    isValidating: readonly(isValidating),
    lastValidated: readonly(lastValidated),
    validationHistory: readonly(validationHistory),
    config: readonly(config),
    
    // Getters
    totalErrors,
    totalWarnings,
    isFormValid,
    criticalErrors,
    isAnyFieldValidating,
    validationSummary,
    
    // Actions
    setFieldErrors,
    setFieldWarnings,
    setFieldValidating,
    addValidationResult,
    clearErrors,
    clearWarnings,
    clearAll,
    getFieldErrors,
    getFieldWarnings,
    isFieldValid,
    isFieldValidating,
    getFieldStatus,
    addToHistory,
    getFieldHistory,
    getRecentHistory,
    clearHistory,
    updateConfig,
    resetConfig,
    
    // Events
    addEventListener,
    removeEventListener,
    emitEvent,
    
    // Analytics
    getAnalytics,
    
    // Utilities
    exportState,
    importState,
  };
});

// =====================================
// HELPER FUNCTIONS
// =====================================

/**
 * Get current user ID (placeholder - implement based on your auth system)
 */
function getCurrentUserId(): string | undefined {
  // TODO: Implement based on your authentication system
  // This could come from a user store, JWT token, etc.
  return undefined;
}
