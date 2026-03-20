/**
 * Degraded Mode Service
 *
 * Sprint 7 Task s7-8: Degraded mode behaviors
 * PRD Phase 9.4: Service Degradation Handling
 *
 * Provides graceful degradation when external services are unavailable.
 * Uses cached data when available and queues operations for retry.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { ObservabilityEventsService } from '@orchestratorai/planes/observability';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Degradation levels for services
 */
export type DegradationLevel = 'normal' | 'partial' | 'degraded' | 'offline';

/**
 * Service degradation state
 */
export interface ServiceDegradation {
  service: string;
  level: DegradationLevel;
  reason: string;
  fallbackAvailable: boolean;
  since: Date;
}

/**
 * Cached content result
 */
export interface CachedContent {
  content: string;
  url: string;
  title?: string;
  cachedAt: Date;
  sourceId: string;
  isStale: boolean;
}

/**
 * Last known price result
 */
export interface LastKnownPrice {
  price: number;
  timestamp: Date;
  isStale: boolean;
  targetId: string;
  symbol: string;
}

/**
 * Configuration for degraded mode behavior
 */
export interface DegradedModeConfig {
  firecrawl: {
    cacheTtlMinutes: number;
    maxStaleMinutes: number;
  };
  priceApi: {
    maxStaleMinutes: number;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_DEGRADED_MODE_CONFIG: DegradedModeConfig = {
  firecrawl: {
    cacheTtlMinutes: 60,
    maxStaleMinutes: 24 * 60,
  },
  priceApi: {
    maxStaleMinutes: 30,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class DegradedModeService {
  private readonly logger = new Logger(DegradedModeService.name);
  private readonly schema = 'prediction';

  // Track degradation status per service
  private readonly degradations = new Map<string, ServiceDegradation>();

  private readonly config: DegradedModeConfig;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly observabilityEventsService: ObservabilityEventsService,
  ) {
    this.config = DEFAULT_DEGRADED_MODE_CONFIG;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEGRADATION STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Report service degradation
   *
   * @param ctx - Execution context for observability
   * @param service - Service name
   * @param level - Degradation level
   * @param reason - Reason for degradation
   */
  async reportDegradation(
    ctx: ExecutionContext,
    service: string,
    level: DegradationLevel,
    reason: string,
  ): Promise<void> {
    const existing = this.degradations.get(service);
    if (existing && existing.level === level) {
      this.logger.debug(
        `Service ${service} already in degradation level ${level}`,
      );
      return;
    }

    const fallbackAvailable = await this.checkFallbackAvailability(service);

    const degradation: ServiceDegradation = {
      service,
      level,
      reason,
      fallbackAvailable,
      since: new Date(),
    };

    this.degradations.set(service, degradation);

    const logMethod =
      level === 'offline' || level === 'degraded' ? 'error' : 'warn';
    this.logger[logMethod](
      `Service ${service} degradation: ${level} - ${reason} (fallback: ${fallbackAvailable})`,
    );

    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'service.degraded',
      status: level === 'offline' || level === 'degraded' ? 'error' : 'warning',
      message: `Service ${service} degraded to ${level}: ${reason}`,
      progress: 0,
      step: 'degradation_detection',
      payload: {
        service,
        level,
        reason,
        fallback_available: fallbackAvailable,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Clear degradation when service recovers
   *
   * @param ctx - Execution context
   * @param service - Service name
   */
  async clearDegradation(
    ctx: ExecutionContext,
    service: string,
  ): Promise<void> {
    const existing = this.degradations.get(service);
    if (!existing) {
      return;
    }

    this.degradations.delete(service);

    const duration = Date.now() - existing.since.getTime();
    const durationMinutes = Math.floor(duration / 60000);

    this.logger.log(
      `Service ${service} recovered from ${existing.level} after ${durationMinutes} minutes`,
    );

    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'service.recovered',
      status: 'completed',
      message: `Service ${service} recovered from ${existing.level}`,
      progress: 100,
      step: 'service_recovery',
      payload: {
        service,
        previous_level: existing.level,
        duration_minutes: durationMinutes,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Get current degradation level for a service
   *
   * @param service - Service name
   * @returns Current degradation level
   */
  getDegradationLevel(service: string): DegradationLevel {
    const degradation = this.degradations.get(service);
    return degradation ? degradation.level : 'normal';
  }

  /**
   * Check if we should use fallback behavior
   *
   * @param service - Service name
   * @returns True if fallback should be used
   */
  shouldUseFallback(service: string): boolean {
    const level = this.getDegradationLevel(service);
    return level === 'degraded' || level === 'offline';
  }

  /**
   * Get all current degradations
   */
  getAllDegradations(): ServiceDegradation[] {
    return Array.from(this.degradations.values());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIRECRAWL FALLBACKS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get cached content from previous crawl
   *
   * @param url - URL to find cached content for
   * @param sourceId - Optional source ID
   * @returns Cached content or null
   */
  async getCachedContent(
    url: string,
    sourceId?: string,
  ): Promise<CachedContent | null> {
    try {
      let query = this.db
        .from(this.schema, 'signals')
        .select('content, url, detected_at, source_id, metadata')
        .eq('url', url)
        .order('detected_at', { ascending: false })
        .limit(1);

      if (sourceId) {
        query = query.eq('source_id', sourceId);
      }

      const { data, error } =
        (await query.maybeSingle()) as SupabaseSelectResponse<{
          content: string;
          url: string;
          detected_at: string;
          source_id: string;
          metadata: Record<string, unknown>;
        }>;

      if (error) {
        this.logger.error(`Failed to get cached content: ${error.message}`);
        return null;
      }

      if (!data) {
        return null;
      }

      const cachedAt = new Date(data.detected_at);
      const ageMinutes = (Date.now() - cachedAt.getTime()) / (1000 * 60);
      const isStale = ageMinutes > this.config.firecrawl.cacheTtlMinutes;

      if (ageMinutes > this.config.firecrawl.maxStaleMinutes) {
        this.logger.debug(
          `Cached content for ${url} is too old (${Math.floor(ageMinutes)} minutes)`,
        );
        return null;
      }

      this.logger.debug(
        `Found cached content for ${url} (age: ${Math.floor(ageMinutes)} minutes, stale: ${isStale})`,
      );

      return {
        content: data.content,
        url: data.url,
        title: (data.metadata as { title?: string })?.title,
        cachedAt,
        sourceId: data.source_id,
        isStale,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error getting cached content: ${errorMessage}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRICE API FALLBACKS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get last known price if price API is down
   *
   * @param targetId - Target ID
   * @returns Last known price or null
   */
  async getLastKnownPrice(targetId: string): Promise<LastKnownPrice | null> {
    try {
      const { data: target, error: targetError } = (await this.db
        .from(this.schema, 'targets')
        .select('symbol')
        .eq('id', targetId)
        .single()) as SupabaseSelectResponse<{ symbol: string }>;

      if (targetError) {
        this.logger.error(
          `Failed to get target for price lookup: ${targetError.message}`,
        );
        return null;
      }

      const { data, error } = (await this.db
        .from(this.schema, 'target_snapshots')
        .select('value, captured_at')
        .eq('target_id', targetId)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle()) as SupabaseSelectResponse<{
        value: number;
        captured_at: string;
      }>;

      if (error) {
        this.logger.error(`Failed to get last known price: ${error.message}`);
        return null;
      }

      if (!data) {
        return null;
      }

      const timestamp = new Date(data.captured_at);
      const ageMinutes = (Date.now() - timestamp.getTime()) / (1000 * 60);
      const isStale = ageMinutes > this.config.priceApi.maxStaleMinutes;

      this.logger.debug(
        `Found last known price for ${target?.symbol || targetId} (age: ${Math.floor(ageMinutes)} minutes, stale: ${isStale})`,
      );

      return {
        price: Number(data.value),
        timestamp,
        isStale,
        targetId,
        symbol: target?.symbol || 'UNKNOWN',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error getting last known price: ${errorMessage}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if fallback data is available for a service
   */
  private async checkFallbackAvailability(service: string): Promise<boolean> {
    try {
      switch (service) {
        case 'firecrawl': {
          const { data, error } = (await this.db
            .from(this.schema, 'signals')
            .select('id')
            .gte(
              'detected_at',
              new Date(
                Date.now() - this.config.firecrawl.maxStaleMinutes * 60 * 1000,
              ).toISOString(),
            )
            .limit(1)
            .maybeSingle()) as SupabaseSelectResponse<{ id: string }>;

          return !error && data !== null;
        }

        case 'price-api': {
          const { data, error } = (await this.db
            .from(this.schema, 'target_snapshots')
            .select('id')
            .gte(
              'captured_at',
              new Date(
                Date.now() - this.config.priceApi.maxStaleMinutes * 60 * 1000,
              ).toISOString(),
            )
            .limit(1)
            .maybeSingle()) as SupabaseSelectResponse<{ id: string }>;

          return !error && data !== null;
        }

        default:
          return false;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error checking fallback availability for ${service}: ${errorMessage}`,
      );
      return false;
    }
  }

  /**
   * Get degradation summary for monitoring
   */
  getDegradationSummary(): {
    total: number;
    byLevel: Record<DegradationLevel, number>;
    services: Array<{ service: string; level: DegradationLevel }>;
  } {
    const degradations = this.getAllDegradations();

    const byLevel: Record<DegradationLevel, number> = {
      normal: 0,
      partial: 0,
      degraded: 0,
      offline: 0,
    };

    for (const d of degradations) {
      byLevel[d.level]++;
    }

    return {
      total: degradations.length,
      byLevel,
      services: degradations.map((d) => ({
        service: d.service,
        level: d.level,
      })),
    };
  }
}
