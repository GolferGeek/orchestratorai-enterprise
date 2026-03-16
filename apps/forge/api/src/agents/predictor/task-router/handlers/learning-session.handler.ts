/**
 * Learning Session Handler
 *
 * Handles bidirectional learning between user and ai forks.
 * Part of the Learning Loop: Review Queue → Learning Queue → Learning Session → Apply Changes
 *
 * Features:
 * - Start learning session with comparison report
 * - Interactive dialogue (user asks ai, ai asks user)
 * - Adoption decisions with full audit trail
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { PortfolioRepository } from '../../repositories/portfolio.repository';
import { AnalystService } from '../../services/analyst.service';
import type {
  ForkLearningExchange,
  AnalystPortfolio,
  AnalystContextVersion,
  LearningOutcome,
} from '../../interfaces/portfolio.interface';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';

interface LearningSessionParams {
  id?: string;
  analystId?: string;
  initiatedBy?: 'user' | 'ai';
  outcome?: LearningOutcome;
  page?: number;
  pageSize?: number;
}

interface StartSessionInput {
  analystId: string;
}

interface AskQuestionInput {
  analystId: string;
  question: string;
  contextDiff?: Record<string, unknown>;
  performanceEvidence?: Record<string, unknown>;
}

interface RespondInput {
  exchangeId: string;
  response: string;
  outcome: LearningOutcome;
  adoptionDetails?: Record<string, unknown>;
}

@Injectable()
export class LearningSessionHandler implements IDashboardHandler {
  private readonly logger = new Logger(LearningSessionHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'start',
    'askAi',
    'askUser',
    'respond',
    'pending',
    'stats',
  ];

  constructor(
    private readonly portfolioRepository: PortfolioRepository,
    private readonly analystService: AnalystService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[LEARNING-SESSION-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as LearningSessionParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'start':
        return this.handleStartSession(payload);
      case 'askai':
        return this.handleAskAi(payload);
      case 'askuser':
        return this.handleAskUser(payload);
      case 'respond':
        return this.handleRespond(payload);
      case 'pending':
        return this.handlePending(params);
      case 'stats':
        return this.handleStats(params);
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
   * List learning exchanges for an analyst
   */
  private async handleList(
    params?: LearningSessionParams,
  ): Promise<DashboardActionResult> {
    if (!params?.analystId) {
      return buildDashboardError(
        'MISSING_ANALYST_ID',
        'Analyst ID is required',
      );
    }

    try {
      const exchanges = await this.portfolioRepository.getLearningExchanges(
        params.analystId,
        params.initiatedBy,
        params.outcome,
      );

      // Pagination
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedExchanges = exchanges.slice(
        startIndex,
        startIndex + pageSize,
      );

      // Get analyst info
      const analyst = await this.analystService.findById(params.analystId);

      return buildDashboardSuccess(
        {
          analyst: analyst
            ? { id: analyst.id, slug: analyst.slug, name: analyst.name }
            : null,
          exchanges: paginatedExchanges,
        },
        buildPaginationMetadata(exchanges.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list learning exchanges: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to list learning exchanges',
      );
    }
  }

  /**
   * Get a specific learning exchange by ID
   */
  private async handleGet(
    params?: LearningSessionParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Exchange ID is required');
    }

    try {
      const exchange = await this.portfolioRepository.getLearningExchangeById(
        params.id,
      );

      if (!exchange) {
        return buildDashboardError(
          'NOT_FOUND',
          `Learning exchange not found: ${params.id}`,
        );
      }

      // Get analyst info
      const analyst = await this.analystService.findById(exchange.analyst_id);

      return buildDashboardSuccess({
        exchange,
        analyst: analyst
          ? { id: analyst.id, slug: analyst.slug, name: analyst.name }
          : null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get learning exchange: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get learning exchange',
      );
    }
  }

  /**
   * Start a learning session - generates comparison report
   */
  private async handleStartSession(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const input = payload.params as StartSessionInput | undefined;

    if (!input?.analystId) {
      return buildDashboardError(
        'MISSING_ANALYST_ID',
        'Analyst ID is required',
      );
    }

    try {
      const analyst = await this.analystService.findById(input.analystId);
      if (!analyst) {
        return buildDashboardError(
          'NOT_FOUND',
          `Analyst not found: ${input.analystId}`,
        );
      }

      // Get both portfolios for performance comparison
      const userPortfolio = await this.portfolioRepository.getAnalystPortfolio(
        input.analystId,
        'user',
      );
      const aiPortfolio = await this.portfolioRepository.getAnalystPortfolio(
        input.analystId,
        'ai',
      );

      // Get current contexts for diff
      const userContext =
        await this.portfolioRepository.getCurrentAnalystContextVersion(
          input.analystId,
          'user',
        );
      const aiContext =
        await this.portfolioRepository.getCurrentAnalystContextVersion(
          input.analystId,
          'ai',
        );

      // Get recent exchanges
      const recentExchanges =
        await this.portfolioRepository.getLearningExchanges(input.analystId);

      // Build comparison report
      const report = this.buildComparisonReport(
        analyst,
        userPortfolio,
        aiPortfolio,
        userContext,
        aiContext,
        recentExchanges,
      );

      return buildDashboardSuccess({
        sessionStarted: true,
        analyst: {
          id: analyst.id,
          slug: analyst.slug,
          name: analyst.name,
        },
        report,
      });
    } catch (error) {
      this.logger.error(
        `Failed to start learning session: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SESSION_START_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to start learning session',
      );
    }
  }

  /**
   * User asks a question to the ai fork
   */
  private async handleAskAi(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const input = payload.params as AskQuestionInput | undefined;

    if (!input?.analystId || !input?.question) {
      return buildDashboardError(
        'MISSING_PARAMS',
        'Analyst ID and question are required',
      );
    }

    try {
      // Get performance evidence
      const userPortfolio = await this.portfolioRepository.getAnalystPortfolio(
        input.analystId,
        'user',
      );
      const aiPortfolio = await this.portfolioRepository.getAnalystPortfolio(
        input.analystId,
        'ai',
      );

      const performanceEvidence = input.performanceEvidence ?? {
        userPnl: userPortfolio
          ? userPortfolio.total_realized_pnl +
            userPortfolio.total_unrealized_pnl
          : 0,
        aiPnl: aiPortfolio
          ? aiPortfolio.total_realized_pnl + aiPortfolio.total_unrealized_pnl
          : 0,
        period: '30d',
      };

      // Create the exchange
      const exchange = await this.portfolioRepository.createLearningExchange(
        input.analystId,
        'user',
        input.question,
        input.contextDiff,
        performanceEvidence,
      );

      this.logger.log(
        `User asked ai: "${input.question.substring(0, 50)}..." for analyst ${input.analystId}`,
      );

      return buildDashboardSuccess({
        exchange,
        message:
          'Question recorded. AI response will be generated during next evaluation cycle.',
      });
    } catch (error) {
      this.logger.error(
        `Failed to ask ai: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ASK_FAILED',
        error instanceof Error ? error.message : 'Failed to ask ai',
      );
    }
  }

  /**
   * AI asks a question to the user
   * (This is typically triggered by ai self-reflection)
   */
  private async handleAskUser(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const input = payload.params as AskQuestionInput | undefined;

    if (!input?.analystId || !input?.question) {
      return buildDashboardError(
        'MISSING_PARAMS',
        'Analyst ID and question are required',
      );
    }

    try {
      // Get context diff
      const userContext =
        await this.portfolioRepository.getCurrentAnalystContextVersion(
          input.analystId,
          'user',
        );
      const aiContext =
        await this.portfolioRepository.getCurrentAnalystContextVersion(
          input.analystId,
          'ai',
        );

      const contextDiff = input.contextDiff ?? {
        userPerspective: userContext?.perspective,
        aiPerspective: aiContext?.perspective,
        userWeight: userContext?.default_weight,
        aiWeight: aiContext?.default_weight,
      };

      // Create the exchange
      const exchange = await this.portfolioRepository.createLearningExchange(
        input.analystId,
        'ai',
        input.question,
        contextDiff,
        input.performanceEvidence,
      );

      this.logger.log(
        `AI asked user: "${input.question.substring(0, 50)}..." for analyst ${input.analystId}`,
      );

      return buildDashboardSuccess({
        exchange,
        message: 'Question recorded. Awaiting user response.',
      });
    } catch (error) {
      this.logger.error(
        `Failed to ask user: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ASK_FAILED',
        error instanceof Error ? error.message : 'Failed to ask user',
      );
    }
  }

  /**
   * Respond to a learning exchange and record outcome
   */
  private async handleRespond(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const input = payload.params as RespondInput | undefined;

    if (!input?.exchangeId || !input?.response || !input?.outcome) {
      return buildDashboardError(
        'MISSING_PARAMS',
        'Exchange ID, response, and outcome are required',
      );
    }

    try {
      const exchange = await this.portfolioRepository.updateLearningExchange(
        input.exchangeId,
        input.response,
        input.outcome,
        input.adoptionDetails,
      );

      this.logger.log(
        `Learning exchange ${input.exchangeId} responded with outcome: ${input.outcome}`,
      );

      return buildDashboardSuccess({
        exchange,
        message: `Response recorded with outcome: ${input.outcome}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to respond to exchange: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'RESPOND_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to respond to exchange',
      );
    }
  }

  /**
   * Get pending learning exchanges (for HITL queue)
   */
  private async handlePending(
    params?: LearningSessionParams,
  ): Promise<DashboardActionResult> {
    try {
      const exchanges =
        await this.portfolioRepository.getPendingLearningExchanges();

      // Enrich with analyst info
      const enrichedExchanges = await Promise.all(
        exchanges.map(async (exchange) => {
          const analyst = await this.analystService.findById(
            exchange.analyst_id,
          );
          return {
            ...exchange,
            analyst_name: analyst?.name ?? 'Unknown',
            analyst_slug: analyst?.slug ?? 'unknown',
          };
        }),
      );

      // Pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedExchanges = enrichedExchanges.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        {
          pending: paginatedExchanges,
          totalPending: exchanges.length,
        },
        buildPaginationMetadata(exchanges.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to get pending exchanges: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'PENDING_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get pending exchanges',
      );
    }
  }

  /**
   * Get learning session statistics
   */
  private async handleStats(
    _params?: LearningSessionParams,
  ): Promise<DashboardActionResult> {
    try {
      const pending =
        await this.portfolioRepository.getPendingLearningExchanges();

      // Get all analysts for comprehensive stats
      const analysts = await this.analystService.findRunnerLevel();

      // Collect stats across all analysts
      let totalExchanges = 0;
      let totalAdopted = 0;
      let totalRejected = 0;
      let totalNoted = 0;
      let userInitiated = 0;
      let aiInitiated = 0;

      for (const analyst of analysts) {
        const exchanges = await this.portfolioRepository.getLearningExchanges(
          analyst.id,
        );
        totalExchanges += exchanges.length;

        for (const ex of exchanges) {
          if (ex.outcome === 'adopted') totalAdopted++;
          if (ex.outcome === 'rejected') totalRejected++;
          if (ex.outcome === 'noted') totalNoted++;
          if (ex.initiated_by === 'user') userInitiated++;
          if (ex.initiated_by === 'ai') aiInitiated++;
        }
      }

      const stats = {
        totalExchanges,
        pendingCount: pending.length,
        outcomes: {
          adopted: totalAdopted,
          rejected: totalRejected,
          noted: totalNoted,
          pending: pending.length,
        },
        initiators: {
          user: userInitiated,
          ai: aiInitiated,
        },
        adoptionRate:
          totalExchanges > 0
            ? (
                (totalAdopted / (totalExchanges - pending.length)) *
                100
              ).toFixed(1)
            : '0.0',
      };

      return buildDashboardSuccess(stats);
    } catch (error) {
      this.logger.error(
        `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'STATS_FAILED',
        error instanceof Error ? error.message : 'Failed to get stats',
      );
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private buildComparisonReport(
    analyst: { id: string; slug: string; name: string },
    userPortfolio: AnalystPortfolio | null,
    aiPortfolio: AnalystPortfolio | null,
    userContext: AnalystContextVersion | null,
    aiContext: AnalystContextVersion | null,
    recentExchanges: ForkLearningExchange[],
  ): {
    performanceDiff: {
      userPnl: number;
      aiPnl: number;
      diff: number;
      diffPercent: number;
      aiOutperforming: boolean;
    };
    contextDiff: {
      perspectiveChanged: boolean;
      tierInstructionsChanged: boolean;
      weightChanged: boolean;
      details: string[];
    };
    recentLearnings: {
      total: number;
      adopted: number;
      rejected: number;
      pending: number;
    };
    suggestions: string[];
  } {
    // Performance comparison
    const userPnl =
      (userPortfolio?.total_realized_pnl ?? 0) +
      (userPortfolio?.total_unrealized_pnl ?? 0);
    const aiPnl =
      (aiPortfolio?.total_realized_pnl ?? 0) +
      (aiPortfolio?.total_unrealized_pnl ?? 0);
    const diff = aiPnl - userPnl;
    const diffPercent = userPnl !== 0 ? (diff / Math.abs(userPnl)) * 100 : 0;

    // Context comparison
    const contextDetails: string[] = [];
    let perspectiveChanged = false;
    let tierInstructionsChanged = false;
    let weightChanged = false;

    if (userContext && aiContext) {
      if (userContext.perspective !== aiContext.perspective) {
        perspectiveChanged = true;
        contextDetails.push(
          `Perspective changed: "${userContext.perspective.substring(0, 30)}..." → "${aiContext.perspective.substring(0, 30)}..."`,
        );
      }

      if (
        JSON.stringify(userContext.tier_instructions) !==
        JSON.stringify(aiContext.tier_instructions)
      ) {
        tierInstructionsChanged = true;
        contextDetails.push('Tier instructions have been modified');
      }

      if (userContext.default_weight !== aiContext.default_weight) {
        weightChanged = true;
        contextDetails.push(
          `Weight changed: ${userContext.default_weight} → ${aiContext.default_weight}`,
        );
      }

      if (aiContext.agent_journal) {
        contextDetails.push('AI has self-reflection journal entries');
      }
    }

    // Recent learnings summary
    const learningCounts = {
      total: recentExchanges.length,
      adopted: recentExchanges.filter((e) => e.outcome === 'adopted').length,
      rejected: recentExchanges.filter((e) => e.outcome === 'rejected').length,
      pending: recentExchanges.filter((e) => e.outcome === 'pending').length,
    };

    // Generate suggestions
    const suggestions: string[] = [];

    if (diff > 0 && diffPercent > 5) {
      suggestions.push(
        `AI fork is outperforming by ${diffPercent.toFixed(1)}%. Consider reviewing AI's changes.`,
      );
    }

    if (diff < 0 && diffPercent < -5) {
      suggestions.push(
        `User fork is outperforming by ${Math.abs(diffPercent).toFixed(1)}%. AI may need guidance.`,
      );
    }

    if (perspectiveChanged) {
      suggestions.push(
        "Review AI's perspective changes - they may contain valuable insights.",
      );
    }

    if (weightChanged) {
      suggestions.push(
        'AI has adjusted confidence weighting. Check if it aligns with performance.',
      );
    }

    if (learningCounts.pending > 3) {
      suggestions.push(
        `You have ${learningCounts.pending} pending exchanges awaiting response.`,
      );
    }

    if (suggestions.length === 0) {
      suggestions.push(
        'Both forks are performing similarly. No urgent actions needed.',
      );
    }

    return {
      performanceDiff: {
        userPnl,
        aiPnl,
        diff,
        diffPercent,
        aiOutperforming: aiPnl > userPnl,
      },
      contextDiff: {
        perspectiveChanged,
        tierInstructionsChanged,
        weightChanged,
        details:
          contextDetails.length > 0
            ? contextDetails
            : ['No differences detected'],
      },
      recentLearnings: learningCounts,
      suggestions,
    };
  }
}
