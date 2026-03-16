/**
 * Learning Promotion Handler
 *
 * Handles dashboard mode requests for learning promotion workflow.
 * Promotes test learnings (is_test=true) to production (is_test=false) through human review.
 *
 * Phase 5 - Learning Promotion Workflow
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { LearningPromotionService } from '../../services/learning-promotion.service';
import { LearningService } from '../../services/learning.service';
import { LearningRepository } from '../../repositories/learning.repository';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import {
  PromoteLearningDto,
  RejectLearningDto,
  BacktestConfigDto,
  ValidationResultDto,
  PromotionHistoryDto,
  PromotionStatsDto,
  BacktestResultDto,
} from '../../dto/learning-promotion.dto';
import { v4 as uuidv4 } from 'uuid';

interface PromotionParams {
  learningId?: string;
  page?: number;
  pageSize?: number;
  organizationSlug?: string;
  userId?: string;
}

@Injectable()
export class LearningPromotionHandler implements IDashboardHandler {
  private readonly logger = new Logger(LearningPromotionHandler.name);
  private readonly supportedActions = [
    'list-candidates',
    'validate',
    'promote',
    'reject',
    'history',
    'stats',
    'run-backtest',
  ];

  constructor(
    private readonly promotionService: LearningPromotionService,
    private readonly learningService: LearningService,
    private readonly learningRepository: LearningRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[LEARNING-PROMOTION-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as PromotionParams | undefined;

    switch (action.toLowerCase()) {
      case 'list-candidates':
        return this.handleListCandidates(params, context);
      case 'validate':
        return this.handleValidate(params);
      case 'promote':
        return this.handlePromote(payload, context);
      case 'reject':
        return this.handleReject(payload, context);
      case 'history':
        return this.handleHistory(params, context);
      case 'stats':
        return this.handleStats(context);
      case 'run-backtest':
        return this.handleRunBacktest(payload);
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
   * List test learnings that are candidates for promotion
   * Returns is_test=true, status=active learnings
   */
  private async handleListCandidates(
    params?: PromotionParams,
    _context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    try {
      // Get all learnings and filter for test learnings that are active
      const allLearnings = await this.learningRepository.findByScope(
        'runner', // Get all scopes
      );

      // Filter for test learnings that are active (candidates for promotion)
      const candidates = allLearnings.filter(
        (l) => l.is_test && l.status === 'active',
      );

      // Sort by times_applied descending (most validated first)
      candidates.sort((a, b) => b.times_applied - a.times_applied);

      // Apply pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedCandidates = candidates.slice(
        startIndex,
        startIndex + pageSize,
      );

      // Enrich with validation status
      const enrichedCandidates = paginatedCandidates.map((learning) => {
        const successRate =
          learning.times_applied > 0
            ? learning.times_helpful / learning.times_applied
            : 0;

        return {
          ...learning,
          validationMetrics: {
            timesApplied: learning.times_applied,
            timesHelpful: learning.times_helpful,
            successRate,
          },
          readyForPromotion: learning.times_applied >= 3 && successRate >= 0.5,
        };
      });

      return buildDashboardSuccess(
        enrichedCandidates,
        buildPaginationMetadata(candidates.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list promotion candidates: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_CANDIDATES_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to list promotion candidates',
      );
    }
  }

  /**
   * Validate a test learning for promotion
   * Runs validation checks and returns detailed results
   */
  private async handleValidate(
    params?: PromotionParams,
  ): Promise<DashboardActionResult> {
    if (!params?.learningId) {
      return buildDashboardError('MISSING_ID', 'Learning ID is required');
    }

    try {
      const validationResult = await this.promotionService.validateForPromotion(
        params.learningId,
      );

      const learning = validationResult.learning;

      // Build validation result DTO
      const result: ValidationResultDto = {
        learningId: params.learningId,
        isValid: validationResult.valid,
        checks: {
          isTestLearning: learning ? learning.is_test : false,
          isActive: learning ? learning.status === 'active' : false,
          notAlreadyPromoted: !validationResult.errors.some((e) =>
            e.includes('already been promoted'),
          ),
          hasValidationMetrics: learning ? learning.times_applied > 0 : false,
          meetsMinApplications: learning ? learning.times_applied >= 3 : false,
          meetsMinSuccessRate:
            learning && learning.times_applied > 0
              ? learning.times_helpful / learning.times_applied >= 0.5
              : false,
        },
        validationMetrics: learning
          ? {
              timesApplied: learning.times_applied,
              timesHelpful: learning.times_helpful,
              successRate:
                learning.times_applied > 0
                  ? learning.times_helpful / learning.times_applied
                  : 0,
            }
          : undefined,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
      };

      return buildDashboardSuccess(result);
    } catch (error) {
      this.logger.error(
        `Failed to validate learning: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'VALIDATION_FAILED',
        error instanceof Error ? error.message : 'Failed to validate learning',
      );
    }
  }

  /**
   * Promote a test learning to production
   * Executes the promotion workflow with human approval
   */
  private async handlePromote(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const data = payload.params as Partial<PromoteLearningDto>;

    if (!data.learningId) {
      return buildDashboardError(
        'MISSING_LEARNING_ID',
        'Learning ID is required for promotion',
      );
    }

    if (!context.userId) {
      return buildDashboardError(
        'MISSING_USER_ID',
        'User ID is required for promotion (human approval)',
      );
    }

    try {
      // Convert backtest result if provided
      const backtestResult = data.backtestResult
        ? {
            pass: data.backtestResult.passed,
            improvement_score: data.backtestResult.metrics.accuracyLift,
            window_days: 30, // Default or extract from backtest config
            details: {
              backtestId: data.backtestResult.backtestId,
              metrics: data.backtestResult.metrics,
              executedAt: data.backtestResult.executedAt,
              executionTimeMs: data.backtestResult.executionTimeMs,
            },
          }
        : undefined;

      const lineage = await this.promotionService.promoteLearning(
        data.learningId,
        context.userId,
        context.orgSlug,
        data.reviewerNotes,
        backtestResult,
        data.scenarioRunIds,
      );

      // Build response DTO
      const response: PromotionHistoryDto = {
        id: lineage.id,
        testLearningId: lineage.test_learning_id,
        productionLearningId: lineage.production_learning_id,
        testLearningTitle: lineage.test_learning_title ?? 'Unknown',
        productionLearningTitle: lineage.production_learning_title ?? 'Unknown',
        promotedBy: lineage.promoted_by,
        promotedByEmail: lineage.promoter_email,
        promotedByName: lineage.promoter_name,
        promotedAt: lineage.promoted_at,
        validationMetrics: lineage.validation_metrics,
        backtestResult: lineage.backtest_result ?? undefined,
        reviewerNotes: lineage.notes ?? undefined,
        scenarioRuns: lineage.scenario_runs,
      };

      return buildDashboardSuccess(response);
    } catch (error) {
      this.logger.error(
        `Failed to promote learning: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'PROMOTION_FAILED',
        error instanceof Error ? error.message : 'Failed to promote learning',
      );
    }
  }

  /**
   * Reject a test learning from promotion
   * Marks the learning as disabled with rejection reason
   */
  private async handleReject(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const data = payload.params as Partial<RejectLearningDto>;

    if (!data.learningId) {
      return buildDashboardError(
        'MISSING_LEARNING_ID',
        'Learning ID is required for rejection',
      );
    }

    if (!data.reason) {
      return buildDashboardError(
        'MISSING_REASON',
        'Rejection reason is required',
      );
    }

    if (!context.userId) {
      return buildDashboardError(
        'MISSING_USER_ID',
        'User ID is required for rejection (human approval)',
      );
    }

    try {
      const rejectedLearning = await this.promotionService.rejectLearning(
        data.learningId,
        context.userId,
        context.orgSlug,
        data.reason,
      );

      return buildDashboardSuccess({
        learningId: rejectedLearning.id,
        status: rejectedLearning.status,
        reason: data.reason,
        rejectedAt: new Date().toISOString(),
        rejectedBy: context.userId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to reject learning: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'REJECTION_FAILED',
        error instanceof Error ? error.message : 'Failed to reject learning',
      );
    }
  }

  /**
   * Get promotion history for the organization
   * Returns all learning promotions with user and learning details
   */
  private async handleHistory(
    params?: PromotionParams,
    context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!context?.orgSlug) {
      return buildDashboardError(
        'MISSING_ORG_SLUG',
        'Organization slug is required',
      );
    }

    try {
      const history = await this.promotionService.getPromotionHistory(
        context.orgSlug,
      );

      // Apply pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedHistory = history.slice(startIndex, startIndex + pageSize);

      // Convert to DTOs
      const historyDtos: PromotionHistoryDto[] = paginatedHistory.map(
        (lineage) => ({
          id: lineage.id,
          testLearningId: lineage.test_learning_id,
          productionLearningId: lineage.production_learning_id,
          testLearningTitle: lineage.test_learning_title ?? 'Unknown',
          productionLearningTitle:
            lineage.production_learning_title ?? 'Unknown',
          promotedBy: lineage.promoted_by,
          promotedByEmail: lineage.promoter_email,
          promotedByName: lineage.promoter_name,
          promotedAt: lineage.promoted_at,
          validationMetrics: lineage.validation_metrics,
          backtestResult: lineage.backtest_result ?? undefined,
          reviewerNotes: lineage.notes ?? undefined,
          scenarioRuns: lineage.scenario_runs,
        }),
      );

      return buildDashboardSuccess(
        historyDtos,
        buildPaginationMetadata(history.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to get promotion history: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'HISTORY_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get promotion history',
      );
    }
  }

  /**
   * Get promotion statistics for the organization
   * Returns aggregate metrics about learning promotions
   */
  private async handleStats(
    context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!context?.orgSlug) {
      return buildDashboardError(
        'MISSING_ORG_SLUG',
        'Organization slug is required',
      );
    }

    try {
      const stats = await this.promotionService.getPromotionStats(
        context.orgSlug,
      );

      const statsDto: PromotionStatsDto = {
        totalTestLearnings: stats.total_test_learnings,
        totalPromoted: stats.total_promoted,
        totalRejected: stats.total_rejected,
        pendingReview: stats.pending_review,
        avgTimesApplied: stats.avg_times_applied,
        avgSuccessRate: stats.avg_success_rate,
      };

      return buildDashboardSuccess(statsDto);
    } catch (error) {
      this.logger.error(
        `Failed to get promotion stats: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'STATS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get promotion stats',
      );
    }
  }

  /**
   * Run a backtest for a test learning
   * Simulates what would happen if the learning had been applied in the past
   *
   * Note: Currently returns mock data as backtest implementation is a placeholder
   */
  private async handleRunBacktest(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = payload.params as Partial<BacktestConfigDto>;

    if (!data.learningId) {
      return buildDashboardError(
        'MISSING_LEARNING_ID',
        'Learning ID is required for backtest',
      );
    }

    try {
      // Call the backtest service (currently returns placeholder data)
      const windowDays = data.windowDays ?? 30;
      const backtestResult = await this.promotionService.backtestLearning(
        data.learningId,
        windowDays,
      );

      // Generate mock detailed results for UI
      // TODO: Replace with real backtest implementation
      const mockResult: BacktestResultDto = {
        backtestId: uuidv4(),
        learningId: data.learningId,
        passed: backtestResult.pass,
        metrics: {
          baselineAccuracy: 0.72,
          withLearningAccuracy: 0.78,
          accuracyLift: 0.06,
          baselineFalsePositiveRate: 0.15,
          withLearningFalsePositiveRate: 0.12,
          falsePositiveDelta: -0.03,
          predictionsAffected: 150,
          predictionsImproved: 95,
          predictionsDegraded: 10,
          statisticalSignificance: 0.95,
        },
        executedAt: new Date().toISOString(),
        executionTimeMs: 2500,
      };

      this.logger.warn(
        `Backtest for learning ${data.learningId} returned mock data - real implementation pending`,
      );

      return buildDashboardSuccess(mockResult);
    } catch (error) {
      this.logger.error(
        `Failed to run backtest: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'BACKTEST_FAILED',
        error instanceof Error ? error.message : 'Failed to run backtest',
      );
    }
  }
}
