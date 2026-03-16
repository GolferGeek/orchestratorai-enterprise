import { Injectable, Logger } from '@nestjs/common';
import { PredictionRepository } from '../repositories/prediction.repository';
import { Prediction } from '../interfaces/prediction.interface';

/**
 * Service for tracking prediction outcomes and resolution
 *
 * Tier 4: Outcome Tracking
 * - Captures actual outcomes for predictions
 * - Resolves predictions with outcome values
 * - Manages prediction expiration
 * - Tracks pending resolution predictions
 */
@Injectable()
export class OutcomeTrackingService {
  private readonly logger = new Logger(OutcomeTrackingService.name);

  constructor(private readonly predictionRepository: PredictionRepository) {}

  /**
   * Capture outcome value for a prediction without changing status
   * Useful for recording outcomes before formal resolution
   *
   * @param predictionId - ID of the prediction
   * @param value - The actual outcome value
   * @param capturedAt - Optional timestamp (defaults to now)
   * @returns Updated prediction
   */
  async captureOutcome(
    predictionId: string,
    value: number,
    capturedAt?: Date,
  ): Promise<Prediction> {
    this.logger.log(
      `Capturing outcome for prediction ${predictionId}: ${value}`,
    );

    const timestamp = capturedAt || new Date();

    return this.predictionRepository.update(predictionId, {
      outcome_value: value,
      outcome_captured_at: timestamp.toISOString(),
    });
  }

  /**
   * Resolve a prediction with actual outcome
   * Sets outcome value, capture timestamp, and changes status to 'resolved'
   *
   * @param predictionId - ID of the prediction to resolve
   * @param outcomeValue - The actual outcome value
   * @returns Resolved prediction
   */
  async resolvePrediction(
    predictionId: string,
    outcomeValue: number,
  ): Promise<Prediction> {
    this.logger.log(
      `Resolving prediction ${predictionId} with outcome: ${outcomeValue}`,
    );

    return this.predictionRepository.resolve(predictionId, outcomeValue);
  }

  /**
   * Expire predictions that are past their timeframe
   * Finds all active predictions where expires_at is in the past
   * and updates their status to 'expired'
   *
   * @returns Array of expired predictions
   */
  async expirePredictions(): Promise<Prediction[]> {
    this.logger.log('Checking for predictions to expire');

    const expiredPredictions =
      await this.predictionRepository.expirePastDueActivePredictions();

    if (expiredPredictions.length === 0) {
      this.logger.debug('No predictions to expire');
      return [];
    }

    this.logger.log(`Expired ${expiredPredictions.length} predictions`);

    return expiredPredictions;
  }

  /**
   * Get all predictions that need outcome capture
   * Returns active predictions past their expires_at time
   *
   * @returns Array of predictions pending resolution
   */
  async getPendingResolutionPredictions(): Promise<Prediction[]> {
    this.logger.debug('Fetching predictions pending resolution');

    const predictions = await this.predictionRepository.findPendingResolution();

    this.logger.debug(
      `Found ${predictions.length} predictions pending resolution`,
    );

    return predictions;
  }
}
