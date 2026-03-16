import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PredictionRepository } from '../repositories/prediction.repository';
import { TargetSnapshotRepository } from '../repositories/target-snapshot.repository';
import { TargetRepository } from '../repositories/target.repository';
import { OutcomeTrackingService } from '../services/outcome-tracking.service';
import { TargetSnapshotService } from '../services/target-snapshot.service';
import { Prediction } from '../interfaces/prediction.interface';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import { NIL_UUID } from '@orchestrator-ai/transport-types';

/**
 * Outcome Tracking Runner - Phase 7, Step 7-4
 *
 * Captures target value snapshots, resolves predictions, and checks expirations.
 * This is the central runner for tracking prediction outcomes.
 *
 * Schedule: Every 15 minutes (via @Cron decorator)
 *
 * Data sources:
 * - target_snapshots table: Price/value data captured at regular intervals
 * - predictions table: Active predictions being tracked
 *
 * What this runner does:
 * 1. Capture current prices/values for targets with active predictions (stored in target_snapshots)
 * 2. Resolve predictions that have reached their timeframe end
 * 3. Expire predictions past their expiration time
 * 4. Emit observability events for monitoring
 *
 * Integration with evaluation:
 * - When a prediction is resolved (via OutcomeTrackingService.resolvePrediction()):
 *   - The prediction status changes to 'resolved'
 *   - The outcome_value field is populated with the percentage change
 * - The EvaluationRunner (runs hourly) then:
 *   - Queries for resolved predictions without evaluations
 *   - Creates evaluation records for each resolved prediction
 * - This is a database-state-based integration, not a direct function call
 *
 * Complete pipeline flow:
 * 1. OutcomeTrackingRunner.captureSnapshots() - Captures price data every 15 min
 * 2. OutcomeTrackingRunner.resolvePendingPredictions() - Resolves predictions when timeframe ends
 * 3. EvaluationRunner (hourly) - Evaluates resolved predictions
 * 4. MissedOpportunityScanner (hourly) - Detects significant moves without predictions
 */
@Injectable()
export class OutcomeTrackingRunner {
  private readonly logger = new Logger(OutcomeTrackingRunner.name);
  private isRunning = false;

  constructor(
    private readonly predictionRepository: PredictionRepository,
    private readonly targetSnapshotRepository: TargetSnapshotRepository,
    private readonly targetRepository: TargetRepository,
    private readonly outcomeTrackingService: OutcomeTrackingService,
    private readonly targetSnapshotService: TargetSnapshotService,
    private readonly observabilityEvents: ObservabilityEventsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if outcome tracking is disabled via master environment variable
   */
  private isDisabled(): boolean {
    return (
      this.configService.get<string>('DISABLE_SCHEDULED_PREDICTION') === 'true' ||
      this.configService.get<string>('DISABLE_PREDICTION_RUNNERS') === 'true'
    );
  }

  /**
   * Run outcome tracking
   */
  async runOutcomeTracking(): Promise<{
    snapshotsCaptured: number;
    predictionsResolved: number;
    predictionsExpired: number;
    errors: number;
  }> {
    if (this.isRunning) {
      this.logger.warn(
        'Skipping outcome tracking - previous run still in progress',
      );
      return {
        snapshotsCaptured: 0,
        predictionsResolved: 0,
        predictionsExpired: 0,
        errors: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    this.logger.log('Starting outcome tracking');

    let snapshotsCaptured = 0;
    let predictionsResolved = 0;
    let predictionsExpired = 0;
    let errors = 0;

    try {
      // Step 1: Capture price snapshots for active predictions
      const snapshotsResult = await this.captureSnapshots();
      snapshotsCaptured = snapshotsResult.captured;
      errors += snapshotsResult.errors;

      // Step 2: Resolve predictions that have reached their timeframe
      const resolveResult = await this.resolvePendingPredictions();
      predictionsResolved = resolveResult.resolved;
      errors += resolveResult.errors;

      // Step 3: Expire predictions past their expiration
      const expireResult = await this.expireOldPredictions();
      predictionsExpired = expireResult.expired;
      errors += expireResult.errors;

      const duration = Date.now() - startTime;
      this.logger.log(
        `Outcome tracking complete: ${snapshotsCaptured} snapshots, ` +
          `${predictionsResolved} resolved, ${predictionsExpired} expired, ` +
          `${errors} errors (${duration}ms)`,
      );

      // Emit observability event for snapshot capture
      if (snapshotsCaptured > 0) {
        await this.observabilityEvents.push({
          context: {
            orgSlug: 'system',
            userId: 'prediction-runner',
            conversationId: `outcome-tracking-${Date.now()}`,
            agentSlug: 'prediction-runner',
            agentType: 'system',
            provider: NIL_UUID,
            model: NIL_UUID,
          },
          source_app: 'prediction-runner',
          hook_event_type: 'prediction.snapshot',
          status: 'completed',
          message: `Captured ${snapshotsCaptured} price snapshots`,
          progress: 100,
          step: 'snapshot-capture',
          payload: {
            snapshotsCaptured,
            errors,
            durationMs: duration,
          },
          timestamp: Date.now(),
        });
      }

      // Emit observability event for resolved predictions
      if (predictionsResolved > 0) {
        await this.observabilityEvents.push({
          context: {
            orgSlug: 'system',
            userId: 'prediction-runner',
            conversationId: `outcome-tracking-${Date.now()}`,
            agentSlug: 'prediction-runner',
            agentType: 'system',
            provider: NIL_UUID,
            model: NIL_UUID,
          },
          source_app: 'prediction-runner',
          hook_event_type: 'prediction.resolved',
          status: 'completed',
          message: `Resolved ${predictionsResolved} predictions`,
          progress: 100,
          step: 'prediction-resolution',
          payload: {
            predictionsResolved,
            predictionsExpired,
            errors,
            durationMs: duration,
          },
          timestamp: Date.now(),
        });
      }

      return {
        snapshotsCaptured,
        predictionsResolved,
        predictionsExpired,
        errors,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Capture current price snapshots for all active targets
   * This ensures we have prices for:
   * 1. Targets with active predictions (for outcome tracking)
   * 2. Targets with open positions (for P&L calculation)
   * 3. All active targets (so users can take new positions)
   */
  private async captureSnapshots(): Promise<{
    captured: number;
    errors: number;
  }> {
    let captured = 0;
    let errors = 0;

    try {
      // Get ALL active targets, not just those with predictions
      const activeTargets = await this.targetRepository.findAllActive();
      const targetIds = activeTargets.map((t) => t.id);

      this.logger.debug(
        `Capturing snapshots for ${targetIds.length} active targets`,
      );

      for (let i = 0; i < targetIds.length; i++) {
        const targetId = targetIds[i]!;
        try {
          await this.targetSnapshotService.fetchAndCaptureValue(targetId);
          captured++;

          // Rate limiting: wait 15 seconds between API calls to avoid Polygon 429 errors
          if (i < targetIds.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 15000));
          }
        } catch (error) {
          errors++;
          this.logger.error(
            `Failed to capture snapshot for target ${targetId}: ` +
              `${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    } catch (error) {
      errors++;
      this.logger.error(
        `Failed to capture snapshots: ` +
          `${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return { captured, errors };
  }

  /**
   * Resolve predictions that have reached their timeframe end
   * Position closing is handled by the EodSettlementRunner at end-of-day
   */
  private async resolvePendingPredictions(): Promise<{
    resolved: number;
    errors: number;
  }> {
    let resolved = 0;
    let errors = 0;

    try {
      // Get predictions pending resolution
      const pendingPredictions =
        await this.outcomeTrackingService.getPendingResolutionPredictions();

      this.logger.debug(
        `Found ${pendingPredictions.length} predictions pending resolution`,
      );

      for (const prediction of pendingPredictions) {
        try {
          // Get the outcome value from latest snapshot
          const { outcomeValue } =
            await this.calculateOutcomeAndExitPrice(prediction);

          if (outcomeValue !== null) {
            // Resolve the prediction (position closing deferred to EOD settlement)
            await this.outcomeTrackingService.resolvePrediction(
              prediction.id,
              outcomeValue,
            );
            resolved++;
            this.logger.debug(
              `Resolved prediction ${prediction.id} with outcome ${outcomeValue}%`,
            );
          }
        } catch (error) {
          errors++;
          this.logger.error(
            `Failed to resolve prediction ${prediction.id}: ` +
              `${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    } catch (error) {
      errors++;
      this.logger.error(
        `Failed to resolve predictions: ` +
          `${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return { resolved, errors };
  }

  /**
   * Expire predictions that are past their expiration time
   */
  private async expireOldPredictions(): Promise<{
    expired: number;
    errors: number;
  }> {
    let expired = 0;
    let errors = 0;

    try {
      const expiredPredictions =
        await this.outcomeTrackingService.expirePredictions();
      expired = expiredPredictions.length;
    } catch (error) {
      errors++;
      this.logger.error(
        `Failed to expire predictions: ` +
          `${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return { expired, errors };
  }

  /**
   * Calculate the outcome value and exit price for a prediction
   * Returns percentage change from prediction time to current, and the exit price
   * Uses target.current_price for exit price (updated when snapshots are captured)
   */
  private async calculateOutcomeAndExitPrice(
    prediction: Prediction,
  ): Promise<{ outcomeValue: number | null; exitPrice: number | null }> {
    try {
      // Get snapshot at prediction time (for start value)
      const predictionSnapshot =
        await this.targetSnapshotRepository.findClosestToTime(
          prediction.target_id,
          new Date(prediction.predicted_at),
        );

      // Get current price from target (cached, no snapshot query needed)
      const target = await this.targetRepository.findById(prediction.target_id);
      const currentPrice = target?.current_price;

      // Fall back to snapshot query if target.current_price not set
      let endValue: number | null = currentPrice ?? null;
      if (endValue === null) {
        const latestSnapshot = await this.targetSnapshotRepository.findLatest(
          prediction.target_id,
        );
        endValue = latestSnapshot?.value ?? null;
      }

      if (!predictionSnapshot || endValue === null) {
        this.logger.debug(
          `Missing price data for prediction ${prediction.id} - cannot calculate outcome`,
        );
        return { outcomeValue: null, exitPrice: null };
      }

      // Calculate percentage change
      const startValue = predictionSnapshot.value;

      if (startValue === 0) {
        return { outcomeValue: null, exitPrice: null };
      }

      const percentageChange = ((endValue - startValue) / startValue) * 100;
      const outcomeValue = Math.round(percentageChange * 100) / 100; // Round to 2 decimals

      return { outcomeValue, exitPrice: endValue };
    } catch (error) {
      this.logger.error(
        `Failed to calculate outcome for prediction ${prediction.id}: ` +
          `${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { outcomeValue: null, exitPrice: null };
    }
  }

  /**
   * Calculate the outcome value for a prediction (legacy method)
   * Returns percentage change from prediction time to current
   */
  private async calculateOutcomeValue(
    prediction: Prediction,
  ): Promise<number | null> {
    const { outcomeValue } =
      await this.calculateOutcomeAndExitPrice(prediction);
    return outcomeValue;
  }

  /**
   * Manually capture outcome for a specific prediction
   */
  async captureOutcomeManually(
    predictionId: string,
    outcomeValue: number,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.outcomeTrackingService.captureOutcome(
        predictionId,
        outcomeValue,
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Manually resolve a specific prediction
   */
  async resolveManually(
    predictionId: string,
    outcomeValue: number,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.outcomeTrackingService.resolvePrediction(
        predictionId,
        outcomeValue,
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
