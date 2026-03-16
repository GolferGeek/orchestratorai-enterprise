import { Injectable, Logger } from '@nestjs/common';
import { PredictorRepository } from '../repositories/predictor.repository';
import { TargetRepository } from '../repositories/target.repository';
import {
  Predictor,
  PredictorDirection,
} from '../interfaces/predictor.interface';
import {
  ThresholdConfig,
  ThresholdEvaluationResult,
  DEFAULT_THRESHOLD_CONFIG,
} from '../interfaces/threshold-evaluation.interface';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { createSystemTriggeredContext } from '../../../automation-context/automation-context';

/**
 * Tier 2: Predictor Management Service
 *
 * Manages the predictor pool for each target:
 * - Tracks active predictors
 * - Evaluates threshold conditions
 * - Determines when to create predictions
 * - Manages predictor lifecycle (active -> consumed/expired)
 *
 * Threshold evaluation determines:
 * - Do we have enough predictors?
 * - Is the combined strength sufficient?
 * - Is there enough directional consensus?
 */
@Injectable()
export class PredictorManagementService {
  private readonly logger = new Logger(PredictorManagementService.name);

  constructor(
    private readonly predictorRepository: PredictorRepository,
    private readonly targetRepository: TargetRepository,
    private readonly observabilityEventsService: ObservabilityEventsService,
  ) {}

  /**
   * Create execution context for observability events
   */
  private createObservabilityContext(_targetId: string): ExecutionContext {
    return createSystemTriggeredContext({
      orgSlug: 'system',
      agentSlug: 'predictor-management',
      provider: 'none',
      model: 'none',
    });
  }

  /**
   * Calculate time-decay weight for a predictor
   * Uses exponential decay: weight = exp(-decayRate * hoursOld)
   * This gives newer predictors more influence than older ones
   *
   * @param createdAt - When the predictor was created
   * @param decayRate - Decay rate (0.05 gives ~50% weight at 14 hours)
   * @returns Weight between 0 and 1 (1 = brand new, decays toward 0)
   */
  private calculateTimeWeight(createdAt: string, decayRate: number): number {
    if (decayRate === 0) return 1; // No decay - equal weighting

    const createdDate = new Date(createdAt);
    const now = new Date();
    const hoursOld = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

    return Math.exp(-decayRate * hoursOld);
  }

  /**
   * Get a single predictor by ID
   */
  async getPredictorById(id: string): Promise<Predictor | null> {
    return this.predictorRepository.findById(id);
  }

  /**
   * Get active predictors for a target
   */
  async getActivePredictors(targetId: string): Promise<Predictor[]> {
    // First, expire any old predictors
    await this.predictorRepository.expireOldPredictors(targetId);

    // Then get active ones
    return this.predictorRepository.findActiveByTarget(targetId);
  }

  /**
   * Evaluate if predictors meet threshold for prediction creation
   * Uses time-weighted consensus where newer predictors have more influence
   */
  async evaluateThreshold(
    targetId: string,
    config?: ThresholdConfig,
  ): Promise<ThresholdEvaluationResult> {
    const effectiveConfig = { ...DEFAULT_THRESHOLD_CONFIG, ...config };
    // Default decay rate is 0.05 (~50% weight after 14 hours)
    const decayRate = effectiveConfig.time_decay_rate ?? 0.05;

    const predictors = await this.getActivePredictors(targetId);

    // Count by direction (raw counts for reference)
    const bullishPredictors = predictors.filter(
      (p) => p.direction === 'bullish',
    );
    const bearishPredictors = predictors.filter(
      (p) => p.direction === 'bearish',
    );
    const neutralPredictors = predictors.filter(
      (p) => p.direction === 'neutral',
    );

    const bullishCount = bullishPredictors.length;
    const bearishCount = bearishPredictors.length;
    const neutralCount = neutralPredictors.length;
    const activeCount = predictors.length;

    // Calculate time-weighted sums by direction
    // Newer predictors contribute more to the direction consensus
    let weightedBullish = 0;
    let weightedBearish = 0;
    let weightedNeutral = 0;
    let totalWeight = 0;

    for (const predictor of predictors) {
      const weight = this.calculateTimeWeight(predictor.created_at, decayRate);
      totalWeight += weight;

      switch (predictor.direction) {
        case 'bullish':
          weightedBullish += weight;
          break;
        case 'bearish':
          weightedBearish += weight;
          break;
        case 'neutral':
          weightedNeutral += weight;
          break;
      }
    }

    // Calculate combined strength (unweighted - still represents total signal strength)
    const combinedStrength = predictors.reduce((sum, p) => sum + p.strength, 0);

    // Calculate average confidence
    const avgConfidence =
      activeCount > 0
        ? predictors.reduce((sum, p) => sum + p.confidence, 0) / activeCount
        : 0;

    // Determine dominant direction using WEIGHTED sums
    // This gives newer predictors more say in determining the overall direction
    let dominantDirection: 'bullish' | 'bearish' | 'neutral';
    if (
      weightedBullish > weightedBearish &&
      weightedBullish > weightedNeutral
    ) {
      dominantDirection = 'bullish';
    } else if (
      weightedBearish > weightedBullish &&
      weightedBearish > weightedNeutral
    ) {
      dominantDirection = 'bearish';
    } else {
      dominantDirection = 'neutral';
    }

    // Calculate direction consensus using WEIGHTED ratios
    // This means a recent predictor disagreeing with older ones carries more weight
    const dominantWeight =
      dominantDirection === 'bullish'
        ? weightedBullish
        : dominantDirection === 'bearish'
          ? weightedBearish
          : weightedNeutral;
    const directionConsensus =
      totalWeight > 0 ? dominantWeight / totalWeight : 0;

    // Check if thresholds are met
    const meetsThreshold =
      activeCount >= effectiveConfig.min_predictors &&
      combinedStrength >= effectiveConfig.min_combined_strength &&
      directionConsensus >= effectiveConfig.min_direction_consensus;

    const result: ThresholdEvaluationResult = {
      meetsThreshold,
      activeCount,
      combinedStrength,
      directionConsensus,
      dominantDirection,
      details: {
        bullishCount,
        bearishCount,
        neutralCount,
        avgConfidence,
        // Include weighted metrics for transparency
        weightedBullish,
        weightedBearish,
        weightedNeutral,
        totalWeight,
      },
    };

    this.logger.debug(
      `Threshold evaluation for ${targetId}: ` +
        `meets=${meetsThreshold}, active=${activeCount}, ` +
        `strength=${combinedStrength}, weighted consensus=${directionConsensus.toFixed(2)} (${dominantDirection})`,
    );

    // Emit predictor.ready event when threshold is met
    if (meetsThreshold) {
      // Get target symbol for display in activity feed
      const target = await this.targetRepository.findById(targetId);
      const targetSymbol = target?.symbol || 'Unknown';

      const ctx = this.createObservabilityContext(targetId);
      await this.observabilityEventsService.push({
        context: ctx,
        source_app: 'prediction-runner',
        hook_event_type: 'predictor.ready',
        status: 'ready',
        message: `Predictor threshold met for ${targetSymbol}: ${activeCount} predictors, ${combinedStrength} combined strength, ${(directionConsensus * 100).toFixed(0)}% weighted consensus (${dominantDirection})`,
        progress: null,
        step: 'predictor-ready',
        payload: {
          targetId,
          targetSymbol,
          activeCount,
          combinedStrength,
          directionConsensus,
          dominantDirection,
          direction: dominantDirection, // Also include as 'direction' for activity feed chip
          confidence: avgConfidence, // Also include as 'confidence' for activity feed chip
          bullishCount,
          bearishCount,
          neutralCount,
          avgConfidence,
          // Time-weighted metrics
          weightedBullish,
          weightedBearish,
          weightedNeutral,
          totalWeight,
          timeDecayRate: decayRate,
        },
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * Consume predictors when a prediction is created
   * Marks all active predictors as consumed by the prediction
   */
  async consumePredictors(
    targetId: string,
    predictionId: string,
  ): Promise<Predictor[]> {
    const predictors = await this.getActivePredictors(targetId);

    const consumedPredictors: Predictor[] = [];
    for (const predictor of predictors) {
      const consumed = await this.predictorRepository.consumePredictor(
        predictor.id,
        predictionId,
      );
      consumedPredictors.push(consumed);
    }

    this.logger.log(
      `Consumed ${consumedPredictors.length} predictors for prediction ${predictionId}`,
    );

    return consumedPredictors;
  }

  /**
   * Get summary statistics for a target's predictors
   */
  async getPredictorStats(targetId: string): Promise<{
    activeCount: number;
    totalStrength: number;
    avgConfidence: number;
    byDirection: Record<PredictorDirection, number>;
  }> {
    const predictors = await this.getActivePredictors(targetId);

    const byDirection: Record<PredictorDirection, number> = {
      bullish: 0,
      bearish: 0,
      neutral: 0,
    };

    let totalStrength = 0;
    let totalConfidence = 0;

    for (const p of predictors) {
      byDirection[p.direction]++;
      totalStrength += p.strength;
      totalConfidence += p.confidence;
    }

    return {
      activeCount: predictors.length,
      totalStrength,
      avgConfidence:
        predictors.length > 0 ? totalConfidence / predictors.length : 0,
      byDirection,
    };
  }

  /**
   * Check if adding a new predictor would trigger threshold
   * Useful for deciding whether to queue for HITL review
   */
  async wouldMeetThreshold(
    targetId: string,
    newPredictorStrength: number,
    newPredictorDirection: PredictorDirection,
    config?: ThresholdConfig,
  ): Promise<boolean> {
    const effectiveConfig = { ...DEFAULT_THRESHOLD_CONFIG, ...config };

    const predictors = await this.getActivePredictors(targetId);
    const simulatedCount = predictors.length + 1;

    if (simulatedCount < effectiveConfig.min_predictors) {
      return false;
    }

    const simulatedStrength =
      predictors.reduce((sum, p) => sum + p.strength, 0) + newPredictorStrength;

    if (simulatedStrength < effectiveConfig.min_combined_strength) {
      return false;
    }

    // Calculate consensus with new predictor
    const directionCounts: Record<PredictorDirection, number> = {
      bullish: 0,
      bearish: 0,
      neutral: 0,
    };
    for (const p of predictors) {
      directionCounts[p.direction]++;
    }
    directionCounts[newPredictorDirection]++;

    const maxCount = Math.max(...Object.values(directionCounts));
    const consensus = maxCount / simulatedCount;

    return consensus >= effectiveConfig.min_direction_consensus;
  }
}
