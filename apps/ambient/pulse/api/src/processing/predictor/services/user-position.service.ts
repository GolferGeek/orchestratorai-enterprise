/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// Disabled unsafe rules due to Supabase RPC calls returning generic 'any' types
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { PredictionRepository } from '../repositories/prediction.repository';
import { TargetRepository } from '../repositories/target.repository';
import { TargetSnapshotRepository } from '../repositories/target-snapshot.repository';
import {
  UserPortfolio,
  UserPosition,
  PositionDirection,
} from '../interfaces/portfolio.interface';
import type { Prediction } from '../interfaces/prediction.interface';

/**
 * Input for creating a user position from a prediction
 */
export interface CreateUserPositionInput {
  userId: string;
  orgSlug: string;
  predictionId: string;
  quantity: number; // User's chosen quantity (may differ from recommended)
  entryPrice?: number; // Optional override, defaults to current price
}

/**
 * Result of position creation
 */
export interface UserPositionResult {
  position: UserPosition;
  portfolio: UserPortfolio;
  prediction: Prediction;
}

/**
 * Position size recommendation
 */
export interface PositionSizeRecommendation {
  recommendedQuantity: number;
  reasoning: string;
  riskAmount: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  potentialProfit: number;
  potentialLoss: number;
  riskRewardRatio: number;
}

/**
 * Service for managing user positions based on predictions
 * Handles position sizing recommendations and creation
 */
@Injectable()
export class UserPositionService {
  private readonly logger = new Logger(UserPositionService.name);

  // Default position sizing parameters
  private readonly DEFAULT_RISK_PERCENT = 0.02; // 2% risk per trade
  private readonly DEFAULT_STOP_DISTANCE_PERCENT = 0.05; // 5% stop loss
  private readonly MAX_POSITION_PERCENT = 0.1; // Max 10% of portfolio in one position
  private readonly CONFIDENCE_BASELINE = 0.7; // Confidence normalization baseline

  // Magnitude-based target distances
  private readonly MAGNITUDE_TARGETS: Record<string, number> = {
    small: 0.02, // 2% target
    medium: 0.05, // 5% target
    large: 0.1, // 10% target
  };

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly portfolioRepository: PortfolioRepository,
    private readonly predictionRepository: PredictionRepository,
    private readonly targetRepository: TargetRepository,
    private readonly targetSnapshotRepository: TargetSnapshotRepository,
  ) {}

  /**
   * Get or create user portfolio
   */
  async getOrCreatePortfolio(
    userId: string,
    orgSlug: string,
  ): Promise<UserPortfolio> {
    return this.portfolioRepository.getOrCreateUserPortfolio(userId, orgSlug);
  }

  /**
   * Calculate recommended position size for a prediction
   */
  async calculateRecommendedSize(
    predictionId: string,
    portfolioBalance: number,
    currentPrice: number,
  ): Promise<PositionSizeRecommendation> {
    const prediction = await this.predictionRepository.findById(predictionId);
    if (!prediction) {
      throw new Error(`Prediction not found: ${predictionId}`);
    }

    // Get target for magnitude info
    const target = await this.targetRepository.findById(prediction.target_id);
    if (!target) {
      throw new Error(`Target not found: ${prediction.target_id}`);
    }

    // Calculate risk amount
    const riskAmount = portfolioBalance * this.DEFAULT_RISK_PERCENT;

    // Calculate stop distance based on confidence (higher confidence = tighter stop)
    const stopDistancePercent =
      this.DEFAULT_STOP_DISTANCE_PERCENT * (1 - (prediction.confidence - 0.5));
    const stopDistance = currentPrice * stopDistancePercent;

    // Calculate stop price based on direction
    const stopPrice =
      prediction.direction === 'up'
        ? currentPrice - stopDistance
        : currentPrice + stopDistance;

    // Calculate target price based on magnitude
    const targetDistancePercent =
      this.MAGNITUDE_TARGETS[prediction.magnitude ?? 'medium'] ?? 0.05;
    const targetPrice =
      prediction.direction === 'up'
        ? currentPrice * (1 + targetDistancePercent)
        : currentPrice * (1 - targetDistancePercent);

    // Base quantity calculation from risk
    const riskBasedQuantity = riskAmount / stopDistance;

    // Apply confidence multiplier (normalized to 70% baseline)
    const confidenceMultiplier =
      prediction.confidence / this.CONFIDENCE_BASELINE;
    const adjustedQuantity = riskBasedQuantity * confidenceMultiplier;

    // Cap at max position size (10% of portfolio)
    const maxPositionValue = portfolioBalance * this.MAX_POSITION_PERCENT;
    const maxQuantityByPosition = maxPositionValue / currentPrice;

    // Final quantity is the minimum of risk-based and max-position limits
    const recommendedQuantity = Math.floor(
      Math.min(adjustedQuantity, maxQuantityByPosition),
    );

    // Calculate potential profit/loss
    const potentialLoss = stopDistance * recommendedQuantity;
    const potentialProfit =
      Math.abs(targetPrice - currentPrice) * recommendedQuantity;
    const riskRewardRatio = potentialProfit / potentialLoss;

    // Generate reasoning
    const reasoning = this.generateSizingReasoning(
      prediction,
      portfolioBalance,
      recommendedQuantity,
      riskAmount,
      riskRewardRatio,
    );

    return {
      recommendedQuantity,
      reasoning,
      riskAmount,
      entryPrice: currentPrice,
      stopPrice,
      targetPrice,
      potentialProfit,
      potentialLoss,
      riskRewardRatio,
    };
  }

  /**
   * Create a user position from a prediction
   */
  async createPositionFromPrediction(
    input: CreateUserPositionInput,
  ): Promise<UserPositionResult> {
    const { userId, orgSlug, predictionId, quantity, entryPrice } = input;

    // Get or create user portfolio
    const portfolio = await this.getOrCreatePortfolio(userId, orgSlug);

    // Get prediction
    const prediction = await this.predictionRepository.findById(predictionId);
    if (!prediction) {
      throw new Error(`Prediction not found: ${predictionId}`);
    }

    // Get target
    const target = await this.targetRepository.findById(prediction.target_id);
    if (!target) {
      throw new Error(`Target not found: ${prediction.target_id}`);
    }

    // Get current price if not provided
    let price = entryPrice;
    if (!price) {
      const snapshot = await this.targetSnapshotRepository.findLatest(
        prediction.target_id,
      );
      if (snapshot?.value) {
        price = snapshot.value;
      } else {
        throw new Error(
          `No entry price provided and no current price available for ${target.symbol}`,
        );
      }
    }

    // Determine position direction
    const direction: PositionDirection =
      prediction.direction === 'up' ? 'long' : 'short';

    // Create the position
    const position = await this.portfolioRepository.createUserPosition(
      portfolio.id,
      predictionId,
      prediction.target_id,
      target.symbol,
      direction,
      quantity,
      price,
    );

    this.logger.log(
      `Created user position: ${direction} ${quantity} ${target.symbol} @ $${price} for user ${userId}`,
    );

    return { position, portfolio, prediction };
  }

  /**
   * Get open positions for a user
   */
  async getOpenPositions(
    userId: string,
    orgSlug: string,
  ): Promise<UserPosition[]> {
    const portfolio = await this.portfolioRepository.getUserPortfolio(
      userId,
      orgSlug,
    );
    if (!portfolio) {
      return [];
    }
    return this.portfolioRepository.getOpenUserPositions(portfolio.id);
  }

  /**
   * Get portfolio summary for a user
   */
  async getPortfolioSummary(
    userId: string,
    orgSlug: string,
  ): Promise<{
    portfolio: UserPortfolio | null;
    openPositions: UserPosition[];
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
    winRate: number;
    totalTrades: number;
    wins: number;
    losses: number;
  }> {
    const portfolio = await this.portfolioRepository.getUserPortfolio(
      userId,
      orgSlug,
    );

    if (!portfolio) {
      return {
        portfolio: null,
        openPositions: [],
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
        winRate: 0,
        totalTrades: 0,
        wins: 0,
        losses: 0,
      };
    }

    const openPositions = await this.portfolioRepository.getOpenUserPositions(
      portfolio.id,
    );

    // Calculate total unrealized P&L
    const totalUnrealizedPnl = openPositions.reduce(
      (sum, pos) => sum + pos.unrealized_pnl,
      0,
    );

    // Get win/loss statistics from closed positions
    const stats = await this.portfolioRepository.getUserPortfolioStats(
      portfolio.id,
    );

    return {
      portfolio,
      openPositions,
      totalUnrealizedPnl,
      totalRealizedPnl: portfolio.total_realized_pnl,
      winRate: stats.winRate,
      totalTrades: stats.totalTrades,
      wins: stats.wins,
      losses: stats.losses,
    };
  }

  /**
   * Get closed positions for a user with statistics
   */
  async getClosedPositions(
    userId: string,
    orgSlug: string,
    options?: {
      startDate?: string;
      endDate?: string;
      symbol?: string;
      limit?: number;
    },
  ): Promise<{
    positions: UserPosition[];
    statistics: {
      totalClosed: number;
      wins: number;
      losses: number;
      totalPnl: number;
      avgPnl: number;
      winRate: number;
    };
  }> {
    const portfolio = await this.portfolioRepository.getUserPortfolio(
      userId,
      orgSlug,
    );

    if (!portfolio) {
      return {
        positions: [],
        statistics: {
          totalClosed: 0,
          wins: 0,
          losses: 0,
          totalPnl: 0,
          avgPnl: 0,
          winRate: 0,
        },
      };
    }

    const positions = await this.portfolioRepository.getClosedUserPositions(
      portfolio.id,
      options,
    );

    // Calculate statistics
    const wins = positions.filter((p) => (p.realized_pnl ?? 0) > 0).length;
    const losses = positions.filter((p) => (p.realized_pnl ?? 0) < 0).length;
    const totalPnl = positions.reduce(
      (sum, p) => sum + (p.realized_pnl ?? 0),
      0,
    );
    const totalClosed = positions.length;
    const avgPnl = totalClosed > 0 ? totalPnl / totalClosed : 0;
    const winRate = totalClosed > 0 ? wins / totalClosed : 0;

    return {
      positions,
      statistics: {
        totalClosed,
        wins,
        losses,
        totalPnl,
        avgPnl,
        winRate,
      },
    };
  }

  /**
   * Close a user position at the given price
   * Returns the realized P&L
   */
  async closePosition(
    positionId: string,
    exitPrice: number,
  ): Promise<{ realizedPnl: number; isWin: boolean }> {
    // Get the position first to calculate P&L
    const { data: positionData, error: fetchError } = await this.db
      .from('prediction', 'user_positions')
      .select('*')
      .eq('id', positionId)
      .eq('status', 'open')
      .single();

    if (fetchError || !positionData) {
      throw new Error(`Position ${positionId} not found or already closed`);
    }

    const position = positionData as Record<string, unknown>;

    // Calculate P&L
    const realizedPnl = this.portfolioRepository.calculatePnL(
      position.direction as PositionDirection,
      position.entry_price as number,
      exitPrice,
      position.quantity as number,
    );

    const isWin = realizedPnl > 0;

    // Close the position with calculated P&L
    await this.portfolioRepository.closeUserPosition(
      positionId,
      exitPrice,
      realizedPnl,
    );

    // Record the trade result in the portfolio
    await this.portfolioRepository.recordUserTradeResult(
      position.portfolio_id as string,
      realizedPnl,
    );

    this.logger.log(
      `Closed user position ${positionId}: ${position.direction as string} ${position.symbol as string}, P&L: $${realizedPnl.toFixed(2)} (${isWin ? 'WIN' : 'LOSS'})`,
    );

    return { realizedPnl, isWin };
  }

  /**
   * Generate human-readable reasoning for position sizing
   */
  private generateSizingReasoning(
    prediction: Prediction,
    portfolioBalance: number,
    recommendedQuantity: number,
    riskAmount: number,
    riskRewardRatio: number,
  ): string {
    const confidenceLabel =
      prediction.confidence >= 0.8
        ? 'high'
        : prediction.confidence >= 0.6
          ? 'moderate'
          : 'low';

    const magnitudeLabel = prediction.magnitude ?? 'medium';

    return (
      `Based on ${confidenceLabel} confidence (${(prediction.confidence * 100).toFixed(0)}%) ` +
      `and ${magnitudeLabel} expected move, risking $${riskAmount.toFixed(0)} ` +
      `(2% of $${portfolioBalance.toFixed(0)} portfolio). ` +
      `Position size of ${recommendedQuantity} units provides ${riskRewardRatio.toFixed(1)}:1 risk/reward ratio.`
    );
  }
}
