import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { TestScenarioRepository } from '../repositories/test-scenario.repository';
import {
  TestScenario,
  CreateTestScenarioData,
  TestDataMarkers,
  CleanupResult,
  TierRunResult,
  InjectionPoint,
} from '../interfaces/test-data.interface';
import { CreateSignalData, Signal } from '../interfaces/signal.interface';
import {
  CreatePredictorData,
  Predictor,
} from '../interfaces/predictor.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

/**
 * Service for injecting test data into prediction tables
 * Part of the Test Data Injection Framework (Phase 3)
 *
 * Key features:
 * - All injected data is marked with is_test_data=true and test_scenario_id
 * - Generic injection method for any prediction table
 * - Tier-specific injection methods with proper typing
 * - Cleanup methods for scenario or all test data
 */
@Injectable()
export class TestDataInjectorService {
  private readonly logger = new Logger(TestDataInjectorService.name);
  private readonly schema = 'prediction';

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly testScenarioRepository: TestScenarioRepository,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new test scenario
   */
  async createScenario(data: CreateTestScenarioData): Promise<TestScenario> {
    return this.testScenarioRepository.create(data);
  }

  /**
   * Get a test scenario by ID
   */
  async getScenario(scenarioId: string): Promise<TestScenario | null> {
    return this.testScenarioRepository.findById(scenarioId);
  }

  /**
   * List all test scenarios for an organization
   */
  async listScenarios(organizationSlug: string): Promise<TestScenario[]> {
    return this.testScenarioRepository.findByOrganization(organizationSlug);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERIC INJECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generic injection into any prediction table
   * Adds test data markers to all records
   *
   * @param tableName - The prediction schema table name
   * @param data - Array of records to insert
   * @param scenarioId - Test scenario ID to associate with
   * @returns Array of inserted records with their IDs
   */
  async injectIntoTable<T>(
    tableName: InjectionPoint,
    data: T[],
    scenarioId: string,
  ): Promise<Array<T & TestDataMarkers>> {
    if (data.length === 0) {
      return [];
    }

    // Add test markers to all records
    const withTestMarkers = data.map((row) => ({
      ...(row as object),
      is_test_data: true,
      test_scenario_id: scenarioId,
    }));

    const { data: inserted, error } = (await this.db
      .from(this.schema, tableName)
      .insert(withTestMarkers)
      .select()) as SupabaseSelectListResponse<T & TestDataMarkers>;

    if (error) {
      this.logger.error(`Failed to inject into ${tableName}: ${error.message}`);
      throw new Error(`Failed to inject into ${tableName}: ${error.message}`);
    }

    this.logger.debug(
      `Injected ${inserted?.length ?? 0} rows into ${tableName} for scenario ${scenarioId}`,
    );

    return inserted ?? [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER-SPECIFIC INJECTORS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Inject signals with test data markers
   * Note: Sets is_test=true to satisfy database constraint when source is a test source
   */
  async injectSignals(
    scenarioId: string,
    signals: CreateSignalData[],
  ): Promise<Array<Signal & TestDataMarkers>> {
    // Add is_test flag to all signals (required when source has is_test=true)
    const signalsWithTestFlag = signals.map((signal) => ({
      ...signal,
      is_test: true,
    }));
    return this.injectIntoTable<CreateSignalData>(
      'signals',
      signalsWithTestFlag,
      scenarioId,
    ) as Promise<Array<Signal & TestDataMarkers>>;
  }

  /**
   * Inject predictors with test data markers
   */
  async injectPredictors(
    scenarioId: string,
    predictors: CreatePredictorData[],
  ): Promise<Array<Predictor & TestDataMarkers>> {
    return this.injectIntoTable<CreatePredictorData>(
      'predictors',
      predictors,
      scenarioId,
    ) as Promise<Array<Predictor & TestDataMarkers>>;
  }

  /**
   * Inject predictions with test data markers
   */
  async injectPredictions<T>(
    scenarioId: string,
    predictions: T[],
  ): Promise<Array<T & TestDataMarkers>> {
    return this.injectIntoTable<T>('predictions', predictions, scenarioId);
  }

  /**
   * Inject evaluations with test data markers
   */
  async injectEvaluations<T>(
    scenarioId: string,
    evaluations: T[],
  ): Promise<Array<T & TestDataMarkers>> {
    return this.injectIntoTable<T>('evaluations', evaluations, scenarioId);
  }

  /**
   * Inject sources with test data markers
   */
  async injectSources<T>(
    scenarioId: string,
    sources: T[],
  ): Promise<Array<T & TestDataMarkers>> {
    return this.injectIntoTable<T>('sources', sources, scenarioId);
  }

  /**
   * Inject missed opportunities with test data markers
   */
  async injectMissedOpportunities<T>(
    scenarioId: string,
    missed: T[],
  ): Promise<Array<T & TestDataMarkers>> {
    return this.injectIntoTable<T>('missed_opportunities', missed, scenarioId);
  }

  /**
   * Inject learning queue items with test data markers
   */
  async injectLearningItems<T>(
    scenarioId: string,
    items: T[],
  ): Promise<Array<T & TestDataMarkers>> {
    return this.injectIntoTable<T>('learning_queue', items, scenarioId);
  }

  /**
   * Inject analysts with test data markers
   */
  async injectAnalysts<T>(
    scenarioId: string,
    analysts: T[],
  ): Promise<Array<T & TestDataMarkers>> {
    return this.injectIntoTable<T>('analysts', analysts, scenarioId);
  }

  /**
   * Inject strategies with test data markers
   */
  async injectStrategies<T>(
    scenarioId: string,
    strategies: T[],
  ): Promise<Array<T & TestDataMarkers>> {
    return this.injectIntoTable<T>('strategies', strategies, scenarioId);
  }

  /**
   * Inject articles into test_articles table
   * Note: test_articles uses scenario_id instead of test_scenario_id
   */
  async injectArticles(
    scenarioId: string,
    organizationSlug: string,
    articles: Array<{
      title: string;
      content: string;
      url?: string;
      published_at: string;
      author?: string;
      source_name?: string;
    }>,
  ): Promise<Array<{ id: string; title: string; scenario_id: string }>> {
    if (articles.length === 0) {
      return [];
    }

    // Transform MockArticle to CreateTestArticleData format
    const articleData = articles.map((article) => ({
      organization_slug: organizationSlug,
      scenario_id: scenarioId,
      title: article.title,
      content: article.content,
      source_name: article.source_name ?? 'Test News Site',
      published_at: article.published_at,
      target_symbols: [],
      is_synthetic: true,
      synthetic_marker: `test-scenario-${scenarioId}`,
      processed: false,
      metadata: { author: article.author, url: article.url },
    }));

    const { data: inserted, error } = (await this.db
      .from(this.schema, 'test_articles')
      .insert(articleData)
      .select('id, title, scenario_id')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to inject articles: ${error.message}`);
      throw new Error(`Failed to inject articles: ${error.message}`);
    }

    const insertedRows = (inserted ?? []) as Array<{
      id: string;
      title: string;
      scenario_id: string;
    }>;
    this.logger.debug(
      `Injected ${insertedRows.length} articles for scenario ${scenarioId}`,
    );

    return insertedRows;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTCOME INJECTION (for testing evaluations)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Inject outcomes for existing predictions
   * Updates predictions with outcome data
   */
  async injectOutcomes(
    scenarioId: string,
    outcomes: Array<{
      prediction_id: string;
      outcome_value: number;
      actual_direction?: 'up' | 'down' | 'flat';
    }>,
  ): Promise<void> {
    for (const outcome of outcomes) {
      const { error } = await this.db
        .from(this.schema, 'predictions')
        .update({
          status: 'resolved',
          outcome_value: outcome.outcome_value,
          outcome_captured_at: new Date().toISOString(),
          resolution_notes: outcome.actual_direction
            ? `Test outcome: ${outcome.actual_direction}`
            : 'Test outcome injected',
        })
        .eq('id', outcome.prediction_id)
        .eq('test_scenario_id', scenarioId);

      if (error) {
        this.logger.error(
          `Failed to inject outcome for ${outcome.prediction_id}: ${error.message}`,
        );
        throw new Error(`Failed to inject outcome: ${error.message}`);
      }
    }

    this.logger.debug(
      `Injected ${outcomes.length} outcomes for scenario ${scenarioId}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO RUNNERS (execute tiers against test data)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run signal detection on test data signals
   * Creates predictors from signals marked with the scenario ID
   */
  async runSignalDetection(scenarioId: string): Promise<TierRunResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let itemsProcessed = 0;
    let itemsCreated = 0;

    try {
      // Mark scenario as running
      await this.testScenarioRepository.markRunning(scenarioId);

      // Get test signals for this scenario
      const { data: signals, error } = (await this.db
        .from(this.schema, 'signals')
        .select('*')
        .eq('test_scenario_id', scenarioId)
        .eq('disposition', 'pending')) as SupabaseSelectListResponse<Signal>;

      if (error) {
        throw new Error(`Failed to fetch test signals: ${error.message}`);
      }

      itemsProcessed = signals?.length ?? 0;

      // For each signal, create a predictor (simplified - real implementation would use SignalDetectionService)
      for (const signal of signals ?? []) {
        try {
          const predictorData = {
            signal_id: signal.id,
            target_id: signal.target_id,
            direction: signal.direction,
            strength: 5,
            confidence: 0.7,
            reasoning: `Test predictor from signal: ${signal.content.substring(0, 100)}`,
            analyst_slug: 'test-analyst',
            analyst_assessment: { test: true, signal_id: signal.id },
            expires_at: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ).toISOString(),
            is_test_data: true,
            test_scenario_id: scenarioId,
          };

          const { error: insertError } = await this.db
            .from(this.schema, 'predictors')
            .insert(predictorData);

          if (insertError) {
            errors.push(
              `Failed to create predictor for signal ${signal.id}: ${insertError.message}`,
            );
          } else {
            itemsCreated++;

            // Update signal disposition
            await this.db
              .from(this.schema, 'signals')
              .update({ disposition: 'predictor_created' })
              .eq('id', signal.id);
          }
        } catch (err) {
          errors.push(
            `Error processing signal ${signal.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Update scenario results
      await this.testScenarioRepository.markCompleted(scenarioId, {
        tier_results: {
          signal_detection: {
            success: errors.length === 0,
            processed: itemsProcessed,
            created: itemsCreated,
            errors,
          },
        },
      });

      return {
        success: errors.length === 0,
        items_processed: itemsProcessed,
        items_created: itemsCreated,
        duration_ms: Date.now() - startTime,
        errors,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.testScenarioRepository.markFailed(scenarioId, errorMessage);

      return {
        success: false,
        items_processed: itemsProcessed,
        items_created: itemsCreated,
        duration_ms: Date.now() - startTime,
        errors: [...errors, errorMessage],
      };
    }
  }

  /**
   * Run prediction generation on test data predictors
   */
  async runPredictionGeneration(scenarioId: string): Promise<TierRunResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let itemsProcessed = 0;
    let itemsCreated = 0;

    try {
      await this.testScenarioRepository.markRunning(scenarioId);

      // Get test predictors for this scenario
      const { data: predictors, error } = (await this.db
        .from(this.schema, 'predictors')
        .select('*')
        .eq('test_scenario_id', scenarioId)
        .eq('status', 'active')) as SupabaseSelectListResponse<Predictor>;

      if (error) {
        throw new Error(`Failed to fetch test predictors: ${error.message}`);
      }

      itemsProcessed = predictors?.length ?? 0;

      // Group predictors by target for prediction generation
      const byTarget = new Map<string, Predictor[]>();
      for (const predictor of predictors ?? []) {
        const existing = byTarget.get(predictor.target_id) ?? [];
        existing.push(predictor);
        byTarget.set(predictor.target_id, existing);
      }

      // Create a prediction for each target
      for (const [targetId, targetPredictors] of byTarget) {
        try {
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

          const predictionData = {
            target_id: targetId,
            direction,
            confidence: avgConfidence,
            magnitude: 'medium',
            reasoning: `Test prediction from ${targetPredictors.length} predictors`,
            timeframe_hours: 24,
            predicted_at: new Date().toISOString(),
            expires_at: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ).toISOString(),
            analyst_ensemble: { test: true },
            llm_ensemble: { test: true },
            is_test_data: true,
            test_scenario_id: scenarioId,
          };

          const { error: insertError } = await this.db
            .from(this.schema, 'predictions')
            .insert(predictionData);

          if (insertError) {
            errors.push(
              `Failed to create prediction for target ${targetId}: ${insertError.message}`,
            );
          } else {
            itemsCreated++;

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
        } catch (err) {
          errors.push(
            `Error creating prediction for target ${targetId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      await this.testScenarioRepository.markCompleted(scenarioId, {
        tier_results: {
          prediction_generation: {
            success: errors.length === 0,
            processed: itemsProcessed,
            created: itemsCreated,
            errors,
          },
        },
      });

      return {
        success: errors.length === 0,
        items_processed: itemsProcessed,
        items_created: itemsCreated,
        duration_ms: Date.now() - startTime,
        errors,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.testScenarioRepository.markFailed(scenarioId, errorMessage);

      return {
        success: false,
        items_processed: itemsProcessed,
        items_created: itemsCreated,
        duration_ms: Date.now() - startTime,
        errors: [...errors, errorMessage],
      };
    }
  }

  /**
   * Run evaluation on test data predictions with outcomes
   */
  async runEvaluation(scenarioId: string): Promise<TierRunResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let itemsProcessed = 0;
    let itemsCreated = 0;

    try {
      await this.testScenarioRepository.markRunning(scenarioId);

      // Get test predictions with outcomes
      const { data: predictions, error } = (await this.db
        .from(this.schema, 'predictions')
        .select('*')
        .eq('test_scenario_id', scenarioId)
        .eq('status', 'resolved')
        .not('outcome_value', 'is', null)) as SupabaseSelectListResponse<
        Record<string, unknown>
      >;

      if (error) {
        throw new Error(`Failed to fetch test predictions: ${error.message}`);
      }

      itemsProcessed = predictions?.length ?? 0;

      for (const prediction of predictions ?? []) {
        try {
          // Simple evaluation: compare predicted direction with resolution notes
          const resolutionNotes = prediction.resolution_notes as string;
          const predictedDirection = prediction.direction as string;

          let directionCorrect = false;
          if (resolutionNotes?.includes('up') && predictedDirection === 'up') {
            directionCorrect = true;
          } else if (
            resolutionNotes?.includes('down') &&
            predictedDirection === 'down'
          ) {
            directionCorrect = true;
          } else if (
            resolutionNotes?.includes('flat') &&
            predictedDirection === 'flat'
          ) {
            directionCorrect = true;
          }

          const evaluationData = {
            prediction_id: prediction.id,
            direction_correct: directionCorrect,
            direction_score: directionCorrect ? 1.0 : 0.0,
            overall_score: directionCorrect ? 0.85 : 0.15,
            analyst_scores: { test: true },
            llm_tier_scores: { test: true },
            analysis: `Test evaluation: ${directionCorrect ? 'Correct' : 'Incorrect'} prediction`,
            is_test_data: true,
            test_scenario_id: scenarioId,
          };

          const { error: insertError } = await this.db
            .from(this.schema, 'evaluations')
            .insert(evaluationData);

          if (insertError) {
            errors.push(
              `Failed to create evaluation for prediction ${String(prediction.id)}: ${insertError.message}`,
            );
          } else {
            itemsCreated++;
          }
        } catch (err) {
          errors.push(
            `Error evaluating prediction ${String(prediction.id)}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      await this.testScenarioRepository.markCompleted(scenarioId, {
        tier_results: {
          evaluation: {
            success: errors.length === 0,
            processed: itemsProcessed,
            created: itemsCreated,
            errors,
          },
        },
      });

      return {
        success: errors.length === 0,
        items_processed: itemsProcessed,
        items_created: itemsCreated,
        duration_ms: Date.now() - startTime,
        errors,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.testScenarioRepository.markFailed(scenarioId, errorMessage);

      return {
        success: false,
        items_processed: itemsProcessed,
        items_created: itemsCreated,
        duration_ms: Date.now() - startTime,
        errors: [...errors, errorMessage],
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Cleanup a specific test scenario and all its data
   */
  async cleanupScenario(scenarioId: string): Promise<CleanupResult> {
    return this.testScenarioRepository.cleanupScenario(scenarioId);
  }

  /**
   * Cleanup ALL test data across all scenarios
   * WARNING: This is destructive - use with caution
   */
  async cleanupAllTestData(): Promise<CleanupResult> {
    return this.testScenarioRepository.cleanupAllTestData();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get counts of test data by table for a scenario
   */
  async getScenarioDataCounts(
    scenarioId: string,
  ): Promise<Record<string, number>> {
    // Tables that use test_scenario_id column
    const tablesWithTestScenarioId: InjectionPoint[] = [
      'signals',
      'predictors',
      'predictions',
      'evaluations',
      'sources',
      'missed_opportunities',
      'learning_queue',
    ];

    // Tables that use scenario_id column (dedicated test data tables)
    const tablesWithScenarioId: InjectionPoint[] = [
      'test_articles',
      'test_price_data',
    ];

    const counts: Record<string, number> = {};

    // Query tables using test_scenario_id
    for (const table of tablesWithTestScenarioId) {
      const { count, error } = await this.db
        .from(this.schema, table)
        .select('*', { count: 'exact', head: true })
        .eq('test_scenario_id', scenarioId);

      if (!error) {
        counts[table] = count ?? 0;
      }
    }

    // Query tables using scenario_id
    for (const table of tablesWithScenarioId) {
      const { count, error } = await this.db
        .from(this.schema, table)
        .select('*', { count: 'exact', head: true })
        .eq('scenario_id', scenarioId);

      if (!error) {
        counts[table] = count ?? 0;
      }
    }

    return counts;
  }
}
