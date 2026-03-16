/**
 * Risk Learning Runner
 *
 * Scheduled runner that processes learnings and generates improvement suggestions.
 * Runs daily to:
 * 1. Analyze evaluation patterns and generate new learning suggestions
 * 2. Update learning effectiveness scores
 * 3. Run historical replay tests for pending learnings
 * 4. Auto-retire ineffective learnings
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';
import { createSystemTriggeredContext } from '../../../automation-context/automation-context';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { ScopeRepository } from '../repositories/scope.repository';
import { EvaluationRepository } from '../repositories/evaluation.repository';
import { LearningRepository } from '../repositories/learning.repository';
import { RiskLearningService } from '../services/risk-learning.service';
import { HistoricalReplayService } from '../services/historical-replay.service';
import { RiskEvaluation } from '../interfaces/evaluation.interface';

export interface LearningRunnerResult {
  learningsSuggested: number;
  learningsUpdated: number;
  learningsRetired: number;
  replayTestsRun: number;
  replayTestsPassed: number;
  errors: number;
  duration: number;
}

@Injectable()
export class RiskLearningRunner {
  private readonly logger = new Logger(RiskLearningRunner.name);
  private isRunning = false;

  // Thresholds for learning management
  private readonly MIN_APPLICATIONS_FOR_EVALUATION = 10;
  private readonly MIN_EFFECTIVENESS_FOR_RETENTION = 0.4;
  private readonly MAX_DAYS_WITHOUT_APPLICATION = 90;

  constructor(
    private readonly scopeRepo: ScopeRepository,
    private readonly evaluationRepo: EvaluationRepository,
    private readonly learningRepo: LearningRepository,
    private readonly learningService: RiskLearningService,
    private readonly replayService: HistoricalReplayService,
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Manual trigger for learning batch processing
   */
  async runLearningBatch(): Promise<LearningRunnerResult> {
    if (this.isRunning) {
      this.logger.warn('Skipping - previous learning run still in progress');
      return {
        learningsSuggested: 0,
        learningsUpdated: 0,
        learningsRetired: 0,
        replayTestsRun: 0,
        replayTestsPassed: 0,
        errors: 0,
        duration: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    let learningsSuggested = 0;
    let learningsUpdated = 0;
    let learningsRetired = 0;
    let replayTestsRun = 0;
    let replayTestsPassed = 0;
    let errors = 0;

    try {
      // 1. Analyze recent evaluations for new learning opportunities
      this.logger.log('Analyzing recent evaluations for learning patterns...');
      const newSuggestions = await this.analyzeEvaluationsForLearnings();
      learningsSuggested = newSuggestions;

      // 2. Update effectiveness scores for all active learnings
      this.logger.log('Updating learning effectiveness scores...');
      const updatedCount = await this.updateEffectivenessScores();
      learningsUpdated = updatedCount;

      // 3. Run replay tests for test learnings that need validation
      this.logger.log('Running replay tests for pending learnings...');
      const replayResults = await this.runPendingReplayTests();
      replayTestsRun = replayResults.testsRun;
      replayTestsPassed = replayResults.testsPassed;

      // 4. Retire ineffective learnings
      this.logger.log('Checking for learnings to retire...');
      const retiredCount = await this.retireIneffectiveLearnings();
      learningsRetired = retiredCount;

      const duration = Date.now() - startTime;

      this.logger.log(
        `Learning batch complete: ${learningsSuggested} suggested, ` +
          `${learningsUpdated} updated, ${learningsRetired} retired, ` +
          `${replayTestsPassed}/${replayTestsRun} replay tests passed (${duration}ms)`,
      );

      return {
        learningsSuggested,
        learningsUpdated,
        learningsRetired,
        replayTestsRun,
        replayTestsPassed,
        errors,
        duration,
      };
    } catch (error) {
      errors++;
      this.logger.error(
        `Learning batch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        learningsSuggested,
        learningsUpdated,
        learningsRetired,
        replayTestsRun,
        replayTestsPassed,
        errors,
        duration: Date.now() - startTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Analyze recent evaluations to identify learning patterns
   */
  private async analyzeEvaluationsForLearnings(): Promise<number> {
    let suggestionsCreated = 0;

    // Get evaluations from the last 7 days
    const recentEvaluations = await this.getRecentEvaluations(7);

    if (recentEvaluations.length < 5) {
      this.logger.debug('Not enough recent evaluations for pattern analysis');
      return 0;
    }

    // Group evaluations by accuracy pattern
    const inaccurateEvaluations = recentEvaluations.filter(
      (e) => e.score_accuracy !== null && e.score_accuracy < 0.6,
    );

    if (inaccurateEvaluations.length < 3) {
      this.logger.debug(
        'Not enough inaccurate evaluations for learning suggestions',
      );
      return 0;
    }

    // Use LLM to analyze patterns and suggest learnings
    try {
      const patterns = await this.identifyPatterns(inaccurateEvaluations);

      for (const pattern of patterns) {
        // Check if similar learning already exists
        const existingLearnings = await this.learningRepo.findAllLearnings({
          includeTest: true,
        });

        const isDuplicate = existingLearnings.some(
          (l) =>
            l.title.toLowerCase().includes(pattern.title.toLowerCase()) ||
            (l.description?.toLowerCase() || '').includes(
              pattern.description.toLowerCase(),
            ),
        );

        if (!isDuplicate) {
          await this.learningRepo.createQueueItem({
            suggested_scope_level: pattern.scopeLevel,
            suggested_learning_type: pattern.type,
            suggested_title: pattern.title,
            suggested_description: pattern.description,
            suggested_config: pattern.config,
            ai_reasoning: pattern.reasoning,
            ai_confidence: pattern.confidence,
            status: 'pending',
            is_test: false,
          });
          suggestionsCreated++;
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to analyze patterns: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return suggestionsCreated;
  }

  /**
   * Get recent evaluations
   */
  private async getRecentEvaluations(days: number): Promise<RiskEvaluation[]> {
    const evaluations: RiskEvaluation[] = [];
    const windows: Array<'7d' | '30d' | '90d'> = ['7d', '30d', '90d'];

    for (const window of windows) {
      const windowEvals = await this.evaluationRepo.findAllByWindow(window, {
        includeTest: false,
      });

      // Filter to recent
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      for (const eval_ of windowEvals) {
        if (new Date(eval_.created_at) >= cutoff) {
          evaluations.push(eval_);
        }
      }
    }

    return evaluations;
  }

  /**
   * Use LLM to identify patterns from inaccurate evaluations
   */
  private async identifyPatterns(evaluations: RiskEvaluation[]): Promise<
    Array<{
      type: string;
      scopeLevel: string;
      title: string;
      description: string;
      config: Record<string, unknown>;
      confidence: number;
      reasoning: string;
    }>
  > {
    const systemPrompt = `You are a risk analysis pattern detector. Analyze evaluation results to identify patterns that could improve future risk assessments.

For each pattern, provide:
- type: rule | pattern | avoid | weight_adjustment | threshold
- scopeLevel: runner | domain | scope | subject
- title: Short, descriptive title
- description: What the learning captures
- config: Any configuration needed
- confidence: 0.0-1.0
- reasoning: Why this pattern matters

Output JSON format:
{
  "patterns": [
    {
      "type": "pattern",
      "scopeLevel": "domain",
      "title": "...",
      "description": "...",
      "config": {},
      "confidence": 0.8,
      "reasoning": "..."
    }
  ]
}`;

    const evaluationSummary = evaluations.map((e) => ({
      id: e.id,
      window: e.evaluation_window,
      score_accuracy: e.score_accuracy,
      calibration_error: e.calibration_error,
      outcome_severity: e.outcome_severity,
      dimension_accuracy: e.dimension_accuracy,
    }));

    const userPrompt = `Analyze these inaccurate risk evaluations and identify patterns that could improve accuracy:

${JSON.stringify(evaluationSummary, null, 2)}

Identify 1-3 actionable learning patterns.`;

    const context: ExecutionContext = createSystemTriggeredContext({
      orgSlug: 'system',
      agentSlug: 'risk-learning-runner',
      provider: this.configService.getOrThrow<string>('DEFAULT_LLM_PROVIDER'),
      model: this.configService.getOrThrow<string>('DEFAULT_LLM_MODEL'),
    });

    const response = await this.llmService.generateResponse(
      systemPrompt,
      userPrompt,
      {
        executionContext: context,
        callerType: 'api',
        callerName: 'risk-learning-runner',
      },
    );

    const content = typeof response === 'string' ? response : response.content;

    try {
      const parsed = JSON.parse(content) as {
        patterns: Array<{
          type: string;
          scopeLevel: string;
          title: string;
          description: string;
          config: Record<string, unknown>;
          confidence: number;
          reasoning: string;
        }>;
      };
      return parsed.patterns || [];
    } catch {
      this.logger.warn('Failed to parse pattern response');
      return [];
    }
  }

  /**
   * Update effectiveness scores for all active learnings
   */
  private async updateEffectivenessScores(): Promise<number> {
    let updated = 0;

    const learnings = await this.learningRepo.findAllLearnings({
      includeTest: true,
    });

    for (const learning of learnings) {
      if (
        learning.times_applied >= this.MIN_APPLICATIONS_FOR_EVALUATION &&
        learning.status === 'active'
      ) {
        try {
          await this.learningService.updateEffectivenessScore(learning.id);
          updated++;
        } catch (error) {
          this.logger.warn(
            `Failed to update effectiveness for ${learning.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return updated;
  }

  /**
   * Run replay tests for test learnings that haven't been validated
   */
  private async runPendingReplayTests(): Promise<{
    testsRun: number;
    testsPassed: number;
  }> {
    let testsRun = 0;
    let testsPassed = 0;

    // Get test learnings in 'testing' status
    const testLearnings = await this.learningRepo.findAllLearnings({
      includeTest: true,
    });

    const pendingTests = testLearnings.filter(
      (l) => l.is_test && l.status === 'testing' && l.times_applied < 5,
    );

    for (const learning of pendingTests.slice(0, 10)) {
      // Limit to 10 per run
      try {
        const result = await this.replayService.replayLearning(
          learning.id,
          30, // 30 day window
        );
        testsRun++;

        if (result.pass) {
          testsPassed++;
          this.logger.debug(
            `Replay test passed for ${learning.title}: +${(result.accuracyLift * 100).toFixed(1)}%`,
          );
        } else {
          this.logger.debug(
            `Replay test failed for ${learning.title}: ${(result.accuracyLift * 100).toFixed(1)}%`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to run replay test for ${learning.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { testsRun, testsPassed };
  }

  /**
   * Retire learnings that have proven ineffective
   */
  private async retireIneffectiveLearnings(): Promise<number> {
    let retired = 0;

    const learnings = await this.learningRepo.findAllLearnings({
      includeTest: true,
    });

    for (const learning of learnings) {
      if (learning.status !== 'active' && learning.status !== 'testing') {
        continue;
      }

      let shouldRetire = false;
      let reason = '';

      // Check effectiveness threshold
      if (learning.times_applied >= this.MIN_APPLICATIONS_FOR_EVALUATION) {
        const effectiveness =
          learning.times_helpful / Math.max(1, learning.times_applied);
        if (effectiveness < this.MIN_EFFECTIVENESS_FOR_RETENTION) {
          shouldRetire = true;
          reason = `Low effectiveness: ${(effectiveness * 100).toFixed(0)}%`;
        }
      }

      // Check age without application
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(learning.updated_at).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (
        daysSinceUpdate > this.MAX_DAYS_WITHOUT_APPLICATION &&
        learning.times_applied === 0
      ) {
        shouldRetire = true;
        reason = `No applications in ${daysSinceUpdate} days`;
      }

      if (shouldRetire) {
        try {
          await this.learningService.retireLearning(
            learning.id,
            NIL_UUID, // System user
            reason,
          );
          retired++;
          this.logger.log(`Retired learning ${learning.title}: ${reason}`);
        } catch (error) {
          this.logger.warn(
            `Failed to retire learning ${learning.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return retired;
  }

  /**
   * Check if runner is currently processing
   */
  isProcessing(): boolean {
    return this.isRunning;
  }
}
