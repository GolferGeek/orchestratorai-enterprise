import { Injectable, Logger } from '@nestjs/common';
import { PredictionRepository } from '../repositories/prediction.repository';
import { SnapshotService } from './snapshot.service';
import {
  Prediction,
  PredictionDirection,
} from '../interfaces/prediction.interface';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';

/**
 * Evaluation result for a resolved prediction
 */
export interface EvaluationResult {
  predictionId: string;
  directionCorrect: boolean;
  magnitudeAccuracy: number; // 0.0-1.0
  timingAccuracy: number; // 0.0-1.0
  overallScore: number; // 0.0-1.0
  actualDirection: PredictionDirection;
  actualMagnitude: number;
  details: {
    predictedDirection: PredictionDirection;
    predictedMagnitude: number;
    predictedConfidence: number;
    horizonHours: number;
  };
}

/**
 * Suggested learning from evaluation
 */
export interface SuggestedLearning {
  type: 'rule' | 'pattern' | 'weight_adjustment' | 'threshold' | 'avoid';
  scope: 'runner' | 'domain' | 'universe' | 'target' | 'analyst';
  content: string;
  reason: string;
  sourceEvaluationId: string;
}

/**
 * Tier 5: Evaluation Service
 *
 * Scores resolved predictions to measure system accuracy:
 * - Direction accuracy (correct/incorrect)
 * - Magnitude accuracy (how close to actual move)
 * - Timing accuracy (did move happen within horizon)
 * - Overall score (weighted combination)
 *
 * Generates suggested learnings based on patterns in results
 */
@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly predictionRepository: PredictionRepository,
    private readonly snapshotService: SnapshotService,
    private readonly observabilityEventsService: ObservabilityEventsService,
  ) {}

  /**
   * Create execution context for observability events
   */
  private createObservabilityContext(predictionId: string): ExecutionContext {
    return {
      orgSlug: 'system',
      userId: NIL_UUID,
      conversationId: NIL_UUID,
      taskId: `eval-${predictionId}-${Date.now()}`,
      planId: NIL_UUID,
      deliverableId: NIL_UUID,
      agentSlug: 'evaluation-service',
      agentType: 'service',
      provider: NIL_UUID,
      model: NIL_UUID,
    };
  }

  /**
   * Evaluate a resolved prediction
   * Must have outcome_value set before calling
   */
  async evaluatePrediction(predictionId: string): Promise<EvaluationResult> {
    this.logger.log(`Evaluating prediction: ${predictionId}`);

    const prediction = await this.predictionRepository.findById(predictionId);
    if (!prediction) {
      throw new Error(`Prediction not found: ${predictionId}`);
    }

    if (
      prediction.outcome_value === null ||
      prediction.outcome_value === undefined
    ) {
      throw new Error(
        `Prediction ${predictionId} has no outcome value - cannot evaluate`,
      );
    }

    // Calculate actual direction and magnitude from outcome
    const actualMagnitude = prediction.outcome_value;
    const actualDirection = this.determineActualDirection(actualMagnitude);

    // Evaluate direction
    const directionCorrect = prediction.direction === actualDirection;

    // Evaluate magnitude accuracy (how close prediction magnitude was to actual)
    // Convert categorical magnitude to numeric for comparison
    const predictedMagnitudeNumeric = this.magnitudeToNumeric(
      prediction.magnitude,
    );
    const magnitudeAccuracy = this.calculateMagnitudeAccuracy(
      predictedMagnitudeNumeric,
      actualMagnitude,
    );

    // Evaluate timing (was move within horizon?)
    const timingAccuracy = this.calculateTimingAccuracy(prediction);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(
      directionCorrect,
      magnitudeAccuracy,
      timingAccuracy,
      prediction.confidence,
    );

    const result: EvaluationResult = {
      predictionId,
      directionCorrect,
      magnitudeAccuracy,
      timingAccuracy,
      overallScore,
      actualDirection,
      actualMagnitude,
      details: {
        predictedDirection: prediction.direction,
        predictedMagnitude: predictedMagnitudeNumeric,
        predictedConfidence: prediction.confidence,
        horizonHours: prediction.timeframe_hours,
      },
    };

    // Update prediction with resolution notes containing evaluation
    await this.predictionRepository.update(predictionId, {
      resolution_notes: `Evaluation: direction=${directionCorrect ? 'correct' : 'wrong'}, magnitude=${(magnitudeAccuracy * 100).toFixed(0)}%, overall=${(overallScore * 100).toFixed(0)}%`,
    });

    this.logger.log(
      `Evaluation for ${predictionId}: ` +
        `direction=${directionCorrect ? 'correct' : 'wrong'}, ` +
        `magnitude=${(magnitudeAccuracy * 100).toFixed(0)}%, ` +
        `overall=${(overallScore * 100).toFixed(0)}%`,
    );

    // Emit prediction.evaluated event for observability
    const ctx = this.createObservabilityContext(predictionId);
    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'prediction.evaluated',
      status: directionCorrect ? 'correct' : 'incorrect',
      message: `Prediction evaluated: ${directionCorrect ? 'CORRECT' : 'WRONG'} (${(overallScore * 100).toFixed(0)}% score) - predicted ${prediction.direction}, actual ${actualDirection}`,
      progress: null,
      step: 'prediction-evaluated',
      payload: {
        predictionId,
        targetId: prediction.target_id,
        directionCorrect,
        magnitudeAccuracy,
        timingAccuracy,
        overallScore,
        predictedDirection: prediction.direction,
        actualDirection,
        predictedMagnitude: predictedMagnitudeNumeric,
        actualMagnitude,
        predictedConfidence: prediction.confidence,
        horizonHours: prediction.timeframe_hours,
      },
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * Generate suggested learnings from evaluation patterns
   */
  generateLearnings(evaluations: EvaluationResult[]): SuggestedLearning[] {
    const learnings: SuggestedLearning[] = [];

    // Analyze patterns in evaluations
    const correctCount = evaluations.filter((e) => e.directionCorrect).length;
    const totalCount = evaluations.length;
    const accuracyRate = totalCount > 0 ? correctCount / totalCount : 0;

    // Low accuracy pattern
    if (accuracyRate < 0.5 && totalCount >= 5) {
      learnings.push({
        type: 'threshold',
        scope: 'runner',
        content:
          'Consider increasing confidence threshold for prediction creation',
        reason: `Direction accuracy is ${(accuracyRate * 100).toFixed(0)}% over ${totalCount} predictions`,
        sourceEvaluationId: evaluations[0]?.predictionId || 'aggregate',
      });
    }

    // Magnitude underestimation pattern
    const underestimations = evaluations.filter(
      (e) => e.actualMagnitude > e.details.predictedMagnitude * 1.5,
    );
    if (underestimations.length > totalCount * 0.3) {
      learnings.push({
        type: 'weight_adjustment',
        scope: 'runner',
        content:
          'Magnitude predictions are consistently underestimating actual moves',
        reason: `${underestimations.length} of ${totalCount} predictions underestimated magnitude by >50%`,
        sourceEvaluationId: underestimations[0]?.predictionId || 'aggregate',
      });
    }

    // Overconfidence pattern
    const overconfident = evaluations.filter(
      (e) => !e.directionCorrect && e.details.predictedConfidence > 0.8,
    );
    if (overconfident.length > 3) {
      learnings.push({
        type: 'avoid',
        scope: 'runner',
        content: 'High-confidence predictions are frequently wrong',
        reason: `${overconfident.length} high-confidence predictions were incorrect`,
        sourceEvaluationId: overconfident[0]?.predictionId || 'aggregate',
      });
    }

    return learnings;
  }

  /**
   * Determine actual direction from outcome value
   */
  private determineActualDirection(outcomeValue: number): PredictionDirection {
    // Threshold for flat: < 0.5% move
    if (Math.abs(outcomeValue) < 0.5) {
      return 'flat';
    }
    return outcomeValue > 0 ? 'up' : 'down';
  }

  /**
   * Calculate magnitude accuracy (0-1)
   * Higher score for predictions closer to actual magnitude
   */
  private calculateMagnitudeAccuracy(
    predicted: number,
    actual: number,
  ): number {
    if (predicted === 0 && actual === 0) return 1.0;
    if (predicted === 0) return 0;

    // Calculate ratio (actual/predicted)
    const ratio = actual / predicted;

    // Score based on how close ratio is to 1.0
    // ratio of 1.0 = perfect = 1.0 score
    // ratio of 0.5 or 2.0 = half right = 0.5 score
    // ratio of 0.25 or 4.0 = quarter right = 0.25 score
    const deviation = Math.abs(Math.log2(Math.abs(ratio) || 0.01));
    const accuracy = Math.max(0, 1 - deviation / 2);

    return Math.round(accuracy * 100) / 100;
  }

  /**
   * Convert categorical magnitude to numeric value
   */
  private magnitudeToNumeric(
    magnitude: 'small' | 'medium' | 'large' | null,
  ): number {
    switch (magnitude) {
      case 'small':
        return 2.0; // ~2% expected move
      case 'medium':
        return 5.0; // ~5% expected move
      case 'large':
        return 10.0; // ~10% expected move
      default:
        return 3.0; // Default to medium-small
    }
  }

  /**
   * Calculate timing accuracy
   * Did the move happen within the predicted horizon?
   */
  private calculateTimingAccuracy(prediction: Prediction): number {
    if (!prediction.outcome_captured_at) {
      return 0.5; // Unknown timing
    }

    const capturedAt = new Date(prediction.outcome_captured_at).getTime();
    const expiresAt = new Date(prediction.expires_at).getTime();
    const predictedAt = new Date(prediction.predicted_at).getTime();

    // Outcome captured before expiration = good timing
    if (capturedAt <= expiresAt) {
      // Earlier in horizon = better score
      const horizonDuration = expiresAt - predictedAt;
      const timeTaken = capturedAt - predictedAt;
      const earlinessBonus = 1 - timeTaken / horizonDuration;
      return 0.8 + earlinessBonus * 0.2; // 0.8-1.0 range
    }

    // Outcome after expiration = reduced score based on how late
    const lateness = (capturedAt - expiresAt) / (expiresAt - predictedAt);
    return Math.max(0, 0.8 - lateness * 0.4); // Decay from 0.8 to 0
  }

  /**
   * Calculate overall score with weighted components
   */
  private calculateOverallScore(
    directionCorrect: boolean,
    magnitudeAccuracy: number,
    timingAccuracy: number,
    confidence: number,
  ): number {
    // Weights: direction 50%, magnitude 30%, timing 20%
    const directionScore = directionCorrect ? 1.0 : 0.0;

    const weighted =
      directionScore * 0.5 + magnitudeAccuracy * 0.3 + timingAccuracy * 0.2;

    // Apply confidence calibration penalty/bonus
    // If high confidence and right: small bonus
    // If high confidence and wrong: penalty
    const calibrationFactor = directionCorrect
      ? 1 + (confidence - 0.5) * 0.1
      : 1 - (confidence - 0.5) * 0.2;

    return Math.round(weighted * calibrationFactor * 100) / 100;
  }
}
