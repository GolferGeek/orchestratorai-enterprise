import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  AccuracyComparisonDto,
  LearningVelocityDto,
  ScenarioEffectivenessDto,
  PromotionFunnelDto,
  AnalyticsSummaryDto,
  AccuracyByStrategyDto,
  AccuracyByTargetDto,
  SignalDetectionRateDto,
} from '../dto/analytics.dto';

// Database row types for analytics views
interface AccuracyComparisonRow {
  period_date: string;
  is_test: boolean;
  total_predictions: number;
  resolved_predictions: number;
  correct_predictions: number;
  accuracy_pct: number | null;
  avg_confidence: number | null;
  avg_overall_score: number | null;
}

interface LearningVelocityRow {
  period_date: string;
  test_learnings_created: number;
  production_learnings_created: number;
  learnings_promoted: number;
  avg_days_to_promotion: number | null;
}

interface ScenarioEffectivenessRow {
  scenario_type: string;
  total_scenarios: number;
  total_runs: number;
  successful_runs: number;
  success_rate_pct: number | null;
  learnings_generated: number;
  avg_run_duration_minutes: number | null;
}

interface PromotionFunnelRow {
  stage: string;
  count: number;
  pct_of_total: number | null;
}

// Note: AccuracyByStrategyRow and AccuracyByTargetRow interfaces are not needed
// because we aggregate data from predictions table directly rather than from views

/**
 * Analytics Service
 * Handles querying Phase 6.1 Analytics Views for dashboard consumption
 *
 * Phase 6.2 - Analytics API Endpoints
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Get accuracy comparison analytics
   * Compares test vs production prediction accuracy over time
   *
   * @param orgSlug - Organization slug (for future org-scoped filtering)
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @returns Array of accuracy comparison records
   */
  async getAccuracyComparison(
    orgSlug: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AccuracyComparisonDto[]> {
    this.logger.debug(
      `Fetching accuracy comparison for org: ${orgSlug}, dateRange: ${startDate ?? 'all'} to ${endDate ?? 'now'}`,
    );

    let query = this.db
      .from('prediction', 'v_analytics_accuracy_comparison')
      .select('*')
      .order('period_date', { ascending: false });

    // Apply date range filters if provided
    if (startDate) {
      query = query.gte('period_date', startDate);
    }
    if (endDate) {
      query = query.lte('period_date', endDate);
    }

    const { data, error } = (await query) as QueryResult<unknown>;

    if (error) {
      this.logger.error(
        `Failed to fetch accuracy comparison: ${error.message}`,
      );
      throw new Error(`Failed to fetch accuracy comparison: ${error.message}`);
    }

    // Transform to DTO
    return ((data as AccuracyComparisonRow[] | null) ?? []).map((row) => ({
      period_date: row.period_date,
      is_test: row.is_test,
      total_predictions: Number(row.total_predictions ?? 0),
      resolved_predictions: Number(row.resolved_predictions ?? 0),
      correct_predictions: Number(row.correct_predictions ?? 0),
      accuracy_pct: row.accuracy_pct !== null ? Number(row.accuracy_pct) : null,
      avg_confidence:
        row.avg_confidence !== null ? Number(row.avg_confidence) : null,
      avg_overall_score:
        row.avg_overall_score !== null ? Number(row.avg_overall_score) : null,
    }));
  }

  /**
   * Get learning velocity analytics
   * Tracks test learning creation, promotion, and time to promotion
   *
   * @param orgSlug - Organization slug (for future org-scoped filtering)
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @returns Array of learning velocity records
   */
  async getLearningVelocity(
    orgSlug: string,
    startDate?: string,
    endDate?: string,
  ): Promise<LearningVelocityDto[]> {
    this.logger.debug(
      `Fetching learning velocity for org: ${orgSlug}, dateRange: ${startDate ?? 'all'} to ${endDate ?? 'now'}`,
    );

    let query = this.db
      .from('prediction', 'v_analytics_learning_velocity')
      .select('*')
      .order('period_date', { ascending: false });

    // Apply date range filters if provided
    if (startDate) {
      query = query.gte('period_date', startDate);
    }
    if (endDate) {
      query = query.lte('period_date', endDate);
    }

    const { data, error } = (await query) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to fetch learning velocity: ${error.message}`);
      throw new Error(`Failed to fetch learning velocity: ${error.message}`);
    }

    // Transform to DTO
    return ((data as LearningVelocityRow[] | null) ?? []).map((row) => ({
      period_date: row.period_date,
      test_learnings_created: Number(row.test_learnings_created ?? 0),
      production_learnings_created: Number(
        row.production_learnings_created ?? 0,
      ),
      learnings_promoted: Number(row.learnings_promoted ?? 0),
      avg_days_to_promotion:
        row.avg_days_to_promotion !== null
          ? Number(row.avg_days_to_promotion)
          : null,
    }));
  }

  /**
   * Get scenario effectiveness analytics
   * Analyzes test scenario success rates and learning generation
   *
   * @param orgSlug - Organization slug (for future org-scoped filtering)
   * @returns Array of scenario effectiveness records
   */
  async getScenarioEffectiveness(
    orgSlug: string,
  ): Promise<ScenarioEffectivenessDto[]> {
    this.logger.debug(`Fetching scenario effectiveness for org: ${orgSlug}`);

    const { data, error } = (await this.db
      .from('prediction', 'v_analytics_scenario_effectiveness')
      .select('*')
      .order('total_runs', { ascending: false })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(
        `Failed to fetch scenario effectiveness: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch scenario effectiveness: ${error.message}`,
      );
    }

    // Transform to DTO
    return ((data as ScenarioEffectivenessRow[] | null) ?? []).map((row) => ({
      scenario_type: row.scenario_type ?? 'unknown',
      total_scenarios: Number(row.total_scenarios ?? 0),
      total_runs: Number(row.total_runs ?? 0),
      successful_runs: Number(row.successful_runs ?? 0),
      success_rate_pct:
        row.success_rate_pct !== null ? Number(row.success_rate_pct) : null,
      learnings_generated: Number(row.learnings_generated ?? 0),
      avg_run_duration_minutes:
        row.avg_run_duration_minutes !== null
          ? Number(row.avg_run_duration_minutes)
          : null,
    }));
  }

  /**
   * Get promotion funnel analytics
   * Shows conversion rates through learning promotion stages
   *
   * @param orgSlug - Organization slug (for future org-scoped filtering)
   * @returns Array of promotion funnel records
   */
  async getPromotionFunnel(orgSlug: string): Promise<PromotionFunnelDto[]> {
    this.logger.debug(`Fetching promotion funnel for org: ${orgSlug}`);

    const { data, error } = (await this.db
      .from('prediction', 'v_analytics_promotion_funnel')
      .select('*')
      .order('stage', { ascending: true })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to fetch promotion funnel: ${error.message}`);
      throw new Error(`Failed to fetch promotion funnel: ${error.message}`);
    }

    // Transform to DTO
    return ((data as PromotionFunnelRow[] | null) ?? []).map((row) => ({
      stage: row.stage ?? 'unknown',
      count: Number(row.count ?? 0),
      pct_of_total: row.pct_of_total !== null ? Number(row.pct_of_total) : null,
    }));
  }

  /**
   * Get analytics summary
   * Aggregates key metrics from all analytics views
   *
   * @param orgSlug - Organization slug (for future org-scoped filtering)
   * @returns Analytics summary with key metrics
   */
  async getSummary(orgSlug: string): Promise<AnalyticsSummaryDto> {
    this.logger.debug(`Fetching analytics summary for org: ${orgSlug}`);

    // Fetch all analytics in parallel
    const [accuracy, velocity, effectiveness, funnel] = await Promise.all([
      this.getAccuracyComparison(orgSlug),
      this.getLearningVelocity(orgSlug),
      this.getScenarioEffectiveness(orgSlug),
      this.getPromotionFunnel(orgSlug),
    ]);

    // Extract latest accuracy metrics (most recent period)
    const latestTest = accuracy.find((a) => a.is_test) ?? null;
    const latestProduction = accuracy.find((a) => !a.is_test) ?? null;

    // Calculate learning velocity for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentVelocity = velocity.filter(
      (v) => new Date(v.period_date) >= sevenDaysAgo,
    );
    const velocitySummary = recentVelocity.reduce(
      (acc, v) => ({
        test_learnings_created:
          acc.test_learnings_created + v.test_learnings_created,
        production_learnings_created:
          acc.production_learnings_created + v.production_learnings_created,
        learnings_promoted: acc.learnings_promoted + v.learnings_promoted,
        avg_days_to_promotion:
          v.avg_days_to_promotion !== null
            ? (acc.avg_days_to_promotion ?? 0) + v.avg_days_to_promotion
            : acc.avg_days_to_promotion,
      }),
      {
        test_learnings_created: 0,
        production_learnings_created: 0,
        learnings_promoted: 0,
        avg_days_to_promotion: null as number | null,
      },
    );

    // Calculate average days to promotion
    const velocityWithDays = recentVelocity.filter(
      (v) => v.avg_days_to_promotion !== null,
    );
    if (
      velocityWithDays.length > 0 &&
      velocitySummary.avg_days_to_promotion !== null
    ) {
      velocitySummary.avg_days_to_promotion =
        velocitySummary.avg_days_to_promotion / velocityWithDays.length;
    }

    // Aggregate scenario effectiveness
    const effectivenessSummary = effectiveness.reduce(
      (acc, s) => ({
        total_scenarios: acc.total_scenarios + s.total_scenarios,
        total_runs: acc.total_runs + s.total_runs,
        successful_runs: acc.successful_runs + s.successful_runs,
        total_learnings_generated:
          acc.total_learnings_generated + s.learnings_generated,
      }),
      {
        total_scenarios: 0,
        total_runs: 0,
        successful_runs: 0,
        total_learnings_generated: 0,
      },
    );

    const overallSuccessRate =
      effectivenessSummary.total_runs > 0
        ? (effectivenessSummary.successful_runs /
            effectivenessSummary.total_runs) *
          100
        : null;

    // Extract promotion funnel stages
    const funnelMap = funnel.reduce(
      (acc, f) => {
        acc[f.stage] = f.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      accuracy: {
        test: {
          total_predictions: latestTest?.total_predictions ?? 0,
          accuracy_pct: latestTest?.accuracy_pct ?? null,
          avg_confidence: latestTest?.avg_confidence ?? null,
        },
        production: {
          total_predictions: latestProduction?.total_predictions ?? 0,
          accuracy_pct: latestProduction?.accuracy_pct ?? null,
          avg_confidence: latestProduction?.avg_confidence ?? null,
        },
      },
      learning_velocity: velocitySummary,
      scenario_effectiveness: {
        total_scenarios: effectivenessSummary.total_scenarios,
        total_runs: effectivenessSummary.total_runs,
        overall_success_rate_pct: overallSuccessRate,
        total_learnings_generated:
          effectivenessSummary.total_learnings_generated,
      },
      promotion_funnel: {
        test_created: funnelMap['test_created'] ?? 0,
        validated: funnelMap['validated'] ?? 0,
        backtested: funnelMap['backtested'] ?? 0,
        promoted: funnelMap['promoted'] ?? 0,
      },
    };
  }

  /**
   * Get accuracy by strategy analytics
   * Breakdown of prediction accuracy by strategy used
   *
   * Phase 4.8 - Accuracy by Strategy
   *
   * @param orgSlug - Organization slug (for future org-scoped filtering)
   * @param includeTest - Whether to include test predictions (default: false)
   * @returns Array of accuracy-by-strategy records
   */
  async getAccuracyByStrategy(
    orgSlug: string,
    includeTest = false,
  ): Promise<AccuracyByStrategyDto[]> {
    this.logger.debug(
      `Fetching accuracy by strategy for org: ${orgSlug}, includeTest: ${includeTest}`,
    );

    // Query predictions with strategy information
    // Since there's no dedicated view, we'll aggregate from predictions table
    const { data, error } = (await this.db
      .from('prediction', 'predictions')
      .select(
        `
        id,
        direction,
        magnitude,
        confidence,
        status,
        outcome_value,
        is_test,
        predicted_at,
        target_id,
        targets!inner (
          id,
          name,
          strategies (
            id,
            name
          )
        )
      `,
      )
      .eq('status', 'resolved')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(
        `Failed to fetch accuracy by strategy: ${error.message}`,
      );
      throw new Error(`Failed to fetch accuracy by strategy: ${error.message}`);
    }

    // Aggregate by strategy
    const strategyMap = new Map<
      string,
      {
        total: number;
        resolved: number;
        correct: number;
        confidenceSum: number;
        magnitudeSum: number;
        timingSum: number;
      }
    >();

    // Supabase returns joined tables as single objects when using !inner
    type PredictionRow = {
      id: string;
      direction: string;
      magnitude: string;
      confidence: number;
      status: string;
      outcome_value: number | null;
      is_test: boolean;
      targets: {
        id: string;
        name: string;
        strategies: Array<{ id: string; name: string }> | null;
      } | null;
    };

    for (const row of (data as PredictionRow[] | null) ?? []) {
      // Skip test data unless includeTest is true
      if (!includeTest && row.is_test) continue;

      const strategies = row.targets?.strategies ?? [];
      const strategyName =
        strategies.length > 0
          ? (strategies[0]?.name ?? 'Unknown')
          : 'No Strategy';

      const existing = strategyMap.get(strategyName) ?? {
        total: 0,
        resolved: 0,
        correct: 0,
        confidenceSum: 0,
        magnitudeSum: 0,
        timingSum: 0,
      };

      existing.total++;
      existing.resolved++;
      existing.confidenceSum += row.confidence ?? 0;

      // Determine if prediction was correct (simplified: direction matched outcome)
      if (row.outcome_value !== null) {
        const outcomeDirection = row.outcome_value > 0 ? 'up' : 'down';
        if (row.direction === outcomeDirection) {
          existing.correct++;
        }
      }

      strategyMap.set(strategyName, existing);
    }

    // Convert to DTOs
    const results: AccuracyByStrategyDto[] = [];
    for (const [strategyName, stats] of strategyMap) {
      results.push({
        strategy_name: strategyName,
        total_predictions: stats.total,
        resolved_predictions: stats.resolved,
        correct_predictions: stats.correct,
        accuracy_pct:
          stats.resolved > 0 ? (stats.correct / stats.resolved) * 100 : null,
        avg_confidence:
          stats.total > 0 ? stats.confidenceSum / stats.total : null,
        avg_magnitude_score: null, // Would need evaluation data
        avg_timing_score: null, // Would need evaluation data
      });
    }

    // Sort by total predictions descending
    results.sort((a, b) => b.total_predictions - a.total_predictions);

    return results;
  }

  /**
   * Get accuracy by target analytics
   * Breakdown of prediction accuracy by target
   *
   * Phase 4.9 - Accuracy by Target
   *
   * @param orgSlug - Organization slug (for future org-scoped filtering)
   * @param includeTest - Whether to include test targets (default: false)
   * @returns Array of accuracy-by-target records
   */
  async getAccuracyByTarget(
    orgSlug: string,
    includeTest = false,
  ): Promise<AccuracyByTargetDto[]> {
    this.logger.debug(
      `Fetching accuracy by target for org: ${orgSlug}, includeTest: ${includeTest}`,
    );

    // Query predictions grouped by target
    const { data, error } = (await this.db
      .from('prediction', 'predictions')
      .select(
        `
        id,
        direction,
        confidence,
        status,
        outcome_value,
        is_test,
        target_id,
        targets!inner (
          id,
          name,
          target_type,
          is_test
        )
      `,
      )
      .eq('status', 'resolved')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to fetch accuracy by target: ${error.message}`);
      throw new Error(`Failed to fetch accuracy by target: ${error.message}`);
    }

    // Aggregate by target
    const targetMap = new Map<
      string,
      {
        target_name: string;
        target_type: string;
        is_test: boolean;
        total: number;
        resolved: number;
        correct: number;
        confidenceSum: number;
      }
    >();

    // Supabase returns joined tables as single objects when using !inner
    type PredictionWithTarget = {
      id: string;
      direction: string;
      confidence: number;
      status: string;
      outcome_value: number | null;
      is_test: boolean;
      target_id: string;
      targets: {
        id: string;
        name: string;
        target_type: string;
        is_test: boolean;
      } | null;
    };

    for (const row of (data as PredictionWithTarget[] | null) ?? []) {
      // Skip test data unless includeTest is true
      if (!includeTest && (row.is_test || row.targets?.is_test)) continue;

      const targetId = row.target_id;
      const existing = targetMap.get(targetId) ?? {
        target_name: row.targets?.name ?? 'Unknown',
        target_type: row.targets?.target_type ?? 'unknown',
        is_test: row.targets?.is_test ?? false,
        total: 0,
        resolved: 0,
        correct: 0,
        confidenceSum: 0,
      };

      existing.total++;
      existing.resolved++;
      existing.confidenceSum += row.confidence ?? 0;

      // Determine if prediction was correct
      if (row.outcome_value !== null) {
        const outcomeDirection = row.outcome_value > 0 ? 'up' : 'down';
        if (row.direction === outcomeDirection) {
          existing.correct++;
        }
      }

      targetMap.set(targetId, existing);
    }

    // Convert to DTOs
    const results: AccuracyByTargetDto[] = [];
    for (const [targetId, stats] of targetMap) {
      results.push({
        target_id: targetId,
        target_name: stats.target_name,
        target_type: stats.target_type,
        total_predictions: stats.total,
        resolved_predictions: stats.resolved,
        correct_predictions: stats.correct,
        accuracy_pct:
          stats.resolved > 0 ? (stats.correct / stats.resolved) * 100 : null,
        avg_confidence:
          stats.total > 0 ? stats.confidenceSum / stats.total : null,
        is_test: stats.is_test,
      });
    }

    // Sort by total predictions descending
    results.sort((a, b) => b.total_predictions - a.total_predictions);

    return results;
  }

  /**
   * Get signal detection rate analytics
   * Track signals detected per source/target over time
   *
   * Phase 7.5 - Signal Detection Rate
   *
   * @param orgSlug - Organization slug (for future org-scoped filtering)
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @param groupBy - How to group results: 'day', 'week', 'month', 'source', 'target', 'direction', 'urgency'
   * @param universeId - Optional universe filter
   * @param targetId - Optional target filter
   * @param includeTest - Whether to include test signals (default: false)
   * @returns Array of signal detection rate records
   */
  async getSignalDetectionRate(
    orgSlug: string,
    startDate?: string,
    endDate?: string,
    groupBy:
      | 'day'
      | 'week'
      | 'month'
      | 'source'
      | 'target'
      | 'direction'
      | 'urgency' = 'day',
    universeId?: string,
    targetId?: string,
    includeTest = false,
  ): Promise<SignalDetectionRateDto[]> {
    this.logger.debug(
      `Fetching signal detection rate for org: ${orgSlug}, groupBy: ${groupBy}, dateRange: ${startDate ?? 'all'} to ${endDate ?? 'now'}`,
    );

    // Build the base query with joins
    let query = this.db.from('prediction', 'signals').select(
      `
        id,
        detected_at,
        direction,
        urgency,
        source_id,
        target_id,
        is_test,
        sources!inner (
          id,
          name,
          universe_id
        ),
        targets!inner (
          id,
          name
        )
      `,
    );

    // Apply filters
    if (!includeTest) {
      query = query.eq('is_test', false);
    }

    if (startDate) {
      query = query.gte('detected_at', startDate);
    }
    if (endDate) {
      query = query.lte('detected_at', endDate);
    }

    if (universeId) {
      query = query.eq('sources.universe_id', universeId);
    }

    if (targetId) {
      query = query.eq('target_id', targetId);
    }

    const { data: signalData, error: signalError } =
      (await query) as QueryResult<unknown>;

    if (signalError) {
      this.logger.error(
        `Failed to fetch signal detection rate: ${signalError.message}`,
      );
      throw new Error(
        `Failed to fetch signal detection rate: ${signalError.message}`,
      );
    }

    // Type for the joined data
    type SignalRow = {
      id: string;
      detected_at: string;
      direction: string;
      urgency: string | null;
      source_id: string;
      target_id: string;
      is_test: boolean;
      sources: {
        id: string;
        name: string;
        universe_id: string | null;
      } | null;
      targets: {
        id: string;
        name: string;
      } | null;
    };

    const signals = (signalData as SignalRow[] | null) ?? [];

    // If grouping includes source, fetch crawl data for signal-to-crawl ratio
    let crawlData: Map<string, { crawls: number; articles: number }> | null =
      null;
    if (
      (groupBy === 'source' ||
        groupBy === 'day' ||
        groupBy === 'week' ||
        groupBy === 'month') &&
      signals.length > 0
    ) {
      const sourceIds = Array.from(new Set(signals.map((s) => s.source_id)));

      let crawlQuery = this.db
        .from('prediction', 'source_crawls')
        .select('source_id, items_found, signals_created, started_at')
        .in('source_id', sourceIds)
        .eq('status', 'success');

      if (!includeTest) {
        crawlQuery = crawlQuery.eq('is_test_data', false);
      }

      if (startDate) {
        crawlQuery = crawlQuery.gte('started_at', startDate);
      }
      if (endDate) {
        crawlQuery = crawlQuery.lte('started_at', endDate);
      }

      const { data: crawls, error: crawlError } =
        (await crawlQuery) as QueryResult<unknown>;

      if (!crawlError && crawls) {
        crawlData = new Map();
        for (const crawl of crawls as Array<{
          source_id: string;
          items_found: number;
          signals_created: number;
          started_at: string;
        }>) {
          const key =
            groupBy === 'source'
              ? crawl.source_id
              : this.getTimePeriodKey(crawl.started_at, groupBy);

          const existing = crawlData.get(key) ?? { crawls: 0, articles: 0 };
          existing.crawls++;
          existing.articles += crawl.items_found ?? 0;
          crawlData.set(key, existing);
        }
      }
    }

    // Group signals based on groupBy parameter
    const groupMap = new Map<string, SignalDetectionRateDto>();

    for (const signal of signals) {
      let key: string;
      let dto: Partial<SignalDetectionRateDto>;

      switch (groupBy) {
        case 'source':
          key = signal.source_id;
          dto = {
            source_id: signal.source_id,
            source_name: signal.sources?.name ?? 'Unknown',
          };
          break;

        case 'target':
          key = signal.target_id;
          dto = {
            target_id: signal.target_id,
            target_name: signal.targets?.name ?? 'Unknown',
          };
          break;

        case 'direction':
          key = signal.direction;
          dto = {
            signal_direction: signal.direction,
          };
          break;

        case 'urgency':
          key = signal.urgency ?? 'none';
          dto = {
            signal_urgency: signal.urgency ?? 'none',
          };
          break;

        case 'day':
        case 'week':
        case 'month':
          key = this.getTimePeriodKey(signal.detected_at, groupBy);
          dto = {
            period_date: key,
          };
          break;

        default:
          key = this.getTimePeriodKey(signal.detected_at, 'day');
          dto = {
            period_date: key,
          };
      }

      const existing = groupMap.get(key) ?? {
        ...dto,
        total_signals: 0,
      };

      existing.total_signals++;
      groupMap.set(key, existing);
    }

    // Convert to array and add crawl/article metrics
    const results: SignalDetectionRateDto[] = [];
    for (const [key, stats] of groupMap) {
      if (crawlData) {
        const crawlStats = crawlData.get(key);
        if (crawlStats) {
          stats.total_crawls = crawlStats.crawls;
          stats.articles_crawled = crawlStats.articles;
          stats.signal_to_crawl_ratio =
            crawlStats.crawls > 0
              ? (stats.total_signals / crawlStats.crawls) * 100
              : null;
          stats.signal_to_article_ratio =
            crawlStats.articles > 0
              ? (stats.total_signals / crawlStats.articles) * 100
              : null;
        }
      }
      results.push(stats);
    }

    // Sort results appropriately
    if (groupBy === 'day' || groupBy === 'week' || groupBy === 'month') {
      results.sort((a, b) =>
        (b.period_date ?? '').localeCompare(a.period_date ?? ''),
      );
    } else {
      results.sort((a, b) => b.total_signals - a.total_signals);
    }

    return results;
  }

  /**
   * Helper method to get time period key for grouping
   */
  private getTimePeriodKey(
    dateStr: string,
    groupBy: 'day' | 'week' | 'month',
  ): string {
    const date = new Date(dateStr);

    switch (groupBy) {
      case 'day': {
        const isoStr = date.toISOString();
        return isoStr.split('T')[0] ?? isoStr.substring(0, 10); // YYYY-MM-DD
      }

      case 'week': {
        // Get ISO week number
        const target = new Date(date.valueOf());
        const dayNr = (date.getDay() + 6) % 7;
        target.setDate(target.getDate() - dayNr + 3);
        const firstThursday = target.valueOf();
        target.setMonth(0, 1);
        if (target.getDay() !== 4) {
          target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
        }
        const weekNumber =
          1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
        return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
      }

      case 'month':
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`; // YYYY-MM

      default: {
        const isoStr = date.toISOString();
        return isoStr.split('T')[0] ?? isoStr.substring(0, 10);
      }
    }
  }
}
