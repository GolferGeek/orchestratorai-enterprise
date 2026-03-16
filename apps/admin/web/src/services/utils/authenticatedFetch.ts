/**
 * Authenticated Fetch Utility
 *
 * Wraps fetch with automatic token refresh on 401 errors.
 * Use this instead of raw fetch() for authenticated API calls.
 */

import { tokenStorage } from '../tokenStorageService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Track if we're currently refreshing to prevent multiple simultaneous refreshes
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Attempt to refresh the auth token
 * Returns the new token or null if refresh failed
 */
async function refreshAuthToken(): Promise<string | null> {
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) {
        console.warn('[AuthenticatedFetch] No refresh token available');
        return null;
      }

      console.log('[AuthenticatedFetch] Attempting token refresh...');

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        console.error('[AuthenticatedFetch] Token refresh failed:', response.status);
        // Clear tokens on refresh failure
        await tokenStorage.clearTokens();
        return null;
      }

      const data = await response.json();
      const { accessToken, refreshToken: newRefreshToken } = data;

      if (accessToken) {
        await tokenStorage.setAccessToken(accessToken);
        if (newRefreshToken) {
          await tokenStorage.setRefreshToken(newRefreshToken);
        }
        console.log('[AuthenticatedFetch] Token refresh successful');
        return accessToken;
      }

      return null;
    } catch (error) {
      console.error('[AuthenticatedFetch] Token refresh error:', error);
      await tokenStorage.clearTokens();
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Get the current auth token
 */
export async function getAuthToken(): Promise<string | null> {
  return tokenStorage.getAccessToken();
}

/**
 * Options for authenticated fetch
 */
export interface AuthenticatedFetchOptions extends RequestInit {
  /** Skip automatic token refresh on 401 (default: false) */
  skipAutoRefresh?: boolean;
  /** Custom token to use instead of stored token */
  token?: string;
}

/**
 * Fetch with automatic authentication and token refresh
 *
 * @param url - The URL to fetch (can be relative or absolute)
 * @param options - Fetch options plus authentication options
 * @returns Fetch Response
 * @throws Error if request fails after retry
 */
export async function authenticatedFetch(
  url: string,
  options: AuthenticatedFetchOptions = {}
): Promise<Response> {
  const { skipAutoRefresh = false, token: customToken, ...fetchOptions } = options;

  // Get the auth token
  const token = customToken ?? await getAuthToken();

  // Prepare headers
  const headers = new Headers(fetchOptions.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && fetchOptions.body) {
    headers.set('Content-Type', 'application/json');
  }

  // Make the request
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  // If 401 and auto-refresh is enabled, try to refresh and retry
  if (response.status === 401 && !skipAutoRefresh) {
    console.log('[AuthenticatedFetch] Got 401, attempting token refresh...');

    const newToken = await refreshAuthToken();

    if (newToken) {
      // Retry with new token
      console.log('[AuthenticatedFetch] Retrying request with new token...');
      headers.set('Authorization', `Bearer ${newToken}`);

      return fetch(url, {
        ...fetchOptions,
        headers,
      });
    }

    // Refresh failed - return original 401 response
    console.warn('[AuthenticatedFetch] Token refresh failed, returning 401');
  }

  return response;
}

/**
 * Helper to check if an error is an auth error that requires re-login
 */
export function isAuthError(response: Response): boolean {
  return response.status === 401;
}

/**
 * Helper to trigger a re-login flow
 * This can be called when token refresh fails
 */
export async function triggerReLogin(): Promise<void> {
  await tokenStorage.clearTokens();
  // Dispatch a custom event that the auth system can listen for
  window.dispatchEvent(new CustomEvent('auth:session-expired'));
}
