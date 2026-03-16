import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PredictionRepository } from '../repositories/prediction.repository';
import { LearningQueueRepository } from '../repositories/learning-queue.repository';
import {
  EvaluationService,
  EvaluationResult,
  SuggestedLearning,
} from '../services/evaluation.service';
import { Prediction } from '../interfaces/prediction.interface';

/**
 * Evaluation Runner - Phase 7, Step 7-5
 *
 * Evaluates resolved predictions and generates learning suggestions.
 *
 * Schedule: Every hour
 *
 * Responsibilities:
 * 1. Score resolved predictions (direction, magnitude, timing accuracy)
 * 2. Analyze patterns across evaluations
 * 3. Generate suggested learnings for human review
 * 4. Track per-analyst performance
 */
@Injectable()
export class EvaluationRunner {
  private readonly logger = new Logger(EvaluationRunner.name);
  private isRunning = false;

  constructor(
    private readonly predictionRepository: PredictionRepository,
    private readonly learningQueueRepository: LearningQueueRepository,
    private readonly evaluationService: EvaluationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if evaluation is disabled via master environment variable
   */
  private isDisabled(): boolean {
    return (
      this.configService.get<string>('DISABLE_SCHEDULED_PREDICTION') === 'true' ||
      this.configService.get<string>('DISABLE_PREDICTION_RUNNERS') === 'true'
    );
  }

  /**
   * Run evaluation batch
   */
  async runEvaluationBatch(): Promise<{
    evaluated: number;
    correct: number;
    incorrect: number;
    learningsSuggested: number;
    errors: number;
  }> {
    if (this.isRunning) {
      this.logger.warn(
        'Skipping evaluation run - previous run still in progress',
      );
      return {
        evaluated: 0,
        correct: 0,
        incorrect: 0,
        learningsSuggested: 0,
        errors: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    this.logger.log('Starting evaluation batch');

    let evaluated = 0;
    let correct = 0;
    let incorrect = 0;
    let learningsSuggested = 0;
    let errors = 0;

    try {
      // Get predictions that need evaluation (resolved but not yet evaluated)
      const predictionsToEvaluate = await this.findPredictionsToEvaluate();

      if (predictionsToEvaluate.length === 0) {
        this.logger.debug('No predictions to evaluate');
        return {
          evaluated: 0,
          correct: 0,
          incorrect: 0,
          learningsSuggested: 0,
          errors: 0,
        };
      }

      this.logger.log(`Evaluating ${predictionsToEvaluate.length} predictions`);

      const evaluationResults: EvaluationResult[] = [];

      for (const prediction of predictionsToEvaluate) {
        try {
          const result = await this.evaluationService.evaluatePrediction(
            prediction.id,
          );

          evaluationResults.push(result);
          evaluated++;

          if (result.directionCorrect) {
            correct++;
          } else {
            incorrect++;
          }

          this.logger.debug(
            `Evaluated prediction ${prediction.id}: ` +
              `direction=${result.directionCorrect ? 'correct' : 'wrong'}, ` +
              `score=${(result.overallScore * 100).toFixed(0)}%`,
          );
        } catch (error) {
          errors++;
          this.logger.error(
            `Failed to evaluate prediction ${prediction.id}: ` +
              `${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      // Generate learnings from patterns in evaluations
      if (evaluationResults.length >= 5) {
        const suggestedLearnings =
          this.evaluationService.generateLearnings(evaluationResults);

        for (const learning of suggestedLearnings) {
          try {
            await this.queueLearning(learning);
            learningsSuggested++;
          } catch (error) {
            this.logger.error(
              `Failed to queue learning: ` +
                `${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        }
      }

      const duration = Date.now() - startTime;
      const accuracy = evaluated > 0 ? (correct / evaluated) * 100 : 0;

      this.logger.log(
        `Evaluation batch complete: ${evaluated} evaluated, ` +
          `${correct} correct (${accuracy.toFixed(1)}%), ` +
          `${learningsSuggested} learnings suggested (${duration}ms)`,
      );

      return { evaluated, correct, incorrect, learningsSuggested, errors };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Find predictions that need evaluation
   * Returns resolved predictions that haven't been evaluated yet
   */
  private async findPredictionsToEvaluate(): Promise<Prediction[]> {
    // Get resolved predictions with outcome values that don't have evaluation notes
    const resolvedPredictions =
      await this.predictionRepository.findResolvedWithoutEvaluation();

    return resolvedPredictions;
  }

  /**
   * Queue a suggested learning for human review
   */
  private async queueLearning(learning: SuggestedLearning): Promise<void> {
    // Map 'analyst' scope to 'target' since LearningScopeLevel doesn't include 'analyst'
    const scopeLevel = learning.scope === 'analyst' ? 'target' : learning.scope;

    await this.learningQueueRepository.create({
      suggested_learning_type: learning.type,
      suggested_description: learning.content,
      suggested_scope_level: scopeLevel,
      source_evaluation_id: learning.sourceEvaluationId,
      ai_reasoning: learning.reason,
      ai_confidence: 0.7,
      suggested_title: `Evaluation learning: ${learning.type}`,
      suggested_config: {},
      status: 'pending',
    });

    this.logger.debug(
      `Queued learning suggestion: ${learning.type} - ${learning.content.slice(0, 50)}...`,
    );
  }

  /**
   * Get evaluation summary statistics
   */
  getEvaluationStats(): {
    totalEvaluated: number;
    directionAccuracy: number;
    avgOverallScore: number;
    byTimeframe: Record<string, { count: number; accuracy: number }>;
  } {
    // This would query evaluation results and aggregate stats
    // For now, return placeholder
    return {
      totalEvaluated: 0,
      directionAccuracy: 0,
      avgOverallScore: 0,
      byTimeframe: {},
    };
  }

  /**
   * Manually evaluate a specific prediction
   */
  async evaluateManually(predictionId: string): Promise<{
    success: boolean;
    result?: EvaluationResult;
    error?: string;
  }> {
    try {
      const result =
        await this.evaluationService.evaluatePrediction(predictionId);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
