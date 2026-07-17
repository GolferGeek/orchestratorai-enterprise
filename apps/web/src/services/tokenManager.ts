/**
 * Token Manager Service
 * Handles proactive token refresh and automatic token management
 */
import { authService } from "./authService";
import {
  isTokenExpiredOrExpiringSoon,
  getTokenTimeRemaining,
} from "@/utils/tokenUtils";
class TokenManager {
  private refreshInterval: number | null = null;
  private isRefreshing = false;
  private refreshCallbacks: Array<(success: boolean) => void> = [];
  /**
   * Start automatic token refresh monitoring
   * Checks every minute if token needs refresh
   */
  startMonitoring(): void {
    // Clear any existing interval
    this.stopMonitoring();
    // Check immediately
    this.checkAndRefreshToken();
    // Set up periodic checking (every minute)
    this.refreshInterval = window.setInterval(() => {
      this.checkAndRefreshToken();
    }, 60000); // 60 seconds
  }
  /**
   * Stop automatic token refresh monitoring
   */
  stopMonitoring(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
  /**
   * Check if token needs refresh and refresh if needed
   */
  private async checkAndRefreshToken(): Promise<void> {
    const token = await authService.getToken();
    if (!token) {
      return; // No token to refresh
    }
    // Check if token is expired or expiring soon (within 5 minutes)
    if (isTokenExpiredOrExpiringSoon(token, 5)) {
      await this.refreshToken();
    }
  }
  /**
   * Refresh token with deduplication (only one refresh at a time)
   * @returns Promise that resolves to true if refresh was successful
   */
  async refreshToken(): Promise<boolean> {
    // If already refreshing, wait for that to complete
    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.refreshCallbacks.push(resolve);
      });
    }
    this.isRefreshing = true;
    let success = false;
    try {
      await authService.refreshToken();
      success = true;
    } catch {
      success = false;
    } finally {
      this.isRefreshing = false;
      // Notify all waiting callbacks
      this.refreshCallbacks.forEach((callback) => callback(success));
      this.refreshCallbacks = [];
    }
    return success;
  }
  /**
   * Check if currently refreshing a token
   */
  isCurrentlyRefreshing(): boolean {
    return this.isRefreshing;
  }
  /**
   * Get current token status information
   */
  async getTokenStatus(): Promise<{
    hasToken: boolean;
    isValid: boolean;
    timeRemaining: number;
    isExpiringSoon: boolean;
  }> {
    const token = await authService.getToken();
    if (!token) {
      return {
        hasToken: false,
        isValid: false,
        timeRemaining: 0,
        isExpiringSoon: false,
      };
    }
    const timeRemaining = getTokenTimeRemaining(token);
    const isExpiringSoon = isTokenExpiredOrExpiringSoon(token, 5);
    return {
      hasToken: true,
      isValid: timeRemaining > 0,
      timeRemaining,
      isExpiringSoon,
    };
  }
}
// Export singleton instance
export const tokenManager = new TokenManager();
// Auto-start monitoring when the module is imported (if user is authenticated)
authService
  .getToken()
  .then((token) => {
    if (token) {
      tokenManager.startMonitoring();
    }
  })
  .catch((err) => {
    console.error("[TokenManager] Failed to auto-start monitoring:", err);
  });
