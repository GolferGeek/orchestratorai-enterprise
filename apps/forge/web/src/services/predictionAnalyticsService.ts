/**
 * Prediction Analytics Service
 *
 * Handles analytics dashboard data for the Test-Based Learning Loop.
 * Uses predictionDashboardService with analytics dashboard actions.
 *
 * IMPORTANT: This service uses A2A dashboard mode, NOT REST endpoints.
 * All data access is through POST /agent-to-agent/:orgSlug/prediction-runner/tasks
 */

import { predictionDashboardService } from './predictionDashboardService';
import type { DashboardResponsePayload } from '@orchestrator-ai/transport-types';

// ============================================================================
// TYPES (from analytics.dto.ts)
// ============================================================================

export interface AccuracyComparison {
  period_date: string;
  is_test: boolean;
  total_predictions: number;
  resolved_predictions: number;
  correct_predictions: number;
  accuracy_pct: number | null;
  avg_confidence: number | null;
  avg_overall_score: number | null;
}

export interface LearningVelocity {
  period_date: string;
  test_learnings_created: number;
  production_learnings_created: number;
  learnings_promoted: number;
  avg_days_to_promotion: number | null;
}

export interface ScenarioEffectiveness {
  scenario_type: string;
  total_scenarios: number;
  total_runs: number;
  successful_runs: number;
  success_rate_pct: number | null;
  learnings_generated: number;
  avg_run_duration_minutes: number | null;
}

export interface PromotionFunnel {
  stage: string;
  count: number;
  pct_of_total: number | null;
}

export interface AnalyticsSummary {
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
  learning_velocity: {
    test_learnings_created: number;
    production_learnings_created: number;
    learnings_promoted: number;
    avg_days_to_promotion: number | null;
  };
  scenario_effectiveness: {
    total_scenarios: number;
    total_runs: number;
    overall_success_rate_pct: number | null;
    total_learnings_generated: number;
  };
  promotion_funnel: {
    test_created: number;
    validated: number;
    backtested: number;
    promoted: number;
  };
}

// ============================================================================
// SERVICE
// ============================================================================

class PredictionAnalyticsService {
  /**
   * Get accuracy comparison analytics
   * Compares test vs production prediction accuracy over time
   */
  async getAccuracyComparison(
    dateRange?: { startDate?: string; endDate?: string }
  ): Promise<DashboardResponsePayload<AccuracyComparison[]>> {
    const result = await predictionDashboardService['executeDashboardRequest']<
      AccuracyComparison[]
    >('analytics.accuracy-comparison', dateRange);
    return result as DashboardResponsePayload<AccuracyComparison[]>;
  }

  /**
   * Get learning velocity analytics
   * Tracks test learning creation, promotion, and time to promotion
   */
  async getLearningVelocity(
    dateRange?: { startDate?: string; endDate?: string }
  ): Promise<DashboardResponsePayload<LearningVelocity[]>> {
    const result = await predictionDashboardService['executeDashboardRequest']<
      LearningVelocity[]
    >('analytics.learning-velocity', dateRange);
    return result as DashboardResponsePayload<LearningVelocity[]>;
  }

  /**
   * Get scenario effectiveness analytics
   * Analyzes test scenario success rates and learning generation
   */
  async getScenarioEffectiveness(): Promise<
    DashboardResponsePayload<ScenarioEffectiveness[]>
  > {
    const result = await predictionDashboardService['executeDashboardRequest']<
      ScenarioEffectiveness[]
    >('analytics.scenario-effectiveness');
    return result as DashboardResponsePayload<ScenarioEffectiveness[]>;
  }

  /**
   * Get promotion funnel analytics
   * Shows conversion rates through learning promotion stages
   */
  async getPromotionFunnel(): Promise<
    DashboardResponsePayload<PromotionFunnel[]>
  > {
    const result = await predictionDashboardService['executeDashboardRequest']<
      PromotionFunnel[]
    >('analytics.promotion-funnel');
    return result as DashboardResponsePayload<PromotionFunnel[]>;
  }

  /**
   * Get analytics summary
   * Aggregates key metrics from all analytics views
   */
  async getSummary(): Promise<DashboardResponsePayload<AnalyticsSummary>> {
    const result = await predictionDashboardService['executeDashboardRequest']<
      AnalyticsSummary
    >('analytics.summary');
    return result as DashboardResponsePayload<AnalyticsSummary>;
  }
}

export const predictionAnalyticsService = new PredictionAnalyticsService();
