/**
 * Strategy Dashboard Handler
 *
 * Handles dashboard mode requests for prediction strategies.
 * Strategies define threshold configurations and analyst weight adjustments.
 * System strategies are read-only.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { StrategyService } from '../../services/strategy.service';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';

interface StrategyFilters {
  isSystem?: boolean;
  riskLevel?: string;
  isActive?: boolean;
}

interface StrategyParams {
  id?: string;
  slug?: string;
  universeId?: string;
  filters?: StrategyFilters;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class StrategyHandler implements IDashboardHandler {
  private readonly logger = new Logger(StrategyHandler.name);
  // Read-only for system strategies
  private readonly supportedActions = ['list', 'get', 'recommend'];

  constructor(private readonly strategyService: StrategyService) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[STRATEGY-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as StrategyParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'recommend':
        return this.handleRecommend(params);
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

  private async handleList(
    params?: StrategyParams,
  ): Promise<DashboardActionResult> {
    try {
      let strategies;

      if (params?.filters?.isSystem === true) {
        strategies = await this.strategyService.findSystemStrategies();
      } else {
        strategies = await this.strategyService.findAll();
      }

      // Apply additional filters
      let filtered = strategies;

      if (params?.filters?.riskLevel) {
        filtered = filtered.filter(
          (s) => s.risk_level === params.filters!.riskLevel,
        );
      }

      if (params?.filters?.isActive !== undefined) {
        filtered = filtered.filter(
          (s) => s.is_active === params.filters!.isActive,
        );
      }

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedStrategies = filtered.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedStrategies,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list strategies: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list strategies',
      );
    }
  }

  private async handleGet(
    params?: StrategyParams,
  ): Promise<DashboardActionResult> {
    try {
      let strategy;

      if (params?.id) {
        strategy = await this.strategyService.findById(params.id);
      } else if (params?.slug) {
        strategy = await this.strategyService.findBySlug(params.slug);
      } else {
        return buildDashboardError(
          'MISSING_ID',
          'Strategy ID or slug is required',
        );
      }

      if (!strategy) {
        return buildDashboardError(
          'NOT_FOUND',
          `Strategy not found: ${params.id || params.slug}`,
        );
      }

      return buildDashboardSuccess(strategy);
    } catch (error) {
      this.logger.error(
        `Failed to get strategy: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get strategy',
      );
    }
  }

  /**
   * Get strategy recommendation for a universe
   * Based on domain and historical performance
   */
  private async handleRecommend(
    params?: StrategyParams,
  ): Promise<DashboardActionResult> {
    if (!params?.universeId) {
      return buildDashboardError(
        'MISSING_UNIVERSE_ID',
        'Universe ID is required for strategy recommendation',
      );
    }

    try {
      const recommendation = await this.strategyService.recommendStrategy(
        params.universeId,
      );

      return buildDashboardSuccess({
        universeId: params.universeId,
        recommended: recommendation.recommended,
        reasoning: recommendation.reasoning,
        alternatives: recommendation.alternatives,
      });
    } catch (error) {
      this.logger.error(
        `Failed to recommend strategy: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'RECOMMEND_FAILED',
        error instanceof Error ? error.message : 'Failed to recommend strategy',
      );
    }
  }
}
