/**
 * API Sanitization Composable
 * Ensures all API requests use properly sanitized inputs
 */

import { SanitizationHelpers } from '@/utils/sanitizationProfiles';
// import type { SanitizationOptions } from '@/utils/sanitizationProfiles';

// =====================================
// TYPES
// =====================================

export interface ApiSanitizationOptions {
  /** Enable deep sanitization of nested objects */
  deep?: boolean;
  /** Custom sanitization profile */
  profile?: string;
  /** Fields to exclude from sanitization */
  excludeFields?: string[];
  /** Fields that require specific sanitization profiles */
  fieldProfiles?: Record<string, string>;
  /** Enable logging of sanitization actions */
  logSanitization?: boolean;
}

export interface SanitizationResult {
  sanitized: Record<string, unknown>;
  modified: boolean;
  modifiedFields: string[];
  profile: string;
}

// =====================================
// API SANITIZATION COMPOSABLE
// =====================================

export function useApiSanitization() {
  /**
   * Sanitize data before sending to API
   */
  function sanitizeApiData(
    data: Record<string, unknown>,
    options: ApiSanitizationOptions = {}
  ): SanitizationResult {
    const {
      deep = true,
      profile = 'apiInput',
      excludeFields = [],
      fieldProfiles = {}
    } = options;

    const modifiedFields: string[] = [];
    let modified = false;

    function sanitizeValue(value: unknown, key?: string): unknown {
      // Skip excluded fields
      if (key && excludeFields.includes(key)) {
        return value;
      }

      // Use field-specific profile if available
      const sanitizationProfile = (key && fieldProfiles[key]) || profile;
      
      if (typeof value === 'string') {
        const sanitized = getSanitizedValue(value, sanitizationProfile);
        if (sanitized !== value) {
          modified = true;
          if (key) modifiedFields.push(key);
        }
        return sanitized;
      }

      if (deep && Array.isArray(value)) {
        return value.map((item, index) => sanitizeValue(item, `${key}[${index}]`));
      }

      if (deep && value && typeof value === 'object') {
        const sanitizedObj: Record<string, unknown> = {};
        for (const [objKey, objValue] of Object.entries(value)) {
          const fullKey = key ? `${key}.${objKey}` : objKey;
          sanitizedObj[objKey] = sanitizeValue(objValue, fullKey);
        }
        return sanitizedObj;
      }

      return value;
    }

    const sanitized = sanitizeValue(data) as Record<string, unknown>;

    return {
      sanitized,
      modified,
      modifiedFields,
      profile
    };
  }

  /**
   * Get sanitized value based on profile
   */
  function getSanitizedValue(value: string, profile: string): string {
    switch (profile) {
      case 'apiInput':
        return SanitizationHelpers.forApiInput(value);
      case 'search':
        return SanitizationHelpers.forSearch(value);
      case 'email':
        return SanitizationHelpers.forEmail(value);
      case 'richText':
        return SanitizationHelpers.forRichText(value);
      case 'strict':
        return SanitizationHelpers.strict(value);
      case 'moderate':
        return SanitizationHelpers.moderate(value);
      default:
        return SanitizationHelpers.forApiInput(value);
    }
  }

  /**
   * Sanitize request payload for orchestrator
   */
  function sanitizeOrchestratorRequest(payload: {
    message: string;
    session_id?: string;
    conversation_history?: Array<{ role: string; content: string; metadata?: Record<string, unknown> }>;
    [key: string]: unknown;
  }): typeof payload {
    const result = sanitizeApiData(payload, {
      fieldProfiles: {
        'message': 'apiInput',
        'conversation_history.content': 'apiInput'
      },
      excludeFields: ['session_id', 'authToken', 'currentUser'],
      logSanitization: true
    });

    return result.sanitized as typeof payload;
  }

  /**
   * Sanitize task creation request
   */
  function sanitizeTaskRequest(request: {
    method: string;
    prompt: string;
    params?: Record<string, unknown>;
    [key: string]: unknown;
  }): typeof request {
    const result = sanitizeApiData(request, {
      fieldProfiles: {
        'prompt': 'apiInput',
        'method': 'strict'
      },
      excludeFields: ['timeoutSeconds', 'conversationId'],
      logSanitization: true
    });

    return result.sanitized as typeof request;
  }

  /**
   * Sanitize PII test request
   * IMPORTANT: We exclude the 'text' field from sanitization because the whole point
   * of PII testing is to detect PII in the original unsanitized text.
   * Sanitizing it would defeat the purpose and prevent proper PII detection.
   */
  function sanitizePIIRequest(request: {
    text: string;
    [key: string]: unknown;
  }): typeof request {
    const result = sanitizeApiData(request, {
      excludeFields: ['text'], // Do NOT sanitize the text field - we need to detect PII in it!
      logSanitization: true
    });

    return result.sanitized as typeof request;
  }

  /**
   * Sanitize error report payload
   */
  function sanitizeErrorReport(payload: {
    error: Error | Record<string, unknown>;
    userFeedback?: string;
    reproductionSteps?: string;
    expectedBehavior?: string;
    [key: string]: unknown;
  }): typeof payload {
    const result = sanitizeApiData(payload, {
      fieldProfiles: {
        'userFeedback': 'moderate',
        'reproductionSteps': 'moderate',
        'expectedBehavior': 'moderate'
      },
      excludeFields: ['error', 'reportTimestamp', 'reportId'],
      logSanitization: true
    });

    return result.sanitized as typeof payload;
  }

  /**
   * Sanitize form data before API submission
   */
  function sanitizeFormData(formData: Record<string, unknown>, fieldTypes: Record<string, string> = {}): Record<string, unknown> {
    const result = sanitizeApiData(formData, {
      fieldProfiles: fieldTypes,
      logSanitization: true
    });

    return result.sanitized;
  }

  /**
   * Create a sanitized API wrapper function
   */
  function createSanitizedApiCall<T extends (...args: unknown[]) => Promise<unknown>>(
    apiFunction: T,
    sanitizationOptions: ApiSanitizationOptions = {}
  ): T {
    return (async (...args: Parameters<T>) => {
      // Sanitize all string arguments
      const sanitizedArgs = args.map((arg, _index) => {
        if (typeof arg === 'string') {
          return getSanitizedValue(arg, sanitizationOptions.profile || 'apiInput');
        }
        if (arg && typeof arg === 'object') {
          return sanitizeApiData(arg as Record<string, unknown>, sanitizationOptions).sanitized;
        }
        return arg;
      });

      return apiFunction(...sanitizedArgs);
    }) as T;
  }

  /**
   * Validate that data has been sanitized
   */
  function validateSanitization(data: unknown): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    function checkValue(value: unknown, path: string = ''): void {
      if (typeof value === 'string') {
        // Check for common XSS patterns
        if (/<script|javascript:|on\w+\s*=/i.test(value)) {
          issues.push(`Potential XSS in ${path || 'root'}: ${value.substring(0, 50)}`);
        }
        
        // Check for SQL injection patterns
        if (/(\bUNION\b|\bSELECT\b|\bDROP\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b).*(\bFROM\b|\bWHERE\b|\bTABLE\b)/i.test(value)) {
          issues.push(`Potential SQL injection in ${path || 'root'}: ${value.substring(0, 50)}`);
        }
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => checkValue(item, `${path}[${index}]`));
      } else if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, val]) => {
          checkValue(val, path ? `${path}.${key}` : key);
        });
      }
    }

    checkValue(data);

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  return {
    sanitizeApiData,
    sanitizeOrchestratorRequest,
    sanitizeTaskRequest,
    sanitizePIIRequest,
    sanitizeErrorReport,
    sanitizeFormData,
    createSanitizedApiCall,
    validateSanitization
  };
}

// =====================================
// GLOBAL API SANITIZATION INTERCEPTOR
// =====================================

/**
 * Axios interceptor to automatically sanitize request data
 */
interface AxiosRequestConfig {
  data?: unknown;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export function createApiSanitizationInterceptor(options: ApiSanitizationOptions = {}) {
  return (config: AxiosRequestConfig) => {
    if (config.data && typeof config.data === 'object') {
      // Use direct sanitization to avoid circular reference
      const sanitizationOptions = {
        profile: 'apiInput',
        logSanitization: true,
        ...options
      };
      
      const modifiedFields: string[] = [];
      let modified = false;
      
      const sanitizeValue = (value: unknown, key?: string): unknown => {
        if (typeof value === 'string') {
          const sanitized = SanitizationHelpers.sanitizeString(value, { profile: sanitizationOptions.profile || 'apiInput' });
          if (sanitized !== value) {
            modified = true;
            if (key) modifiedFields.push(key);
          }
          return sanitized;
        }
        
        if (Array.isArray(value)) {
          return value.map((item, index) => sanitizeValue(item, `${key}[${index}]`));
        }
        
        if (value && typeof value === 'object') {
          const sanitized: Record<string, unknown> = {};
          for (const [objKey, objValue] of Object.entries(value)) {
            sanitized[objKey] = sanitizeValue(objValue, objKey);
          }
          return sanitized;
        }

        return value;
      };
      
      const sanitizedData = sanitizeValue(config.data);
      
      config.data = sanitizedData;
      
      // Add sanitization metadata to headers
      config.headers = {
        ...config.headers,
        'X-Sanitization-Applied': modified.toString(),
        'X-Sanitization-Profile': sanitizationOptions.profile
      };
    }
    
    return config;
  };
}
