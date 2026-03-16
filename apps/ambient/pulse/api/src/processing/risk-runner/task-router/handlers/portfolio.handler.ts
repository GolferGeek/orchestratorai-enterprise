/**
 * Portfolio Handler
 *
 * Phase 5: Dashboard handler for portfolio-level risk aggregation
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
} from '../dashboard-handler.interface';
import { PortfolioRiskService } from '../../services/portfolio-risk.service';

@Injectable()
export class PortfolioHandler implements IDashboardHandler {
  private readonly logger = new Logger(PortfolioHandler.name);
  private readonly supportedActions = [
    'summary',
    'contributions',
    'heatmap',
    'trend',
  ];

  constructor(private readonly portfolioService: PortfolioRiskService) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing portfolio action: ${action}`);

    switch (action.toLowerCase()) {
      case 'summary':
        return this.handleSummary(payload);
      case 'contributions':
        return this.handleContributions(payload);
      case 'heatmap':
        return this.handleHeatmap(payload);
      case 'trend':
        return this.handleTrend(payload);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported portfolio action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  /**
   * Get comprehensive portfolio risk summary
   * Action: portfolio.summary
   * Params: { scopeId: string, includeInactive?: boolean, maxAlerts?: number }
   */
  private async handleSummary(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for portfolio summary',
      );
    }

    try {
      const summary = await this.portfolioService.getPortfolioSummary(scopeId, {
        includeInactiveSubjects: params?.includeInactive as boolean | undefined,
        maxAlerts: params?.maxAlerts as number | undefined,
      });

      return buildDashboardSuccess(summary, {
        assessmentCoverage:
          summary.total_subjects > 0
            ? Math.round(
                (summary.assessed_subjects / summary.total_subjects) * 100,
              )
            : 0,
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate portfolio summary: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SUMMARY_GENERATION_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to generate portfolio summary',
      );
    }
  }

  /**
   * Get subject contributions to portfolio risk
   * Action: portfolio.contributions
   * Params: { scopeId: string }
   */
  private async handleContributions(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for contribution analysis',
      );
    }

    try {
      const contributions =
        await this.portfolioService.getSubjectContributions(scopeId);

      return buildDashboardSuccess(contributions, {
        totalSubjects: contributions.length,
        highRiskSubjects: contributions.filter((c) => c.is_high_risk).length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get contributions: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CONTRIBUTIONS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get subject contributions',
      );
    }
  }

  /**
   * Get portfolio heatmap data
   * Action: portfolio.heatmap
   * Params: { scopeId: string }
   */
  private async handleHeatmap(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for heatmap',
      );
    }

    try {
      const heatmap = await this.portfolioService.getPortfolioHeatmap(scopeId);

      return buildDashboardSuccess(heatmap, {
        subjectCount: heatmap.subjects.length,
        dimensionCount: heatmap.dimensions.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate heatmap: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'HEATMAP_FAILED',
        error instanceof Error ? error.message : 'Failed to generate heatmap',
      );
    }
  }

  /**
   * Get portfolio trend over time
   * Action: portfolio.trend
   * Params: { scopeId: string, period?: 'day' | 'week' | 'month' }
   */
  private async handleTrend(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const period = params?.period as 'day' | 'week' | 'month' | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for trend analysis',
      );
    }

    try {
      const trend = await this.portfolioService.getPortfolioTrend(
        scopeId,
        period ?? 'week',
      );

      return buildDashboardSuccess(trend, {
        trendDirection: trend.trend_direction,
        dataPoints: trend.data_points.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate trend: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'TREND_FAILED',
        error instanceof Error ? error.message : 'Failed to generate trend',
      );
    }
  }
}
