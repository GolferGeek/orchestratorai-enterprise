/**
 * Analyst Dashboard Handler
 *
 * Handles dashboard mode requests for prediction analysts.
 * Analysts are AI personas that evaluate signals/predictors from different perspectives.
 * Supports fork comparison (user vs ai) and adoption workflows.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { AnalystService } from '../../services/analyst.service';
import { PortfolioRepository } from '../../repositories/portfolio.repository';
import type {
  ForkType,
  AnalystContextVersion,
  AnalystPortfolio,
} from '../../interfaces/portfolio.interface';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import { CreateAnalystDto, UpdateAnalystDto } from '../../dto/analyst.dto';

interface AnalystFilters {
  scopeLevel?: string;
  domain?: string;
  universeId?: string;
  targetId?: string;
  isActive?: boolean;
}

interface AnalystParams {
  id?: string;
  slug?: string;
  filters?: AnalystFilters;
  page?: number;
  pageSize?: number;
  forkType?: ForkType;
}

@Injectable()
export class AnalystHandler implements IDashboardHandler {
  private readonly logger = new Logger(AnalystHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'update',
    'delete',
    // Fork comparison actions
    'compareForks',
    'forksSummary',
    'getForkHistory',
    'adoptChange',
    'rollback',
    // Position actions
    'positions',
  ];

  constructor(
    private readonly analystService: AnalystService,
    private readonly portfolioRepository: PortfolioRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[ANALYST-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as AnalystParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'create':
        return this.handleCreate(payload);
      case 'update':
        return this.handleUpdate(params, payload);
      case 'delete':
        return this.handleDelete(params);
      // Fork comparison actions
      case 'compareforks':
        return this.handleCompareForks(params);
      case 'forkssummary':
        return this.handleForksSummary(params);
      case 'getforkhistory':
        return this.handleGetForkHistory(params);
      case 'adoptchange':
        return this.handleAdoptChange(params, payload);
      case 'rollback':
        return this.handleRollback(params, payload);
      // Position actions
      case 'positions':
        return this.handlePositions(params);
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
    params?: AnalystParams,
  ): Promise<DashboardActionResult> {
    try {
      let analysts;

      // Fetch based on scope
      if (params?.filters?.domain) {
        analysts = await this.analystService.findByDomain(
          params.filters.domain,
        );
      } else if (params?.filters?.scopeLevel === 'runner') {
        analysts = await this.analystService.findRunnerLevel();
      } else if (params?.slug) {
        analysts = await this.analystService.findBySlug(
          params.slug,
          params.filters?.scopeLevel,
          params.filters?.domain,
        );
      } else {
        // Default: get all enabled analysts
        analysts = await this.analystService.findAll();
      }

      // Apply additional filters
      let filtered = analysts;

      if (params?.filters?.isActive !== undefined) {
        filtered = filtered.filter(
          (a) => a.is_enabled === params.filters!.isActive,
        );
      }

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedAnalysts = filtered.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedAnalysts,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list analysts: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list analysts',
      );
    }
  }

  private async handleGet(
    params?: AnalystParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Analyst ID is required');
    }

    try {
      const analyst = await this.analystService.findById(params.id);
      if (!analyst) {
        return buildDashboardError(
          'NOT_FOUND',
          `Analyst not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(analyst);
    } catch (error) {
      this.logger.error(
        `Failed to get analyst: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get analyst',
      );
    }
  }

  private async handleCreate(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = payload.params as Partial<CreateAnalystDto>;

    if (!data.slug || !data.name || !data.scope_level || !data.perspective) {
      return buildDashboardError(
        'INVALID_DATA',
        'slug, name, scope_level, and perspective are required',
      );
    }

    try {
      const createDto: CreateAnalystDto = {
        slug: data.slug,
        name: data.name,
        scope_level: data.scope_level,
        perspective: data.perspective,
        domain: data.domain,
        universe_id: data.universe_id,
        target_id: data.target_id,
        agent_id: data.agent_id,
        default_weight: data.default_weight ?? 1.0,
        tier_instructions: data.tier_instructions,
        learned_patterns: data.learned_patterns,
        is_enabled: data.is_enabled ?? true,
      };

      const analyst = await this.analystService.create(createDto);
      return buildDashboardSuccess(analyst);
    } catch (error) {
      this.logger.error(
        `Failed to create analyst: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error ? error.message : 'Failed to create analyst',
      );
    }
  }

  private async handleUpdate(
    params: AnalystParams | undefined,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Analyst ID is required');
    }

    const data = payload.params as Partial<UpdateAnalystDto>;

    try {
      const updateDto: UpdateAnalystDto = {};

      if (data.name !== undefined) updateDto.name = data.name;
      if (data.perspective !== undefined)
        updateDto.perspective = data.perspective;
      if (data.default_weight !== undefined)
        updateDto.default_weight = data.default_weight;
      if (data.tier_instructions !== undefined)
        updateDto.tier_instructions = data.tier_instructions;
      if (data.learned_patterns !== undefined)
        updateDto.learned_patterns = data.learned_patterns;
      if (data.agent_id !== undefined) updateDto.agent_id = data.agent_id;
      if (data.is_enabled !== undefined) updateDto.is_enabled = data.is_enabled;

      const analyst = await this.analystService.update(params.id, updateDto);
      return buildDashboardSuccess(analyst);
    } catch (error) {
      this.logger.error(
        `Failed to update analyst: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UPDATE_FAILED',
        error instanceof Error ? error.message : 'Failed to update analyst',
      );
    }
  }

  private async handleDelete(
    params?: AnalystParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Analyst ID is required');
    }

    try {
      await this.analystService.delete(params.id);
      return buildDashboardSuccess({ deleted: true, id: params.id });
    } catch (error) {
      this.logger.error(
        `Failed to delete analyst: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error ? error.message : 'Failed to delete analyst',
      );
    }
  }

  // =============================================================================
  // FORK COMPARISON ACTIONS
  // =============================================================================

  /**
   * Compare user fork vs ai fork for a specific analyst
   * Returns portfolio performance, context differences, and adoption suggestions
   */
  private async handleCompareForks(
    params?: AnalystParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Analyst ID is required');
    }

    try {
      const analyst = await this.analystService.findById(params.id);
      if (!analyst) {
        return buildDashboardError(
          'NOT_FOUND',
          `Analyst not found: ${params.id}`,
        );
      }

      // Get both portfolios
      const userPortfolio = await this.portfolioRepository.getAnalystPortfolio(
        params.id,
        'user',
      );
      const aiPortfolio = await this.portfolioRepository.getAnalystPortfolio(
        params.id,
        'ai',
      );

      // Get current context versions for both forks
      const userContext =
        await this.portfolioRepository.getCurrentAnalystContextVersion(
          params.id,
          'user',
        );
      const aiContext =
        await this.portfolioRepository.getCurrentAnalystContextVersion(
          params.id,
          'ai',
        );

      // Calculate context differences
      const contextDiff = this.calculateContextDiff(userContext, aiContext);

      // Build comparison result
      const comparison = {
        analyst: {
          id: analyst.id,
          slug: analyst.slug,
          name: analyst.name,
          perspective: analyst.perspective,
        },
        userFork: {
          portfolio: userPortfolio,
          currentContext: userContext,
          pnl: userPortfolio
            ? userPortfolio.total_realized_pnl +
              userPortfolio.total_unrealized_pnl
            : 0,
          winRate: this.calculateWinRate(userPortfolio),
        },
        aiFork: {
          portfolio: aiPortfolio,
          currentContext: aiContext,
          pnl: aiPortfolio
            ? aiPortfolio.total_realized_pnl + aiPortfolio.total_unrealized_pnl
            : 0,
          winRate: this.calculateWinRate(aiPortfolio),
          status: aiPortfolio?.status ?? 'active',
        },
        comparison: {
          pnlDiff: this.calculatePnlDiff(userPortfolio, aiPortfolio),
          contextDiff,
          aiOutperforming:
            (aiPortfolio?.total_realized_pnl ?? 0) +
              (aiPortfolio?.total_unrealized_pnl ?? 0) >
            (userPortfolio?.total_realized_pnl ?? 0) +
              (userPortfolio?.total_unrealized_pnl ?? 0),
        },
      };

      return buildDashboardSuccess(comparison);
    } catch (error) {
      this.logger.error(
        `Failed to compare forks: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'COMPARE_FAILED',
        error instanceof Error ? error.message : 'Failed to compare forks',
      );
    }
  }

  /**
   * Get summary of all analysts with fork comparisons
   * Uses the v_analyst_fork_comparison view for efficient retrieval
   */
  private async handleForksSummary(
    params?: AnalystParams,
  ): Promise<DashboardActionResult> {
    try {
      const comparisons =
        await this.portfolioRepository.getAnalystForkComparisons();

      // Transform view data into frontend-friendly format
      const transformed = comparisons.map((c) => {
        const userPnl =
          (c.user_realized_pnl ?? 0) + (c.user_unrealized_pnl ?? 0);
        const agentPnl =
          (c.agent_realized_pnl ?? 0) + (c.agent_unrealized_pnl ?? 0);
        const arbitratorPnl =
          (c.arbitrator_realized_pnl ?? 0) + (c.arbitrator_unrealized_pnl ?? 0);
        const pnlDiff = agentPnl - userPnl;

        let status: string;
        if (c.agent_status === 'warning' || c.agent_status === 'probation') {
          status = 'warning';
        } else if (pnlDiff > 0) {
          status = 'agent_winning';
        } else if (pnlDiff < 0) {
          status = 'user_winning';
        } else {
          status = 'tied';
        }

        return {
          analyst_id: c.analyst_id,
          slug: c.slug,
          name: c.name,
          perspective: c.perspective,
          user_pnl: userPnl,
          user_win_count: c.user_wins ?? 0,
          user_loss_count: c.user_losses ?? 0,
          agent_pnl: agentPnl,
          agent_win_count: c.agent_wins ?? 0,
          agent_loss_count: c.agent_losses ?? 0,
          arbitrator_pnl: arbitratorPnl,
          arbitrator_win_count: c.arbitrator_wins ?? 0,
          arbitrator_loss_count: c.arbitrator_losses ?? 0,
          pnl_difference: pnlDiff,
          comparison_status: status,
        };
      });

      // Apply pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedComparisons = transformed.slice(
        startIndex,
        startIndex + pageSize,
      );

      // Calculate summary stats
      const summary = {
        totalAnalysts: transformed.length,
        agentOutperforming: transformed.filter(
          (c) => c.comparison_status === 'agent_winning',
        ).length,
        userOutperforming: transformed.filter(
          (c) => c.comparison_status === 'user_winning',
        ).length,
        totalAiPnl: transformed.reduce((sum, c) => sum + c.agent_pnl, 0),
        totalUserPnl: transformed.reduce((sum, c) => sum + c.user_pnl, 0),
        statusBreakdown: {
          active: comparisons.filter((c) => c.agent_status === 'active').length,
          warning: comparisons.filter((c) => c.agent_status === 'warning')
            .length,
          probation: comparisons.filter((c) => c.agent_status === 'probation')
            .length,
          suspended: comparisons.filter((c) => c.agent_status === 'suspended')
            .length,
        },
      };

      return buildDashboardSuccess(
        {
          comparisons: paginatedComparisons,
          summary,
        },
        buildPaginationMetadata(transformed.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to get forks summary: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SUMMARY_FAILED',
        error instanceof Error ? error.message : 'Failed to get forks summary',
      );
    }
  }

  /**
   * Get context version history for a specific fork
   */
  private async handleGetForkHistory(
    params?: AnalystParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Analyst ID is required');
    }

    const forkType: ForkType = params.forkType ?? 'user';

    try {
      const history =
        await this.portfolioRepository.getAnalystContextVersionHistory(
          params.id,
          forkType,
        );

      // Get analyst info
      const analyst = await this.analystService.findById(params.id);

      return buildDashboardSuccess({
        analyst: analyst
          ? {
              id: analyst.id,
              slug: analyst.slug,
              name: analyst.name,
            }
          : null,
        forkType,
        versionCount: history.length,
        versions: history,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get fork history: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'HISTORY_FAILED',
        error instanceof Error ? error.message : 'Failed to get fork history',
      );
    }
  }

  /**
   * Adopt a specific change from ai fork to user fork
   * Creates a new user context version with the adopted changes
   */
  private async handleAdoptChange(
    params: AnalystParams | undefined,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Analyst ID is required');
    }

    const adoptionData = payload.params as {
      id?: string;
      changes?: {
        perspective?: string;
        tierInstructions?: Record<string, string | undefined>;
        defaultWeight?: number;
      };
      reason?: string;
    };

    if (!adoptionData.changes) {
      return buildDashboardError(
        'MISSING_CHANGES',
        'Changes to adopt are required',
      );
    }

    try {
      // Get current user context
      const userContext =
        await this.portfolioRepository.getCurrentAnalystContextVersion(
          params.id,
          'user',
        );

      if (!userContext) {
        return buildDashboardError(
          'NO_USER_CONTEXT',
          'User fork has no context version to update',
        );
      }

      // Create new user context version with adopted changes
      const newVersion =
        await this.portfolioRepository.createAnalystContextVersion({
          analyst_id: params.id,
          fork_type: 'user',
          perspective:
            adoptionData.changes.perspective ?? userContext.perspective,
          tier_instructions:
            adoptionData.changes.tierInstructions ??
            userContext.tier_instructions,
          default_weight:
            adoptionData.changes.defaultWeight ?? userContext.default_weight,
          change_reason: adoptionData.reason ?? 'Adopted changes from ai fork',
          changed_by: 'user',
        });

      this.logger.log(
        `User adopted changes from ai fork for analyst ${params.id}, created version ${newVersion.version_number}`,
      );

      return buildDashboardSuccess({
        adopted: true,
        analystId: params.id,
        previousVersion: userContext.version_number,
        newVersion: newVersion.version_number,
        changes: adoptionData.changes,
      });
    } catch (error) {
      this.logger.error(
        `Failed to adopt change: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ADOPT_FAILED',
        error instanceof Error ? error.message : 'Failed to adopt change',
      );
    }
  }

  /**
   * Rollback an analyst's context to a previous version
   * Creates a new version that copies content from the target version
   */
  private async handleRollback(
    params: AnalystParams | undefined,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Analyst ID is required');
    }

    const rollbackData = payload.params as {
      id?: string;
      targetVersionId?: string;
      forkType?: ForkType;
      reason?: string;
    };

    if (!rollbackData.targetVersionId) {
      return buildDashboardError(
        'MISSING_VERSION_ID',
        'Target version ID is required for rollback',
      );
    }

    const forkType: ForkType = rollbackData.forkType ?? 'user';
    const reason = rollbackData.reason ?? 'Manual rollback';

    try {
      // Get analyst info first
      const analyst = await this.analystService.findById(params.id);
      if (!analyst) {
        return buildDashboardError('NOT_FOUND', 'Analyst not found');
      }

      // Get the target version to show what we're rolling back to
      const targetVersion =
        await this.portfolioRepository.getAnalystContextVersionById(
          rollbackData.targetVersionId,
        );

      if (!targetVersion) {
        return buildDashboardError(
          'VERSION_NOT_FOUND',
          'Target version not found',
        );
      }

      // Perform the rollback
      const newVersion =
        await this.portfolioRepository.rollbackAnalystContextVersion(
          params.id,
          forkType,
          rollbackData.targetVersionId,
          reason,
        );

      this.logger.log(
        `Rolled back analyst ${analyst.slug} ${forkType} fork to v${targetVersion.version_number}, created new v${newVersion.version_number}`,
      );

      return buildDashboardSuccess({
        success: true,
        analyst: {
          id: analyst.id,
          slug: analyst.slug,
          name: analyst.name,
        },
        forkType,
        rolledBackTo: {
          versionId: targetVersion.id,
          versionNumber: targetVersion.version_number,
          changeReason: targetVersion.change_reason,
          changedBy: targetVersion.changed_by,
          createdAt: targetVersion.created_at,
        },
        newVersion: {
          versionId: newVersion.id,
          versionNumber: newVersion.version_number,
          changeReason: newVersion.change_reason,
        },
        reason,
      });
    } catch (error) {
      this.logger.error(
        `Failed to rollback: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ROLLBACK_FAILED',
        error instanceof Error ? error.message : 'Failed to rollback',
      );
    }
  }

  // =============================================================================
  // POSITION ACTIONS
  // =============================================================================

  /**
   * Get open and closed positions for a specific analyst, optionally filtered by fork type.
   * Returns portfolio summary + open positions for each requested fork.
   */
  private async handlePositions(
    params?: AnalystParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Analyst ID is required');
    }

    try {
      const analyst = await this.analystService.findById(params.id);
      if (!analyst) {
        return buildDashboardError(
          'NOT_FOUND',
          `Analyst not found: ${params.id}`,
        );
      }

      // Determine which forks to return
      const requestedForks: ForkType[] = params.forkType
        ? [params.forkType]
        : ['user', 'ai', 'arbitrator'];

      const forks: Array<{
        forkType: ForkType;
        portfolio: AnalystPortfolio | null;
        openPositions: Array<{
          id: string;
          symbol: string;
          direction: string;
          quantity: number;
          entryPrice: number;
          currentPrice: number;
          unrealizedPnl: number;
          predictionId: string | null;
          isPaperOnly: boolean;
          openedAt: string;
        }>;
      }> = [];

      for (const fork of requestedForks) {
        const portfolio = await this.portfolioRepository.getAnalystPortfolio(
          params.id,
          fork,
        );

        let openPositions: Array<{
          id: string;
          symbol: string;
          direction: string;
          quantity: number;
          entryPrice: number;
          currentPrice: number;
          unrealizedPnl: number;
          predictionId: string | null;
          isPaperOnly: boolean;
          openedAt: string;
        }> = [];

        if (portfolio) {
          const positions =
            await this.portfolioRepository.getOpenAnalystPositions(
              portfolio.id,
            );
          openPositions = positions.map((pos) => ({
            id: pos.id,
            symbol: pos.symbol,
            direction: pos.direction,
            quantity: Number(pos.quantity),
            entryPrice: Number(pos.entry_price),
            currentPrice: Number(pos.current_price),
            unrealizedPnl: Number(pos.unrealized_pnl),
            predictionId: pos.prediction_id ?? null,
            isPaperOnly: pos.is_paper_only,
            openedAt: pos.opened_at,
          }));
        }

        forks.push({ forkType: fork, portfolio, openPositions });
      }

      return buildDashboardSuccess({
        analyst: {
          id: analyst.id,
          slug: analyst.slug,
          name: analyst.name,
          perspective: analyst.perspective,
        },
        forks: forks.map((f) => ({
          forkType: f.forkType,
          portfolio: f.portfolio
            ? {
                id: f.portfolio.id,
                initialBalance: f.portfolio.initial_balance,
                currentBalance: f.portfolio.current_balance,
                totalRealizedPnl: f.portfolio.total_realized_pnl,
                totalUnrealizedPnl: f.portfolio.total_unrealized_pnl,
                winCount: f.portfolio.win_count,
                lossCount: f.portfolio.loss_count,
                status: f.portfolio.status,
              }
            : null,
          openPositions: f.openPositions,
          positionCount: f.openPositions.length,
        })),
      });
    } catch (error) {
      this.logger.error(
        `Failed to get analyst positions: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'POSITIONS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get analyst positions',
      );
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private calculateWinRate(portfolio: AnalystPortfolio | null): number {
    if (!portfolio) return 0;
    const total = portfolio.win_count + portfolio.loss_count;
    if (total === 0) return 0;
    return portfolio.win_count / total;
  }

  private calculatePnlDiff(
    userPortfolio: AnalystPortfolio | null,
    aiPortfolio: AnalystPortfolio | null,
  ): {
    absolute: number;
    percent: number;
  } {
    const userPnl =
      (userPortfolio?.total_realized_pnl ?? 0) +
      (userPortfolio?.total_unrealized_pnl ?? 0);
    const aiPnl =
      (aiPortfolio?.total_realized_pnl ?? 0) +
      (aiPortfolio?.total_unrealized_pnl ?? 0);

    const absolute = aiPnl - userPnl;
    const percent = userPnl !== 0 ? (absolute / Math.abs(userPnl)) * 100 : 0;

    return { absolute, percent };
  }

  private calculateContextDiff(
    userContext: AnalystContextVersion | null,
    aiContext: AnalystContextVersion | null,
  ): {
    perspectiveChanged: boolean;
    tierInstructionsChanged: boolean;
    weightChanged: boolean;
    aiHasJournal: boolean;
    summary: string[];
  } {
    const diff: string[] = [];
    let perspectiveChanged = false;
    let tierInstructionsChanged = false;
    let weightChanged = false;
    const aiHasJournal = !!aiContext?.agent_journal;

    if (!userContext || !aiContext) {
      return {
        perspectiveChanged: false,
        tierInstructionsChanged: false,
        weightChanged: false,
        aiHasJournal,
        summary: ['One or both forks have no context version'],
      };
    }

    // Check perspective
    if (userContext.perspective !== aiContext.perspective) {
      perspectiveChanged = true;
      diff.push('AI has modified perspective');
    }

    // Check tier instructions
    const userTiers = JSON.stringify(userContext.tier_instructions);
    const aiTiers = JSON.stringify(aiContext.tier_instructions);
    if (userTiers !== aiTiers) {
      tierInstructionsChanged = true;
      diff.push('AI has modified tier instructions');
    }

    // Check weight
    if (userContext.default_weight !== aiContext.default_weight) {
      weightChanged = true;
      diff.push(
        `AI changed weight from ${userContext.default_weight} to ${aiContext.default_weight}`,
      );
    }

    // Check journal
    if (aiHasJournal) {
      diff.push('AI has journal entries with self-reflection');
    }

    if (diff.length === 0) {
      diff.push('No differences between forks');
    }

    return {
      perspectiveChanged,
      tierInstructionsChanged,
      weightChanged,
      aiHasJournal,
      summary: diff,
    };
  }
}
