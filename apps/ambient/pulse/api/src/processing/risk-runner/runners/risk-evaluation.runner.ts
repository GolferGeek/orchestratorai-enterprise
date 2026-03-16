/**
 * Risk Evaluation Runner
 *
 * Scheduled runner that evaluates past risk assessments against actual outcomes.
 * Runs daily to process assessments that have reached their evaluation window.
 *
 * Responsibilities:
 * 1. Find composite scores that need evaluation (7d, 30d, 90d windows)
 * 2. Fetch actual outcomes (price changes, events, etc.)
 * 3. Score accuracy of past assessments
 * 4. Generate learning suggestions for HITL review
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';
import { ScopeRepository } from '../repositories/scope.repository';
import { SubjectRepository } from '../repositories/subject.repository';
import { CompositeScoreRepository } from '../repositories/composite-score.repository';
import {
  RiskEvaluationService,
  EvaluationResult,
} from '../services/risk-evaluation.service';
import { ActualOutcome } from '../interfaces/evaluation.interface';
import { RiskSubject } from '../interfaces/subject.interface';

export interface EvaluationRunnerResult {
  evaluated: number;
  accurate: number;
  inaccurate: number;
  learningsSuggested: number;
  errors: number;
  duration: number;
}

@Injectable()
export class RiskEvaluationRunner {
  private readonly logger = new Logger(RiskEvaluationRunner.name);
  private isRunning = false;

  constructor(
    private readonly scopeRepo: ScopeRepository,
    private readonly subjectRepo: SubjectRepository,
    private readonly compositeScoreRepo: CompositeScoreRepository,
    private readonly evaluationService: RiskEvaluationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Manual trigger for evaluation batch
   */
  async runEvaluationBatch(): Promise<EvaluationRunnerResult> {
    if (this.isRunning) {
      this.logger.warn('Skipping - previous evaluation run still in progress');
      return {
        evaluated: 0,
        accurate: 0,
        inaccurate: 0,
        learningsSuggested: 0,
        errors: 0,
        duration: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    let evaluated = 0;
    let accurate = 0;
    let inaccurate = 0;
    let learningsSuggested = 0;
    let errors = 0;

    try {
      // Process each evaluation window
      const windows: Array<'7d' | '30d' | '90d'> = ['7d', '30d', '90d'];

      for (const window of windows) {
        this.logger.log(`Processing ${window} evaluations`);

        const scoresToEvaluate =
          await this.evaluationService.findScoresToEvaluate(window, 100);

        this.logger.log(
          `Found ${scoresToEvaluate.length} scores to evaluate for ${window}`,
        );

        for (const { score, subject } of scoresToEvaluate) {
          evaluated++;

          try {
            // Fetch actual outcome for the subject
            const actualOutcome = this.fetchActualOutcome(subject, window);

            if (!actualOutcome) {
              this.logger.debug(
                `No outcome data available for ${subject.identifier} (${window})`,
              );
              continue;
            }

            // Get scope for context
            const scope = await this.scopeRepo.findById(subject.scope_id);
            if (!scope) continue;

            // Create execution context
            const context = this.createExecutionContext(
              scope.organization_slug,
              scope.agent_slug,
            );

            // Run evaluation
            const result = await this.evaluationService.evaluateScore({
              compositeScore: score,
              subject,
              actualOutcome,
              evaluationWindow: window,
              context,
            });

            if (result.wasCalibrated) {
              accurate++;
            } else {
              inaccurate++;
            }

            // Queue suggested learnings
            if (result.suggestedLearnings.length > 0) {
              for (const suggestion of result.suggestedLearnings) {
                await this.evaluationService.queueLearning(
                  suggestion,
                  subject.scope_id,
                  subject.id,
                );
                learningsSuggested++;
              }
            }

            this.logger.debug(
              `Evaluated ${subject.identifier} (${window}): accuracy=${(result.scoreAccuracy * 100).toFixed(0)}%`,
            );
          } catch (error) {
            errors++;
            this.logger.error(
              `Failed to evaluate ${subject.identifier}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      const duration = Date.now() - startTime;
      const accuracyRate =
        evaluated > 0 ? ((accurate / evaluated) * 100).toFixed(1) : '0';

      this.logger.log(
        `Evaluation batch complete: ${evaluated} evaluated, ` +
          `${accuracyRate}% accurate, ${learningsSuggested} learnings suggested (${duration}ms)`,
      );

      return {
        evaluated,
        accurate,
        inaccurate,
        learningsSuggested,
        errors,
        duration,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Evaluate a specific composite score manually
   */
  async evaluateScore(
    compositeScoreId: string,
    window: '7d' | '30d' | '90d',
  ): Promise<EvaluationResult | null> {
    const score = await this.compositeScoreRepo.findById(compositeScoreId);
    if (!score) {
      this.logger.warn(`Composite score not found: ${compositeScoreId}`);
      return null;
    }

    const subject = await this.subjectRepo.findById(score.subject_id);
    if (!subject) {
      this.logger.warn(`Subject not found for score: ${compositeScoreId}`);
      return null;
    }

    const actualOutcome = this.fetchActualOutcome(subject, window);
    if (!actualOutcome) {
      this.logger.warn(`No outcome data available for ${subject.identifier}`);
      return null;
    }

    const scope = await this.scopeRepo.findById(subject.scope_id);
    if (!scope) return null;

    const context = this.createExecutionContext(
      scope.organization_slug,
      scope.agent_slug,
    );

    return this.evaluationService.evaluateScore({
      compositeScore: score,
      subject,
      actualOutcome,
      evaluationWindow: window,
      context,
    });
  }

  /**
   * Fetch actual outcome data for a subject
   * In a real implementation, this would call external APIs (Yahoo Finance, etc.)
   * For MVP, we generate synthetic data or use cached historical data
   */
  private fetchActualOutcome(
    subject: RiskSubject,
    _window: '7d' | '30d' | '90d',
  ): ActualOutcome | null {
    // TODO: Implement real data fetching
    // For now, return synthetic data for testing

    // In production, this would:
    // 1. Call Yahoo Finance API for stock price data
    // 2. Calculate actual price change from assessment date to now
    // 3. Calculate realized volatility
    // 4. Fetch any adverse events (earnings misses, etc.)

    if (subject.subject_type === 'stock' || subject.subject_type === 'crypto') {
      // Synthetic outcome for testing
      const random = Math.random();

      return {
        price_change_percent: (random - 0.5) * 30, // -15% to +15%
        max_drawdown_percent: random * 20, // 0% to 20%
        volatility_realized: 0.15 + random * 0.15, // 15% to 30%
        volatility_predicted: 0.2, // Baseline predicted
        outcome_type: random > 0.8 ? 'significant_decline' : 'no_event',
        outcome_date: new Date().toISOString(),
        adverse_events:
          random > 0.9
            ? [
                {
                  type: 'earnings_miss',
                  description: 'Missed earnings expectations',
                  severity: 'medium' as const,
                  date: new Date().toISOString(),
                },
              ]
            : [],
      };
    }

    return null;
  }

  /**
   * Create execution context for runner operations
   */
  private createExecutionContext(
    orgSlug: string,
    agentSlug: string,
  ): ExecutionContext {
    return {
      orgSlug,
      userId: NIL_UUID,
      conversationId: NIL_UUID,
      taskId: `eval-runner-${Date.now()}`,
      planId: NIL_UUID,
      deliverableId: NIL_UUID,
      agentSlug,
      agentType: 'api',
      provider: this.configService.getOrThrow<string>('DEFAULT_LLM_PROVIDER'),
      model: this.configService.getOrThrow<string>('DEFAULT_LLM_MODEL'),
    };
  }

  /**
   * Check if runner is currently processing
   */
  isProcessing(): boolean {
    return this.isRunning;
  }
}
