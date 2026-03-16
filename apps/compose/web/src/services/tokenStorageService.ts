/**
 * Token Storage Service
 *
 * Provides secure token storage abstraction for both web and native (Capacitor) environments.
 *
 * Security Strategy:
 * - Web Browser: In-memory storage with localStorage persistence (survives browser close)
 * - Native (Capacitor): Capacitor Preferences (encrypted platform storage)
 *
 * Note: localStorage is used for persistent login across browser sessions.
 * Users must explicitly logout to clear tokens.
 */

import { Capacitor } from '@capacitor/core';

// In-memory token storage (most secure for web)
let inMemoryAccessToken: string | null = null;
let inMemoryRefreshToken: string | null = null;

// Storage keys
const ACCESS_TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

/**
 * Platform detection
 */
const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Get Capacitor Preferences dynamically (only when needed)
 */
const getCapacitorPreferences = async () => {
  if (!isNativePlatform()) {
    throw new Error('Capacitor Preferences only available on native platforms');
  }

  // Dynamic import to avoid bundling on web
  const { Preferences } = await import('@capacitor/preferences');
  return Preferences;
};

/**
 * Storage layer abstraction
 */
class TokenStorage {
  private initialized = false;

  /**
   * Initialize token storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Restore tokens from persistent storage on page load
    await this.restoreTokensFromPersistentStorage();

    this.initialized = true;
  }

  /**
   * Restore tokens from persistent storage on app startup
   */
  private async restoreTokensFromPersistentStorage(): Promise<void> {
    try {
      if (isNativePlatform()) {
        // Native: Load from Capacitor Preferences
        const Preferences = await getCapacitorPreferences();
        const { value: accessToken } = await Preferences.get({ key: ACCESS_TOKEN_KEY });
        const { value: refreshToken } = await Preferences.get({ key: REFRESH_TOKEN_KEY });

        if (accessToken) {
          inMemoryAccessToken = accessToken;
        }
        if (refreshToken) {
          inMemoryRefreshToken = refreshToken;
        }
      } else {
        // Web: Load from localStorage (survives browser close for persistent login)
        const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

        if (accessToken) {
          inMemoryAccessToken = accessToken;
        }
        if (refreshToken) {
          inMemoryRefreshToken = refreshToken;
        }
      }
    } catch (error) {
      console.error('[TokenStorage] Failed to restore tokens:', error);
      // Don't throw - allow app to continue with empty tokens
    }
  }

  /**
   * Set access token
   */
  async setAccessToken(token: string): Promise<void> {
    inMemoryAccessToken = token;

    try {
      if (isNativePlatform()) {
        // Native: Store in Capacitor Preferences (encrypted)
        const Preferences = await getCapacitorPreferences();
        await Preferences.set({ key: ACCESS_TOKEN_KEY, value: token });
      } else {
        // Web: Store in localStorage for persistent login across browser sessions
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
      }
    } catch (error) {
      console.error('[TokenStorage] Failed to persist access token:', error);
      // Token is still in memory, so don't throw
    }
  }

  /**
   * Get access token
   */
  async getAccessToken(): Promise<string | null> {
    await this.initialize();
    return inMemoryAccessToken;
  }

  /**
   * Set refresh token
   */
  async setRefreshToken(token: string): Promise<void> {
    inMemoryRefreshToken = token;

    try {
      if (isNativePlatform()) {
        // Native: Store in Capacitor Preferences (encrypted)
        const Preferences = await getCapacitorPreferences();
        await Preferences.set({ key: REFRESH_TOKEN_KEY, value: token });
      } else {
        // Web: Store in localStorage for persistent login across browser sessions
        localStorage.setItem(REFRESH_TOKEN_KEY, token);
      }
    } catch (error) {
      console.error('[TokenStorage] Failed to persist refresh token:', error);
      // Token is still in memory, so don't throw
    }
  }

  /**
   * Get refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    await this.initialize();
    return inMemoryRefreshToken;
  }

  /**
   * Clear all tokens
   */
  async clearTokens(): Promise<void> {
    inMemoryAccessToken = null;
    inMemoryRefreshToken = null;

    try {
      if (isNativePlatform()) {
        // Native: Clear from Capacitor Preferences
        const Preferences = await getCapacitorPreferences();
        await Preferences.remove({ key: ACCESS_TOKEN_KEY });
        await Preferences.remove({ key: REFRESH_TOKEN_KEY });
      } else {
        // Web: Clear from localStorage (explicit logout)
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    } catch (error) {
      console.error('[TokenStorage] Failed to clear persistent tokens:', error);
      // Tokens are cleared from memory, so don't throw
    }
  }

  /**
   * Check if tokens exist
   */
  async hasTokens(): Promise<boolean> {
    await this.initialize();
    return inMemoryAccessToken !== null || inMemoryRefreshToken !== null;
  }
}

// Export singleton instance
export const tokenStorage = new TokenStorage();
