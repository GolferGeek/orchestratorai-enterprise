import { Injectable, Logger } from '@nestjs/common';
import { ReplayTestRepository } from '../repositories/replay-test.repository';
import { PredictionRepository } from '../repositories/prediction.repository';
import { AnalystRepository } from '../repositories/analyst.repository';
import { UniverseRepository } from '../repositories/universe.repository';
import { SignalRepository } from '../repositories/signal.repository';
import { PredictorRepository } from '../repositories/predictor.repository';
import { LearningRepository } from '../repositories/learning.repository';
import {
  ReplayTest,
  CreateReplayTestData,
  ReplayTestSummary,
  ReplayTestResult,
  ReplayTestResults,
  ReplayAffectedRecords,
  RollbackDepth,
} from '../interfaces/test-data.interface';
import { Prediction } from '../interfaces/prediction.interface';

/**
 * Historical Replay Service
 *
 * Orchestrates the replay test workflow using TEST INSTRUMENTS (no delete/restore):
 * 1. Create replay test with configuration
 * 2. Sync test instruments with production instrument contexts
 * 3. Inject historical source data into test pipeline (marked as test data)
 * 4. Run pipeline: sources → signals → predictors → predictions (all as test data)
 * 5. Compare test results against original production predictions
 * 6. Use evaluations as ground truth for accuracy comparison
 *
 * Key principle: Learnings are the CONSTANT, historical data is the VARIABLE.
 * Production data is NEVER deleted - we use parallel test pipeline instead.
 */
@Injectable()
export class HistoricalReplayService {
  private readonly logger = new Logger(HistoricalReplayService.name);

  constructor(
    private readonly replayTestRepository: ReplayTestRepository,
    private readonly predictionRepository: PredictionRepository,
    private readonly analystRepository: AnalystRepository,
    private readonly universeRepository: UniverseRepository,
    private readonly signalRepository: SignalRepository,
    private readonly predictorRepository: PredictorRepository,
    private readonly learningRepository: LearningRepository,
  ) {}

  // =============================================================================
  // REPLAY TEST MANAGEMENT
  // =============================================================================

  /**
   * Create a new replay test
   */
  async createReplayTest(data: CreateReplayTestData): Promise<ReplayTest> {
    this.logger.log(`Creating replay test: ${data.name}`);

    // Validate that evaluations exist for the time period
    const hasEvaluations = this.validateEvaluationsExist(
      data.universe_id,
      data.rollback_to,
      data.target_ids,
    );

    if (!hasEvaluations) {
      throw new Error(
        'No evaluations found for the specified time period. Ground truth is required for comparison.',
      );
    }

    return this.replayTestRepository.create(data);
  }

  /**
   * Get all replay tests for an organization
   */
  async getReplayTests(organizationSlug: string): Promise<ReplayTestSummary[]> {
    return this.replayTestRepository.getSummaries(organizationSlug);
  }

  /**
   * Get a replay test by ID with summary
   */
  async getReplayTestById(id: string): Promise<ReplayTestSummary | null> {
    return this.replayTestRepository.getSummaryById(id);
  }

  /**
   * Get detailed results for a replay test
   */
  async getReplayTestResults(
    replayTestId: string,
  ): Promise<ReplayTestResult[]> {
    return this.replayTestRepository.getResults(replayTestId);
  }

  /**
   * Delete a replay test and its associated test data
   */
  async deleteReplayTest(id: string): Promise<void> {
    const test = await this.replayTestRepository.findById(id);
    if (!test) {
      throw new Error(`Replay test not found: ${id}`);
    }

    // If test is running, don't allow deletion
    if (test.status === 'running') {
      throw new Error('Cannot delete a running replay test');
    }

    // Cleanup test data (all records with test_scenario_id=id)
    await this.cleanupReplayTestData(id);

    // Delete the replay test record itself
    await this.replayTestRepository.delete(id);
    this.logger.log(`Deleted replay test: ${id}`);
  }

  // =============================================================================
  // PREVIEW
  // =============================================================================

  /**
   * Preview what records would be affected by a replay test
   */
  async previewAffectedRecords(
    rollbackDepth: RollbackDepth,
    rollbackTo: string,
    universeId: string,
    targetIds?: string[],
  ): Promise<ReplayAffectedRecords[]> {
    return this.replayTestRepository.getAffectedRecords(
      rollbackDepth,
      rollbackTo,
      universeId,
      targetIds,
    );
  }

  // =============================================================================
  // REPLAY TEST EXECUTION
  // =============================================================================

  /**
   * Run a complete replay test
   * This is the main orchestration method
   *
   * NEW APPROACH (no delete/restore):
   * 1. Record original predictions for the rollback period (for comparison)
   * 2. Sync test instruments with production contexts
   * 3. Inject historical source data into test pipeline
   * 4. Run test pipeline (all outputs marked as test data)
   * 5. Compare test predictions with original predictions
   */
  async runReplayTest(replayTestId: string): Promise<ReplayTestSummary> {
    this.logger.log(`Starting replay test: ${replayTestId}`);

    const test = await this.replayTestRepository.findById(replayTestId);
    if (!test) {
      throw new Error(`Replay test not found: ${replayTestId}`);
    }

    if (test.status !== 'pending' && test.status !== 'snapshot_created') {
      throw new Error(
        `Replay test is in ${test.status} state, cannot run. Only pending or snapshot_created tests can be run.`,
      );
    }

    try {
      // Step 1: Record original predictions for comparison (no deletion!)
      if (test.status === 'pending') {
        await this.recordOriginalPredictions(replayTestId);
      }

      // Step 2: Mark as running
      await this.replayTestRepository.markRunning(replayTestId);

      // Step 3: Sync test instruments with production contexts
      await this.syncTestInstruments(replayTestId);

      // Step 4: Inject historical source data into test pipeline
      await this.injectHistoricalData(replayTestId);

      // Step 5: Run test pipeline (outputs marked as test data)
      await this.triggerTestPipeline(replayTestId);

      // Step 6: Compare test results with original predictions
      const results = await this.compareResults(replayTestId);

      // Step 7: Mark as completed (no restore needed!)
      await this.replayTestRepository.markCompleted(replayTestId, results);

      this.logger.log(`Completed replay test: ${replayTestId}`);
      return (await this.replayTestRepository.getSummaryById(replayTestId))!;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Replay test failed: ${message}`);

      // No restore needed - test data is isolated with is_test_data flag
      await this.replayTestRepository.markFailed(replayTestId, message);
      throw error;
    }
  }

  /**
   * Step 1: Record original predictions for the rollback period
   * These are stored for comparison, NOT deleted
   */
  private async recordOriginalPredictions(replayTestId: string): Promise<void> {
    this.logger.debug(
      `Recording original predictions for replay test: ${replayTestId}`,
    );

    const test = await this.replayTestRepository.findById(replayTestId);
    if (!test) {
      throw new Error(`Replay test not found: ${replayTestId}`);
    }

    // Get the original predictions in the rollback period
    // These will be stored in snapshots for comparison only
    const affectedRecords = await this.replayTestRepository.getAffectedRecords(
      test.rollback_depth,
      test.rollback_to,
      test.universe_id!,
      test.target_ids ?? undefined,
    );

    // Store original predictions for comparison (read-only snapshot)
    for (const record of affectedRecords) {
      if (
        record.table_name === 'predictions' &&
        record.record_ids &&
        record.record_ids.length > 0
      ) {
        await this.replayTestRepository.createSnapshot(
          replayTestId,
          record.table_name,
          record.record_ids,
        );
      }
    }

    await this.replayTestRepository.markSnapshotCreated(replayTestId);
    this.logger.log(
      `Recorded ${affectedRecords.find((r) => r.table_name === 'predictions')?.row_count ?? 0} original predictions for comparison`,
    );
  }

  /**
   * Step 3: Sync test instruments with production instrument contexts
   * Copies current learnings/contexts from production (user fork) to test (ai fork)
   *
   * The ai fork acts as the "test" version that we're validating.
   * We copy the current user fork contexts to ai fork to test current learnings.
   *
   * Also copies all active learnings as test learnings for the test pipeline.
   */
  private async syncTestInstruments(replayTestId: string): Promise<void> {
    this.logger.debug(
      `Syncing test instruments for replay test: ${replayTestId}`,
    );

    const test = await this.replayTestRepository.findById(replayTestId);
    if (!test) {
      throw new Error(`Replay test not found: ${replayTestId}`);
    }

    // =========================================================================
    // PART 1: Sync analyst contexts from user fork to agent fork
    // =========================================================================
    const activeAnalysts = await this.analystRepository.getActive();

    // For each analyst, copy user fork context to agent fork
    // This ensures the test run uses current analyst configurations
    let analystsSynced = 0;
    for (const analyst of activeAnalysts) {
      try {
        // Get current user fork context (production)
        const userContext =
          await this.analystRepository.getCurrentContextVersion(
            analyst.id,
            'user',
          );

        if (userContext) {
          // Create new agent fork version with same context
          // This effectively "syncs" test instruments with production
          await this.analystRepository.createContextVersion(
            analyst.id,
            'ai',
            userContext.perspective,
            userContext.tier_instructions,
            userContext.default_weight,
            `Synced from user fork for replay test: ${test.name}`,
            'system',
          );
          analystsSynced++;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to sync context for analyst ${analyst.slug}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with other analysts
      }
    }

    this.logger.log(
      `Synced ${analystsSynced} analyst contexts for replay test: ${replayTestId}`,
    );

    // =========================================================================
    // PART 2: Copy all active learnings as test learnings
    // =========================================================================
    // Learnings are the KEY thing being tested - we want to see if current
    // learnings would have improved past predictions
    const activeLearnings =
      await this.learningRepository.getAllActiveLearnings();

    let learningsCopied = 0;
    for (const learning of activeLearnings) {
      try {
        await this.learningRepository.createTestCopy(learning, replayTestId);
        learningsCopied++;
      } catch (error) {
        this.logger.warn(
          `Failed to copy learning ${learning.id} (${learning.title}): ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with other learnings
      }
    }

    this.logger.log(
      `Copied ${learningsCopied} learnings as test data for replay test: ${replayTestId}`,
    );

    this.logger.log(
      `Test instrument sync complete: ${analystsSynced} analysts, ${learningsCopied} learnings`,
    );
  }

  /**
   * Step 4: Inject historical source data into test pipeline
   * Copies original signals/predictors as test data (marked with is_test_data=true)
   */
  private async injectHistoricalData(replayTestId: string): Promise<void> {
    this.logger.debug(
      `Injecting historical data for replay test: ${replayTestId}`,
    );

    const test = await this.replayTestRepository.findById(replayTestId);
    if (!test) {
      throw new Error(`Replay test not found: ${replayTestId}`);
    }

    // Get affected records based on rollback depth
    const affectedRecords = await this.replayTestRepository.getAffectedRecords(
      test.rollback_depth,
      test.rollback_to,
      test.universe_id!,
      test.target_ids ?? undefined,
    );

    let signalsInjected = 0;
    let predictorsInjected = 0;

    // For 'signals' depth: copy original signals as test data
    if (test.rollback_depth === 'signals') {
      const signalRecords = affectedRecords.find(
        (r) => r.table_name === 'signals',
      );
      if (signalRecords && signalRecords.record_ids.length > 0) {
        // Fetch original signals
        const originalSignals = await this.signalRepository.findByIds(
          signalRecords.record_ids,
        );

        // Copy as test data
        for (const signal of originalSignals) {
          try {
            await this.signalRepository.createTestCopy(signal, replayTestId);
            signalsInjected++;
          } catch (error) {
            this.logger.warn(
              `Failed to copy signal ${signal.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        this.logger.log(
          `Injected ${signalsInjected} historical signals as test data`,
        );
      }
    }

    // For 'signals' or 'predictors' depth: copy original predictors as test data
    if (
      test.rollback_depth === 'signals' ||
      test.rollback_depth === 'predictors'
    ) {
      const predictorRecords = affectedRecords.find(
        (r) => r.table_name === 'predictors',
      );
      if (predictorRecords && predictorRecords.record_ids.length > 0) {
        // Fetch original predictors
        const originalPredictors = await this.predictorRepository.findByIds(
          predictorRecords.record_ids,
        );

        // Copy as test data
        for (const predictor of originalPredictors) {
          try {
            await this.predictorRepository.createTestCopy(
              predictor,
              replayTestId,
            );
            predictorsInjected++;
          } catch (error) {
            this.logger.warn(
              `Failed to copy predictor ${predictor.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        this.logger.log(
          `Injected ${predictorsInjected} historical predictors as test data`,
        );
      }
    }

    this.logger.log(
      `Historical data injection complete for replay test: ${replayTestId} ` +
        `(depth: ${test.rollback_depth}, signals: ${signalsInjected}, predictors: ${predictorsInjected})`,
    );
  }

  /**
   * Step 5: Trigger TEST pipeline execution
   * Runs pipeline on test data ONLY - production data untouched
   */
  private async triggerTestPipeline(replayTestId: string): Promise<void> {
    this.logger.debug(
      `Triggering TEST pipeline for replay test: ${replayTestId}`,
    );

    const test = await this.replayTestRepository.findById(replayTestId);
    if (!test) {
      throw new Error(`Replay test not found: ${replayTestId}`);
    }

    // TODO: Integrate with actual tier runners in TEST MODE
    // Key requirement: All generated data must have:
    //   - is_test_data = true
    //   - test_scenario_id = replayTestId
    //
    // Based on rollback depth:
    // 1. For 'signals' depth: run signal-detection (test), prediction-generation (test)
    // 2. For 'predictors' depth: run prediction-generation (test)
    // 3. For 'predictions' depth: run prediction-generation (test) only
    //
    // Production pipeline should NEVER pick up data with is_test_data=true

    this.logger.log(
      `TEST pipeline triggered for replay test: ${replayTestId} (depth: ${test.rollback_depth})`,
    );

    // In a real implementation, this would wait for test pipeline completion
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * Step 6: Compare test predictions against original predictions and evaluations
   * Original predictions are from snapshot (for reference)
   * Test predictions are generated with is_test_data=true
   */
  private async compareResults(
    replayTestId: string,
  ): Promise<ReplayTestResults> {
    this.logger.debug(`Comparing results for replay test: ${replayTestId}`);

    const test = await this.replayTestRepository.findById(replayTestId);
    if (!test) {
      throw new Error(`Replay test not found: ${replayTestId}`);
    }

    const snapshots =
      await this.replayTestRepository.getSnapshots(replayTestId);
    const predictionSnapshot = snapshots.find(
      (s) => s.table_name === 'predictions',
    );

    if (!predictionSnapshot) {
      throw new Error('No prediction snapshot found');
    }

    // Get original predictions from snapshot (these are the production predictions we're comparing against)
    const originalPredictions =
      predictionSnapshot.original_data as Prediction[];

    // Get TEST predictions generated by replay (marked with is_test_data=true, test_scenario_id=replayTestId)
    const testPredictions = await this.getTestPredictions(test);

    // Get evaluations for ground truth (these exist for original predictions)
    const evaluations = this.getEvaluationsForComparison(
      test.universe_id!,
      test.rollback_to,
      test.target_ids ?? undefined,
    );

    // Create result records
    const results: Array<Omit<ReplayTestResult, 'id' | 'created_at'>> = [];

    // Match test predictions to original predictions by target and timeframe
    for (const original of originalPredictions) {
      const evaluation = evaluations.find(
        (e) => e.prediction_id === original.id,
      );

      // Find matching test prediction (same target, close in time to original)
      const testPred = testPredictions.find(
        (p) =>
          p.target_id === original.target_id &&
          Math.abs(
            new Date(p.predicted_at).getTime() -
              new Date(original.predicted_at).getTime(),
          ) < 3600000, // 1 hour window
      );

      const directionMatch = testPred?.direction === original.direction;
      const confidenceDiff = testPred
        ? testPred.confidence - original.confidence
        : null;

      // Determine correctness based on evaluation (ground truth)
      let actualOutcome: string | null = null;
      let originalCorrect: boolean | null = null;
      let testCorrect: boolean | null = null;

      if (evaluation) {
        actualOutcome = evaluation.direction_correct ? 'correct' : 'incorrect';
        originalCorrect = evaluation.direction_correct;
        // Check if test prediction would have been correct
        testCorrect = testPred
          ? this.isPredictionCorrect(testPred, evaluation)
          : null;
      }

      // Improvement: test was correct when original was wrong
      const improvement =
        originalCorrect !== null && testCorrect !== null
          ? testCorrect && !originalCorrect
          : null;

      results.push({
        replay_test_id: replayTestId,
        target_id: original.target_id,

        // Original (production) prediction data
        original_prediction_id: original.id,
        original_direction: original.direction,
        original_confidence: original.confidence,
        original_magnitude: original.magnitude,
        original_predicted_at: original.predicted_at,

        // Test prediction data (from replay with current learnings)
        replay_prediction_id: testPred?.id ?? null,
        replay_direction: testPred?.direction ?? null,
        replay_confidence: testPred?.confidence ?? null,
        replay_magnitude: testPred?.magnitude ?? null,
        replay_predicted_at: testPred?.predicted_at ?? null,

        direction_match: directionMatch,
        confidence_diff: confidenceDiff,

        // Ground truth from evaluation
        evaluation_id: evaluation?.id ?? null,
        actual_outcome: actualOutcome,
        actual_outcome_value: evaluation?.outcome_value ?? null,

        // Accuracy assessment
        original_correct: originalCorrect,
        replay_correct: testCorrect,
        improvement,

        // P&L comparison (TODO: Calculate based on positions)
        pnl_original: null,
        pnl_replay: null,
        pnl_diff: null,
      });
    }

    // Save results
    await this.replayTestRepository.createResults(results);

    // Calculate aggregated results
    return this.aggregateResults(results);
  }

  /**
   * Optional: Cleanup test data after replay test
   * Since we're not deleting production data, this just removes test data
   */
  async cleanupReplayTestData(replayTestId: string): Promise<void> {
    this.logger.debug(`Cleaning up test data for replay test: ${replayTestId}`);

    // Delete test learnings created for this replay test
    const learningsDeleted =
      await this.learningRepository.deleteTestLearnings(replayTestId);
    this.logger.log(`Deleted ${learningsDeleted} test learnings`);

    // Delete all other data with test_scenario_id = replayTestId
    // (signals, predictors, predictions, etc.)
    await this.replayTestRepository.cleanup(replayTestId);

    this.logger.log(`Cleaned up test data for replay test: ${replayTestId}`);
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Validate that evaluations exist for the time period
   */
  private validateEvaluationsExist(
    universeId: string,
    rollbackTo: string,
    _targetIds?: string[],
  ): boolean {
    // This would check if there are evaluations for predictions after rollbackTo
    // For now, return true
    this.logger.debug(
      `Validating evaluations exist for universe ${universeId} after ${rollbackTo}`,
    );
    return true;
  }

  /**
   * Get TEST predictions generated during replay
   * These are marked with is_test_data=true and test_scenario_id=replayTestId
   */
  private async getTestPredictions(test: ReplayTest): Promise<Prediction[]> {
    const targetIds = test.target_ids ?? [];

    // Get test predictions for each target
    const allTestPredictions: Prediction[] = [];

    for (const targetId of targetIds) {
      const predictions = await this.predictionRepository.findByTarget(
        targetId,
        undefined,
        {
          includeTestData: true, // Include test data
          testScenarioId: test.id, // Only from this replay test
          testDataOnly: true, // Only test data, exclude production
        },
      );
      allTestPredictions.push(...predictions);
    }

    return allTestPredictions;
  }

  /**
   * Get evaluations for comparison
   */
  private getEvaluationsForComparison(
    universeId: string,
    rollbackTo: string,
    _targetIds?: string[],
  ): Array<{
    id: string;
    prediction_id: string;
    direction_correct: boolean;
    outcome_value: number | null;
  }> {
    // This would fetch evaluations for predictions in the rollback period
    // For now, return empty array (would be implemented with evaluation repository)
    this.logger.debug(
      `Fetching evaluations for universe ${universeId} after ${rollbackTo}`,
    );
    return [];
  }

  /**
   * Check if a prediction was correct based on evaluation
   */
  private isPredictionCorrect(
    prediction: Prediction,
    evaluation: { direction_correct: boolean; outcome_value: number | null },
  ): boolean {
    // Compare prediction direction with actual outcome
    if (evaluation.outcome_value === null) return false;

    const actualDirection = evaluation.outcome_value > 0 ? 'up' : 'down';
    return prediction.direction === actualDirection;
  }

  /**
   * Aggregate individual results into summary metrics
   */
  private aggregateResults(
    results: Array<Omit<ReplayTestResult, 'id' | 'created_at'>>,
  ): ReplayTestResults {
    const totalComparisons = results.length;
    const directionMatches = results.filter((r) => r.direction_match).length;
    const originalCorrect = results.filter(
      (r) => r.original_correct === true,
    ).length;
    const replayCorrect = results.filter(
      (r) => r.replay_correct === true,
    ).length;
    const improvements = results.filter((r) => r.improvement === true).length;

    const resultsWithCorrectness = results.filter(
      (r) => r.original_correct !== null,
    );
    const originalAccuracy =
      resultsWithCorrectness.length > 0
        ? (originalCorrect / resultsWithCorrectness.length) * 100
        : null;
    const replayAccuracy =
      resultsWithCorrectness.length > 0
        ? (replayCorrect / resultsWithCorrectness.length) * 100
        : null;

    const accuracyDelta =
      originalAccuracy !== null && replayAccuracy !== null
        ? replayAccuracy - originalAccuracy
        : null;

    const confidenceDiffs = results
      .filter((r) => r.confidence_diff !== null)
      .map((r) => r.confidence_diff!);
    const avgConfidenceDiff =
      confidenceDiffs.length > 0
        ? confidenceDiffs.reduce((sum, d) => sum + d, 0) /
          confidenceDiffs.length
        : null;

    return {
      total_comparisons: totalComparisons,
      direction_matches: directionMatches,
      original_correct_count: originalCorrect,
      replay_correct_count: replayCorrect,
      improvements,
      original_accuracy_pct: originalAccuracy,
      replay_accuracy_pct: replayAccuracy,
      accuracy_delta: accuracyDelta,
      total_pnl_original: null, // TODO: Implement P&L calculation
      total_pnl_replay: null,
      pnl_delta: null,
      avg_confidence_diff: avgConfidenceDiff,
    };
  }
}
