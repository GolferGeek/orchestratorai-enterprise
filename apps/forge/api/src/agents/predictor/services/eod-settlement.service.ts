import { Injectable, Logger } from '@nestjs/common';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { PredictionRepository } from '../repositories/prediction.repository';
import { TargetSnapshotRepository } from '../repositories/target-snapshot.repository';
import { TargetRepository } from '../repositories/target.repository';
import { UserPositionService } from './user-position.service';
import { AnalystPositionService } from './analyst-position.service';
import { PositionResolutionService } from './position-resolution.service';
import { OutcomeTrackingService } from './outcome-tracking.service';
import { TargetSnapshotService } from './target-snapshot.service';
import type {
  AnalystPosition,
  UserPosition,
} from '../interfaces/portfolio.interface';

/**
 * EOD Settlement Service
 *
 * Orchestrates all end-of-day trading activities in a single sequential process:
 * 1. Execute queued user trades at closing price
 * 2. Create analyst positions for active directional predictions
 * 3. Resolve expired predictions and close their positions
 * 4. Update unrealized P&L for all remaining open positions
 *
 * Called by EodSettlementRunner at 22:00 UTC (5 PM ET) Mon-Fri.
 */
@Injectable()
export class EodSettlementService {
  private readonly logger = new Logger(EodSettlementService.name);

  constructor(
    private readonly portfolioRepository: PortfolioRepository,
    private readonly predictionRepository: PredictionRepository,
    private readonly targetSnapshotRepository: TargetSnapshotRepository,
    private readonly targetRepository: TargetRepository,
    private readonly userPositionService: UserPositionService,
    private readonly analystPositionService: AnalystPositionService,
    private readonly positionResolutionService: PositionResolutionService,
    private readonly outcomeTrackingService: OutcomeTrackingService,
    private readonly targetSnapshotService: TargetSnapshotService,
  ) {}

  /**
   * Step 1: Execute all queued user trades
   * Creates user_positions from pending queue entries at the current closing price
   */
  async executeQueuedTrades(): Promise<{
    executed: number;
    errors: string[];
  }> {
    let executed = 0;
    const errors: string[] = [];

    const queuedTrades = await this.portfolioRepository.getAllQueuedTrades();
    this.logger.log(`Found ${queuedTrades.length} queued trades to execute`);

    for (const trade of queuedTrades) {
      try {
        // Get the closing price from the latest snapshot
        const latestSnapshot = await this.targetSnapshotRepository.findLatest(
          trade.target_id,
        );

        if (!latestSnapshot) {
          const msg = `No price snapshot for target ${trade.target_id} (${trade.symbol}) - cannot execute trade ${trade.id}`;
          this.logger.error(msg);
          errors.push(msg);
          continue;
        }

        const closingPrice = latestSnapshot.value;

        // Create the user position at closing price
        const result =
          await this.userPositionService.createPositionFromPrediction({
            userId: trade.user_id,
            orgSlug: trade.org_slug,
            predictionId: trade.prediction_id,
            quantity: trade.quantity,
            entryPrice: closingPrice,
          });

        // Mark queue entry as executed
        await this.portfolioRepository.markTradeExecuted(
          trade.id,
          result.position.id,
          closingPrice,
        );

        executed++;
        this.logger.log(
          `Executed queued trade: ${trade.symbol} ${trade.direction} x${trade.quantity} @ $${closingPrice}`,
        );
      } catch (error) {
        const msg = `Failed to execute queued trade ${trade.id} (${trade.symbol}): ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(msg);
        errors.push(msg);
      }
    }

    return { executed, errors };
  }

  /**
   * Step 2: Create analyst positions for active directional predictions
   * Delegates to existing AnalystPositionService.createEndOfDayPositions()
   */
  async createAnalystPositions(): Promise<{
    positionsCreated: number;
    positionsSkipped: number;
    errors: string[];
  }> {
    return this.analystPositionService.createEndOfDayPositions();
  }

  /**
   * Step 3: Resolve expired predictions and close their positions
   * Finds predictions past their expires_at, resolves them, and closes all linked positions
   */
  async resolveAndClosePositions(): Promise<{
    predictionsResolved: number;
    positionsClosed: number;
    totalPnl: number;
    errors: string[];
  }> {
    let predictionsResolved = 0;
    let positionsClosed = 0;
    let totalPnl = 0;
    const errors: string[] = [];

    const pendingPredictions =
      await this.outcomeTrackingService.getPendingResolutionPredictions();
    this.logger.log(
      `Found ${pendingPredictions.length} predictions pending resolution`,
    );

    for (const prediction of pendingPredictions) {
      try {
        // Get the snapshot at prediction time for outcome calculation
        const predictionSnapshot =
          await this.targetSnapshotRepository.findClosestToTime(
            prediction.target_id,
            new Date(prediction.predicted_at),
          );

        // Get exit price from target's current price or latest snapshot
        const target = await this.targetRepository.findById(
          prediction.target_id,
        );
        let exitPrice: number | null = target?.current_price ?? null;
        if (exitPrice === null) {
          const latestSnapshot = await this.targetSnapshotRepository.findLatest(
            prediction.target_id,
          );
          exitPrice = latestSnapshot?.value ?? null;
        }

        if (!predictionSnapshot || exitPrice === null) {
          const msg = `Missing price data for prediction ${prediction.id} - cannot resolve`;
          this.logger.error(msg);
          errors.push(msg);
          continue;
        }

        // Calculate outcome value (percentage change)
        const startValue = predictionSnapshot.value;
        const percentageChange = ((exitPrice - startValue) / startValue) * 100;
        const outcomeValue = Math.round(percentageChange * 100) / 100;

        // Resolve the prediction
        await this.outcomeTrackingService.resolvePrediction(
          prediction.id,
          outcomeValue,
        );
        predictionsResolved++;

        // Close all positions linked to this prediction
        const resolutionResult =
          await this.positionResolutionService.closePositionsForPrediction(
            prediction.id,
            exitPrice,
          );
        positionsClosed +=
          resolutionResult.analystPositionsClosed +
          resolutionResult.userPositionsClosed;
        totalPnl +=
          resolutionResult.totalAnalystPnl + resolutionResult.totalUserPnl;
      } catch (error) {
        const msg = `Failed to resolve prediction ${prediction.id}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(msg);
        errors.push(msg);
      }
    }

    // Also expire old predictions (past max expiration time)
    try {
      await this.outcomeTrackingService.expirePredictions();
    } catch (error) {
      const msg = `Failed to expire predictions: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(msg);
      errors.push(msg);
    }

    return { predictionsResolved, positionsClosed, totalPnl, errors };
  }

  /**
   * Step 4: Update unrealized P&L for all open positions
   * Gets the latest price for each target and recalculates unrealized P&L
   */
  async updateUnrealizedPnl(): Promise<{
    positionsUpdated: number;
    errors: string[];
  }> {
    let positionsUpdated = 0;
    const errors: string[] = [];

    // Get all open positions (analyst + user)
    const openAnalystPositions =
      await this.portfolioRepository.getOpenAnalystPositions();
    const openUserPositions =
      await this.portfolioRepository.getAllOpenUserPositions();

    // Group by target_id for efficient price lookups
    const positionsByTarget = new Map<
      string,
      { analyst: AnalystPosition[]; user: UserPosition[] }
    >();

    for (const pos of openAnalystPositions) {
      const existing = positionsByTarget.get(pos.target_id) ?? {
        analyst: [],
        user: [],
      };
      existing.analyst.push(pos);
      positionsByTarget.set(pos.target_id, existing);
    }

    for (const pos of openUserPositions) {
      const existing = positionsByTarget.get(pos.target_id) ?? {
        analyst: [],
        user: [],
      };
      existing.user.push(pos);
      positionsByTarget.set(pos.target_id, existing);
    }

    // Update each target's positions
    for (const [targetId, positions] of positionsByTarget) {
      try {
        // Get latest price
        const latestSnapshot =
          await this.targetSnapshotRepository.findLatest(targetId);
        if (!latestSnapshot) {
          continue; // No price data yet, skip
        }

        const currentPrice = latestSnapshot.value;

        // Update analyst positions
        for (const pos of positions.analyst) {
          const pnl = this.portfolioRepository.calculatePnL(
            pos.direction,
            pos.entry_price,
            currentPrice,
            pos.quantity,
          );
          await this.portfolioRepository.updateAnalystPositionPrice(
            pos.id,
            currentPrice,
            pnl,
          );
          positionsUpdated++;
        }

        // Update user positions
        for (const pos of positions.user) {
          const pnl = this.portfolioRepository.calculatePnL(
            pos.direction,
            pos.entry_price,
            currentPrice,
            pos.quantity,
          );
          await this.portfolioRepository.updateUserPositionPrice(
            pos.id,
            currentPrice,
            pnl,
          );
          positionsUpdated++;
        }
      } catch (error) {
        const msg = `Failed to update P&L for target ${targetId}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(msg);
        errors.push(msg);
      }
    }

    return { positionsUpdated, errors };
  }

  /**
   * Write settlement log entry
   */
  async logSettlement(
    date: Date,
    results: {
      queuedTradesExecuted: number;
      analystPositionsCreated: number;
      predictionsResolved: number;
      positionsClosed: number;
      unrealizedPnlUpdated: number;
      totalRealizedPnl: number;
      errors: string[];
      startedAt: string;
      durationMs: number;
    },
  ): Promise<void> {
    await this.portfolioRepository.createSettlementLog({
      settlement_date: date.toISOString().split('T')[0]!,
      queued_trades_executed: results.queuedTradesExecuted,
      analyst_positions_created: results.analystPositionsCreated,
      predictions_resolved: results.predictionsResolved,
      positions_closed: results.positionsClosed,
      unrealized_pnl_updated: results.unrealizedPnlUpdated,
      total_realized_pnl: results.totalRealizedPnl,
      errors: results.errors,
      started_at: results.startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: results.durationMs,
    });
  }
}
