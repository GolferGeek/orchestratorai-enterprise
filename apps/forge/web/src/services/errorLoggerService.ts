import type { JsonObject, JsonValue } from '@orchestrator-ai/transport-types';
import { apiService } from './apiService';
import type { AppError, ErrorReportPayload, ErrorLogger } from '@/stores/errorStore';
import { useApiSanitization } from '@/composables/useApiSanitization';

type SanitizedAppError = Omit<AppError, 'context'> & { context?: JsonObject };
type ErrorStatsResponse = JsonObject;

/**
 * Error Logger Service
 * Handles logging and reporting of application errors to the backend
 */
class ErrorLoggerService implements ErrorLogger {
  private readonly basePath = '/errors';
  private isEnabled = false; // Disabled until backend endpoint is implemented
  private retryQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private apiSanitization = useApiSanitization();

  /**
   * Log an error to the backend
   */
  async log(error: AppError): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const payload = this.sanitizeError(error);
      
      await apiService.post(`${this.basePath}/log`, payload);
      
    } catch (logError) {
      console.error('❌ Failed to log error:', logError);
      
      // Add to retry queue for later processing
      this.addToRetryQueue(() => this.log(error));
      
      // Don't throw - we don't want logging failures to break the app
    }
  }

  /**
   * Report an error with additional user context
   */
  async report(payload: ErrorReportPayload): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const payload_sanitized = {
        error: this.sanitizeError(payload.error),
        userFeedback: payload.userFeedback?.substring(0, 1000), // Limit feedback length
        reproductionSteps: payload.reproductionSteps?.substring(0, 2000),
        expectedBehavior: payload.expectedBehavior?.substring(0, 1000),
        reportTimestamp: Date.now(),
        reportId: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Apply additional sanitization for security
      const sanitizedPayload = this.apiSanitization.sanitizeErrorReport(payload_sanitized);

      await apiService.post(`${this.basePath}/report`, sanitizedPayload);
      
    } catch (reportError) {
      console.error('❌ Failed to report error:', reportError);
      
      // Add to retry queue for later processing
      this.addToRetryQueue(() => this.report(payload));
      
      throw reportError; // Throw for report failures so UI can show feedback
    }
  }

  /**
   * Batch log multiple errors
   */
  async logBatch(errors: AppError[]): Promise<void> {
    if (!this.isEnabled || errors.length === 0) {
      return;
    }

    try {
      const sanitizedErrors = errors.map(error => this.sanitizeError(error));
      
      await apiService.post(`${this.basePath}/batch`, {
        errors: sanitizedErrors,
        batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now()
      });
      
    } catch (batchError) {
      console.error('❌ Failed to batch log errors:', batchError);
      
      // Fall back to individual logging
      for (const error of errors) {
        await this.log(error);
      }
    }
  }

  /**
   * Get error statistics from backend
   */
  async getErrorStats(timeRange?: { start: number; end: number }): Promise<ErrorStatsResponse> {
    try {
      const params = new URLSearchParams();
      if (timeRange) {
        params.append('start', timeRange.start.toString());
        params.append('end', timeRange.end.toString());
      }

      const response = await apiService.get<ErrorStatsResponse>(
        `${this.basePath}/stats?${params.toString()}`
      );
      return response;
    } catch (error) {
      console.error('Failed to get error stats:', error);
      throw error;
    }
  }

  /**
   * Search errors by criteria
   */
  async searchErrors(criteria: {
    type?: string;
    severity?: string;
    component?: string;
    userId?: string;
    timeRange?: { start: number; end: number };
    limit?: number;
    offset?: number;
  }): Promise<AppError[]> {
    try {
      const params = new URLSearchParams();
      Object.entries(criteria).forEach(([key, value]) => {
        if (value !== undefined) {
          if (typeof value === 'object' && 'start' in value) {
            params.append(`${key}_start`, value.start.toString());
            params.append(`${key}_end`, value.end.toString());
          } else {
            params.append(key, value.toString());
          }
        }
      });

      const response = await apiService.get<{ errors?: AppError[] }>(
        `${this.basePath}/search?${params.toString()}`
      );
      return response.errors || [];
    } catch (error) {
      console.error('Failed to search errors:', error);
      throw error;
    }
  }

  /**
   * Enable or disable error logging
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Check if error logging is enabled
   */
  isLoggingEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Process retry queue
   */
  async processRetryQueue(): Promise<void> {
    if (this.isProcessingQueue || this.retryQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    const queue = [...this.retryQueue];
    this.retryQueue = [];

    for (const operation of queue) {
      try {
        await operation();
      } catch (error) {
        console.error('Retry operation failed:', error);
        // Don't re-queue failed retries to avoid infinite loops
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Clear retry queue
   */
  clearRetryQueue(): void {
    this.retryQueue = [];
  }

  /**
   * Get retry queue status
   */
  getRetryQueueStatus(): { count: number; isProcessing: boolean } {
    return {
      count: this.retryQueue.length,
      isProcessing: this.isProcessingQueue
    };
  }

  /**
   * Sanitize error data before sending to backend
   */
  private sanitizeError(error: AppError): SanitizedAppError {
    // Remove potentially sensitive data
    const sanitized: SanitizedAppError = {
      ...error,
      // Limit stack trace length
      stack: error.stack?.substring(0, 5000),
      // Remove sensitive context data
      context: error.context ? this.sanitizeContext(error.context) : undefined,
      // Ensure userAgent is not too long
      userAgent: error.userAgent?.substring(0, 500),
      // Remove any potential PII from message
      message: this.sanitizeMessage(error.message)
    };

    return sanitized;
  }

  /**
   * Sanitize context data
   */
  private sanitizeContext(context: JsonObject): JsonObject {
    const sanitized: JsonObject = {};
    
    for (const [key, value] of Object.entries(context)) {
      // Skip potentially sensitive keys
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      
      // Limit string values
      if (typeof value === 'string') {
        sanitized[key] = value.substring(0, 1000);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects (with depth limit)
        sanitized[key] = this.sanitizeContextRecursive(value, 1);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Recursively sanitize context with depth limit
   */
  private sanitizeContextRecursive(obj: JsonValue, depth: number): JsonValue {
    if (depth > 3) return '[MAX_DEPTH_REACHED]';
    
    if (Array.isArray(obj)) {
      return obj.slice(0, 10).map(item =>
        typeof item === 'object' && item !== null
          ? this.sanitizeContextRecursive(item as JsonValue, depth + 1)
          : item
      );
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: JsonObject = {};
      for (const [key, value] of Object.entries(obj)) {
        if (this.isSensitiveKey(key)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeContextRecursive(value as JsonValue, depth + 1);
        }
      }
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Check if a key might contain sensitive information
   */
  private isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /secret/i,
      /key/i,
      /auth/i,
      /credential/i,
      /ssn/i,
      /social/i,
      /credit/i,
      /card/i,
      /email/i,
      /phone/i,
      /address/i,
      /name/i
    ];
    
    return sensitivePatterns.some(pattern => pattern.test(key));
  }

  /**
   * Sanitize error message to remove potential PII
   */
  private sanitizeMessage(message: string): string {
    // This is a basic implementation - you might want to use more sophisticated PII detection
    return message
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]') // SSN
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CREDIT_CARD]') // Credit card
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Email
      .replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE]'); // Phone number
  }

  /**
   * Add operation to retry queue
   */
  private addToRetryQueue(operation: () => Promise<void>): void {
    if (this.retryQueue.length < 100) { // Prevent queue from growing too large
      this.retryQueue.push(operation);
    } else {
      // Queue is full - dropping oldest operation to prevent memory issues
    }
  }
}

// Create and export singleton instance
export const errorLoggerService = new ErrorLoggerService();

// Export the class for testing
export default ErrorLoggerService;
