import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ScenarioRunRepository } from '../repositories/scenario-run.repository';
import { TestAuditLogRepository } from '../repositories/test-audit-log.repository';
import { TestScenarioRepository } from '../repositories/test-scenario.repository';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  ScenarioRun,
  CreateScenarioRunData,
  TestScenario,
} from '../interfaces/test-data.interface';
import { Signal } from '../interfaces/signal.interface';
import { Predictor } from '../interfaces/predictor.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

/**
 * Execution result for a scenario run
 */
export interface ScenarioRunExecutionResult {
  success: boolean;
  run_id: string;
  signals_generated: number;
  predictors_generated: number;
  predictions_generated: number;
  outcome_match: boolean;
  errors: string[];
  duration_ms: number;
}

/**
 * Detailed results from a completed scenario run
 */
export interface ScenarioRunResults {
  run: ScenarioRun;
  scenario: TestScenario;
  execution_details: {
    signals_generated: number;
    predictors_generated: number;
    predictions_generated: number;
    outcome_match: boolean;
    errors: string[];
  };
  audit_trail: Array<{
    action: string;
    timestamp: string;
    details: Record<string, unknown>;
  }>;
}

/**
 * Outcome comparison result
 */
export interface OutcomeComparison {
  match: boolean;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  differences: string[];
}

/**
 * Service for orchestrating scenario run execution
 * Part of the Test-Based Learning Loop - Phase 1
 *
 * Responsibilities:
 * - Create and manage scenario runs
 * - Execute scenario runs (process test articles, generate signals, predictors, predictions)
 * - Compare actual outcomes to expected outcomes
 * - Track version info (INV-10)
 * - Log all actions to test_audit_log
 */
@Injectable()
export class ScenarioRunService {
  private readonly logger = new Logger(ScenarioRunService.name);
  private readonly schema = 'prediction';

  constructor(
    private readonly scenarioRunRepository: ScenarioRunRepository,
    private readonly testAuditLogRepository: TestAuditLogRepository,
    private readonly testScenarioRepository: TestScenarioRepository,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO RUN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a new scenario run
   * Creates a run record and logs the action to audit trail
   *
   * @param scenarioId - The test scenario to run
   * @param userId - User who triggered the run
   * @param versionInfo - Code and model versions (INV-10)
   */
  async startRun(
    scenarioId: string,
    userId: string,
    versionInfo?: Record<string, unknown>,
  ): Promise<ScenarioRun> {
    // Fetch the scenario to copy expected outcome
    const scenario = await this.testScenarioRepository.findById(scenarioId);
    if (!scenario) {
      throw new NotFoundException(`Scenario ${scenarioId} not found`);
    }

    // Create the run record
    const runData: CreateScenarioRunData = {
      organization_slug: scenario.organization_slug,
      scenario_id: scenarioId,
      triggered_by: userId,
      version_info: versionInfo ?? {},
      outcome_expected: scenario.config.tier_config ?? {},
    };

    const run = await this.scenarioRunRepository.create(runData);

    // Log to audit trail
    await this.testAuditLogRepository.log({
      organization_slug: scenario.organization_slug,
      user_id: userId,
      action: 'scenario_run_started',
      resource_type: 'scenario_run',
      resource_id: run.id,
      details: {
        scenario_id: scenarioId,
        scenario_name: scenario.name,
        version_info: versionInfo ?? {},
      },
    });

    this.logger.log(
      `Started scenario run ${run.id} for scenario ${scenarioId} (${scenario.name})`,
    );

    return run;
  }

  /**
   * Execute a scenario run
   * Processes test data through the prediction pipeline
   *
   * Steps:
   * 1. Mark run as running
   * 2. Process test articles (generate signals)
   * 3. Generate predictors from signals
   * 4. Generate predictions from predictors
   * 5. Compare outcomes
   * 6. Complete run
   */
  async executeRun(runId: string): Promise<ScenarioRunExecutionResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Fetch the run
      const run = await this.scenarioRunRepository.findById(runId);
      if (!run) {
        throw new NotFoundException(`Run ${runId} not found`);
      }

      // Mark as running
      await this.scenarioRunRepository.markRunning(runId);

      // Fetch the scenario
      const scenario = await this.testScenarioRepository.findById(
        run.scenario_id,
      );
      if (!scenario) {
        throw new NotFoundException(`Scenario ${run.scenario_id} not found`);
      }

      // Execute the pipeline
      let signalsGenerated = 0;
      let predictorsGenerated = 0;
      let predictionsGenerated = 0;

      // Step 1: Process test articles to generate signals
      try {
        signalsGenerated = await this.processTestArticles(run, scenario);
      } catch (err) {
        const errorMessage = `Failed to process test articles: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }

      // Step 2: Generate predictors from signals
      try {
        predictorsGenerated = await this.generatePredictors(run, scenario);
      } catch (err) {
        const errorMessage = `Failed to generate predictors: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }

      // Step 3: Generate predictions from predictors
      try {
        predictionsGenerated = await this.generatePredictions(run, scenario);
      } catch (err) {
        const errorMessage = `Failed to generate predictions: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }

      // Step 4: Compare outcomes
      const actualOutcome = {
        signals_generated: signalsGenerated,
        predictors_generated: predictorsGenerated,
        predictions_generated: predictionsGenerated,
      };

      const comparison = this.compareOutcomes(
        run.outcome_expected,
        actualOutcome,
      );

      // Step 5: Complete the run
      await this.completeRun(runId, actualOutcome, comparison.match);

      // Log completion to audit trail
      await this.testAuditLogRepository.log({
        organization_slug: scenario.organization_slug,
        user_id: run.triggered_by ?? 'system',
        action: 'scenario_run_completed',
        resource_type: 'scenario_run',
        resource_id: runId,
        details: {
          scenario_id: scenario.id,
          outcome_match: comparison.match,
          signals_generated: signalsGenerated,
          predictors_generated: predictorsGenerated,
          predictions_generated: predictionsGenerated,
          errors,
        },
      });

      return {
        success: errors.length === 0,
        run_id: runId,
        signals_generated: signalsGenerated,
        predictors_generated: predictorsGenerated,
        predictions_generated: predictionsGenerated,
        outcome_match: comparison.match,
        errors,
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.failRun(runId, errorMessage);

      return {
        success: false,
        run_id: runId,
        signals_generated: 0,
        predictors_generated: 0,
        predictions_generated: 0,
        outcome_match: false,
        errors: [...errors, errorMessage],
        duration_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Complete a scenario run
   * Marks run as completed and records outcome comparison
   */
  async completeRun(
    runId: string,
    actualOutcome: Record<string, unknown>,
    outcomeMatch: boolean,
  ): Promise<ScenarioRun> {
    return this.scenarioRunRepository.markCompleted(
      runId,
      actualOutcome,
      outcomeMatch,
    );
  }

  /**
   * Fail a scenario run
   * Marks run as failed with error message
   */
  async failRun(runId: string, error: string): Promise<ScenarioRun> {
    const run = await this.scenarioRunRepository.findById(runId);

    if (run) {
      // Log failure to audit trail
      await this.testAuditLogRepository.log({
        organization_slug: run.organization_slug,
        user_id: run.triggered_by ?? 'system',
        action: 'scenario_run_failed',
        resource_type: 'scenario_run',
        resource_id: runId,
        details: {
          error_message: error,
        },
      });
    }

    return this.scenarioRunRepository.markFailed(runId, error);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUN RESULTS AND QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get detailed results from a completed scenario run
   */
  async getRunResults(runId: string): Promise<ScenarioRunResults> {
    const run = await this.scenarioRunRepository.findById(runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const scenario = await this.testScenarioRepository.findById(
      run.scenario_id,
    );
    if (!scenario) {
      throw new NotFoundException(`Scenario ${run.scenario_id} not found`);
    }

    // Get audit trail for this run
    const auditEntries = await this.testAuditLogRepository.findByResource(
      'scenario_run',
      runId,
    );

    const audit_trail = auditEntries.map((entry) => ({
      action: entry.action,
      timestamp: entry.created_at,
      details: entry.details,
    }));

    // Extract execution details from actual outcome
    const actual = run.outcome_actual ?? {};
    const execution_details = {
      signals_generated: (actual.signals_generated as number) ?? 0,
      predictors_generated: (actual.predictors_generated as number) ?? 0,
      predictions_generated: (actual.predictions_generated as number) ?? 0,
      outcome_match: run.outcome_match ?? false,
      errors: [],
    };

    return {
      run,
      scenario,
      execution_details,
      audit_trail,
    };
  }

  /**
   * Get all runs for a scenario
   */
  async getScenarioRuns(scenarioId: string): Promise<ScenarioRun[]> {
    return this.scenarioRunRepository.findByScenario(scenarioId);
  }

  /**
   * Get run statistics for a scenario
   */
  async getScenarioRunStatistics(scenarioId: string): Promise<{
    total_runs: number;
    completed_runs: number;
    failed_runs: number;
    running_runs: number;
    success_rate: number;
    outcome_match_rate: number;
  }> {
    return this.scenarioRunRepository.getStatistics(scenarioId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTCOME COMPARISON
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compare expected outcomes to actual outcomes
   * Determines if the run produced expected results
   *
   * Comparison criteria:
   * - Signals generated count matches expected
   * - Predictors generated count matches expected
   * - Predictions generated count matches expected
   */
  compareOutcomes(
    expected: Record<string, unknown>,
    actual: Record<string, unknown>,
  ): OutcomeComparison {
    const differences: string[] = [];

    // Compare signals count
    if (expected.signals_expected && actual.signals_generated) {
      const expectedSignals = Number(expected.signals_expected);
      const actualSignals = Number(actual.signals_generated);
      if (expectedSignals !== actualSignals) {
        differences.push(
          `Signals: expected ${expectedSignals}, got ${actualSignals}`,
        );
      }
    }

    // Compare predictors count
    if (expected.predictors_expected && actual.predictors_generated) {
      const expectedPredictors = Number(expected.predictors_expected);
      const actualPredictors = Number(actual.predictors_generated);
      if (expectedPredictors !== actualPredictors) {
        differences.push(
          `Predictors: expected ${expectedPredictors}, got ${actualPredictors}`,
        );
      }
    }

    // Compare predictions count
    if (expected.predictions_expected && actual.predictions_generated) {
      const expectedPredictions = Number(expected.predictions_expected);
      const actualPredictions = Number(actual.predictions_generated);
      if (expectedPredictions !== actualPredictions) {
        differences.push(
          `Predictions: expected ${expectedPredictions}, got ${actualPredictions}`,
        );
      }
    }

    const match = differences.length === 0;

    return {
      match,
      expected,
      actual,
      differences,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINE EXECUTION (Private Methods)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process test articles to generate signals
   * This would integrate with the signal detection service in production
   */
  private async processTestArticles(
    run: ScenarioRun,
    scenario: TestScenario,
  ): Promise<number> {
    // Get test articles for this scenario
    const { data: articles, error } = (await this.db
      .from(this.schema, 'test_articles')
      .select('*')
      .eq('test_scenario_id', scenario.id)) as SupabaseSelectListResponse<
      Record<string, unknown>
    >;

    if (error) {
      throw new Error(`Failed to fetch test articles: ${error.message}`);
    }

    const articleCount = articles?.length ?? 0;

    // For each article, generate a signal
    // In production, this would call the signal detection service
    // For now, we create simple test signals
    for (const article of articles ?? []) {
      await this.db.from(this.schema, 'signals').insert({
        target_id: scenario.target_id,
        content: `Signal from article: ${article.title as string}`,
        direction: 'bullish',
        disposition: 'pending',
        is_test_data: true,
        test_scenario_id: scenario.id,
        scenario_run_id: run.id,
      });
    }

    this.logger.debug(
      `Processed ${articleCount} test articles for run ${run.id}`,
    );

    return articleCount;
  }

  /**
   * Generate predictors from signals
   * This would integrate with the predictor management service in production
   */
  private async generatePredictors(
    run: ScenarioRun,
    scenario: TestScenario,
  ): Promise<number> {
    // Get pending signals for this run
    const { data: signals, error } = (await this.db
      .from(this.schema, 'signals')
      .select('*')
      .eq('scenario_run_id', run.id)
      .eq('disposition', 'pending')) as SupabaseSelectListResponse<Signal>;

    if (error) {
      throw new Error(`Failed to fetch signals: ${error.message}`);
    }

    const signalCount = signals?.length ?? 0;

    // For each signal, create a predictor
    for (const signal of signals ?? []) {
      await this.db.from(this.schema, 'predictors').insert({
        signal_id: signal.id,
        target_id: signal.target_id,
        direction: signal.direction,
        strength: 5,
        confidence: 0.7,
        reasoning: `Predictor from signal: ${signal.content.substring(0, 100)}`,
        analyst_slug: 'test-analyst',
        analyst_assessment: { test: true, signal_id: signal.id },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        is_test_data: true,
        test_scenario_id: scenario.id,
        scenario_run_id: run.id,
      });

      // Update signal disposition
      await this.db
        .from(this.schema, 'signals')
        .update({ disposition: 'predictor_created' })
        .eq('id', signal.id);
    }

    this.logger.debug(`Generated ${signalCount} predictors for run ${run.id}`);

    return signalCount;
  }

  /**
   * Generate predictions from predictors
   * This would integrate with the prediction generation service in production
   */
  private async generatePredictions(
    run: ScenarioRun,
    scenario: TestScenario,
  ): Promise<number> {
    // Get active predictors for this run
    const { data: predictors, error } = (await this.db
      .from(this.schema, 'predictors')
      .select('*')
      .eq('scenario_run_id', run.id)
      .eq('status', 'active')) as SupabaseSelectListResponse<Predictor>;

    if (error) {
      throw new Error(`Failed to fetch predictors: ${error.message}`);
    }

    // Group predictors by target
    const byTarget = new Map<string, Predictor[]>();
    for (const predictor of predictors ?? []) {
      const existing = byTarget.get(predictor.target_id) ?? [];
      existing.push(predictor);
      byTarget.set(predictor.target_id, existing);
    }

    let predictionCount = 0;

    // Create a prediction for each target
    for (const [targetId, targetPredictors] of Array.from(byTarget.entries())) {
      // Aggregate direction from predictors
      const directions = targetPredictors.map((p) => p.direction);
      const bullish = directions.filter((d) => d === 'bullish').length;
      const bearish = directions.filter((d) => d === 'bearish').length;

      let direction: 'up' | 'down' | 'flat';
      if (bullish > bearish) {
        direction = 'up';
      } else if (bearish > bullish) {
        direction = 'down';
      } else {
        direction = 'flat';
      }

      const avgConfidence =
        targetPredictors.reduce((sum, p) => sum + p.confidence, 0) /
        targetPredictors.length;

      await this.db.from(this.schema, 'predictions').insert({
        target_id: targetId,
        direction,
        confidence: avgConfidence,
        magnitude: 'medium',
        reasoning: `Prediction from ${targetPredictors.length} predictors`,
        timeframe_hours: 24,
        predicted_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        analyst_ensemble: { test: true },
        llm_ensemble: { test: true },
        is_test_data: true,
        test_scenario_id: scenario.id,
        scenario_run_id: run.id,
      });

      predictionCount++;

      // Mark predictors as consumed
      for (const predictor of targetPredictors) {
        await this.db
          .from(this.schema, 'predictors')
          .update({
            status: 'consumed',
            consumed_at: new Date().toISOString(),
          })
          .eq('id', predictor.id);
      }
    }

    this.logger.debug(
      `Generated ${predictionCount} predictions for run ${run.id}`,
    );

    return predictionCount;
  }
}
