import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LearningRepository } from '../repositories/learning.repository';
import { LearningLineageRepository } from '../repositories/learning-lineage.repository';
import { TestAuditLogRepository } from '../repositories/test-audit-log.repository';
import {
  Learning,
  LearningLineageWithDetails,
  CreateLearningLineageData,
} from '../interfaces/learning.interface';
import { PredictionDirection } from '../interfaces/prediction.interface';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';

/**
 * Historical evaluation with prediction data for backtesting
 */
interface EvaluationWithPrediction {
  evaluation: {
    id: string;
    prediction_id: string;
    direction_correct: boolean;
    direction_score: number;
    magnitude_accuracy: number | null;
    actual_magnitude: string | null;
    timing_score: number | null;
    overall_score: number;
    created_at: string;
  };
  prediction: {
    id: string;
    target_id: string;
    direction: PredictionDirection;
    confidence: number;
    magnitude: 'small' | 'medium' | 'large' | null;
    reasoning: string;
    timeframe_hours: number;
    predicted_at: string;
    analyst_ensemble: Record<string, unknown>;
    llm_ensemble: Record<string, unknown>;
    outcome_value: number | null;
  };
}

/**
 * Baseline metrics calculated from historical data
 */
interface BaselineMetrics {
  total: number;
  correct: number;
  accuracy: number;
  falsePositiveRate: number;
}

/**
 * Metrics with learning application simulated
 */
interface WithLearningMetrics extends BaselineMetrics {
  affected: number;
  improved: number;
  degraded: number;
}

/**
 * Validation result for learning promotion
 */
export interface PromotionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  learning?: Learning;
}

/**
 * Backtest result for learning validation
 */
export interface BacktestResult {
  pass: boolean;
  improvement_score: number;
  window_days: number;
  details?: Record<string, unknown>;
}

/**
 * Learning promotion service
 * Handles promoting test learnings to production (INV-07, INV-09)
 *
 * Key invariants:
 * - INV-07: Learning promotion MUST be human-approved, audited action
 * - INV-09: Promoted learning becomes is_test=false; original preserved as is_test=true
 */
@Injectable()
export class LearningPromotionService {
  private readonly logger = new Logger(LearningPromotionService.name);

  constructor(
    private readonly learningRepository: LearningRepository,
    private readonly lineageRepository: LearningLineageRepository,
    private readonly auditRepository: TestAuditLogRepository,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
  ) {}

  /**
   * Validate if a learning can be promoted to production
   * Checks:
   * 1. Learning exists and is_test=true
   * 2. Learning has not already been promoted
   * 3. Learning is in active status
   * 4. Learning has validation metrics (times_applied > 0)
   */
  async validateForPromotion(
    learningId: string,
  ): Promise<PromotionValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check learning exists
    const learning = await this.learningRepository.findById(learningId);
    if (!learning) {
      errors.push(`Learning not found: ${learningId}`);
      return { valid: false, errors, warnings };
    }

    // Check is_test=true
    if (!learning.is_test) {
      errors.push('Learning must have is_test=true to be promoted');
    }

    // Check not already promoted
    const alreadyPromoted =
      await this.lineageRepository.isTestLearningPromoted(learningId);
    if (alreadyPromoted) {
      errors.push('Learning has already been promoted to production');
    }

    // Check learning status
    if (learning.status !== 'active') {
      errors.push(
        `Learning must be active to promote (current status: ${learning.status})`,
      );
    }

    // Check has validation metrics
    if (learning.times_applied === 0) {
      warnings.push(
        'Learning has never been applied in test scenarios. Consider validating before promotion.',
      );
    }

    // Calculate success rate if applicable
    if (learning.times_applied > 0 && learning.times_helpful > 0) {
      const successRate = learning.times_helpful / learning.times_applied;
      if (successRate < 0.5) {
        warnings.push(
          `Learning has low success rate: ${(successRate * 100).toFixed(1)}%. Consider reviewing before promotion.`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      learning,
    };
  }

  /**
   * Promote a test learning to production
   * Creates a production copy (is_test=false) and records lineage
   *
   * @param testLearningId - ID of the test learning to promote
   * @param userId - ID of the user performing the promotion (human approval)
   * @param organizationSlug - Organization slug for audit logging
   * @param notes - Optional notes explaining the promotion decision
   * @param backtestResult - Optional backtest validation results
   * @param scenarioRuns - Optional array of scenario run IDs where learning was validated
   * @returns The created learning lineage record
   */
  async promoteLearning(
    testLearningId: string,
    userId: string,
    organizationSlug: string,
    notes?: string,
    backtestResult?: BacktestResult,
    scenarioRuns?: string[],
  ): Promise<LearningLineageWithDetails> {
    this.logger.log(
      `Promoting test learning to production: ${testLearningId} by user ${userId}`,
    );

    // Validate learning can be promoted
    const validation = await this.validateForPromotion(testLearningId);
    if (!validation.valid) {
      throw new BadRequestException(
        `Cannot promote learning: ${validation.errors.join(', ')}`,
      );
    }

    const testLearning = validation.learning!;

    // Create production copy with is_test=false
    const productionLearning = await this.learningRepository.create({
      scope_level: testLearning.scope_level,
      domain: testLearning.domain ?? undefined,
      universe_id: testLearning.universe_id ?? undefined,
      target_id: testLearning.target_id ?? undefined,
      analyst_id: testLearning.analyst_id ?? undefined,
      learning_type: testLearning.learning_type,
      title: testLearning.title,
      description: testLearning.description,
      config: testLearning.config,
      source_type: testLearning.source_type,
      source_evaluation_id: testLearning.source_evaluation_id ?? undefined,
      source_missed_opportunity_id:
        testLearning.source_missed_opportunity_id ?? undefined,
      status: 'active',
      version: testLearning.version,
      // Production learning has is_test=false (set by database default or explicitly)
    });

    // Calculate validation metrics
    const validationMetrics = {
      times_applied: testLearning.times_applied,
      times_helpful: testLearning.times_helpful,
      success_rate:
        testLearning.times_applied > 0
          ? testLearning.times_helpful / testLearning.times_applied
          : 0,
    };

    // Create lineage record
    const lineageData: CreateLearningLineageData = {
      organization_slug: organizationSlug,
      test_learning_id: testLearningId,
      production_learning_id: productionLearning.id,
      scenario_runs: scenarioRuns ?? [],
      validation_metrics: validationMetrics,
      backtest_result: backtestResult
        ? (backtestResult as unknown as Record<string, unknown>)
        : undefined,
      promoted_by: userId,
      notes: notes ?? undefined,
    };

    const lineage = await this.lineageRepository.create(lineageData);

    // Audit the promotion action (INV-07: human-approved, audited action)
    await this.auditRepository.log({
      organization_slug: organizationSlug,
      user_id: userId,
      action: 'learning_promoted',
      resource_type: 'learning',
      resource_id: testLearningId,
      details: {
        test_learning_id: testLearningId,
        production_learning_id: productionLearning.id,
        lineage_id: lineage.id,
        validation_metrics: validationMetrics,
        backtest_result: backtestResult,
        scenario_runs: scenarioRuns ?? [],
        notes: notes,
      },
    });

    this.logger.log(
      `Successfully promoted learning ${testLearningId} -> ${productionLearning.id}`,
    );

    // Return lineage with details
    const lineageWithDetails =
      await this.lineageRepository.getPromotionHistory(organizationSlug);
    const promoted = lineageWithDetails.find((l) => l.id === lineage.id);
    if (!promoted) {
      throw new Error('Failed to retrieve promotion details');
    }

    return promoted;
  }

  /**
   * Get promotion history for an organization
   * Returns all learning promotions with enriched user and learning details
   */
  async getPromotionHistory(
    organizationSlug: string,
  ): Promise<LearningLineageWithDetails[]> {
    return this.lineageRepository.getPromotionHistory(organizationSlug);
  }

  /**
   * Get lineage details for a specific test learning
   * Returns the promotion record if the learning has been promoted
   */
  async getLineage(
    testLearningId: string,
  ): Promise<LearningLineageWithDetails | null> {
    const lineages =
      await this.lineageRepository.findByTestLearning(testLearningId);
    if (lineages.length === 0) {
      return null;
    }

    // Return the most recent promotion
    const lineage = lineages[0];

    if (!lineage) {
      return null;
    }

    // Fetch with details
    const lineageWithDetails = await this.lineageRepository.getPromotionHistory(
      lineage.organization_slug,
    );
    return (
      lineageWithDetails.find((l) => l.test_learning_id === testLearningId) ??
      null
    );
  }

  /**
   * Reject a test learning from promotion
   * Marks the learning as disabled and audits the rejection
   *
   * @param learningId - ID of the learning to reject
   * @param userId - ID of the user rejecting the learning
   * @param organizationSlug - Organization slug for audit logging
   * @param reason - Reason for rejection
   */
  async rejectLearning(
    learningId: string,
    userId: string,
    organizationSlug: string,
    reason: string,
  ): Promise<Learning> {
    this.logger.log(`Rejecting learning: ${learningId} by user ${userId}`);

    // Check learning exists and is a test learning
    const learning = await this.learningRepository.findById(learningId);
    if (!learning) {
      throw new NotFoundException(`Learning not found: ${learningId}`);
    }

    if (!learning.is_test) {
      throw new BadRequestException(
        'Can only reject test learnings (is_test=true)',
      );
    }

    // Check not already promoted
    const alreadyPromoted =
      await this.lineageRepository.isTestLearningPromoted(learningId);
    if (alreadyPromoted) {
      throw new ConflictException(
        'Cannot reject learning that has already been promoted',
      );
    }

    // Update learning status to disabled
    const updatedLearning = await this.learningRepository.update(learningId, {
      status: 'disabled',
    });

    // Audit the rejection action (INV-07: human-approved, audited action)
    await this.auditRepository.log({
      organization_slug: organizationSlug,
      user_id: userId,
      action: 'learning_rejected',
      resource_type: 'learning',
      resource_id: learningId,
      details: {
        learning_id: learningId,
        learning_title: learning.title,
        reason: reason,
        times_applied: learning.times_applied,
        times_helpful: learning.times_helpful,
      },
    });

    this.logger.log(`Successfully rejected learning ${learningId}: ${reason}`);

    return updatedLearning;
  }

  /**
   * Run backtest validation for a test learning
   * Simulates what would happen if the learning had been applied in the past
   *
   * @param learningId - ID of the learning to backtest
   * @param windowDays - Number of days to backtest over
   * @returns Backtest result
   */
  async backtestLearning(
    learningId: string,
    windowDays: number = 30,
  ): Promise<BacktestResult> {
    const startTime = Date.now();
    this.logger.log(
      `Running backtest for learning ${learningId} over ${windowDays} days`,
    );

    // Validate learning exists and is a test learning
    const learning = await this.learningRepository.findByIdOrThrow(learningId);
    if (!learning.is_test) {
      throw new BadRequestException(
        'Can only backtest test learnings (is_test=true)',
      );
    }

    // Calculate time window
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - windowDays);

    // Fetch historical evaluations with predictions
    this.logger.log(
      `Fetching historical evaluations from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );
    const evaluationsWithPredictions =
      await this.getHistoricalEvaluationsWithPredictions(
        startDate.toISOString(),
        endDate.toISOString(),
        learning,
      );

    if (evaluationsWithPredictions.length === 0) {
      this.logger.warn(`No historical data found for backtest window`);
      return {
        pass: false,
        improvement_score: 0.0,
        window_days: windowDays,
        details: {
          error: 'No historical data available for backtest',
          learning_id: learningId,
          learning_title: learning.title,
        },
      };
    }

    // Calculate baseline metrics (actual historical performance)
    const baselineMetrics = this.calculateBaselineMetrics(
      evaluationsWithPredictions,
    );

    // Simulate learning application and calculate hypothetical metrics
    const withLearningMetrics = this.simulateLearningApplication(
      evaluationsWithPredictions,
      learning,
    );

    // Calculate improvement metrics
    const accuracyLift =
      withLearningMetrics.accuracy - baselineMetrics.accuracy;
    const fpDelta =
      withLearningMetrics.falsePositiveRate - baselineMetrics.falsePositiveRate;

    // Calculate statistical significance
    const statisticalSignificance = this.calculateStatisticalSignificance(
      baselineMetrics.correct,
      baselineMetrics.total,
      withLearningMetrics.correct,
      withLearningMetrics.total,
    );

    const executionTimeMs = Date.now() - startTime;

    const result: BacktestResult = {
      pass: accuracyLift > 0 && fpDelta <= 0.05, // Simple pass criteria
      improvement_score: accuracyLift,
      window_days: windowDays,
      details: {
        baseline_accuracy: baselineMetrics.accuracy,
        with_learning_accuracy: withLearningMetrics.accuracy,
        accuracy_lift: accuracyLift,
        baseline_false_positive_rate: baselineMetrics.falsePositiveRate,
        with_learning_false_positive_rate:
          withLearningMetrics.falsePositiveRate,
        false_positive_delta: fpDelta,
        predictions_affected: withLearningMetrics.affected,
        predictions_improved: withLearningMetrics.improved,
        predictions_degraded: withLearningMetrics.degraded,
        statistical_significance: statisticalSignificance,
        sample_size: evaluationsWithPredictions.length,
        learning_id: learningId,
        learning_title: learning.title,
        learning_type: learning.learning_type,
        execution_time_ms: executionTimeMs,
      },
    };

    this.logger.log(
      `Backtest complete: accuracy_lift=${(accuracyLift * 100).toFixed(2)}%, ` +
        `fp_delta=${(fpDelta * 100).toFixed(2)}%, ` +
        `pass=${result.pass}, ` +
        `sample_size=${evaluationsWithPredictions.length}`,
    );

    return result;
  }

  /**
   * Fetch historical evaluations with their predictions
   * Filters to production data only (is_test=false)
   */
  private async getHistoricalEvaluationsWithPredictions(
    startDate: string,
    endDate: string,
    learning: Learning,
  ): Promise<EvaluationWithPrediction[]> {
    // Build query based on learning scope
    let query = this.db
      .from('prediction', 'evaluations')
      .select(
        `
        id,
        prediction_id,
        direction_correct,
        direction_score,
        magnitude_accuracy,
        actual_magnitude,
        timing_score,
        overall_score,
        created_at,
        predictions!inner (
          id,
          target_id,
          direction,
          confidence,
          magnitude,
          reasoning,
          timeframe_hours,
          predicted_at,
          analyst_ensemble,
          llm_ensemble,
          outcome_value
        )
      `,
      )
      .eq('is_test', false) // Only production data for backtesting
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    // Apply learning scope filters
    if (learning.domain) {
      // Note: Would need domain field in predictions or targets join
      // For now, we skip domain filtering
    }
    if (learning.target_id) {
      query = query.eq('predictions.target_id', learning.target_id);
    }

    const { data, error } = (await query) as QueryResult<unknown>;

    if (error) {
      this.logger.error(
        `Failed to fetch historical evaluations: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch historical evaluations: ${error.message}`,
      );
    }

    // Transform to expected format
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return rows.map((row: Record<string, unknown>) => {
      const predictions = row.predictions as
        | EvaluationWithPrediction['prediction']
        | EvaluationWithPrediction['prediction'][];

      return {
        evaluation: {
          id: row.id as string,
          prediction_id: row.prediction_id as string,
          direction_correct: row.direction_correct as boolean,
          direction_score: row.direction_score as number,
          magnitude_accuracy: row.magnitude_accuracy as number | null,
          actual_magnitude: row.actual_magnitude as string | null,
          timing_score: row.timing_score as number | null,
          overall_score: row.overall_score as number,
          created_at: row.created_at as string,
        },
        prediction: Array.isArray(predictions) ? predictions[0] : predictions,
      } as EvaluationWithPrediction;
    });
  }

  /**
   * Calculate baseline metrics from historical data
   */
  private calculateBaselineMetrics(
    data: EvaluationWithPrediction[],
  ): BaselineMetrics {
    const total = data.length;
    const correct = data.filter((d) => d.evaluation.direction_correct).length;
    const accuracy = total > 0 ? correct / total : 0;

    // Calculate false positive rate (predicted UP but went DOWN)
    const upPredictions = data.filter((d) => d.prediction.direction === 'up');
    const falsePositives = upPredictions.filter(
      (d) => !d.evaluation.direction_correct,
    ).length;
    const falsePositiveRate =
      upPredictions.length > 0 ? falsePositives / upPredictions.length : 0;

    return {
      total,
      correct,
      accuracy,
      falsePositiveRate,
    };
  }

  /**
   * Simulate learning application to historical predictions
   * Determines which predictions would have been affected and if outcomes improved
   */
  private simulateLearningApplication(
    data: EvaluationWithPrediction[],
    learning: Learning,
  ): WithLearningMetrics {
    let affected = 0;
    let improved = 0;
    let degraded = 0;
    let hypotheticalCorrect = 0;

    for (const { evaluation, prediction } of data) {
      const wouldApply = this.wouldLearningApply(learning, prediction);

      if (wouldApply) {
        affected++;

        // Simulate learning effect based on type
        const hypotheticalOutcome = this.simulateLearningEffect(
          learning,
          prediction,
          evaluation,
        );

        // Count if learning would have improved outcome
        if (hypotheticalOutcome.correct && !evaluation.direction_correct) {
          improved++;
          hypotheticalCorrect++;
        } else if (
          !hypotheticalOutcome.correct &&
          evaluation.direction_correct
        ) {
          degraded++;
        } else if (evaluation.direction_correct) {
          hypotheticalCorrect++;
        }
      } else {
        // Learning didn't apply, outcome unchanged
        if (evaluation.direction_correct) {
          hypotheticalCorrect++;
        }
      }
    }

    const total = data.length;
    const accuracy = total > 0 ? hypotheticalCorrect / total : 0;

    // Recalculate false positive rate with hypothetical outcomes
    // For simplicity, assume learning reduces FP by 10% when it applies to UP predictions
    const baselineFPRate =
      this.calculateBaselineMetrics(data).falsePositiveRate;
    const fpReduction = learning.learning_type === 'avoid' ? 0.1 : 0.05;
    const falsePositiveRate = Math.max(0, baselineFPRate - fpReduction);

    return {
      total,
      correct: hypotheticalCorrect,
      accuracy,
      falsePositiveRate,
      affected,
      improved,
      degraded,
    };
  }

  /**
   * Determine if a learning would have applied to a historical prediction
   */
  private wouldLearningApply(
    learning: Learning,
    prediction: EvaluationWithPrediction['prediction'],
  ): boolean {
    const config = learning.config;

    switch (learning.learning_type) {
      case 'rule':
        // Rule learnings apply based on conditions
        if (config.trigger_condition) {
          // Simplified: check if condition mentions key terms in prediction
          return prediction.reasoning
            .toLowerCase()
            .includes(config.trigger_condition.toLowerCase());
        }
        return false;

      case 'pattern':
        // Pattern learnings apply when indicators present
        if (config.indicators && Array.isArray(config.indicators)) {
          return config.indicators.some((indicator: string) =>
            prediction.reasoning
              .toLowerCase()
              .includes(indicator.toLowerCase()),
          );
        }
        return false;

      case 'weight_adjustment':
        // Weight adjustments apply to specific analysts
        if (config.analyst_slug) {
          const analystEnsemble = prediction.analyst_ensemble || {};
          return config.analyst_slug in analystEnsemble;
        }
        return false;

      case 'threshold':
        // Threshold learnings apply to predictions below/above certain confidence
        if (typeof config.adjustment === 'number') {
          return prediction.confidence < 0.7; // Would apply to lower confidence predictions
        }
        return false;

      case 'avoid':
        // Avoid learnings apply when anti-pattern detected
        if (config.conditions && Array.isArray(config.conditions)) {
          return config.conditions.some((condition: string) =>
            prediction.reasoning
              .toLowerCase()
              .includes(condition.toLowerCase()),
          );
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Simulate the effect of a learning on a prediction
   * Returns hypothetical outcome if learning had been applied
   */
  private simulateLearningEffect(
    learning: Learning,
    prediction: EvaluationWithPrediction['prediction'],
    evaluation: EvaluationWithPrediction['evaluation'],
  ): { correct: boolean } {
    switch (learning.learning_type) {
      case 'avoid':
        // Avoid learnings prevent bad predictions
        // If learning would have blocked the prediction and it was wrong, that's an improvement
        if (!evaluation.direction_correct) {
          return { correct: true }; // Learning would have prevented bad prediction
        }
        return { correct: evaluation.direction_correct };

      case 'threshold':
        // Threshold learnings filter low-confidence predictions
        if (prediction.confidence < 0.7 && !evaluation.direction_correct) {
          return { correct: true }; // Would have filtered out bad prediction
        }
        return { correct: evaluation.direction_correct };

      case 'rule':
      case 'pattern':
        // Rules and patterns improve prediction accuracy when applied
        // Assume 20% improvement in direction correctness when applied
        if (!evaluation.direction_correct && Math.random() > 0.8) {
          return { correct: true }; // Learning would have corrected prediction
        }
        return { correct: evaluation.direction_correct };

      case 'weight_adjustment':
        // Weight adjustments affect ensemble weighting
        // Assume 10% improvement when adjusting underperforming analysts
        if (!evaluation.direction_correct && Math.random() > 0.9) {
          return { correct: true };
        }
        return { correct: evaluation.direction_correct };

      default:
        return { correct: evaluation.direction_correct };
    }
  }

  /**
   * Calculate statistical significance of improvement
   * Uses simple proportion test (Z-test for proportions)
   *
   * Returns confidence level (0.0 to 1.0)
   */
  private calculateStatisticalSignificance(
    baselineCorrect: number,
    baselineTotal: number,
    improvedCorrect: number,
    improvedTotal: number,
  ): number {
    // Need minimum sample size for statistical significance
    if (baselineTotal < 30 || improvedTotal < 30) {
      return 0.0; // Insufficient sample size
    }

    const p1 = baselineCorrect / baselineTotal;
    const p2 = improvedCorrect / improvedTotal;
    const pooledP =
      (baselineCorrect + improvedCorrect) / (baselineTotal + improvedTotal);

    // Standard error of difference
    const se = Math.sqrt(
      pooledP * (1 - pooledP) * (1 / baselineTotal + 1 / improvedTotal),
    );

    // Z-score
    const z = Math.abs(p2 - p1) / (se || 0.01); // Avoid division by zero

    // Convert Z-score to confidence level (approximate)
    // z > 1.96 => 95% confidence
    // z > 1.645 => 90% confidence
    // z > 1.28 => 80% confidence
    if (z > 1.96) return 0.95;
    if (z > 1.645) return 0.9;
    if (z > 1.28) return 0.8;
    if (z > 1.0) return 0.68;

    return Math.min(0.68, z / 1.96); // Linear interpolation below 68%
  }

  /**
   * Get promotion statistics for an organization
   * Returns aggregate metrics about learning promotions
   */
  async getPromotionStats(organizationSlug: string): Promise<{
    total_test_learnings: number;
    total_promoted: number;
    total_rejected: number;
    pending_review: number;
    avg_times_applied: number;
    avg_success_rate: number;
  }> {
    // Get all test learnings
    const allLearnings = await this.learningRepository.findByScope(
      'runner', // Get all scopes
    );
    const testLearnings = allLearnings.filter((l) => l.is_test);

    // Get promoted learnings
    const lineages =
      await this.lineageRepository.findByOrganization(organizationSlug);
    const promotedIds = new Set(lineages.map((l) => l.test_learning_id));

    // Get rejected learnings
    const rejectedLearnings = testLearnings.filter(
      (l) => l.status === 'disabled' && !promotedIds.has(l.id),
    );

    // Get pending learnings (active but not promoted or rejected)
    const pendingLearnings = testLearnings.filter(
      (l) => l.status === 'active' && !promotedIds.has(l.id),
    );

    // Calculate averages
    const promotedLearnings = testLearnings.filter((l) =>
      promotedIds.has(l.id),
    );
    const avgTimesApplied =
      promotedLearnings.length > 0
        ? promotedLearnings.reduce((sum, l) => sum + l.times_applied, 0) /
          promotedLearnings.length
        : 0;

    const successRates = promotedLearnings
      .filter((l) => l.times_applied > 0)
      .map((l) => l.times_helpful / l.times_applied);
    const avgSuccessRate =
      successRates.length > 0
        ? successRates.reduce((sum, r) => sum + r, 0) / successRates.length
        : 0;

    return {
      total_test_learnings: testLearnings.length,
      total_promoted: promotedIds.size,
      total_rejected: rejectedLearnings.length,
      pending_review: pendingLearnings.length,
      avg_times_applied: avgTimesApplied,
      avg_success_rate: avgSuccessRate,
    };
  }
}
