import { Injectable, Logger } from '@nestjs/common';

/**
 * RateLimiterService — Per-agent rate limiting for external-facing endpoints.
 *
 * Tracks request counts per agent ID / IP within a sliding window.
 * Bridge enforces rate limits before processing any inbound A2A request.
 */

interface RateLimitWindow {
  count: number;
  windowStart: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly windows: Map<string, RateLimitWindow> = new Map();

  private readonly WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10); // 1 minute
  private readonly MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10);

  /**
   * Check if the given key (agentId or IP) is within rate limit.
   * Returns true if allowed, false if rate-limited.
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || now - existing.windowStart > this.WINDOW_MS) {
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
}
