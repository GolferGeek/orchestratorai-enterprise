/**
 * Analytics DTOs and Interfaces
 * Data transfer objects for Phase 6.2 Analytics API Endpoints
 */

import { IsISO8601, IsOptional } from 'class-validator';

/**
 * DTO for date range filtering (REQUEST)
 */
export class AnalyticsDateRangeDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

/**
 * Interface for accuracy comparison analytics (RESPONSE)
 * Maps to prediction.v_analytics_accuracy_comparison view
 */
export interface AccuracyComparisonDto {
  period_date: string;
  is_test: boolean;
  total_predictions: number;
  resolved_predictions: number;
  correct_predictions: number;
  accuracy_pct: number | null;
  avg_confidence: number | null;
  avg_overall_score: number | null;
}

/**
 * Interface for learning velocity analytics (RESPONSE)
 * Maps to prediction.v_analytics_learning_velocity view
 */
export interface LearningVelocityDto {
  period_date: string;
  test_learnings_created: number;
  production_learnings_created: number;
  learnings_promoted: number;
  avg_days_to_promotion: number | null;
}

/**
 * Interface for scenario effectiveness analytics (RESPONSE)
 * Maps to prediction.v_analytics_scenario_effectiveness view
 */
export interface ScenarioEffectivenessDto {
  scenario_type: string;
  total_scenarios: number;
  total_runs: number;
  successful_runs: number;
  success_rate_pct: number | null;
  learnings_generated: number;
  avg_run_duration_minutes: number | null;
}

/**
 * Interface for promotion funnel analytics (RESPONSE)
 * Maps to prediction.v_analytics_promotion_funnel view
 */
export interface PromotionFunnelDto {
  stage: string;
  count: number;
  pct_of_total: number | null;
}

/**
 * Interface for accuracy by strategy analytics (RESPONSE)
 * Phase 4.8 - Breakdown of prediction accuracy by strategy used
 */
export interface AccuracyByStrategyDto {
  strategy_name: string;
  total_predictions: number;
  resolved_predictions: number;
  correct_predictions: number;
  accuracy_pct: number | null;
  avg_confidence: number | null;
  avg_magnitude_score: number | null;
  avg_timing_score: number | null;
}

/**
 * Interface for accuracy by target analytics (RESPONSE)
 * Phase 4.9 - Breakdown of prediction accuracy by target
 */
export interface AccuracyByTargetDto {
  target_id: string;
  target_name: string;
  target_type: string;
  total_predictions: number;
  resolved_predictions: number;
  correct_predictions: number;
  accuracy_pct: number | null;
  avg_confidence: number | null;
  is_test: boolean;
}

/**
 * Interface for signal detection rate analytics (RESPONSE)
 * Phase 7.5 - Track signal generation metrics per source/target over time
 */
export interface SignalDetectionRateDto {
  period_date?: string; // Present when grouped by time
  source_id?: string; // Present when grouped by source
  source_name?: string; // Present when grouped by source
  target_id?: string; // Present when grouped by target
  target_name?: string; // Present when grouped by target
  signal_direction?: string; // Present when grouped by direction (bullish/bearish/neutral)
  signal_urgency?: string; // Present when grouped by urgency (urgent/notable/routine)
  total_signals: number;
  total_crawls?: number; // Total crawls in the period (when grouping includes source)
  signal_to_crawl_ratio?: number | null; // Signals per crawl (%)
  articles_crawled?: number; // Total articles found in crawls
  signal_to_article_ratio?: number | null; // % of articles that generated signals
}

/**
 * Interface for analytics summary (RESPONSE)
 * Combines key metrics from all analytics views
 */
export interface AnalyticsSummaryDto {
  // Accuracy comparison (latest period)
  accuracy: {
    test: {
      total_predictions: number;
      accuracy_pct: number | null;
      avg_confidence: number | null;
    };
    production: {
      total_predictions: number;
      accuracy_pct: number | null;
      avg_confidence: number | null;
    };
  };

  // Learning velocity (last 7 days)
  learning_velocity: {
    test_learnings_created: number;
    production_learnings_created: number;
    learnings_promoted: number;
    avg_days_to_promotion: number | null;
  };

  // Scenario effectiveness (overall)
  scenario_effectiveness: {
    total_scenarios: number;
    total_runs: number;
    overall_success_rate_pct: number | null;
    total_learnings_generated: number;
  };

  // Promotion funnel (overall)
  promotion_funnel: {
    test_created: number;
    validated: number;
    backtested: number;
    promoted: number;
  };
}
