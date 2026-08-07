import { Injectable, Logger } from '@nestjs/common';

/**
 * RateLimiterService — Per-agent rate limiting for external-facing endpoints.
 *
 * Tracks request counts per agent ID / IP within a sliding window.
 * Secure Conversations enforces rate limits before processing any inbound A2A request.
 */

interface RateLimitWindow {
  count: number;
  windowStart: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly windows: Map<string, RateLimitWindow> = new Map();

  private readonly WINDOW_MS = this.readPositiveInteger(
    'RATE_LIMIT_WINDOW_MS',
    60_000,
  );
  private readonly MAX_REQUESTS = this.readPositiveInteger(
    'RATE_LIMIT_MAX_REQUESTS',
    100,
  );

  /**
   * Check if the given key (agentId or IP) is within rate limit.
   * Returns true if allowed, false if rate-limited.
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || now - existing.windowStart > this.WINDOW_MS) {
      this.pruneExpiredWindows(now);
      // New window
      this.windows.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (existing.count >= this.MAX_REQUESTS) {
      this.logger.warn(`Rate limit exceeded for ${key}: ${existing.count}/${this.MAX_REQUESTS} in ${this.WINDOW_MS}ms`);
      return false;
    }

    existing.count++;
    return true;
  }

  getRemainingRequests(key: string): number {
    const existing = this.windows.get(key);
    if (!existing || Date.now() - existing.windowStart > this.WINDOW_MS) {
      return this.MAX_REQUESTS;
    }
    return Math.max(0, this.MAX_REQUESTS - existing.count);
  }

  getWindowConfig() {
    return {
      windowMs: this.WINDOW_MS,
      maxRequests: this.MAX_REQUESTS,
    };
  }

  private readPositiveInteger(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
  }

  private pruneExpiredWindows(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.windowStart > this.WINDOW_MS) {
        this.windows.delete(key);
      }
    }
  }
}
