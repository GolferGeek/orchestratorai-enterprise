/**
 * External Integration Service
 *
 * Sprint 7 Task s7-7: Standardize retry/backoff/timeout
 * PRD Phase 9.4: External Integration Standardization
 *
 * Provides standardized retry, backoff, and timeout patterns for external API calls.
 */

import { Injectable, Logger } from '@nestjs/common';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Retry configuration for external API calls
 */
export interface RetryConfig {
  /** Maximum number of retries (default: 3) */
  maxRetries: number;
  /** Initial delay in ms (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Timeout per request in ms (default: 30000) */
  timeoutMs: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  timeoutMs: 30000,
};

/**
 * External service names tracked by this service
 */
export type ServiceName = 'firecrawl' | 'rss' | 'price_api' | 'llm' | 'slack';

/**
 * Service health status
 */
export interface ServiceHealth {
  service: ServiceName;
  status: 'healthy' | 'degraded' | 'down';
  lastSuccess?: Date;
  lastError?: Date;
  consecutiveFailures: number;
  errorRate: number;
}

/**
 * Internal health tracker
 */
interface ServiceHealthTracker {
  service: ServiceName;
  lastSuccess?: Date;
  lastError?: Date;
  consecutiveFailures: number;
  recentResults: boolean[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class ExternalIntegrationService {
  private readonly logger = new Logger(ExternalIntegrationService.name);

  // Track health per service
  private readonly healthTrackers = new Map<
    ServiceName,
    ServiceHealthTracker
  >();

  constructor() {
    // Initialize trackers for all services
    const services: ServiceName[] = [
      'firecrawl',
      'rss',
      'price_api',
      'llm',
      'slack',
    ];
    for (const service of services) {
      this.healthTrackers.set(service, {
        service,
        consecutiveFailures: 0,
        recentResults: [],
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RETRY LOGIC
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute an operation with retry logic and exponential backoff
   *
   * @param service - Service name for health tracking
   * @param operation - Async operation to execute
   * @param config - Optional retry config override
   * @returns Result of the operation
   * @throws Last error if all retries exhausted
   */
  async executeWithRetry<T>(
    service: ServiceName,
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>,
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Wrap operation in timeout
        const result = await this.executeWithTimeout(
          operation,
          retryConfig.timeoutMs,
        );

        // Record success
        this.recordSuccess(service);

        if (attempt > 0) {
          this.logger.log(
            `[${service}] Operation succeeded on attempt ${attempt + 1}/${retryConfig.maxRetries + 1}`,
          );
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Record failure
        this.recordFailure(service, lastError);

        // Don't retry on last attempt
        if (attempt === retryConfig.maxRetries) {
          this.logger.error(
            `[${service}] Operation failed after ${retryConfig.maxRetries + 1} attempts: ${lastError.message}`,
          );
          break;
        }

        // Calculate backoff delay
        const delayMs = this.calculateBackoff(attempt, retryConfig);

        this.logger.warn(
          `[${service}] Attempt ${attempt + 1}/${retryConfig.maxRetries + 1} failed: ${lastError.message}. Retrying in ${delayMs}ms...`,
        );

        // Wait before next attempt
        await this.delay(delayMs);
      }
    }

    // All retries exhausted
    throw lastError || new Error('Operation failed with unknown error');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get health status for a specific service
   *
   * @param service - Service name
   * @returns Service health or null if not tracked
   */
  getServiceHealth(service: ServiceName): ServiceHealth | null {
    const tracker = this.healthTrackers.get(service);
    if (!tracker) {
      return null;
    }
    return this.buildHealthStatus(tracker);
  }

  /**
   * Get health status for all tracked services
   *
   * @returns Array of service health statuses
   */
  getAllServiceHealth(): ServiceHealth[] {
    return Array.from(this.healthTrackers.values()).map((tracker) =>
      this.buildHealthStatus(tracker),
    );
  }

  /**
   * Check if a service is healthy
   *
   * @param service - Service name
   * @returns true if healthy
   */
  isServiceHealthy(service: ServiceName): boolean {
    const health = this.getServiceHealth(service);
    return health?.status === 'healthy';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  /**
   * Delay for specified milliseconds
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoff(attempt: number, config: RetryConfig): number {
    // Exponential: initialDelay * (multiplier ^ attempt)
    const exponentialDelay =
      config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);

    // Add jitter (0-20% random variation to prevent thundering herd)
    const jitter = exponentialDelay * 0.2 * Math.random();

    // Cap at maxDelayMs
    return Math.min(exponentialDelay + jitter, config.maxDelayMs);
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(service: ServiceName): void {
    const tracker = this.healthTrackers.get(service);
    if (!tracker) return;

    tracker.lastSuccess = new Date();
    tracker.consecutiveFailures = 0;

    // Add success to recent results
    tracker.recentResults.push(true);
    if (tracker.recentResults.length > 100) {
      tracker.recentResults.shift();
    }
  }

  /**
   * Record a failed operation
   */
  private recordFailure(service: ServiceName, error: Error): void {
    const tracker = this.healthTrackers.get(service);
    if (!tracker) return;

    tracker.lastError = new Date();
    tracker.consecutiveFailures++;

    // Add failure to recent results
    tracker.recentResults.push(false);
    if (tracker.recentResults.length > 100) {
      tracker.recentResults.shift();
    }

    this.logger.debug(
      `[${service}] Failure recorded: ${error.message}. Consecutive: ${tracker.consecutiveFailures}`,
    );
  }

  /**
   * Build service health status from tracker
   */
  private buildHealthStatus(tracker: ServiceHealthTracker): ServiceHealth {
    const totalResults = tracker.recentResults.length;
    const failures = tracker.recentResults.filter((r) => !r).length;
    const errorRate = totalResults > 0 ? failures / totalResults : 0;

    // Determine status
    let status: 'healthy' | 'degraded' | 'down';
    if (tracker.consecutiveFailures >= 3 || errorRate > 0.75) {
      status = 'down';
    } else if (tracker.consecutiveFailures > 0 || errorRate > 0.25) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      service: tracker.service,
      status,
      lastSuccess: tracker.lastSuccess,
      lastError: tracker.lastError,
      consecutiveFailures: tracker.consecutiveFailures,
      errorRate,
    };
  }

  /**
   * Reset health tracking for a service (for testing)
   */
  resetServiceHealth(service: ServiceName): void {
    const tracker = this.healthTrackers.get(service);
    if (tracker) {
      tracker.consecutiveFailures = 0;
      tracker.recentResults = [];
      tracker.lastError = undefined;
      tracker.lastSuccess = undefined;
    }
  }
}
