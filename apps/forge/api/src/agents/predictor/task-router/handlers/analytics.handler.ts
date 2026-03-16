/**
 * Analytics Handler
 *
 * Handles dashboard mode requests for analytics data.
 * Provides access to Phase 6.1 Analytics Views via Phase 6.2 Analytics API Endpoints.
 *
 * Phase 6.2 - Analytics API Endpoints
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { AnalyticsService } from '../../services/analytics.service';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
} from '../dashboard-handler.interface';

interface AnalyticsParams {
  startDate?: string;
  endDate?: string;
  includeTest?: boolean;
}

@Injectable()
export class AnalyticsHandler implements IDashboardHandler {
  private readonly logger = new Logger(AnalyticsHandler.name);
  private readonly supportedActions = [
    'accuracy-comparison',
    'accuracy-by-strategy',
    'accuracy-by-target',
    'learning-velocity',
    'scenario-effectiveness',
    'promotion-funnel',
    'summary',
  ];

  constructor(private readonly analyticsService: AnalyticsService) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[ANALYTICS-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as AnalyticsParams | undefined;

    switch (action.toLowerCase()) {
      case 'accuracy-comparison':
        return this.handleAccuracyComparison(params, context);
      case 'accuracy-by-strategy':
        return this.handleAccuracyByStrategy(params, context);
      case 'accuracy-by-target':
        return this.handleAccuracyByTarget(params, context);
      case 'learning-velocity':
        return this.handleLearningVelocity(params, context);
      case 'scenario-effectiveness':
        return this.handleScenarioEffectiveness(context);
      case 'promotion-funnel':
        return this.handlePromotionFunnel(context);
      case 'summary':
        return this.handleSummary(context);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  /**
   * Get accuracy comparison analytics
   * Compares test vs production prediction accuracy over time
   */
  private async handleAccuracyComparison(
    params?: AnalyticsParams,
    context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!context?.orgSlug) {
      return buildDashboardError(
        'MISSING_ORG_SLUG',
        'Organization slug is required',
      );
    }

    try {
      const data = await this.analyticsService.getAccuracyComparison(
        context.orgSlug,
        params?.startDate,
        params?.endDate,
      );

      return buildDashboardSuccess(data, {
        totalCount: data.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get accuracy comparison: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ACCURACY_COMPARISON_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get accuracy comparison',
      );
    }
  }

  /**
   * Get learning velocity analytics
   * Tracks test learning creation, promotion, and time to promotion
   */
  private async handleLearningVelocity(
    params?: AnalyticsParams,
    context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!context?.orgSlug) {
      return buildDashboardError(
        'MISSING_ORG_SLUG',
        'Organization slug is required',
      );
    }

    try {
      const data = await this.analyticsService.getLearningVelocity(
        context.orgSlug,
        params?.startDate,
        params?.endDate,
      );

      return buildDashboardSuccess(data, {
        totalCount: data.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get learning velocity: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LEARNING_VELOCITY_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get learning velocity',
      );
    }
  }

  /**
   * Get scenario effectiveness analytics
   * Analyzes test scenario success rates and learning generation
   */
  private async handleScenarioEffectiveness(
    context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!context?.orgSlug) {
      return buildDashboardError(
        'MISSING_ORG_SLUG',
        'Organization slug is required',
      );
    }

    try {
      const data = await this.analyticsService.getScenarioEffectiveness(
        context.orgSlug,
      );

      return buildDashboardSuccess(data, {
        totalCount: data.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get scenario effectiveness: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SCENARIO_EFFECTIVENESS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get scenario effectiveness',
      );
    }
  }

  /**
   * Get promotion funnel analytics
   * Shows conversion rates through learning promotion stages
   */
  private async handlePromotionFunnel(
    context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!context?.orgSlug) {
      return buildDashboardError(
        'MISSING_ORG_SLUG',
        'Organization slug is required',
      );
    }

    try {
      const data = await this.analyticsService.getPromotionFunnel(
        context.orgSlug,
      );

      return buildDashboardSuccess(data, {
        totalCount: data.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get promotion funnel: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'PROMOTION_FUNNEL_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get promotion funnel',
      );
    }
  }

  /**
   * Get analytics summary
   * Aggregates key metrics from all analytics views
   */
  private async handleSummary(
    context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!context?.orgSlug) {
      return buildDashboardError(
        'MISSING_ORG_SLUG',
        'Organization slug is required',
      );
    }

    try {
      const data = await this.analyticsService.getSummary(context.orgSlug);

      return buildDashboardSuccess(data);
    } catch (error) {
      this.logger.error(
        `Failed to get analytics summary: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ANALYTICS_SUMMARY_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get analytics summary',
      );
    }
  }

  /**
   * Get accuracy by strategy analytics
   * Breakdown of prediction accuracy by strategy used
   *
   * Phase 4.8 - Accuracy by Strategy
   */
  private async handleAccuracyByStrategy(
    params?: AnalyticsParams,
    context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!context?.orgSlug) {
      return buildDashboardError(
        'MISSING_ORG_SLUG',
        'Organization slug is required',
      );
    }

    try {
      const data = await this.analyticsService.getAccuracyByStrategy(
        context.orgSlug,
        params?.includeTest ?? false,
      );

      return buildDashboardSuccess(data, {
        totalCount: data.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get accuracy by strategy: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ACCURACY_BY_STRATEGY_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get accuracy by strategy',
      );
    }
  }

  /**
   * Get accuracy by target analytics
   * Breakdown of prediction accuracy by target
   *
   * Phase 4.9 - Accuracy by Target
   */
  private async handleAccuracyByTarget(
    params?: AnalyticsParams,
    context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!context?.orgSlug) {
      return buildDashboardError(
        'MISSING_ORG_SLUG',
        'Organization slug is required',
      );
    }

    try {
      const data = await this.analyticsService.getAccuracyByTarget(
        context.orgSlug,
        params?.includeTest ?? false,
      );

      return buildDashboardSuccess(data, {
        totalCount: data.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get accuracy by target: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ACCURACY_BY_TARGET_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get accuracy by target',
      );
    }
  }
}
