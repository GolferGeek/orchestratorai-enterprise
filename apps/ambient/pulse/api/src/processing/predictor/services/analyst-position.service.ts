import { Injectable, Logger } from '@nestjs/common';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { PredictionRepository } from '../repositories/prediction.repository';
import { TargetSnapshotRepository } from '../repositories/target-snapshot.repository';
import { TargetRepository } from '../repositories/target.repository';
import { AnalystRepository } from '../repositories/analyst.repository';
import { AnalystAssessmentResult } from '../interfaces/ensemble.interface';
import { Target } from '../interfaces/target.interface';

import {
  AnalystPosition,
  AnalystPortfolio,
  PositionDirection,
} from '../interfaces/portfolio.interface';

/**
 * Input for creating a position from an analyst assessment
 */
export interface CreatePositionFromAssessmentInput {
  assessment: AnalystAssessmentResult;
  target: Target;
  entryPrice: number;
  predictionId?: string;
}

/**
 * Result of position creation
 */
export interface PositionCreationResult {
  position: AnalystPosition;
  portfolio: AnalystPortfolio;
}

/**
 * Service for managing analyst positions based on their assessments
 * Handles position sizing, creation, and P&L tracking per fork
 *
 * Position sizing is tiered based on confidence (configurable in database):
 * - 60-70% confidence → 5% of portfolio
 * - 70-80% confidence → 10% of portfolio
 * - 80%+ confidence → 15% of portfolio
 */
@Injectable()
export class AnalystPositionService {
  private readonly logger = new Logger(AnalystPositionService.name);
  private readonly MAX_ONE_OFF_MISSING_ANALYST_PATTERN = 0;

  // Default position sizing parameters (used as fallback)
  private readonly DEFAULT_POSITION_PERCENT = 0.05; // 5% default position
  private readonly MIN_CONFIDENCE_FOR_POSITION = 0.0; // Always take a position when directional (size reflects confidence)

  constructor(
    private readonly portfolioRepository: PortfolioRepository,
    private readonly predictionRepository: PredictionRepository,
    private readonly targetSnapshotRepository: TargetSnapshotRepository,
    private readonly targetRepository: TargetRepository,
    private readonly analystRepository: AnalystRepository,
  ) {}

  private getEnsembleAnalystSlug(analystEnsemble: unknown): string | undefined {
    if (!analystEnsemble || typeof analystEnsemble !== 'object') {
      return undefined;
    }
    const ensemble = analystEnsemble as Record<string, unknown>;
    if (
      typeof ensemble.analyst_slug === 'string' &&
      ensemble.analyst_slug.trim().length > 0
    ) {
      return ensemble.analyst_slug.trim();
    }
    return undefined;
  }

  private getContextVersionAnalystKey(
    analystContextVersionIds: unknown,
  ): string | undefined {
    if (
      !analystContextVersionIds ||
      typeof analystContextVersionIds !== 'object' ||
      Array.isArray(analystContextVersionIds)
    ) {
      return undefined;
    }
    const keys = Object.keys(
      analystContextVersionIds as Record<string, unknown>,
    );
    return keys.length === 1 ? keys[0] : undefined;
  }

  private async resolveAnalystForPrediction(
    prediction: {
      id: string;
      analyst_slug?: string | null;
      analyst_ensemble?: Record<string, unknown>;
      analyst_context_version_ids?: Record<string, string> | null;
    },
    analystsBySlug: Map<
      string,
      Awaited<ReturnType<AnalystRepository['getPersonalityAnalysts']>>[number]
    >,
    analystsById: Map<
      string,
      Awaited<ReturnType<AnalystRepository['getPersonalityAnalysts']>>[number]
    >,
  ): Promise<{
    analyst: Awaited<
      ReturnType<AnalystRepository['getPersonalityAnalysts']>
    >[number];
    source:
      | 'prediction.analyst_slug'
      | 'analyst_ensemble.analyst_slug'
      | 'analyst_context_version_ids';
  } | null> {
    if (prediction.analyst_slug && prediction.analyst_slug.trim().length > 0) {
      const direct = analystsBySlug.get(prediction.analyst_slug.trim());
      if (direct) {
        return { analyst: direct, source: 'prediction.analyst_slug' };
      }
    }

    const ensembleSlug = this.getEnsembleAnalystSlug(
      prediction.analyst_ensemble,
    );
    if (ensembleSlug) {
      const fromEnsemble = analystsBySlug.get(ensembleSlug);
      if (fromEnsemble) {
        // Persist the reconstruction so future EOD runs are clean.
        await this.predictionRepository.backfillAnalystSlug(
          prediction.id,
          ensembleSlug,
        );
        return {
          analyst: fromEnsemble,
          source: 'analyst_ensemble.analyst_slug',
        };
      }
    }

    const contextKey = this.getContextVersionAnalystKey(
      prediction.analyst_context_version_ids,
    );
    if (contextKey) {
      const byId = analystsById.get(contextKey);
      if (byId) {
        await this.predictionRepository.backfillAnalystSlug(
          prediction.id,
          byId.slug,
        );
        return { analyst: byId, source: 'analyst_context_version_ids' };
      }

      const bySlug = analystsBySlug.get(contextKey);
      if (bySlug) {
        await this.predictionRepository.backfillAnalystSlug(
          prediction.id,
          bySlug.slug,
        );
        return { analyst: bySlug, source: 'analyst_context_version_ids' };
      }
    }

    return null;
  }

  private async handleUnresolvableAnalystPrediction(prediction: {
    id: string;
    analyst_slug?: string | null;
    is_arbitrator?: boolean | null;
  }): Promise<{ autoCancelled: boolean; message: string }> {
    if (prediction.is_arbitrator) {
      return {
        autoCancelled: false,
        message: `Arbitrator prediction ${prediction.id} missing analyst linkage; manual investigation required`,
      };
    }

    const otherMissingCount =
      await this.predictionRepository.countActiveDirectionalMissingAnalystSlug(
        prediction.id,
      );

    if (otherMissingCount <= this.MAX_ONE_OFF_MISSING_ANALYST_PATTERN) {
      const reason =
        `Auto-cancelled as non-tradable during EOD: missing analyst linkage for prediction ${prediction.id}. ` +
        `No broader missing-analyst pattern detected at cancellation time.`;
      await this.predictionRepository.markPredictionNonTradable(
        prediction.id,
        reason,
      );
      return {
        autoCancelled: true,
        message: `Prediction ${prediction.id} auto-cancelled as non-tradable (one-off missing analyst linkage)`,
      };
    }

    return {
      autoCancelled: false,
      message:
        `Analyst linkage missing for prediction ${prediction.id}; pattern detected ` +
        `(${otherMissingCount + 1} active directional predictions with missing analyst_slug).`,
    };
  }

  /**
   * Create a position for an analyst assessment
   * Position size is based on the analyst's confidence
   */
  async createPositionFromAssessment(
    input: CreatePositionFromAssessmentInput,
  ): Promise<PositionCreationResult | null> {
    const { assessment, target, entryPrice, predictionId } = input;

    // Determine fork type from assessment
    const forkType = assessment.fork_type || 'user';

    // Get analyst's portfolio for this fork
    const portfolio = await this.portfolioRepository.getAnalystPortfolio(
      assessment.analyst.analyst_id,
      forkType,
    );

    if (!portfolio) {
      this.logger.warn(
        `No ${forkType} portfolio found for analyst ${assessment.analyst.slug}`,
      );
      return null;
    }

    // Skip if portfolio is suspended (paper-only mode)
    if (portfolio.status === 'suspended' && forkType === 'ai') {
      this.logger.log(
        `Analyst ${assessment.analyst.slug} is suspended - creating paper-only position`,
      );
    }

    // Determine position direction from assessment direction
    const direction = this.mapAssessmentToPosition(assessment.direction);
    if (!direction) {
      this.logger.log(
        `Assessment direction ${assessment.direction} doesn't translate to a position`,
      );
      return null;
    }

    // Calculate position size based on confidence (using tiered sizing from DB)
    const quantity = await this.calculatePositionSize(
      portfolio.current_balance,
      entryPrice,
      assessment.confidence,
    );

    // Create the position
    const position = await this.portfolioRepository.createAnalystPosition({
      portfolio_id: portfolio.id,
      analyst_assessment_id: undefined, // Will be linked if we store assessments
      prediction_id: predictionId,
      target_id: target.id,
      symbol: target.symbol,
      direction,
      quantity,
      entry_price: entryPrice,
      is_paper_only: portfolio.status === 'suspended',
    });

    this.logger.log(
      `Created ${forkType} position for analyst ${assessment.analyst.slug}: ${direction} ${quantity} ${target.symbol} @ $${entryPrice}`,
    );

    return { position, portfolio };
  }

  /**
   * Create positions for all assessments in a dual-fork result
   * Returns positions grouped by fork type
   */
  async createPositionsFromDualForkAssessments(
    userAssessments: AnalystAssessmentResult[],
    agentAssessments: AnalystAssessmentResult[],
    target: Target,
    entryPrice: number,
    predictionId?: string,
  ): Promise<{
    userPositions: PositionCreationResult[];
    aiPositions: PositionCreationResult[];
  }> {
    const userPositions: PositionCreationResult[] = [];
    const aiPositions: PositionCreationResult[] = [];

    // Create user fork positions
    for (const assessment of userAssessments) {
      try {
        const result = await this.createPositionFromAssessment({
          assessment: { ...assessment, fork_type: 'user' },
          target,
          entryPrice,
          predictionId,
        });
        if (result) {
          userPositions.push(result);
        }
      } catch (error) {
        this.logger.error(
          `Failed to create user position for ${assessment.analyst.slug}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Create agent fork positions
    for (const assessment of agentAssessments) {
      try {
        const result = await this.createPositionFromAssessment({
          assessment: { ...assessment, fork_type: 'ai' },
          target,
          entryPrice,
          predictionId,
        });
        if (result) {
          aiPositions.push(result);
        }
      } catch (error) {
        this.logger.error(
          `Failed to create agent position for ${assessment.analyst.slug}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Created ${userPositions.length} user positions and ${aiPositions.length} ai positions for ${target.symbol}`,
    );

    return { userPositions, aiPositions };
  }

  /**
   * Calculate position size based on portfolio balance and confidence
   * Uses tiered position sizing from database configuration:
   * - 60-70% confidence → 5% of portfolio
   * - 70-80% confidence → 10% of portfolio
   * - 80%+ confidence → 15% of portfolio
   *
   * Formula: quantity = (balance * position_percent) / entry_price
   */
  async calculatePositionSize(
    portfolioBalance: number,
    entryPrice: number,
    confidence: number,
    orgSlug: string = '*',
  ): Promise<number> {
    if (entryPrice <= 0) {
      return 0;
    }

    // Require minimum confidence to take a position
    if (confidence < this.MIN_CONFIDENCE_FOR_POSITION) {
      this.logger.debug(
        `Confidence ${(confidence * 100).toFixed(1)}% below minimum threshold ${(this.MIN_CONFIDENCE_FOR_POSITION * 100).toFixed(1)}%`,
      );
      return 0;
    }

    // Get the position percent for this confidence level from database
    let positionPercent: number;
    try {
      positionPercent =
        await this.portfolioRepository.getPositionPercentForConfidence(
          confidence,
          orgSlug,
        );
    } catch (error) {
      this.logger.warn(
        `Failed to get position sizing config, using default: ${error instanceof Error ? error.message : String(error)}`,
      );
      positionPercent = this.DEFAULT_POSITION_PERCENT;
    }

    // Calculate position value and quantity
    const positionValue = portfolioBalance * positionPercent;
    const quantity = Math.max(1, Math.floor(positionValue / entryPrice));

    this.logger.debug(
      `Position sizing: confidence=${(confidence * 100).toFixed(1)}%, tier=${(positionPercent * 100).toFixed(0)}%, value=$${positionValue.toFixed(2)}, quantity=${quantity}`,
    );

    return quantity;
  }

  /**
   * Map assessment direction to position direction
   * Returns null if direction doesn't translate to a trade
   */
  private mapAssessmentToPosition(
    assessmentDirection: string,
  ): PositionDirection | null {
    const normalizedDirection = assessmentDirection.toLowerCase();

    // Bullish directions -> long
    if (['bullish', 'up', 'buy', 'long'].includes(normalizedDirection)) {
      return 'long';
    }

    // Bearish directions -> short
    if (['bearish', 'down', 'sell', 'short'].includes(normalizedDirection)) {
      return 'short';
    }

    // Neutral doesn't create a position
    return null;
  }

  /**
   * Close a position at the given price
   * Returns the realized P&L
   */
  async closePosition(
    positionId: string,
    exitPrice: number,
  ): Promise<{ realizedPnl: number; isWin: boolean }> {
    // Get the position first to calculate P&L
    const openPositions =
      await this.portfolioRepository.getOpenAnalystPositions();
    const openPosition = openPositions.find((p) => p.id === positionId);

    if (!openPosition) {
      throw new Error(`Position ${positionId} not found or already closed`);
    }

    // Calculate P&L
    const realizedPnl = this.portfolioRepository.calculatePnL(
      openPosition.direction,
      openPosition.entry_price,
      exitPrice,
      openPosition.quantity,
    );

    const isWin = realizedPnl > 0;

    // Close the position with calculated P&L
    const position = await this.portfolioRepository.closeAnalystPosition(
      positionId,
      exitPrice,
      realizedPnl,
    );

    // Record the trade result in the portfolio
    await this.portfolioRepository.recordAnalystTradeResult(
      position.portfolio_id,
      realizedPnl,
      isWin,
    );

    this.logger.log(
      `Closed position ${positionId}: ${position.direction} ${position.symbol}, P&L: $${realizedPnl.toFixed(2)} (${isWin ? 'WIN' : 'LOSS'})`,
    );

    return { realizedPnl, isWin };
  }

  /**
   * Update unrealized P&L for all open positions of a target
   */
  async updateTargetPositionPrices(
    targetId: string,
    currentPrice: number,
  ): Promise<void> {
    const positions =
      await this.portfolioRepository.getOpenPositionsByTarget(targetId);

    for (const position of positions) {
      const unrealizedPnl = this.portfolioRepository.calculatePnL(
        position.direction,
        position.entry_price,
        currentPrice,
        position.quantity,
      );

      await this.portfolioRepository.updateAnalystPositionPrice(
        position.id,
        currentPrice,
        unrealizedPnl,
      );
    }

    this.logger.log(
      `Updated ${positions.length} positions for target ${targetId} to price $${currentPrice}`,
    );
  }

  /**
   * Create end-of-day positions for all active directional predictions.
   * For each prediction with direction up/down (not flat):
   * - Check if an open position already exists for this analyst + target + fork
   * - If not, create a position using tiered sizing
   */
  async createEndOfDayPositions(): Promise<{
    positionsCreated: number;
    positionsSkipped: number;
    errors: string[];
  }> {
    const result = {
      positionsCreated: 0,
      positionsSkipped: 0,
      errors: [] as string[],
    };

    // Get all active non-test predictions
    const activePredictions =
      await this.predictionRepository.findActivePredictions();

    // Filter to directional predictions only (up/down, not flat)
    const directionalPredictions = activePredictions.filter(
      (p) => p.direction === 'up' || p.direction === 'down',
    );

    this.logger.log(
      `EOD positions: ${directionalPredictions.length} directional predictions out of ${activePredictions.length} active`,
    );

    // Get all open positions to check for duplicates
    const openPositions =
      await this.portfolioRepository.getOpenAnalystPositions();
    const openPositionSet = new Set(
      openPositions.map((p) => `${p.target_id}:${p.prediction_id || ''}`),
    );

    // Get personality analysts for portfolio lookup
    const analysts = await this.analystRepository.getPersonalityAnalysts();
    const analystsBySlug = new Map(analysts.map((a) => [a.slug, a]));
    const analystsById = new Map(analysts.map((a) => [a.analyst_id, a]));

    for (const prediction of directionalPredictions) {
      try {
        // Skip if a position already exists for this prediction
        if (openPositionSet.has(`${prediction.target_id}:${prediction.id}`)) {
          result.positionsSkipped++;
          continue;
        }

        // Get the target for this prediction
        const target = await this.targetRepository.findById(
          prediction.target_id,
        );
        if (!target) {
          result.errors.push(
            `Target not found for prediction ${prediction.id}`,
          );
          continue;
        }

        // Get latest price
        const snapshot = await this.targetSnapshotRepository.findLatest(
          prediction.target_id,
        );
        if (!snapshot) {
          result.errors.push(`No price snapshot for ${target.symbol}`);
          continue;
        }

        const entryPrice = snapshot.value;
        if (entryPrice <= 0) {
          result.errors.push(
            `Invalid entry price for ${target.symbol}: ${entryPrice}`,
          );
          continue;
        }

        // Find the analyst for this prediction
        const resolvedAnalyst = await this.resolveAnalystForPrediction(
          prediction,
          analystsBySlug,
          analystsById,
        );
        if (!resolvedAnalyst) {
          const handling =
            await this.handleUnresolvableAnalystPrediction(prediction);
          if (handling.autoCancelled) {
            result.positionsSkipped++;
            this.logger.warn(handling.message);
            continue;
          }
          result.errors.push(handling.message);
          continue;
        }
        const analyst = resolvedAnalyst.analyst;

        // Get fork info from the prediction's analyst_ensemble
        const ensemble = prediction.analyst_ensemble as {
          active_forks?: string[];
          arbitrator_fork?: { direction?: string; confidence?: number };
        } | null;
        const activeForks = ensemble?.active_forks || ['arbitrator'];

        // Create position for each active fork
        for (const forkType of activeForks) {
          const forkAssessment: AnalystAssessmentResult = {
            analyst: {
              ...analyst,
              effective_weight: analyst.default_weight,
              effective_tier: 'silver',
              learned_patterns: [],
              scope_level: 'target',
            } as AnalystAssessmentResult['analyst'],
            tier: 'silver' as never,
            direction: prediction.direction === 'up' ? 'bullish' : 'bearish',
            confidence: prediction.confidence,
            reasoning: prediction.reasoning,
            key_factors: [],
            risks: [],
            learnings_applied: [],
            fork_type: forkType as 'user' | 'ai' | 'arbitrator',
          };

          const posResult = await this.createPositionFromAssessment({
            assessment: forkAssessment,
            target,
            entryPrice,
            predictionId: prediction.id,
          });

          if (posResult) {
            result.positionsCreated++;
          } else {
            result.positionsSkipped++;
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(
          `Failed to create position for prediction ${prediction.id}: ${msg}`,
        );
        this.logger.error(
          `EOD position error for prediction ${prediction.id}: ${msg}`,
        );
      }
    }

    this.logger.log(
      `EOD positions complete: ${result.positionsCreated} created, ${result.positionsSkipped} skipped, ${result.errors.length} errors`,
    );

    return result;
  }
}
