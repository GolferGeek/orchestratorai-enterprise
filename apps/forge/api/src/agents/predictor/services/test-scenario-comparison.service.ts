/**
 * Test Scenario Comparison Service
 *
 * Compares test scenario (T_) prediction results against production predictions
 * Part of Sprint 6.1 - Provide comparison metrics to validate test scenarios
 *
 * Metrics:
 * - Direction agreement (% of test predictions that match production direction)
 * - Confidence correlation (how well test confidence correlates with production)
 * - Outcome comparison (if both have outcomes, compare accuracy)
 * - Signal overlap (% of signals shared between test and production)
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { Prediction } from '../interfaces/prediction.interface';
import { Signal } from '../interfaces/signal.interface';

/**
 * Comparison result for a single prediction
 */
export interface PredictionComparisonItem {
  test_prediction_id: string;
  production_prediction_id: string | null;
  target_id: string;
  test_direction: string;
  production_direction: string | null;
  direction_match: boolean;
  test_confidence: number;
  production_confidence: number | null;
  confidence_diff: number | null;
  test_outcome: number | null;
  production_outcome: number | null;
  both_resolved: boolean;
  test_correct: boolean | null;
  production_correct: boolean | null;
  predicted_at_diff_minutes: number | null;
}

/**
 * Aggregated comparison metrics
 */
export interface ComparisonMetrics {
  total_test_predictions: number;
  matched_predictions: number;
  match_rate_pct: number;
  direction_agreement_count: number;
  direction_agreement_pct: number;
  avg_confidence_diff: number | null;
  confidence_correlation: number | null;
  both_resolved_count: number;
  test_accuracy_pct: number | null;
  production_accuracy_pct: number | null;
  signal_overlap_pct: number | null;
}

/**
 * Full comparison result
 */
export interface TestScenarioComparisonResult {
  scenario_id: string;
  universe_id: string;
  metrics: ComparisonMetrics;
  details: PredictionComparisonItem[];
  signal_comparison: {
    test_signals_count: number;
    production_signals_count: number;
    shared_signals_count: number;
    overlap_pct: number;
  };
}

@Injectable()
export class TestScenarioComparisonService {
  private readonly logger = new Logger(TestScenarioComparisonService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Compare test scenario predictions against production predictions
   *
   * @param universeId - Universe ID to compare within
   * @param testScenarioId - Test scenario ID
   * @returns Comparison result with metrics and detailed breakdown
   */
  async compareTestScenarioVsProduction(
    universeId: string,
    testScenarioId: string,
  ): Promise<TestScenarioComparisonResult> {
    this.logger.debug(
      `Comparing test scenario ${testScenarioId} vs production for universe ${universeId}`,
    );

    // Fetch test predictions
    const { data: testPredictions, error: testError } = (await this.db
      .from('prediction', 'predictions')
      .select(
        `
        *,
        targets!inner (
          id,
          name,
          universe_id
        )
      `,
      )
      .eq('test_scenario_id', testScenarioId)
      .eq('targets.universe_id', universeId)
      .order('predicted_at', { ascending: true })) as QueryResult<unknown>;

    if (testError) {
      this.logger.error(
        `Failed to fetch test predictions: ${testError.message}`,
      );
      throw new Error(`Failed to fetch test predictions: ${testError.message}`);
    }

    // Fetch production predictions for the same targets and timeframe
    const targetIds = [
      ...new Set(
        (
          testPredictions as Array<
            Prediction & { targets: { universe_id: string } }
          >
        )?.map((p) => p.target_id) ?? [],
      ),
    ];

    if (targetIds.length === 0) {
      this.logger.warn(
        `No test predictions found for scenario ${testScenarioId}`,
      );
      return {
        scenario_id: testScenarioId,
        universe_id: universeId,
        metrics: this.emptyMetrics(),
        details: [],
        signal_comparison: {
          test_signals_count: 0,
          production_signals_count: 0,
          shared_signals_count: 0,
          overlap_pct: 0,
        },
      };
    }

    const { data: productionPredictions, error: prodError } = (await this.db
      .from('prediction', 'predictions')
      .select('*')
      .in('target_id', targetIds)
      .eq('is_test', false)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .order('predicted_at', { ascending: true })) as QueryResult<unknown>;

    if (prodError) {
      this.logger.error(
        `Failed to fetch production predictions: ${prodError.message}`,
      );
      throw new Error(
        `Failed to fetch production predictions: ${prodError.message}`,
      );
    }

    // Compare predictions
    const details = this.matchPredictions(
      testPredictions as Prediction[],
      productionPredictions as Prediction[],
    );

    // Calculate metrics
    const metrics = this.calculateMetrics(details);

    // Compare signals
    const signalComparison = await this.compareSignals(
      testScenarioId,
      targetIds,
    );

    return {
      scenario_id: testScenarioId,
      universe_id: universeId,
      metrics,
      details,
      signal_comparison: signalComparison,
    };
  }

  /**
   * Match test predictions to production predictions
   * Matches based on target and closest predicted_at timestamp
   */
  private matchPredictions(
    testPredictions: Prediction[],
    productionPredictions: Prediction[],
  ): PredictionComparisonItem[] {
    const details: PredictionComparisonItem[] = [];

    for (const testPred of testPredictions) {
      // Find closest production prediction for same target
      const productionMatches = productionPredictions.filter(
        (p) => p.target_id === testPred.target_id,
      );

      let closestProd: Prediction | null = null;
      let minTimeDiff = Infinity;

      const testPredTime = new Date(testPred.predicted_at).getTime();

      for (const prodPred of productionMatches) {
        const prodPredTime = new Date(prodPred.predicted_at).getTime();
        const timeDiff = Math.abs(testPredTime - prodPredTime);

        // Match within 1 hour window
        if (timeDiff < 60 * 60 * 1000 && timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestProd = prodPred;
        }
      }

      const directionMatch =
        closestProd !== null && testPred.direction === closestProd.direction;

      const confidenceDiff =
        closestProd !== null
          ? Math.abs(testPred.confidence - closestProd.confidence)
          : null;

      const bothResolved =
        closestProd !== null &&
        testPred.status === 'resolved' &&
        closestProd.status === 'resolved' &&
        testPred.outcome_value !== null &&
        closestProd.outcome_value !== null;

      let testCorrect: boolean | null = null;
      let productionCorrect: boolean | null = null;

      if (bothResolved && testPred.outcome_value !== null) {
        const testOutcomeDirection = testPred.outcome_value > 0 ? 'up' : 'down';
        testCorrect = testPred.direction === testOutcomeDirection;
      }

      if (
        bothResolved &&
        closestProd !== null &&
        closestProd.outcome_value !== null
      ) {
        const prodOutcomeDirection =
          closestProd.outcome_value > 0 ? 'up' : 'down';
        productionCorrect = closestProd.direction === prodOutcomeDirection;
      }

      const predictedAtDiff =
        closestProd !== null
          ? Math.round(minTimeDiff / (1000 * 60)) // Convert to minutes
          : null;

      details.push({
        test_prediction_id: testPred.id,
        production_prediction_id: closestProd?.id ?? null,
        target_id: testPred.target_id,
        test_direction: testPred.direction,
        production_direction: closestProd?.direction ?? null,
        direction_match: directionMatch,
        test_confidence: testPred.confidence,
        production_confidence: closestProd?.confidence ?? null,
        confidence_diff: confidenceDiff,
        test_outcome: testPred.outcome_value,
        production_outcome: closestProd?.outcome_value ?? null,
        both_resolved: bothResolved,
        test_correct: testCorrect,
        production_correct: productionCorrect,
        predicted_at_diff_minutes: predictedAtDiff,
      });
    }

    return details;
  }

  /**
   * Calculate aggregated metrics from comparison details
   */
  private calculateMetrics(
    details: PredictionComparisonItem[],
  ): ComparisonMetrics {
    const totalTest = details.length;
    const matched = details.filter((d) => d.production_prediction_id !== null);
    const matchedCount = matched.length;

    const directionMatches = matched.filter((d) => d.direction_match);
    const directionMatchCount = directionMatches.length;

    const bothResolved = details.filter((d) => d.both_resolved);
    const bothResolvedCount = bothResolved.length;

    const testCorrect = bothResolved.filter((d) => d.test_correct === true);
    const prodCorrect = bothResolved.filter(
      (d) => d.production_correct === true,
    );

    // Calculate average confidence difference
    const confidenceDiffs = matched
      .map((d) => d.confidence_diff)
      .filter((d): d is number => d !== null);
    const avgConfidenceDiff =
      confidenceDiffs.length > 0
        ? confidenceDiffs.reduce((sum, diff) => sum + diff, 0) /
          confidenceDiffs.length
        : null;

    // Calculate confidence correlation (Pearson correlation coefficient)
    const confidenceCorrelation =
      matched.length > 1
        ? this.calculateCorrelation(
            matched.map((d) => d.test_confidence),
            matched.map((d) => d.production_confidence ?? 0),
          )
        : null;

    return {
      total_test_predictions: totalTest,
      matched_predictions: matchedCount,
      match_rate_pct: totalTest > 0 ? (matchedCount / totalTest) * 100 : 0,
      direction_agreement_count: directionMatchCount,
      direction_agreement_pct:
        matchedCount > 0 ? (directionMatchCount / matchedCount) * 100 : 0,
      avg_confidence_diff: avgConfidenceDiff,
      confidence_correlation: confidenceCorrelation,
      both_resolved_count: bothResolvedCount,
      test_accuracy_pct:
        bothResolvedCount > 0
          ? (testCorrect.length / bothResolvedCount) * 100
          : null,
      production_accuracy_pct:
        bothResolvedCount > 0
          ? (prodCorrect.length / bothResolvedCount) * 100
          : null,
      signal_overlap_pct: null, // Filled in by compareSignals
    };
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private calculateCorrelation(x: number[], y: number[]): number | null {
    if (x.length !== y.length || x.length === 0) return null;

    const n = x.length;
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const xVal = x[i] ?? 0;
      const yVal = y[i] ?? 0;
      const diffX = xVal - meanX;
      const diffY = yVal - meanY;
      numerator += diffX * diffY;
      denomX += diffX * diffX;
      denomY += diffY * diffY;
    }

    const denominator = Math.sqrt(denomX * denomY);

    return denominator === 0 ? null : numerator / denominator;
  }

  /**
   * Compare signals between test and production
   * Measures signal overlap by content hash or URL
   */
  private async compareSignals(
    testScenarioId: string,
    targetIds: string[],
  ): Promise<{
    test_signals_count: number;
    production_signals_count: number;
    shared_signals_count: number;
    overlap_pct: number;
  }> {
    // Fetch test signals
    const { data: testSignals, error: testError } = (await this.db
      .from('prediction', 'signals')
      .select('id, content, url, target_id')
      .eq('test_scenario_id', testScenarioId)
      .in('target_id', targetIds)) as QueryResult<unknown>;

    if (testError) {
      this.logger.error(`Failed to fetch test signals: ${testError.message}`);
      return {
        test_signals_count: 0,
        production_signals_count: 0,
        shared_signals_count: 0,
        overlap_pct: 0,
      };
    }

    // Fetch production signals for same targets
    const { data: prodSignals, error: prodError } = (await this.db
      .from('prediction', 'signals')
      .select('id, content, url, target_id')
      .in('target_id', targetIds)
      .eq('is_test', false)
      .or(
        'is_test_data.is.null,is_test_data.eq.false',
      )) as QueryResult<unknown>;

    if (prodError) {
      this.logger.error(
        `Failed to fetch production signals: ${prodError.message}`,
      );
      return {
        test_signals_count: ((testSignals ?? []) as Array<unknown>).length,
        production_signals_count: 0,
        shared_signals_count: 0,
        overlap_pct: 0,
      };
    }

    // Create fingerprints (simple hash of content + url)
    const testSignalArray = (testSignals as Signal[]) ?? [];
    const prodSignalArray = (prodSignals as Signal[]) ?? [];

    const testFingerprints = new Set(
      testSignalArray.map((s) => this.createSignalFingerprint(s)),
    );
    const prodFingerprints = new Set(
      prodSignalArray.map((s) => this.createSignalFingerprint(s)),
    );

    // Calculate overlap
    const sharedCount = [...testFingerprints].filter((fp) =>
      prodFingerprints.has(fp),
    ).length;

    const testCount = testFingerprints.size;
    const prodCount = prodFingerprints.size;

    const overlapPct = testCount > 0 ? (sharedCount / testCount) * 100 : 0;

    return {
      test_signals_count: testCount,
      production_signals_count: prodCount,
      shared_signals_count: sharedCount,
      overlap_pct: overlapPct,
    };
  }

  /**
   * Create a simple fingerprint for signal matching
   * Uses content + URL to identify similar signals
   */
  private createSignalFingerprint(signal: Partial<Signal>): string {
    const content = (signal.content ?? '').toLowerCase().trim();
    const url = (signal.url ?? '').toLowerCase().trim();
    return `${content}|${url}`;
  }

  /**
   * Create empty metrics object
   */
  private emptyMetrics(): ComparisonMetrics {
    return {
      total_test_predictions: 0,
      matched_predictions: 0,
      match_rate_pct: 0,
      direction_agreement_count: 0,
      direction_agreement_pct: 0,
      avg_confidence_diff: null,
      confidence_correlation: null,
      both_resolved_count: 0,
      test_accuracy_pct: null,
      production_accuracy_pct: null,
      signal_overlap_pct: null,
    };
  }
}
