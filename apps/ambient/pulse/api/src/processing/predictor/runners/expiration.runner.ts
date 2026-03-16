import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PredictorRepository } from '../repositories/predictor.repository';
import { TargetRepository } from '../repositories/target.repository';
import { UniverseRepository } from '../repositories/universe.repository';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import { NIL_UUID } from '@orchestrator-ai/transport-types';

/**
 * Expiration Runner - Manages predictor lifecycle
 *
 * Handles lifecycle expiration for predictors to maintain system health
 * and prevent data staleness.
 *
 * NOTE: Signal expiration has been removed. The system now creates
 * predictors directly from articles, bypassing signals entirely.
 *
 * Schedule: Every hour (via @Cron decorator)
 *
 * What this runner does:
 * 1. Expires stale predictors that are past their TTL (expires_at timestamp)
 * 2. Emits observability events when expirations occur
 *
 * Why expiration is needed:
 * - Predictors have a time-to-live based on their time_window
 * - Expiration keeps the system clean and prevents acting on outdated predictions
 */
@Injectable()
export class ExpirationRunner {
  private readonly logger = new Logger(ExpirationRunner.name);
  private isRunning = false;

  constructor(
    private readonly predictorRepository: PredictorRepository,
    private readonly targetRepository: TargetRepository,
    private readonly universeRepository: UniverseRepository,
    private readonly observabilityEvents: ObservabilityEventsService,
    private readonly configService: ConfigService,
  ) {}

  private isDisabled(): boolean {
    return (
      this.configService.get<string>('DISABLE_SCHEDULED_PREDICTION') === 'true' ||
      this.configService.get<string>('DISABLE_PREDICTION_RUNNERS') === 'true'
    );
  }

  /**
   * Run expiration batch
   */
  async runExpirationBatch(): Promise<{
    predictorsExpired: number;
    errors: number;
  }> {
    if (this.isRunning) {
      this.logger.warn(
        'Skipping expiration run - previous run still in progress',
      );
      return {
        predictorsExpired: 0,
        errors: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    this.logger.log('Starting expiration batch');

    let predictorsExpired = 0;
    let errors = 0;

    try {
      // Expire predictors
      const predictorResult = await this.expirePredictors();
      predictorsExpired = predictorResult.expired;
      errors += predictorResult.errors;

      const duration = Date.now() - startTime;
      this.logger.log(
        `Expiration batch complete: ${predictorsExpired} predictors expired (${duration}ms)`,
      );

      // Emit observability event for monitoring
      await this.observabilityEvents.push({
        context: {
          orgSlug: 'system',
          userId: 'prediction-runner',
          conversationId: `expiration-${Date.now()}`,
          agentSlug: 'prediction-runner',
          agentType: 'system',
          provider: NIL_UUID,
          model: NIL_UUID,
        },
        source_app: 'prediction-runner',
        hook_event_type: 'prediction.expired',
        status: 'completed',
        message: `${predictorsExpired} predictors expired`,
        progress: 100,
        step: 'expiration',
        payload: {
          predictorsExpired,
          errors,
          durationMs: duration,
        },
        timestamp: Date.now(),
      });

      return { predictorsExpired, errors };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Expire predictors past their TTL
   */
  private async expirePredictors(): Promise<{
    expired: number;
    errors: number;
  }> {
    let expired = 0;
    let errors = 0;

    try {
      // Get all universes
      const universes = await this.universeRepository.findAllActive();

      for (const universe of universes) {
        // Get active targets
        const targets = await this.targetRepository.findActiveByUniverse(
          universe.id,
        );

        for (const target of targets) {
          try {
            // This method expires predictors past their expires_at time
            const expiredCount =
              await this.predictorRepository.expireOldPredictors(target.id);

            if (expiredCount > 0) {
              expired += expiredCount;
              this.logger.debug(
                `Expired ${expiredCount} predictors for target ${target.symbol}`,
              );
            }
          } catch (error) {
            errors++;
            this.logger.error(
              `Failed to expire predictors for target ${target.id}: ` +
                `${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        }
      }
    } catch (error) {
      errors++;
      this.logger.error(
        `Failed to expire predictors: ` +
          `${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return { expired, errors };
  }

  /**
   * Manually trigger expiration for a specific target
   */
  async expireForTargetManually(targetId: string): Promise<{
    predictorsExpired: number;
    error?: string;
  }> {
    try {
      // Expire predictors
      const predictorsExpired =
        await this.predictorRepository.expireOldPredictors(targetId);

      return { predictorsExpired };
    } catch (error) {
      return {
        predictorsExpired: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get expiration statistics
   */
  getExpirationStats(): {
    pendingPredictors: number;
    expiringWithin1Hour: number;
  } {
    // This would query the database for stats
    // For now, return placeholder
    return {
      pendingPredictors: 0,
      expiringWithin1Hour: 0,
    };
  }
}
