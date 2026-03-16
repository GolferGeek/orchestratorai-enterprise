/**
 * LLM Usage Limiter Service
 *
 * Sprint 7 Task s7-6: LLM usage caps
 * PRD Phase 9.4: LLM Usage Limits
 *
 * Tracks and enforces LLM usage limits per universe based on tier.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { ObservabilityEventsService } from '@/observability/observability-events.service';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Usage tier type
 */
export type UsageTier = 'free' | 'pro' | 'enterprise';

/**
 * Local providers that should bypass usage tracking (they're free/unlimited)
 */
export const LOCAL_PROVIDERS = ['ollama'] as const;

/**
 * Usage limits configuration per tier
 */
export interface UsageLimits {
  daily_tokens: number;
  monthly_tokens: number;
  daily_requests: number;
  monthly_requests: number;
}

/**
 * Predefined usage limits per tier
 */
export const TIER_LIMITS: Record<UsageTier, UsageLimits> = {
  free: {
    daily_tokens: 100_000_000, // High limits for local models like ollama qwen2.5:7b
    monthly_tokens: 1_000_000_000,
    daily_requests: 100_000,
    monthly_requests: 1_000_000,
  },
  pro: {
    daily_tokens: 100_000_000,
    monthly_tokens: 1_000_000_000,
    daily_requests: 100_000,
    monthly_requests: 1_000_000,
  },
  enterprise: {
    daily_tokens: 100_000_000,
    monthly_tokens: 1_000_000_000,
    daily_requests: 100_000,
    monthly_requests: 1_000_000,
  },
};

/**
 * Usage tracking data per universe
 */
interface UsageTracking {
  universeId: string;
  tier: UsageTier;
  daily_tokens: number;
  monthly_tokens: number;
  daily_requests: number;
  monthly_requests: number;
  last_daily_reset: Date;
  last_monthly_reset: Date;
}

/**
 * Warning threshold percentages
 */
const WARNING_THRESHOLDS = {
  low: 0.75,
  high: 0.9,
  critical: 0.95,
};

/**
 * Check result for token usage
 */
export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
  remaining?: number;
}

/**
 * Current usage statistics
 */
export interface UsageStats {
  daily_tokens: number;
  monthly_tokens: number;
  daily_requests: number;
  monthly_requests: number;
  tier: UsageTier;
  limits: UsageLimits;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class LlmUsageLimiterService {
  private readonly logger = new Logger(LlmUsageLimiterService.name);

  // In-memory usage tracking
  private readonly usageMap = new Map<string, UsageTracking>();

  constructor(
    private readonly observabilityEventsService: ObservabilityEventsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // USAGE CHECKS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if a provider is local (and thus unlimited/free)
   */
  isLocalProvider(provider: string): boolean {
    return LOCAL_PROVIDERS.includes(
      provider.toLowerCase() as (typeof LOCAL_PROVIDERS)[number],
    );
  }

  /**
   * Check if a universe can use the specified number of tokens
   *
   * @param universeId - Universe ID to check
   * @param estimatedTokens - Estimated tokens to be used
   * @param provider - Optional provider name; if local, always allowed
   * @returns Check result with allowed status
   */
  canUseTokens(
    universeId: string,
    estimatedTokens: number,
    provider?: string,
  ): UsageCheckResult {
    // Local providers are unlimited - no tracking needed
    if (provider && this.isLocalProvider(provider)) {
      this.logger.debug(`Skipping usage check for local provider: ${provider}`);
      return { allowed: true };
    }
    const usage = this.getOrCreateUsageTracking(universeId);
    const limits = TIER_LIMITS[usage.tier];

    // Check if we need to reset counters
    this.checkAndResetCounters(usage);

    // Check daily token limit
    if (usage.daily_tokens + estimatedTokens > limits.daily_tokens) {
      const remaining = Math.max(0, limits.daily_tokens - usage.daily_tokens);
      this.logger.warn(
        `Universe ${universeId} (${usage.tier}) would exceed daily token limit: ${usage.daily_tokens + estimatedTokens}/${limits.daily_tokens}`,
      );
      return {
        allowed: false,
        reason: 'Daily token limit exceeded',
        remaining,
      };
    }

    // Check monthly token limit
    if (usage.monthly_tokens + estimatedTokens > limits.monthly_tokens) {
      const remaining = Math.max(
        0,
        limits.monthly_tokens - usage.monthly_tokens,
      );
      this.logger.warn(
        `Universe ${universeId} (${usage.tier}) would exceed monthly token limit`,
      );
      return {
        allowed: false,
        reason: 'Monthly token limit exceeded',
        remaining,
      };
    }

    // Check daily request limit
    if (usage.daily_requests + 1 > limits.daily_requests) {
      const remaining = Math.max(
        0,
        limits.daily_requests - usage.daily_requests,
      );
      this.logger.warn(
        `Universe ${universeId} (${usage.tier}) would exceed daily request limit`,
      );
      return {
        allowed: false,
        reason: 'Daily request limit exceeded',
        remaining,
      };
    }

    // Check monthly request limit
    if (usage.monthly_requests + 1 > limits.monthly_requests) {
      const remaining = Math.max(
        0,
        limits.monthly_requests - usage.monthly_requests,
      );
      this.logger.warn(
        `Universe ${universeId} (${usage.tier}) would exceed monthly request limit`,
      );
      return {
        allowed: false,
        reason: 'Monthly request limit exceeded',
        remaining,
      };
    }

    return {
      allowed: true,
      remaining: Math.min(
        limits.daily_tokens - usage.daily_tokens,
        limits.monthly_tokens - usage.monthly_tokens,
      ),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USAGE RECORDING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record LLM usage for a universe
   *
   * @param universeId - Universe ID
   * @param tokens - Number of tokens used
   * @param requestType - Type of request (for logging)
   * @param provider - Optional provider name; if local, skip recording
   */
  recordUsage(
    universeId: string,
    tokens: number,
    requestType: string,
    provider?: string,
  ): void {
    // Local providers are unlimited - no tracking needed
    if (provider && this.isLocalProvider(provider)) {
      this.logger.debug(
        `Skipping usage recording for local provider: ${provider}`,
      );
      return;
    }
    const usage = this.getOrCreateUsageTracking(universeId);

    // Check and reset counters if needed
    this.checkAndResetCounters(usage);

    // Update usage counters
    usage.daily_tokens += tokens;
    usage.monthly_tokens += tokens;
    usage.daily_requests += 1;
    usage.monthly_requests += 1;

    this.logger.debug(
      `Recorded usage for universe ${universeId} (${usage.tier}): +${tokens} tokens, request: ${requestType}. Daily: ${usage.daily_tokens}/${TIER_LIMITS[usage.tier].daily_tokens}`,
    );

    // Save updated usage
    this.usageMap.set(universeId, usage);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USAGE STATS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get current usage for a universe
   *
   * @param universeId - Universe ID
   * @returns Current usage statistics
   */
  getUsage(universeId: string): UsageStats {
    const usage = this.getOrCreateUsageTracking(universeId);
    this.checkAndResetCounters(usage);

    return {
      daily_tokens: usage.daily_tokens,
      monthly_tokens: usage.monthly_tokens,
      daily_requests: usage.daily_requests,
      monthly_requests: usage.monthly_requests,
      tier: usage.tier,
      limits: TIER_LIMITS[usage.tier],
    };
  }

  /**
   * Set the tier for a universe
   *
   * @param universeId - Universe ID
   * @param tier - Usage tier
   */
  setTier(universeId: string, tier: UsageTier): void {
    const usage = this.getOrCreateUsageTracking(universeId);
    usage.tier = tier;
    this.usageMap.set(universeId, usage);
    this.logger.log(`Set tier for universe ${universeId} to ${tier}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WARNINGS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check usage levels and emit warning events if approaching limits
   *
   * @param ctx - ExecutionContext for event emission
   * @param universeId - Universe ID to check
   */
  async checkAndEmitWarnings(
    ctx: ExecutionContext,
    universeId: string,
  ): Promise<void> {
    const usage = this.getOrCreateUsageTracking(universeId);
    const limits = TIER_LIMITS[usage.tier];

    this.checkAndResetCounters(usage);

    // Check daily token usage
    const dailyTokenPct = usage.daily_tokens / limits.daily_tokens;
    await this.checkThresholdAndEmit(
      ctx,
      universeId,
      usage.tier,
      'daily_tokens',
      dailyTokenPct,
      usage.daily_tokens,
      limits.daily_tokens,
    );

    // Check monthly token usage
    const monthlyTokenPct = usage.monthly_tokens / limits.monthly_tokens;
    await this.checkThresholdAndEmit(
      ctx,
      universeId,
      usage.tier,
      'monthly_tokens',
      monthlyTokenPct,
      usage.monthly_tokens,
      limits.monthly_tokens,
    );

    // Check daily request usage
    const dailyRequestPct = usage.daily_requests / limits.daily_requests;
    await this.checkThresholdAndEmit(
      ctx,
      universeId,
      usage.tier,
      'daily_requests',
      dailyRequestPct,
      usage.daily_requests,
      limits.daily_requests,
    );

    // Check monthly request usage
    const monthlyRequestPct = usage.monthly_requests / limits.monthly_requests;
    await this.checkThresholdAndEmit(
      ctx,
      universeId,
      usage.tier,
      'monthly_requests',
      monthlyRequestPct,
      usage.monthly_requests,
      limits.monthly_requests,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get or create usage tracking for a universe
   */
  private getOrCreateUsageTracking(universeId: string): UsageTracking {
    let usage = this.usageMap.get(universeId);

    if (!usage) {
      const now = new Date();
      usage = {
        universeId,
        tier: 'free', // Default tier
        daily_tokens: 0,
        monthly_tokens: 0,
        daily_requests: 0,
        monthly_requests: 0,
        last_daily_reset: now,
        last_monthly_reset: now,
      };

      this.usageMap.set(universeId, usage);
      this.logger.log(
        `Initialized usage tracking for universe ${universeId} with tier: ${usage.tier}`,
      );
    }

    return usage;
  }

  /**
   * Check if counters need to be reset
   */
  private checkAndResetCounters(usage: UsageTracking): void {
    const now = new Date();

    // Check daily reset
    const lastResetDay = usage.last_daily_reset.toISOString().split('T')[0];
    const currentDay = now.toISOString().split('T')[0];

    if (lastResetDay !== currentDay) {
      this.logger.log(
        `Resetting daily counters for universe ${usage.universeId} (previous: ${usage.daily_tokens} tokens, ${usage.daily_requests} requests)`,
      );
      usage.daily_tokens = 0;
      usage.daily_requests = 0;
      usage.last_daily_reset = now;
    }

    // Check monthly reset
    const lastResetMonth = `${usage.last_monthly_reset.getFullYear()}-${String(usage.last_monthly_reset.getMonth() + 1).padStart(2, '0')}`;
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (lastResetMonth !== currentMonth) {
      this.logger.log(
        `Resetting monthly counters for universe ${usage.universeId} (previous: ${usage.monthly_tokens} tokens, ${usage.monthly_requests} requests)`,
      );
      usage.monthly_tokens = 0;
      usage.monthly_requests = 0;
      usage.last_monthly_reset = now;
    }
  }

  /**
   * Check threshold and emit warning if exceeded
   */
  private async checkThresholdAndEmit(
    ctx: ExecutionContext,
    universeId: string,
    tier: UsageTier,
    metric: string,
    percentage: number,
    current: number,
    limit: number,
  ): Promise<void> {
    let warningLevel: 'low' | 'high' | 'critical' | null = null;

    if (percentage >= WARNING_THRESHOLDS.critical) {
      warningLevel = 'critical';
    } else if (percentage >= WARNING_THRESHOLDS.high) {
      warningLevel = 'high';
    } else if (percentage >= WARNING_THRESHOLDS.low) {
      warningLevel = 'low';
    }

    if (warningLevel) {
      const message = `${warningLevel.toUpperCase()}: ${metric} usage at ${(percentage * 100).toFixed(1)}% (${current}/${limit}) for universe ${universeId} (${tier} tier)`;

      this.logger.warn(message);

      await this.observabilityEventsService.push({
        context: ctx,
        source_app: 'prediction-runner',
        hook_event_type: 'llm.usage.warning',
        status: 'warning',
        message,
        progress: Math.round(percentage * 100),
        step: 'usage_check',
        payload: {
          universeId,
          tier,
          warning_level: warningLevel,
          metric,
          current,
          limit,
          percentage: percentage * 100,
        },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Reset usage for a universe (for testing)
   */
  resetUsage(universeId: string): void {
    this.usageMap.delete(universeId);
  }
}
