/**
 * securityConfig.ts
 *
 * Minimal security configuration helpers for Compose Web.
 * Provides the API base URL from environment variables.
 */

/**
 * Returns the API base URL.
 * Compose Web proxies API requests via Vite dev server so
 * the base URL is relative in development.
 */
export function getSecureApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '';
}

/**
 * Validates that the application is running in a secure context.
 * Throws if required security conditions are not met.
 */
export function validateSecureContext(): void {
  // In production, ensure HTTPS. Skip in development.
  if (
    import.meta.env.PROD &&
    typeof window !== 'undefined' &&
    window.location.protocol !== 'https:'
  ) {
    throw new Error('Compose Web requires HTTPS in production.');
  }
}

/**
 * Logs security configuration to the console in development.
 */
export function logSecurityConfig(): void {
  if (import.meta.env.DEV) {
    console.log('[Compose] Security config:', {
      apiBaseUrl: getSecureApiBaseUrl(),
      protocol: typeof window !== 'undefined' ? window.location.protocol : 'N/A',
    });
  }
}

/**
 * Returns common secure request headers.
 */
export function getSecureHeaders(): Record<string, string> {
  // Token is stored under 'authToken' (camelCase) by the rbacStore.
  // Check sessionStorage first (TokenStorageService migrates there),
  // then fall back to localStorage.
  const token =
    sessionStorage.getItem('authToken') ||
    localStorage.getItem('authToken') ||
    '';

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
