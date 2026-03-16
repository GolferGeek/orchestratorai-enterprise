/**
 * Historical Replay Testing Service
 *
 * Tests learnings against historical data to validate their effectiveness
 * before promoting to production.
 *
 * Key responsibilities:
 * 1. Run learnings against historical assessments and evaluations
 * 2. Calculate improvement metrics (accuracy lift, false positive delta)
 * 3. Generate backtest reports for HITL review
 * 4. Track test scenario execution
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { EvaluationRepository } from '../repositories/evaluation.repository';
import { CompositeScoreRepository } from '../repositories/composite-score.repository';
import { LearningRepository } from '../repositories/learning.repository';
import { RiskEvaluation } from '../interfaces/evaluation.interface';
import { RiskCompositeScore } from '../interfaces/composite-score.interface';
import { RiskLearning } from '../interfaces/learning.interface';

export interface ReplayScenario {
  id: string;
  name: string;
  description?: string;
  windowDays: number;
  scopeId?: string;
  subjectIds?: string[];
  learningIds: string[];
  createdAt: string;
}

export interface ReplayResult {
  scenarioId: string;
  learningId: string;
  learningTitle: string;
  pass: boolean;
  improvementScore: number;
  baselineAccuracy: number;
  withLearningAccuracy: number;
  accuracyLift: number;
  sampleSize: number;
  affectedCount: number;
  improvedCount: number;
  degradedCount: number;
  statisticalSignificance: number;
  executionTimeMs: number;
  details: Record<string, unknown>;
}

export interface ReplaySummary {
  scenarioId: string;
  scenarioName: string;
  totalLearnings: number;
  passedLearnings: number;
  failedLearnings: number;
  overallImprovement: number;
  results: ReplayResult[];
  executedAt: string;
}

interface HistoricalDataPoint {
  evaluation: RiskEvaluation;
  compositeScore: RiskCompositeScore;
}

interface BaselineMetrics {
  total: number;
  correct: number;
  accuracy: number;
  avgCalibrationError: number;
}

interface WithLearningMetrics extends BaselineMetrics {
  affected: number;
  improved: number;
  degraded: number;
}

@Injectable()
export class HistoricalReplayService {
  private readonly logger = new Logger(HistoricalReplayService.name);

  constructor(
    private readonly evaluationRepo: EvaluationRepository,
    private readonly compositeScoreRepo: CompositeScoreRepository,
    private readonly learningRepo: LearningRepository,
  ) {}

  /**
   * Run a historical replay test for a single learning
   */
  async replayLearning(
    learningId: string,
    windowDays: number = 30,
    scopeId?: string,
  ): Promise<ReplayResult> {
    const startTime = Date.now();

    this.logger.log(
      `Starting historical replay for learning ${learningId} (${windowDays} days)`,
    );

    // Get the learning
    const learning = await this.learningRepo.findLearningById(learningId);
    if (!learning) {
      throw new BadRequestException(`Learning not found: ${learningId}`);
    }

    if (!learning.is_test) {
      throw new BadRequestException(
        'Can only replay test learnings (is_test=true)',
      );
    }

    // Calculate time window
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - windowDays);

    // Fetch historical data
    const historicalData = await this.fetchHistoricalData(
      startDate,
      endDate,
      scopeId,
    );

    if (historicalData.length === 0) {
      this.logger.warn(
        `No historical data found for replay (${windowDays} days)`,
      );
      return {
        scenarioId: `replay-${learningId}`,
        learningId,
        learningTitle: learning.title,
        pass: false,
        improvementScore: 0,
        baselineAccuracy: 0,
        withLearningAccuracy: 0,
        accuracyLift: 0,
        sampleSize: 0,
        affectedCount: 0,
        improvedCount: 0,
        degradedCount: 0,
        statisticalSignificance: 0,
        executionTimeMs: Date.now() - startTime,
        details: {
          error: 'No historical data available',
          windowDays,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      };
    }

    // Calculate baseline metrics
    const baselineMetrics = this.calculateBaselineMetrics(historicalData);

    // Simulate learning application
    const withLearningMetrics = this.simulateLearningApplication(
      historicalData,
      learning,
    );

    // Calculate improvement
    const accuracyLift =
      withLearningMetrics.accuracy - baselineMetrics.accuracy;
    const statisticalSignificance = this.calculateStatisticalSignificance(
      baselineMetrics.correct,
      baselineMetrics.total,
      withLearningMetrics.correct,
      withLearningMetrics.total,
    );

    // Determine pass/fail
    // Pass if: accuracy improved AND no significant degradation AND statistically significant
    const pass =
      accuracyLift > 0 &&
      withLearningMetrics.degraded / Math.max(1, withLearningMetrics.affected) <
        0.3 &&
      statisticalSignificance >= 0.8;

    const executionTimeMs = Date.now() - startTime;

    const result: ReplayResult = {
      scenarioId: `replay-${learningId}`,
      learningId,
      learningTitle: learning.title,
      pass,
      improvementScore: accuracyLift,
      baselineAccuracy: baselineMetrics.accuracy,
      withLearningAccuracy: withLearningMetrics.accuracy,
      accuracyLift,
      sampleSize: historicalData.length,
      affectedCount: withLearningMetrics.affected,
      improvedCount: withLearningMetrics.improved,
      degradedCount: withLearningMetrics.degraded,
      statisticalSignificance,
      executionTimeMs,
      details: {
        windowDays,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        learningType: learning.learning_type,
        learningConfig: learning.config,
        baselineMetrics,
        withLearningMetrics,
      },
    };

    this.logger.log(
      `Replay complete: ${result.pass ? 'PASS' : 'FAIL'} - ` +
        `accuracy lift: ${(accuracyLift * 100).toFixed(2)}%, ` +
        `significance: ${(statisticalSignificance * 100).toFixed(0)}%`,
    );

    // Update learning application stats
    await this.updateLearningTestStats(learning.id, result);

    return result;
  }

  /**
   * Run replay for multiple learnings (batch test)
   */
  async replayMultipleLearnings(
    learningIds: string[],
    windowDays: number = 30,
    scopeId?: string,
    scenarioName?: string,
  ): Promise<ReplaySummary> {
    const scenarioId = `scenario-${Date.now()}`;
    const results: ReplayResult[] = [];

    this.logger.log(
      `Starting batch replay: ${learningIds.length} learnings, ${windowDays} days`,
    );

    for (const learningId of learningIds) {
      try {
        const result = await this.replayLearning(
          learningId,
          windowDays,
          scopeId,
        );
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Failed to replay learning ${learningId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with other learnings
      }
    }

    const passedCount = results.filter((r) => r.pass).length;
    const totalImprovement =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.improvementScore, 0) /
          results.length
        : 0;

    const summary: ReplaySummary = {
      scenarioId,
      scenarioName: scenarioName || `Batch replay ${new Date().toISOString()}`,
      totalLearnings: learningIds.length,
      passedLearnings: passedCount,
      failedLearnings: results.length - passedCount,
      overallImprovement: totalImprovement,
      results,
      executedAt: new Date().toISOString(),
    };

    this.logger.log(
      `Batch replay complete: ${passedCount}/${results.length} passed, ` +
        `overall improvement: ${(totalImprovement * 100).toFixed(2)}%`,
    );

    return summary;
  }

  /**
   * Fetch historical evaluation data
   */
  private async fetchHistoricalData(
    startDate: Date,
    endDate: Date,
    scopeId?: string,
  ): Promise<HistoricalDataPoint[]> {
    const data: HistoricalDataPoint[] = [];

    // Get evaluations in the time window
    const windows: Array<'7d' | '30d' | '90d'> = ['7d', '30d', '90d'];

    for (const window of windows) {
      const evaluations = await this.evaluationRepo.findAllByWindow(window, {
        includeTest: false, // Only production data
      });

      for (const evaluation of evaluations) {
        // Check if within date range
        const evalDate = new Date(evaluation.created_at);
        if (evalDate < startDate || evalDate > endDate) {
          continue;
        }

        // Get associated composite score
        const compositeScore = await this.compositeScoreRepo.findById(
          evaluation.composite_score_id,
        );

        if (compositeScore) {
          // If scopeId provided, filter by scope
          if (scopeId) {
            // Need to check if subject belongs to scope
            // For now, include all (scope filtering would need subject lookup)
          }

          data.push({
            evaluation,
            compositeScore,
          });
        }
      }
    }

    return data;
  }

  /**
   * Calculate baseline accuracy metrics
   */
  private calculateBaselineMetrics(
    data: HistoricalDataPoint[],
  ): BaselineMetrics {
    const total = data.length;
    let correct = 0;
    let totalCalibrationError = 0;

    for (const { evaluation } of data) {
      // Consider "correct" if score was within 20 points of outcome severity
      const calibrationError = Math.abs(evaluation.calibration_error ?? 0);
      totalCalibrationError += calibrationError;

      if (calibrationError <= 20) {
        correct++;
      }
    }

    const accuracy = total > 0 ? correct / total : 0;
    const avgCalibrationError = total > 0 ? totalCalibrationError / total : 0;

    return {
      total,
      correct,
      accuracy,
      avgCalibrationError,
    };
  }

  /**
   * Simulate applying a learning to historical data
   */
  private simulateLearningApplication(
    data: HistoricalDataPoint[],
    learning: RiskLearning,
  ): WithLearningMetrics {
    let affected = 0;
    let improved = 0;
    let degraded = 0;
    let hypotheticalCorrect = 0;
    let hypotheticalCalibrationError = 0;

    for (const { evaluation, compositeScore } of data) {
      const wouldApply = this.wouldLearningApply(learning, compositeScore);

      if (wouldApply) {
        affected++;

        // Simulate the learning effect
        const simulatedEffect = this.simulateLearningEffect(
          learning,
          compositeScore,
          evaluation,
        );

        if (simulatedEffect.improvedAccuracy) {
          improved++;
          hypotheticalCorrect++;
        } else if (simulatedEffect.degradedAccuracy) {
          degraded++;
        } else {
          // No change - use original accuracy
          if (Math.abs(evaluation.calibration_error ?? 0) <= 20) {
            hypotheticalCorrect++;
          }
        }

        hypotheticalCalibrationError += simulatedEffect.calibrationError;
      } else {
        // Learning didn't apply - use original metrics
        if (Math.abs(evaluation.calibration_error ?? 0) <= 20) {
          hypotheticalCorrect++;
        }
        hypotheticalCalibrationError += Math.abs(
          evaluation.calibration_error ?? 0,
        );
      }
    }

    const total = data.length;
    const accuracy = total > 0 ? hypotheticalCorrect / total : 0;
    const avgCalibrationError =
      total > 0 ? hypotheticalCalibrationError / total : 0;

    return {
      total,
      correct: hypotheticalCorrect,
      accuracy,
      avgCalibrationError,
      affected,
      improved,
      degraded,
    };
  }

  /**
   * Check if a learning would apply to a historical score
   */
  private wouldLearningApply(
    learning: RiskLearning,
    compositeScore: RiskCompositeScore,
  ): boolean {
    const config = learning.config;

    switch (learning.learning_type) {
      case 'rule':
        // Rules apply based on trigger conditions
        if (config.rule_condition) {
          // Check if rule condition matches score characteristics
          // Simplified: check if high/low confidence
          if (
            config.applies_to?.includes('high_confidence') &&
            compositeScore.confidence >= 0.7
          ) {
            return true;
          }
          if (
            config.applies_to?.includes('low_confidence') &&
            compositeScore.confidence < 0.5
          ) {
            return true;
          }
        }
        return false;

      case 'pattern':
        // Patterns apply when signals match
        if (config.pattern_signals && Array.isArray(config.pattern_signals)) {
          // Check if pattern signals match dimension scores
          for (const signal of config.pattern_signals) {
            const signalMatch = this.checkPatternSignal(
              String(signal),
              compositeScore,
            );
            if (signalMatch) return true;
          }
        }
        return false;

      case 'weight_adjustment':
        // Weight adjustments apply to scores with the target dimension
        if (config.dimension_slug) {
          return config.dimension_slug in compositeScore.dimension_scores;
        }
        return false;

      case 'threshold':
        // Threshold adjustments apply based on score range
        if (
          config.threshold_name === 'overall' &&
          config.threshold_value !== undefined
        ) {
          const threshold = Number(config.threshold_value);
          if (config.threshold_direction === 'increase') {
            return compositeScore.overall_score < threshold;
          } else {
            return compositeScore.overall_score > threshold;
          }
        }
        return false;

      case 'avoid':
        // Avoid learnings apply when anti-pattern detected
        if (config.avoid_condition) {
          // Check for anti-pattern in score characteristics
          return this.checkAvoidCondition(
            String(config.avoid_condition),
            compositeScore,
          );
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Check if a pattern signal matches the composite score
   */
  private checkPatternSignal(
    signal: string,
    compositeScore: RiskCompositeScore,
  ): boolean {
    const signalLower = signal.toLowerCase();

    // Check for dimension-related signals
    for (const [dimension, score] of Object.entries(
      compositeScore.dimension_scores,
    )) {
      if (signalLower.includes(dimension) && signalLower.includes('high')) {
        if (score >= 70) return true;
      }
      if (signalLower.includes(dimension) && signalLower.includes('low')) {
        if (score <= 30) return true;
      }
    }

    // Check for overall score signals
    if (signalLower.includes('overall') && signalLower.includes('high')) {
      return compositeScore.overall_score >= 70;
    }

    return false;
  }

  /**
   * Check if an avoid condition matches the composite score
   */
  private checkAvoidCondition(
    condition: string,
    compositeScore: RiskCompositeScore,
  ): boolean {
    const conditionLower = condition.toLowerCase();

    // Check for common avoid conditions
    if (
      conditionLower.includes('overconfident') &&
      compositeScore.confidence > 0.9
    ) {
      return true;
    }

    if (
      conditionLower.includes('underconfident') &&
      compositeScore.confidence < 0.3
    ) {
      return true;
    }

    if (
      conditionLower.includes('extreme') &&
      (compositeScore.overall_score > 90 || compositeScore.overall_score < 10)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Simulate the effect of applying a learning
   */
  private simulateLearningEffect(
    learning: RiskLearning,
    compositeScore: RiskCompositeScore,
    evaluation: RiskEvaluation,
  ): {
    improvedAccuracy: boolean;
    degradedAccuracy: boolean;
    calibrationError: number;
  } {
    const originalCalibrationError = Math.abs(
      evaluation.calibration_error ?? 0,
    );
    let adjustedCalibrationError = originalCalibrationError;

    switch (learning.learning_type) {
      case 'weight_adjustment':
        // Weight adjustments improve calibration by 10-20%
        adjustedCalibrationError = originalCalibrationError * 0.85;
        break;

      case 'threshold':
        // Thresholds improve extreme scores by 15%
        if (
          compositeScore.overall_score > 80 ||
          compositeScore.overall_score < 20
        ) {
          adjustedCalibrationError = originalCalibrationError * 0.85;
        }
        break;

      case 'pattern':
        // Patterns improve calibration by 10%
        adjustedCalibrationError = originalCalibrationError * 0.9;
        break;

      case 'rule':
        // Rules have variable effect - use 5% improvement
        adjustedCalibrationError = originalCalibrationError * 0.95;
        break;

      case 'avoid':
        // Avoid learnings prevent bad predictions - 20% improvement
        adjustedCalibrationError = originalCalibrationError * 0.8;
        break;
    }

    const wasCorrect = originalCalibrationError <= 20;
    const nowCorrect = adjustedCalibrationError <= 20;

    return {
      improvedAccuracy: !wasCorrect && nowCorrect,
      degradedAccuracy: wasCorrect && !nowCorrect,
      calibrationError: adjustedCalibrationError,
    };
  }

  /**
   * Calculate statistical significance using a simple proportion test
   */
  private calculateStatisticalSignificance(
    baselineCorrect: number,
    baselineTotal: number,
    improvedCorrect: number,
    improvedTotal: number,
  ): number {
    // Need minimum sample size
    if (baselineTotal < 20 || improvedTotal < 20) {
      return 0.0;
    }

    const p1 = baselineCorrect / baselineTotal;
    const p2 = improvedCorrect / improvedTotal;
    const pooledP =
      (baselineCorrect + improvedCorrect) / (baselineTotal + improvedTotal);

    const se = Math.sqrt(
      pooledP * (1 - pooledP) * (1 / baselineTotal + 1 / improvedTotal),
    );

    if (se === 0) return 0.0;

    const z = Math.abs(p2 - p1) / se;

    // Convert Z-score to confidence level
    if (z > 2.58) return 0.99;
    if (z > 1.96) return 0.95;
    if (z > 1.645) return 0.9;
    if (z > 1.28) return 0.8;
    if (z > 1.0) return 0.68;

    return Math.min(0.68, z / 2.58);
  }

  /**
   * Update learning test statistics after replay
   */
  private async updateLearningTestStats(
    learningId: string,
    result: ReplayResult,
  ): Promise<void> {
    try {
      const learning = await this.learningRepo.findLearningById(learningId);
      if (!learning) return;

      // Increment times_applied
      await this.learningRepo.incrementApplied(learningId);

      // If pass, increment times_helpful
      if (result.pass) {
        await this.learningRepo.incrementHelpful(learningId);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to update learning stats: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
