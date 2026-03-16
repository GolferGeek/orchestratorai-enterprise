import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';
import { TargetRepository } from '../repositories/target.repository';
import { UniverseRepository } from '../repositories/universe.repository';
import { PredictionGenerationService } from '../services/prediction-generation.service';
import { PredictorManagementService } from '../services/predictor-management.service';
import { StrategyService } from '../services/strategy.service';

/**
 * Batch Prediction Generator Runner - Phase 7, Step 7-3
 *
 * Evaluates predictor thresholds and generates predictions
 * when conditions are met.
 *
 * Schedule: Every 30 minutes
 *
 * Flow:
 * 1. Get all active targets
 * 2. For each target, evaluate predictor threshold
 * 3. If threshold met, generate prediction
 * 4. Apply strategy-specific settings
 */
@Injectable()
export class BatchPredictionGeneratorRunner {
  private readonly logger = new Logger(BatchPredictionGeneratorRunner.name);
  private isRunning = false;

  constructor(
    private readonly targetRepository: TargetRepository,
    private readonly universeRepository: UniverseRepository,
    private readonly predictionGenerationService: PredictionGenerationService,
    private readonly predictorManagementService: PredictorManagementService,
    private readonly strategyService: StrategyService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if batch prediction generation is disabled via master environment variable
   */
  private isDisabled(): boolean {
    return (
      this.configService.get<string>('DISABLE_SCHEDULED_PREDICTION') === 'true' ||
      this.configService.get<string>('DISABLE_PREDICTION_RUNNERS') === 'true'
    );
  }

  // EOD position creation moved to EodSettlementRunner (runs at 22:00 UTC)

  /**
   * Run batch prediction generation
   */
  async runBatchGeneration(): Promise<{
    targetsEvaluated: number;
    predictionsCreated: number;
    thresholdsNotMet: number;
    errors: number;
  }> {
    if (this.isRunning) {
      this.logger.warn('Skipping batch run - previous run still in progress');
      return {
        targetsEvaluated: 0,
        predictionsCreated: 0,
        thresholdsNotMet: 0,
        errors: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    this.logger.log('Starting batch prediction generation');

    let targetsEvaluated = 0;
    let predictionsCreated = 0;
    let thresholdsNotMet = 0;
    let errors = 0;

    try {
      // Get all universes
      const universes = await this.universeRepository.findAllActive();

      for (const universe of universes) {
        // Get applied strategy for this universe
        const appliedStrategy = await this.strategyService.getAppliedStrategy(
          universe.id,
        );

        // Get active targets
        const targets = await this.targetRepository.findActiveByUniverse(
          universe.id,
        );

        for (const target of targets) {
          try {
            targetsEvaluated++;

            // Get threshold config from applied strategy parameters
            const thresholdConfig = appliedStrategy
              ? {
                  min_predictors:
                    appliedStrategy.effective_parameters.min_predictors,
                  min_combined_strength:
                    appliedStrategy.effective_parameters.min_combined_strength,
                  min_direction_consensus:
                    appliedStrategy.effective_parameters
                      .min_direction_consensus,
                  predictor_ttl_hours:
                    appliedStrategy.effective_parameters.predictor_ttl_hours,
                }
              : undefined;

            // Check predictor threshold
            const thresholdResult =
              await this.predictorManagementService.evaluateThreshold(
                target.id,
                thresholdConfig,
              );

            if (!thresholdResult.meetsThreshold) {
              thresholdsNotMet++;
              this.logger.debug(
                `Threshold not met for ${target.symbol}: ` +
                  `${thresholdResult.activeCount} predictors, ` +
                  `strength=${thresholdResult.combinedStrength}, ` +
                  `consensus=${(thresholdResult.directionConsensus * 100).toFixed(0)}%`,
              );
              continue;
            }

            // Create execution context
            const ctx: ExecutionContext = {
              orgSlug: universe.organization_slug || 'system',
              userId: 'system',
              conversationId: NIL_UUID,
              taskId: uuidv4(),
              planId: NIL_UUID,
              deliverableId: NIL_UUID,
              agentSlug: 'batch-prediction-generator',
              agentType: 'context',
              provider: 'anthropic',
              model: 'claude-haiku-4-20250514',
            };

            // Generate prediction
            const prediction =
              await this.predictionGenerationService.attemptPredictionGeneration(
                ctx,
                target.id,
                thresholdConfig,
              );

            if (prediction) {
              predictionsCreated++;
              this.logger.log(
                `Created prediction ${prediction.id} for ${target.symbol}: ` +
                  `${prediction.direction} (confidence: ${(prediction.confidence * 100).toFixed(0)}%)`,
              );
            }
          } catch (error) {
            errors++;
            this.logger.error(
              `Error generating prediction for target ${target.id}: ` +
                `${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Batch prediction generation complete: ${targetsEvaluated} evaluated, ` +
          `${predictionsCreated} predictions created, ` +
          `${thresholdsNotMet} below threshold, ${errors} errors (${duration}ms)`,
      );

      return { targetsEvaluated, predictionsCreated, thresholdsNotMet, errors };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Evaluate a single predictor for immediate prediction generation.
   * Called by Pulse DB watcher when a new predictor is inserted.
   *
   * If the predictor's strength is >= HIGH_PRIORITY_THRESHOLD (8),
   * immediately trigger prediction generation for that target.
   * Otherwise, the predictor waits for the next batch cron run.
   */
  async evaluatePredictorForImmediatePrediction(predictorId: string): Promise<{
    evaluated: boolean;
    immediate: boolean;
    predictionId?: string;
    reason: string;
  }> {
    const HIGH_PRIORITY_THRESHOLD = 8; // strength 8+ out of 10 triggers immediate prediction

    try {
      // Import predictor repository to look up the predictor
      const predictor = await this.predictorManagementService.getPredictorById(predictorId);
      if (!predictor) {
        return { evaluated: false, immediate: false, reason: `Predictor not found: ${predictorId}` };
      }

      if (predictor.status !== 'active') {
        return { evaluated: true, immediate: false, reason: `Predictor status is ${predictor.status}, not active` };
      }

      this.logger.log(
        `Evaluating predictor ${predictorId} for immediate prediction: ` +
          `strength=${predictor.strength}, direction=${predictor.direction}, target=${predictor.target_id}`,
      );

      if (predictor.strength < HIGH_PRIORITY_THRESHOLD) {
        return {
          evaluated: true,
          immediate: false,
          reason: `Strength ${predictor.strength} below threshold ${HIGH_PRIORITY_THRESHOLD} — will be picked up by batch cron`,
        };
      }

      // High priority — trigger immediate prediction for this target
      this.logger.log(
        `High-priority predictor detected (strength=${predictor.strength}) — triggering immediate prediction for target ${predictor.target_id}`,
      );

      const result = await this.generateForTargetManually(predictor.target_id);
      return {
        evaluated: true,
        immediate: true,
        predictionId: result.predictionId,
        reason: result.success
          ? `Immediate prediction created: ${result.predictionId}`
          : `Threshold not met for target despite high-priority predictor: ${result.error}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to evaluate predictor ${predictorId}: ${message}`);
      return { evaluated: false, immediate: false, reason: message };
    }
  }

  /**
   * Manually trigger prediction generation for a specific target
   */
  async generateForTargetManually(targetId: string): Promise<{
    success: boolean;
    predictionId?: string;
    error?: string;
  }> {
    try {
      const target = await this.targetRepository.findByIdOrThrow(targetId);

      const ctx: ExecutionContext = {
        orgSlug: 'system',
        userId: 'system',
        conversationId: NIL_UUID,
        taskId: uuidv4(),
        planId: NIL_UUID,
        deliverableId: NIL_UUID,
        agentSlug: 'manual-prediction-generator',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-haiku-4-20250514',
      };

      const prediction =
        await this.predictionGenerationService.attemptPredictionGeneration(
          ctx,
          target.id,
        );

      if (prediction) {
        return { success: true, predictionId: prediction.id };
      }

      return { success: false, error: 'Threshold not met' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get predictor stats for a target (useful for debugging)
   */
  async getTargetStats(targetId: string): Promise<{
    activeCount: number;
    totalStrength: number;
    avgConfidence: number;
    byDirection: Record<string, number>;
    meetsThreshold: boolean;
  }> {
    const stats =
      await this.predictorManagementService.getPredictorStats(targetId);
    const thresholdResult =
      await this.predictorManagementService.evaluateThreshold(targetId);

    return {
      ...stats,
      meetsThreshold: thresholdResult.meetsThreshold,
    };
  }
}
