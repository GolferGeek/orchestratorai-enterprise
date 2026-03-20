/**
 * Risk Evaluation Service
 *
 * Evaluates risk assessments against actual outcomes to measure accuracy.
 * Generates learning suggestions based on evaluation results.
 *
 * Key responsibilities:
 * 1. Compare composite scores to actual outcomes (price changes, volatility, events)
 * 2. Calculate accuracy metrics (calibration, AUC, Brier score)
 * 3. Track per-dimension accuracy
 * 4. Generate suggested learnings for HITL review
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { EvaluationRepository } from '../repositories/evaluation.repository';
import { CompositeScoreRepository } from '../repositories/composite-score.repository';
import { SubjectRepository } from '../repositories/subject.repository';
import { LearningRepository } from '../repositories/learning.repository';
import {
  RiskEvaluation,
  CreateRiskEvaluationData,
  ActualOutcome,
  DimensionAccuracy,
} from '../interfaces/evaluation.interface';
import { RiskCompositeScore } from '../interfaces/composite-score.interface';
import { RiskSubject } from '../interfaces/subject.interface';
import { CreateLearningQueueItemData } from '../interfaces/learning.interface';

export interface EvaluationInput {
  compositeScore: RiskCompositeScore;
  subject: RiskSubject;
  actualOutcome: ActualOutcome;
  evaluationWindow: '7d' | '30d' | '90d';
  context: ExecutionContext;
}

export interface EvaluationResult {
  evaluation: RiskEvaluation;
  scoreAccuracy: number;
  wasCalibrated: boolean;
  suggestedLearnings: SuggestedLearning[];
}

export interface SuggestedLearning {
  type: 'rule' | 'pattern' | 'avoid' | 'weight_adjustment' | 'threshold';
  scopeLevel: 'runner' | 'domain' | 'scope' | 'subject' | 'dimension';
  title: string;
  description: string;
  config: Record<string, unknown>;
  confidence: number;
  sourceEvaluationId: string;
  reason: string;
}

export interface AccuracyMetrics {
  overallAccuracy: number;
  calibrationScore: number;
  discriminationScore: number;
  brierScore: number;
  byWindow: Record<string, { count: number; accuracy: number }>;
  byDimension: Record<string, { count: number; accuracy: number }>;
}

@Injectable()
export class RiskEvaluationService {
  private readonly logger = new Logger(RiskEvaluationService.name);

  constructor(
    private readonly evaluationRepo: EvaluationRepository,
    private readonly compositeScoreRepo: CompositeScoreRepository,
    private readonly subjectRepo: SubjectRepository,
    private readonly learningRepo: LearningRepository,
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  /**
   * Evaluate a composite score against actual outcomes
   */
  async evaluateScore(input: EvaluationInput): Promise<EvaluationResult> {
    const {
      compositeScore,
      subject,
      actualOutcome,
      evaluationWindow,
      context,
    } = input;

    this.logger.log(
      `Evaluating composite score ${compositeScore.id} for ${subject.identifier} (${evaluationWindow})`,
    );

    // Check if already evaluated for this window
    const existing = await this.evaluationRepo.findByScoreAndWindow(
      compositeScore.id,
      evaluationWindow,
    );
    if (existing) {
      this.logger.debug(
        `Already evaluated score ${compositeScore.id} for ${evaluationWindow}`,
      );
      return {
        evaluation: existing,
        scoreAccuracy: existing.score_accuracy ?? 0,
        wasCalibrated: this.isCalibrated(
          compositeScore.overall_score,
          existing.outcome_severity ?? 0,
        ),
        suggestedLearnings: [],
      };
    }

    // Calculate outcome severity from actual outcome
    const outcomeSeverity = this.calculateOutcomeSeverity(actualOutcome);

    // Calculate score accuracy (how close was risk score to actual outcome severity)
    const scoreAccuracy = this.calculateScoreAccuracy(
      compositeScore.overall_score,
      outcomeSeverity,
    );

    // Calculate per-dimension accuracy
    const dimensionAccuracy = this.calculateDimensionAccuracy(
      compositeScore.dimension_scores,
      actualOutcome,
    );

    // Calculate calibration error
    const calibrationError = this.calculateCalibrationError(
      compositeScore.overall_score,
      outcomeSeverity,
    );

    // Create evaluation record
    const evaluationData: CreateRiskEvaluationData = {
      composite_score_id: compositeScore.id,
      subject_id: subject.id,
      evaluation_window: evaluationWindow,
      actual_outcome: actualOutcome,
      outcome_severity: outcomeSeverity,
      score_accuracy: scoreAccuracy,
      dimension_accuracy: dimensionAccuracy,
      calibration_error: calibrationError,
      is_test: false,
    };

    const evaluation = await this.evaluationRepo.create(evaluationData);

    this.logger.log(
      `Evaluation created: ${evaluation.id} - accuracy: ${(scoreAccuracy * 100).toFixed(1)}%, severity: ${outcomeSeverity}`,
    );

    // Generate learning suggestions if accuracy is low
    const suggestedLearnings: SuggestedLearning[] = [];
    if (scoreAccuracy < 0.6) {
      const suggestions = await this.generateLearningSuggestions(
        evaluation,
        compositeScore,
        subject,
        actualOutcome,
        context,
      );
      suggestedLearnings.push(...suggestions);
    }

    return {
      evaluation,
      scoreAccuracy,
      wasCalibrated: this.isCalibrated(
        compositeScore.overall_score,
        outcomeSeverity,
      ),
      suggestedLearnings,
    };
  }

  /**
   * Find composite scores that need evaluation
   * Returns scores that are old enough for the specified window and haven't been evaluated
   */
  async findScoresToEvaluate(
    evaluationWindow: '7d' | '30d' | '90d',
    limit: number = 50,
  ): Promise<{ score: RiskCompositeScore; subject: RiskSubject }[]> {
    const windowDays = this.windowToDays(evaluationWindow);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);

    // Get composite scores older than the window
    const scores =
      await this.compositeScoreRepo.findScoresOlderThan(cutoffDate);

    // Filter to scores that haven't been evaluated for this window
    const scoresToEvaluate: {
      score: RiskCompositeScore;
      subject: RiskSubject;
    }[] = [];

    for (const score of scores) {
      if (scoresToEvaluate.length >= limit) break;

      const existing = await this.evaluationRepo.findByScoreAndWindow(
        score.id,
        evaluationWindow,
      );

      if (!existing) {
        const subject = await this.subjectRepo.findById(score.subject_id);
        if (subject) {
          scoresToEvaluate.push({ score, subject });
        }
      }
    }

    return scoresToEvaluate;
  }

  /**
   * Calculate outcome severity from actual outcome (0-100)
   */
  private calculateOutcomeSeverity(outcome: ActualOutcome): number {
    let severity = 0;

    // Price change contribution (max 40 points)
    if (outcome.price_change_percent !== undefined) {
      const absChange = Math.abs(outcome.price_change_percent);
      if (absChange > 20) severity += 40;
      else if (absChange > 10) severity += 30;
      else if (absChange > 5) severity += 20;
      else if (absChange > 2) severity += 10;
    }

    // Drawdown contribution (max 30 points)
    if (outcome.max_drawdown_percent !== undefined) {
      const drawdown = Math.abs(outcome.max_drawdown_percent);
      if (drawdown > 30) severity += 30;
      else if (drawdown > 20) severity += 20;
      else if (drawdown > 10) severity += 15;
      else if (drawdown > 5) severity += 10;
    }

    // Volatility spike contribution (max 20 points)
    if (
      outcome.volatility_realized !== undefined &&
      outcome.volatility_predicted !== undefined
    ) {
      const volRatio =
        outcome.volatility_realized / outcome.volatility_predicted;
      if (volRatio > 2) severity += 20;
      else if (volRatio > 1.5) severity += 15;
      else if (volRatio > 1.2) severity += 10;
    }

    // Adverse events contribution (max 10 points)
    if (outcome.adverse_events && outcome.adverse_events.length > 0) {
      for (const event of outcome.adverse_events) {
        if (event.severity === 'critical') severity += 10;
        else if (event.severity === 'high') severity += 7;
        else if (event.severity === 'medium') severity += 4;
        else severity += 2;
      }
    }

    return Math.min(100, severity);
  }

  /**
   * Calculate score accuracy (0-1)
   * Higher accuracy means the risk score predicted the actual outcome severity well
   */
  private calculateScoreAccuracy(
    riskScore: number,
    outcomeSeverity: number,
  ): number {
    const diff = Math.abs(riskScore - outcomeSeverity);
    // Perfect accuracy if within 10 points, linear decay after
    if (diff <= 10) return 1.0;
    if (diff >= 50) return 0.0;
    return 1.0 - (diff - 10) / 40;
  }

  /**
   * Check if score was well-calibrated
   */
  private isCalibrated(riskScore: number, outcomeSeverity: number): boolean {
    // Calibrated if within 15 points
    return Math.abs(riskScore - outcomeSeverity) <= 15;
  }

  /**
   * Calculate calibration error
   */
  private calculateCalibrationError(
    riskScore: number,
    outcomeSeverity: number,
  ): number {
    return riskScore - outcomeSeverity;
  }

  /**
   * Calculate per-dimension accuracy
   */
  private calculateDimensionAccuracy(
    dimensionScores: Record<string, number>,
    actualOutcome: ActualOutcome,
  ): DimensionAccuracy {
    const accuracy: DimensionAccuracy = {};

    for (const [dimension, score] of Object.entries(dimensionScores)) {
      // Map dimension to relevant outcome aspect
      let wasHelpful = false;
      let contributionToAccuracy = 0;

      switch (dimension) {
        case 'market':
          // Market risk should predict volatility
          if (actualOutcome.volatility_realized !== undefined) {
            const volSeverity =
              actualOutcome.volatility_realized > 0.3
                ? 80
                : actualOutcome.volatility_realized > 0.2
                  ? 60
                  : 40;
            wasHelpful = Math.abs(score - volSeverity) < 20;
            contributionToAccuracy = wasHelpful ? 0.2 : 0;
          }
          break;

        case 'fundamental':
          // Fundamental risk should predict adverse events
          if (actualOutcome.adverse_events) {
            const eventSeverity = actualOutcome.adverse_events.length * 20;
            wasHelpful = Math.abs(score - Math.min(100, eventSeverity)) < 25;
            contributionToAccuracy = wasHelpful ? 0.2 : 0;
          }
          break;

        case 'technical':
          // Technical risk should predict drawdowns
          if (actualOutcome.max_drawdown_percent !== undefined) {
            const drawdownSeverity =
              Math.abs(actualOutcome.max_drawdown_percent) * 2;
            wasHelpful = Math.abs(score - Math.min(100, drawdownSeverity)) < 20;
            contributionToAccuracy = wasHelpful ? 0.2 : 0;
          }
          break;

        default:
          // Generic helpfulness check based on overall outcome
          wasHelpful =
            score > 50 && this.calculateOutcomeSeverity(actualOutcome) > 50;
          contributionToAccuracy = wasHelpful ? 0.1 : 0;
      }

      accuracy[dimension] = {
        predicted_score: score,
        contribution_to_accuracy: contributionToAccuracy,
        was_helpful: wasHelpful,
      };
    }

    return accuracy;
  }

  /**
   * Generate learning suggestions from evaluation
   */
  private async generateLearningSuggestions(
    evaluation: RiskEvaluation,
    compositeScore: RiskCompositeScore,
    subject: RiskSubject,
    actualOutcome: ActualOutcome,
    context: ExecutionContext,
  ): Promise<SuggestedLearning[]> {
    const suggestions: SuggestedLearning[] = [];

    // Analyze the gap between prediction and actual
    const gap =
      compositeScore.overall_score - (evaluation.outcome_severity ?? 0);

    if (Math.abs(gap) < 15) {
      return suggestions; // Score was reasonably accurate
    }

    // Use LLM to generate learning suggestions
    try {
      const systemPrompt = `You are a risk analysis learning generator. Analyze the evaluation results and suggest learnings to improve future risk assessments.

Learning types:
- rule: Hard rule to apply in specific conditions
- pattern: Pattern recognition hint for analysts
- avoid: Anti-pattern to avoid
- weight_adjustment: Adjust dimension weight
- threshold: Adjust scoring thresholds

Output JSON format:
{
  "suggestions": [
    {
      "type": "pattern|rule|avoid|weight_adjustment|threshold",
      "title": "Short learning title",
      "description": "Detailed description of the learning",
      "reason": "Why this learning would help",
      "confidence": 0.0-1.0
    }
  ]
}`;

      const userPrompt = `Evaluation Results:
- Subject: ${subject.identifier} (${subject.subject_type})
- Predicted Risk Score: ${compositeScore.overall_score}
- Actual Outcome Severity: ${evaluation.outcome_severity}
- Gap: ${gap} (${gap > 0 ? 'overpredicted' : 'underpredicted'} risk)
- Calibration Error: ${evaluation.calibration_error}
- Dimension Scores: ${JSON.stringify(compositeScore.dimension_scores)}
- Dimension Accuracy: ${JSON.stringify(evaluation.dimension_accuracy)}
- Actual Outcome: ${JSON.stringify(actualOutcome)}

Generate 1-3 learning suggestions to improve future risk assessments.`;

      const response = await this.llmService.generateResponse(
        systemPrompt,
        userPrompt,
        {
          executionContext: context,
          callerType: 'api',
          callerName: 'risk-evaluation-service',
        },
      );

      const content =
        typeof response === 'string' ? response : response.content;
      const parsed = JSON.parse(content) as {
        suggestions: Array<{
          type: string;
          title: string;
          description: string;
          reason: string;
          confidence: number;
        }>;
      };

      for (const suggestion of parsed.suggestions || []) {
        suggestions.push({
          type: suggestion.type as SuggestedLearning['type'],
          scopeLevel: gap > 0 ? 'subject' : 'scope', // Subject-specific if overpredicting
          title: suggestion.title,
          description: suggestion.description,
          config: {},
          confidence: Math.min(1, Math.max(0, suggestion.confidence || 0.7)),
          sourceEvaluationId: evaluation.id,
          reason: suggestion.reason,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to generate learning suggestions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return suggestions;
  }

  /**
   * Queue a suggested learning for HITL review
   */
  async queueLearning(
    suggestion: SuggestedLearning,
    scopeId?: string,
    subjectId?: string,
  ): Promise<void> {
    const queueData: CreateLearningQueueItemData = {
      scope_id: scopeId,
      subject_id: subjectId,
      evaluation_id: suggestion.sourceEvaluationId,
      suggested_scope_level: suggestion.scopeLevel,
      suggested_learning_type: suggestion.type,
      suggested_title: suggestion.title,
      suggested_description: suggestion.description,
      suggested_config: suggestion.config,
      ai_reasoning: suggestion.reason,
      ai_confidence: suggestion.confidence,
      status: 'pending',
      is_test: false,
    };

    await this.learningRepo.createQueueItem(queueData);

    this.logger.log(
      `Queued learning suggestion: ${suggestion.title} (confidence: ${(suggestion.confidence * 100).toFixed(0)}%)`,
    );
  }

  /**
   * Calculate aggregate accuracy metrics
   */
  async calculateAccuracyMetrics(scopeId?: string): Promise<AccuracyMetrics> {
    // Get all evaluations (optionally filtered by scope)
    const evaluations: RiskEvaluation[] = [];

    if (scopeId) {
      // Get subjects for scope
      const subjects = await this.subjectRepo.findByScope(scopeId);
      for (const subject of subjects) {
        const subjectEvals = await this.evaluationRepo.findBySubject(
          subject.id,
        );
        evaluations.push(...subjectEvals);
      }
    } else {
      // Get all evaluations (limited)
      const windows: Array<'7d' | '30d' | '90d'> = ['7d', '30d', '90d'];
      for (const window of windows) {
        const windowEvals = await this.evaluationRepo.findAllByWindow(window);
        evaluations.push(...windowEvals);
      }
    }

    if (evaluations.length === 0) {
      return {
        overallAccuracy: 0,
        calibrationScore: 0,
        discriminationScore: 0,
        brierScore: 1.0, // Worst possible
        byWindow: {},
        byDimension: {},
      };
    }

    // Calculate overall accuracy
    const accuracies = evaluations
      .filter((e) => e.score_accuracy !== null)
      .map((e) => e.score_accuracy!);
    const overallAccuracy =
      accuracies.length > 0
        ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
        : 0;

    // Calculate calibration score (inverse of average absolute calibration error)
    const calibrationErrors = evaluations
      .filter((e) => e.calibration_error !== null)
      .map((e) => Math.abs(e.calibration_error!));
    const avgCalibrationError =
      calibrationErrors.length > 0
        ? calibrationErrors.reduce((a, b) => a + b, 0) /
          calibrationErrors.length
        : 50;
    const calibrationScore = Math.max(0, 1 - avgCalibrationError / 100);

    // Calculate Brier score (lower is better)
    const brierScores = evaluations
      .filter((e) => e.score_accuracy !== null && e.outcome_severity !== null)
      .map((e) =>
        Math.pow((e.score_accuracy! * 100 - e.outcome_severity!) / 100, 2),
      );
    const brierScore =
      brierScores.length > 0
        ? brierScores.reduce((a, b) => a + b, 0) / brierScores.length
        : 1.0;

    // By window
    const byWindow: Record<string, { count: number; accuracy: number }> = {};
    for (const window of ['7d', '30d', '90d']) {
      const windowEvals = evaluations.filter(
        (e) => e.evaluation_window === window,
      );
      if (windowEvals.length > 0) {
        const windowAccuracies = windowEvals
          .filter((e) => e.score_accuracy !== null)
          .map((e) => e.score_accuracy!);
        byWindow[window] = {
          count: windowEvals.length,
          accuracy:
            windowAccuracies.length > 0
              ? windowAccuracies.reduce((a, b) => a + b, 0) /
                windowAccuracies.length
              : 0,
        };
      }
    }

    // By dimension (aggregate from dimension_accuracy)
    const byDimension: Record<string, { count: number; accuracy: number }> = {};
    const dimensionHelpful: Record<string, { helpful: number; total: number }> =
      {};

    for (const evaluation of evaluations) {
      if (!evaluation.dimension_accuracy) continue;
      for (const [dim, data] of Object.entries(evaluation.dimension_accuracy)) {
        if (!dimensionHelpful[dim]) {
          dimensionHelpful[dim] = { helpful: 0, total: 0 };
        }
        dimensionHelpful[dim].total++;
        if (data.was_helpful) {
          dimensionHelpful[dim].helpful++;
        }
      }
    }

    for (const [dim, data] of Object.entries(dimensionHelpful)) {
      byDimension[dim] = {
        count: data.total,
        accuracy: data.total > 0 ? data.helpful / data.total : 0,
      };
    }

    return {
      overallAccuracy,
      calibrationScore,
      discriminationScore: overallAccuracy, // Simplified - use accuracy as discrimination
      brierScore,
      byWindow,
      byDimension,
    };
  }

  /**
   * Convert window string to days
   */
  private windowToDays(window: '7d' | '30d' | '90d'): number {
    switch (window) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '90d':
        return 90;
    }
  }

  /**
   * Get evaluation by ID
   */
  async getEvaluationById(id: string): Promise<RiskEvaluation | null> {
    return this.evaluationRepo.findById(id);
  }

  /**
   * Get evaluations for a subject
   */
  async getEvaluationsForSubject(subjectId: string): Promise<RiskEvaluation[]> {
    return this.evaluationRepo.findBySubject(subjectId);
  }
}
