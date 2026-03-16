import { Injectable, Logger } from '@nestjs/common';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { AnalystPositionService } from './analyst-position.service';
import { UserPositionService } from './user-position.service';

/**
 * Result of closing positions for a resolved prediction
 */
export interface PositionResolutionResult {
  predictionId: string;
  exitPrice: number;
  analystPositionsClosed: number;
  userPositionsClosed: number;
  totalAnalystPnl: number;
  totalUserPnl: number;
  errors: string[];
}

/**
 * Position Resolution Service
 *
 * Closes all open positions (analyst and user) when a prediction resolves.
 * This service is called by OutcomeTrackingRunner after resolving a prediction.
 *
 * Flow:
 * 1. OutcomeTrackingRunner resolves prediction with outcome value
 * 2. OutcomeTrackingRunner calls this service with prediction ID and exit price
 * 3. This service finds all open positions linked to the prediction
 * 4. Closes each position, calculating and recording P&L
 * 5. Returns summary of closed positions and P&L
 */
@Injectable()
export class PositionResolutionService {
  private readonly logger = new Logger(PositionResolutionService.name);

  constructor(
    private readonly portfolioRepository: PortfolioRepository,
    private readonly analystPositionService: AnalystPositionService,
    private readonly userPositionService: UserPositionService,
  ) {}

  /**
   * Close all positions linked to a resolved prediction
   *
   * @param predictionId - ID of the resolved prediction
   * @param exitPrice - The exit price (current price at resolution time)
   * @returns Summary of closed positions and P&L
   */
  async closePositionsForPrediction(
    predictionId: string,
    exitPrice: number,
  ): Promise<PositionResolutionResult> {
    const result: PositionResolutionResult = {
      predictionId,
      exitPrice,
      analystPositionsClosed: 0,
      userPositionsClosed: 0,
      totalAnalystPnl: 0,
      totalUserPnl: 0,
      errors: [],
    };

    this.logger.log(
      `Closing positions for prediction ${predictionId} at exit price $${exitPrice}`,
    );

    // Close analyst positions
    try {
      const analystPositions =
        await this.portfolioRepository.getOpenAnalystPositionsByPrediction(
          predictionId,
        );

      for (const position of analystPositions) {
        try {
          const { realizedPnl } =
            await this.analystPositionService.closePosition(
              position.id,
              exitPrice,
            );
          result.analystPositionsClosed++;
          result.totalAnalystPnl += realizedPnl;
        } catch (error) {
          const errorMsg = `Failed to close analyst position ${position.id}: ${error instanceof Error ? error.message : String(error)}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      if (analystPositions.length > 0) {
        this.logger.log(
          `Closed ${result.analystPositionsClosed}/${analystPositions.length} analyst positions, total P&L: $${result.totalAnalystPnl.toFixed(2)}`,
        );
      }
    } catch (error) {
      const errorMsg = `Failed to get analyst positions for prediction ${predictionId}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      result.errors.push(errorMsg);
    }

    // Close user positions
    try {
      const userPositions =
        await this.portfolioRepository.getOpenUserPositionsByPrediction(
          predictionId,
        );

      for (const position of userPositions) {
        try {
          const { realizedPnl } = await this.userPositionService.closePosition(
            position.id,
            exitPrice,
          );
          result.userPositionsClosed++;
          result.totalUserPnl += realizedPnl;
        } catch (error) {
          const errorMsg = `Failed to close user position ${position.id}: ${error instanceof Error ? error.message : String(error)}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      if (userPositions.length > 0) {
        this.logger.log(
          `Closed ${result.userPositionsClosed}/${userPositions.length} user positions, total P&L: $${result.totalUserPnl.toFixed(2)}`,
        );
      }
    } catch (error) {
      const errorMsg = `Failed to get user positions for prediction ${predictionId}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      result.errors.push(errorMsg);
    }

    // Log summary
    const totalPositions =
      result.analystPositionsClosed + result.userPositionsClosed;
    const totalPnl = result.totalAnalystPnl + result.totalUserPnl;

    if (totalPositions > 0) {
      this.logger.log(
        `Position resolution complete for prediction ${predictionId}: ${totalPositions} positions closed, total P&L: $${totalPnl.toFixed(2)}`,
      );
    } else {
      this.logger.debug(
        `No open positions found for prediction ${predictionId}`,
      );
    }

    return result;
  }
}
