/**
 * useApiSanitization
 *
 * Compose-scoped API sanitization composable.
 * In Compose Web, data sanitization is handled by the Compose API.
 * This stub preserves the interface contract consumed by apiService.ts.
 */

export interface ApiSanitizationResult {
  sanitized: boolean;
  input: unknown;
  output: unknown;
}

export interface UseApiSanitization {
  sanitizeRequest: (data: unknown) => unknown;
  sanitizeResponse: (data: unknown) => unknown;
  isEnabled: boolean;
}

/**
 * Returns identity-pass sanitization helpers.
 * Compose API handles sanitization server-side; no client-side PII scrubbing needed.
 */
export function useApiSanitization(): UseApiSanitization {
  return {
    isEnabled: false,
    sanitizeRequest: (data: unknown): unknown => data,
    sanitizeResponse: (data: unknown): unknown => data,
  };
}
