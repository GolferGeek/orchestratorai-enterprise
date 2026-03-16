/**
 * Backpressure Service
 *
 * Sprint 7 Task s7-5: Rate limits and backpressure
 * PRD Phase 9.4: Rate Limiting and Backpressure
 *
 * Provides backpressure management for crawling operations to prevent
 * overwhelming external services or the system.
 */

import { Injectable, Logger } from '@nestjs/common';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Backpressure configuration
 */
export interface BackpressureConfig {
  /** Maximum concurrent crawls per source (default: 1) */
  maxConcurrentCrawlsPerSource: number;
  /** Maximum concurrent crawls globally (default: 10) */
  maxConcurrentCrawlsGlobal: number;
  /** Minimum delay between crawls in ms (default: 1000) */
  crawlDelayMs: number;
  /** Queue depth threshold before applying backpressure (default: 100) */
  queueDepthThreshold: number;
  /** Token bucket refill rate per second (default: 10) */
  tokenRefillRate: number;
  /** Maximum tokens in bucket (default: 50) */
  maxTokens: number;
}

/**
 * Default backpressure configuration
 */
export const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  maxConcurrentCrawlsPerSource: 1,
  maxConcurrentCrawlsGlobal: 10,
  crawlDelayMs: 1000,
  queueDepthThreshold: 100,
  tokenRefillRate: 10,
  maxTokens: 50,
};

/**
 * Backpressure status
 */
export interface BackpressureStatus {
  isUnderBackpressure: boolean;
  currentCrawls: number;
  maxCrawls: number;
  queueDepth: number;
  availableTokens: number;
  reason?: string;
}

/**
 * Check result for starting a crawl
 */
export interface CrawlCheckResult {
  allowed: boolean;
  reason?: string;
  delayMs?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class BackpressureService {
  private readonly logger = new Logger(BackpressureService.name);
  private readonly config: BackpressureConfig;

  // Track active crawls per source
  private readonly activeCrawlsBySource = new Map<string, number>();
  // Track global active crawls
  private activeCrawlsGlobal = 0;
  // Track queue depth
  private queueDepth = 0;
  // Token bucket for rate limiting
  private tokens: number;
  private lastTokenRefill: number;

  constructor() {
    this.config = DEFAULT_BACKPRESSURE_CONFIG;
    this.tokens = this.config.maxTokens;
    this.lastTokenRefill = Date.now();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CRAWL PERMISSION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if a crawl can be started for a source
   *
   * @param sourceId - Source ID to check
   * @returns Result indicating if crawl is allowed
   */
  canStartCrawl(sourceId: string): CrawlCheckResult {
    // Refill tokens
    this.refillTokens();

    // Check global limit
    if (this.activeCrawlsGlobal >= this.config.maxConcurrentCrawlsGlobal) {
      this.logger.debug(
        `Global crawl limit reached: ${this.activeCrawlsGlobal}/${this.config.maxConcurrentCrawlsGlobal}`,
      );
      return {
        allowed: false,
        reason: `Global crawl limit reached (${this.activeCrawlsGlobal}/${this.config.maxConcurrentCrawlsGlobal})`,
        delayMs: this.config.crawlDelayMs,
      };
    }

    // Check per-source limit
    const sourceCrawls = this.activeCrawlsBySource.get(sourceId) ?? 0;
    if (sourceCrawls >= this.config.maxConcurrentCrawlsPerSource) {
      this.logger.debug(
        `Source ${sourceId} crawl limit reached: ${sourceCrawls}/${this.config.maxConcurrentCrawlsPerSource}`,
      );
      return {
        allowed: false,
        reason: `Source crawl limit reached (${sourceCrawls}/${this.config.maxConcurrentCrawlsPerSource})`,
        delayMs: this.config.crawlDelayMs * 2,
      };
    }

    // Check queue depth threshold
    if (this.queueDepth >= this.config.queueDepthThreshold) {
      this.logger.warn(
        `Queue depth threshold exceeded: ${this.queueDepth}/${this.config.queueDepthThreshold}`,
      );
      return {
        allowed: false,
        reason: `Queue depth threshold exceeded (${this.queueDepth}/${this.config.queueDepthThreshold})`,
        delayMs: this.config.crawlDelayMs * 3,
      };
    }

    // Check token bucket
    if (this.tokens < 1) {
      this.logger.debug(`No tokens available for rate limiting`);
      return {
        allowed: false,
        reason: 'Rate limit: no tokens available',
        delayMs: 1000 / this.config.tokenRefillRate,
      };
    }

    // Consume a token
    this.tokens--;

    return { allowed: true };
  }

  /**
   * Record the start of a crawl operation
   *
   * @param sourceId - Source ID
   */
  recordCrawlStart(sourceId: string): void {
    // Increment global counter
    this.activeCrawlsGlobal++;

    // Increment per-source counter
    const current = this.activeCrawlsBySource.get(sourceId) ?? 0;
    this.activeCrawlsBySource.set(sourceId, current + 1);

    this.logger.debug(
      `Crawl started for source ${sourceId}. Global: ${this.activeCrawlsGlobal}, Source: ${current + 1}`,
    );
  }

  /**
   * Record the completion of a crawl operation
   *
   * @param sourceId - Source ID
   */
  recordCrawlComplete(sourceId: string): void {
    // Decrement global counter
    this.activeCrawlsGlobal = Math.max(0, this.activeCrawlsGlobal - 1);

    // Decrement per-source counter
    const current = this.activeCrawlsBySource.get(sourceId) ?? 0;
    if (current > 0) {
      this.activeCrawlsBySource.set(sourceId, current - 1);
    }

    this.logger.debug(
      `Crawl completed for source ${sourceId}. Global: ${this.activeCrawlsGlobal}, Source: ${Math.max(0, current - 1)}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUEUE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get current queue depth
   *
   * @returns Current queue depth
   */
  getQueueDepth(): number {
    return this.queueDepth;
  }

  /**
   * Increment queue depth when adding items
   *
   * @param count - Number of items added (default: 1)
   */
  incrementQueueDepth(count = 1): void {
    this.queueDepth += count;
  }

  /**
   * Decrement queue depth when processing items
   *
   * @param count - Number of items processed (default: 1)
   */
  decrementQueueDepth(count = 1): void {
    this.queueDepth = Math.max(0, this.queueDepth - count);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if system is under backpressure
   *
   * @returns Backpressure status
   */
  isUnderBackpressure(): BackpressureStatus {
    this.refillTokens();

    const isUnderBackpressure =
      this.activeCrawlsGlobal >= this.config.maxConcurrentCrawlsGlobal * 0.8 ||
      this.queueDepth >= this.config.queueDepthThreshold * 0.8 ||
      this.tokens < this.config.maxTokens * 0.2;

    let reason: string | undefined;
    if (isUnderBackpressure) {
      if (
        this.activeCrawlsGlobal >=
        this.config.maxConcurrentCrawlsGlobal * 0.8
      ) {
        reason = 'Approaching global crawl limit';
      } else if (this.queueDepth >= this.config.queueDepthThreshold * 0.8) {
        reason = 'Queue depth approaching threshold';
      } else {
        reason = 'Token bucket running low';
      }
    }

    return {
      isUnderBackpressure,
      currentCrawls: this.activeCrawlsGlobal,
      maxCrawls: this.config.maxConcurrentCrawlsGlobal,
      queueDepth: this.queueDepth,
      availableTokens: Math.floor(this.tokens),
      reason,
    };
  }

  /**
   * Get current statistics
   *
   * @returns Current backpressure statistics
   */
  getStats(): {
    activeCrawlsGlobal: number;
    activeCrawlsBySource: Map<string, number>;
    queueDepth: number;
    availableTokens: number;
    config: BackpressureConfig;
  } {
    this.refillTokens();
    return {
      activeCrawlsGlobal: this.activeCrawlsGlobal,
      activeCrawlsBySource: new Map(this.activeCrawlsBySource),
      queueDepth: this.queueDepth,
      availableTokens: Math.floor(this.tokens),
      config: { ...this.config },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastTokenRefill) / 1000;
    const tokensToAdd = elapsedSeconds * this.config.tokenRefillRate;

    this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
    this.lastTokenRefill = now;
  }

  /**
   * Reset all counters (for testing)
   */
  reset(): void {
    this.activeCrawlsGlobal = 0;
    this.activeCrawlsBySource.clear();
    this.queueDepth = 0;
    this.tokens = this.config.maxTokens;
    this.lastTokenRefill = Date.now();
  }
}
