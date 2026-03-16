/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
// Disabled unsafe rules due to Supabase RPC calls returning generic 'any' types
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  MissType,
  MissInvestigation,
  PredictionWithChain,
  PredictorWithSignal,
  SignalWithSource,
  UnusedPredictorAnalysis,
  MisreadSignalAnalysis,
  SuggestedLearningFromInvestigation,
  DailyInvestigationSummary,
} from '../interfaces/miss-investigation.interface';
import { PredictionDirection } from '../interfaces/prediction.interface';

/**
 * Configuration for miss detection
 */
interface MissDetectionConfig {
  /** Threshold for significant move (percentage) */
  significantMoveThreshold: number;
  /** Threshold for magnitude underestimation */
  magnitudeUnderestimationRatio: number;
}

const DEFAULT_CONFIG: MissDetectionConfig = {
  significantMoveThreshold: 0.5, // 0.5% move = significant
  magnitudeUnderestimationRatio: 1.5, // Actual > 1.5x predicted = underestimated
};

/**
 * Miss Investigation Service
 *
 * Investigates prediction misses (wrong predictions and missed opportunities)
 * using a hierarchical approach:
 *
 * Level 1: Check for unused predictors
 * Level 2: Check for misread signals
 * Level 3: Mark for external source research (Gemini)
 *
 * Provides backward navigation: Prediction → Predictors → Signals → Sources
 */
@Injectable()
export class MissInvestigationService {
  private readonly logger = new Logger(MissInvestigationService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Identify all prediction misses for a given date
   * Includes both explicit predictions and baseline (flat) predictions
   */
  async identifyMisses(
    date: string,
    universeId?: string,
    config: MissDetectionConfig = DEFAULT_CONFIG,
  ): Promise<
    Array<{
      prediction: PredictionWithChain;
      missType: MissType;
      actualDirection: PredictionDirection;
      actualMagnitude: number;
    }>
  > {
    this.logger.log(`Identifying misses for date: ${date}`);

    // Get all resolved predictions for the date
    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;

    let query = this.db
      .from('prediction', 'predictions')
      .select(
        `
        *,
        target:targets(id, symbol, name, target_type)
      `,
      )
      .gte('predicted_at', startOfDay)
      .lte('predicted_at', endOfDay)
      .in('status', ['resolved', 'expired'])
      .not('outcome_value', 'is', null);

    if (universeId) {
      query = query.eq('target.universe_id', universeId);
    }

    const { data: predictions, error } = await query;

    if (error) {
      const errMsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Failed to fetch predictions: ${errMsg}`);
      throw new Error(`Failed to fetch predictions: ${errMsg}`);
    }

    const misses: Array<{
      prediction: PredictionWithChain;
      missType: MissType;
      actualDirection: PredictionDirection;
      actualMagnitude: number;
    }> = [];

    const predictionRows = (predictions || []) as Array<
      Record<string, unknown>
    >;
    for (const prediction of predictionRows) {
      const outcomeValue = prediction.outcome_value as number;
      const actualDirection = this.determineActualDirection(
        outcomeValue,
        config.significantMoveThreshold,
      );
      const actualMagnitude = Math.abs(outcomeValue);

      const missType = this.determineMissType(
        prediction.direction as PredictionDirection,
        actualDirection,
        prediction.magnitude as string | null,
        actualMagnitude,
        config,
      );

      if (missType) {
        // Load consumed predictors for this prediction
        const consumedPredictors = await this.loadConsumedPredictors(
          prediction.id as string,
        );

        misses.push({
          prediction: {
            ...prediction,
            consumedPredictors,
            target: prediction.target,
          } as PredictionWithChain,
          missType,
          actualDirection,
          actualMagnitude,
        });
      }
    }

    this.logger.log(`Found ${misses.length} misses for ${date}`);
    return misses;
  }

  /**
   * Investigate a miss by prediction ID
   * Convenience method that looks up all necessary data and delegates to investigateMiss
   */
  async investigateMissById(
    predictionId: string,
    config: MissDetectionConfig = DEFAULT_CONFIG,
  ): Promise<MissInvestigation | null> {
    this.logger.log(`Looking up prediction ${predictionId} for investigation`);

    // Fetch the prediction with its chain
    const { data: prediction, error } = await this.db
      .from('prediction', 'predictions')
      .select(
        `
        *,
        target:targets(id, symbol, name, target_type)
      `,
      )
      .eq('id', predictionId)
      .single();

    if (error || !prediction) {
      this.logger.warn(`Prediction ${predictionId} not found`);
      return null;
    }

    const predRow = prediction as Record<string, unknown>;

    // Check if it has outcome data
    if (predRow.outcome_value === null || predRow.outcome_value === undefined) {
      this.logger.warn(`Prediction ${predictionId} has no outcome yet`);
      return null;
    }

    const outcomeValue = predRow.outcome_value as number;
    const actualDirection = this.determineActualDirection(
      outcomeValue,
      config.significantMoveThreshold,
    );
    const actualMagnitude = Math.abs(outcomeValue);

    const missType = this.determineMissType(
      predRow.direction as PredictionDirection,
      actualDirection,
      predRow.magnitude as string | null,
      actualMagnitude,
      config,
    );

    if (!missType) {
      this.logger.log(`Prediction ${predictionId} was correct, not a miss`);
      return null;
    }

    // Load consumed predictors
    const consumedPredictors = await this.loadConsumedPredictors(predictionId);

    const predictionWithChain: PredictionWithChain = {
      ...predRow,
      consumedPredictors,
      target: predRow.target,
    } as PredictionWithChain;

    return this.investigateMiss(
      predictionWithChain,
      missType,
      actualDirection,
      actualMagnitude,
    );
  }

  /**
   * Investigate a single miss
   * Checks predictors (Level 1) and signals (Level 2)
   */
  async investigateMiss(
    prediction: PredictionWithChain,
    missType: MissType,
    actualDirection: PredictionDirection,
    actualMagnitude: number,
  ): Promise<MissInvestigation> {
    this.logger.log(
      `Investigating miss for prediction ${prediction.id}, type: ${missType}`,
    );

    const investigation: MissInvestigation = {
      id: `inv-${prediction.id}-${Date.now()}`,
      prediction,
      missType,
      predicted: {
        direction: prediction.direction,
        magnitude: prediction.magnitude,
        confidence: prediction.confidence,
      },
      actual: {
        direction: actualDirection,
        magnitude: actualMagnitude,
      },
      investigationLevel: 'unpredictable', // Will be updated
      unusedPredictors: [],
      misreadSignals: [],
      investigatedAt: new Date().toISOString(),
    };

    // Level 1: Check for unused predictors
    const unusedPredictors = await this.findUnusedPredictors(
      prediction.target_id,
      prediction.predicted_at,
      actualDirection,
    );

    if (unusedPredictors.length > 0) {
      investigation.unusedPredictors = unusedPredictors;
      investigation.investigationLevel = 'predictor';
      investigation.suggestedLearning = this.generatePredictorLevelLearning(
        investigation,
        unusedPredictors,
      );
      return investigation;
    }

    // Level 2: Check for misread signals
    const misreadSignals = await this.findMisreadSignals(
      prediction.target_id,
      prediction.predicted_at,
      actualDirection,
    );

    if (misreadSignals.length > 0) {
      investigation.misreadSignals = misreadSignals;
      investigation.investigationLevel = 'signal';
      investigation.suggestedLearning = this.generateSignalLevelLearning(
        investigation,
        misreadSignals,
      );
      return investigation;
    }

    // Level 3: Need external research
    investigation.investigationLevel = 'source';
    return investigation;
  }

  /**
   * Load predictors that were consumed to create a prediction
   * With full signal chain for navigation
   */
  private async loadConsumedPredictors(
    predictionId: string,
  ): Promise<PredictorWithSignal[]> {
    const { data, error } = await this.db
      .from('prediction', 'predictors')
      .select(
        `
        *,
        signal:signals(
          *,
          source:sources(id, name, source_type, url)
        )
      `,
      )
      .eq('consumed_by_prediction_id', predictionId);

    if (error) {
      this.logger.error(`Failed to load consumed predictors: ${error.message}`);
      return [];
    }

    const rows = (data || []) as Array<Record<string, unknown>>;
    return rows.map((p: Record<string, unknown>) => ({
      ...p,
      signal: p.signal
        ? {
            ...(p.signal as Record<string, unknown>),
            source: (p.signal as Record<string, unknown>).source,
          }
        : undefined,
    })) as PredictorWithSignal[];
  }

  /**
   * Find predictors that existed but weren't used
   * These could have helped make a better prediction
   */
  private async findUnusedPredictors(
    targetId: string,
    predictionDate: string,
    actualDirection: PredictionDirection,
  ): Promise<UnusedPredictorAnalysis[]> {
    // Look for predictors that were active around the prediction time but not consumed
    const dateStart = new Date(predictionDate);
    dateStart.setHours(dateStart.getHours() - 24); // Look back 24 hours

    const { data, error } = await this.db
      .from('prediction', 'predictors')
      .select(
        `
        *,
        signal:signals(
          *,
          source:sources(id, name, source_type, url)
        )
      `,
      )
      .eq('target_id', targetId)
      .gte('created_at', dateStart.toISOString())
      .lte('created_at', predictionDate)
      .in('status', ['expired', 'active']) // Not consumed
      .is('consumed_by_prediction_id', null);

    if (error) {
      this.logger.error(`Failed to find unused predictors: ${error.message}`);
      return [];
    }

    // Analyze each unused predictor
    const analyses: UnusedPredictorAnalysis[] = [];

    const unusedRows = (data || []) as Array<Record<string, unknown>>;
    for (const predictor of unusedRows) {
      // Check if this predictor would have helped (pointed to actual direction)
      const predictorDirection = predictor.direction as string;
      const wouldHaveHelped =
        (predictorDirection === 'bullish' && actualDirection === 'up') ||
        (predictorDirection === 'bearish' && actualDirection === 'down');

      if (wouldHaveHelped) {
        const signalData = predictor.signal as Record<string, unknown> | null;
        const confidence = predictor.confidence as number;
        analyses.push({
          predictor: {
            ...predictor,
            signal: signalData
              ? {
                  ...signalData,
                  source: signalData.source,
                }
              : undefined,
          } as PredictorWithSignal,
          reason: this.determineUnusedReason(predictor),
          suggestedThreshold: confidence > 0.5 ? confidence - 0.1 : undefined,
        });
      }
    }

    return analyses;
  }

  /**
   * Find signals that were misread or rejected incorrectly
   */
  private async findMisreadSignals(
    targetId: string,
    predictionDate: string,
    actualDirection: PredictionDirection,
  ): Promise<MisreadSignalAnalysis[]> {
    const dateStart = new Date(predictionDate);
    dateStart.setHours(dateStart.getHours() - 48); // Look back 48 hours

    const { data, error } = await this.db
      .from('prediction', 'signals')
      .select(
        `
        *,
        source:sources(id, name, source_type, url)
      `,
      )
      .eq('target_id', targetId)
      .gte('detected_at', dateStart.toISOString())
      .lte('detected_at', predictionDate)
      .in('disposition', ['rejected', 'expired', 'review_pending']);

    if (error) {
      this.logger.error(`Failed to find misread signals: ${error.message}`);
      return [];
    }

    const analyses: MisreadSignalAnalysis[] = [];

    const signalRows = (data || []) as Array<Record<string, unknown>>;
    for (const signal of signalRows) {
      const signalDirection = signal.direction as string;

      // Check if signal pointed to actual direction but was rejected
      const wouldHaveHelped =
        (signalDirection === 'bullish' && actualDirection === 'up') ||
        (signalDirection === 'bearish' && actualDirection === 'down');

      if (wouldHaveHelped && signal.disposition === 'rejected') {
        analyses.push({
          signal: {
            ...signal,
            source: signal.source,
          } as SignalWithSource,
          originalDisposition: signal.disposition,
          signalDirection,
          actualDirection,
          possibleIssue: 'rejected_incorrectly',
        });
      }

      // Check if signal direction was opposite to actual (misread)
      const wasOpposite =
        (signalDirection === 'bullish' && actualDirection === 'down') ||
        (signalDirection === 'bearish' && actualDirection === 'up');

      if (wasOpposite && signal.disposition === 'predictor_created') {
        analyses.push({
          signal: {
            ...signal,
            source: signal.source,
          } as SignalWithSource,
          originalDisposition: signal.disposition,
          signalDirection,
          actualDirection,
          possibleIssue: 'wrong_direction',
        });
      }
    }

    return analyses;
  }

  /**
   * Determine why a predictor wasn't used
   */
  private determineUnusedReason(
    predictor: Record<string, unknown>,
  ): UnusedPredictorAnalysis['reason'] {
    if (predictor.status === 'expired') {
      return 'expired';
    }
    if ((predictor.confidence as number) < 0.6) {
      return 'below_threshold';
    }
    if ((predictor.strength as number) < 5) {
      return 'below_threshold';
    }
    return 'insufficient_count';
  }

  /**
   * Determine actual direction from outcome value
   */
  private determineActualDirection(
    outcomeValue: number,
    threshold: number,
  ): PredictionDirection {
    if (Math.abs(outcomeValue) < threshold) {
      return 'flat';
    }
    return outcomeValue > 0 ? 'up' : 'down';
  }

  /**
   * Determine the type of miss
   */
  private determineMissType(
    predictedDirection: PredictionDirection,
    actualDirection: PredictionDirection,
    predictedMagnitude: string | null,
    actualMagnitude: number,
    config: MissDetectionConfig,
  ): MissType | null {
    // Correct prediction - not a miss
    if (predictedDirection === actualDirection) {
      // Check for magnitude underestimation
      const expectedMagnitude = this.magnitudeToNumeric(predictedMagnitude);
      if (
        actualMagnitude >
        expectedMagnitude * config.magnitudeUnderestimationRatio
      ) {
        return 'magnitude_wrong';
      }
      return null; // Correct prediction
    }

    // Missed opportunity: predicted flat but moved
    if (predictedDirection === 'flat' && actualDirection !== 'flat') {
      return 'missed_opportunity';
    }

    // False positive: predicted move but stayed flat
    if (predictedDirection !== 'flat' && actualDirection === 'flat') {
      return 'false_positive';
    }

    // Direction wrong: predicted opposite direction
    return 'direction_wrong';
  }

  /**
   * Convert categorical magnitude to numeric
   */
  private magnitudeToNumeric(magnitude: string | null): number {
    switch (magnitude) {
      case 'small':
        return 2.0;
      case 'medium':
        return 5.0;
      case 'large':
        return 10.0;
      default:
        return 3.0;
    }
  }

  /**
   * Generate learning suggestion for predictor-level miss
   */
  private generatePredictorLevelLearning(
    investigation: MissInvestigation,
    unusedPredictors: UnusedPredictorAnalysis[],
  ): SuggestedLearningFromInvestigation {
    const avgConfidence =
      unusedPredictors.reduce((sum, p) => sum + p.predictor.confidence, 0) /
      unusedPredictors.length;

    const reasons = unusedPredictors.map((p) => p.reason);
    const mostCommonReason = this.getMostCommon(reasons);

    let learningType: SuggestedLearningFromInvestigation['type'] = 'threshold';
    let title = 'Adjust prediction threshold';
    let description = '';
    const config: Record<string, unknown> = {};

    if (mostCommonReason === 'below_threshold') {
      title = 'Lower confidence threshold';
      description = `${unusedPredictors.length} predictor(s) with avg confidence ${(avgConfidence * 100).toFixed(0)}% were not used. Consider lowering threshold.`;
      config.suggestedThreshold = Math.max(0.4, avgConfidence - 0.1);
    } else if (mostCommonReason === 'insufficient_count') {
      title = 'Reduce required predictor count';
      description = `Predictors existed but count was below threshold. Consider requiring fewer predictors for prediction.`;
      config.suggestedCount = Math.max(1, unusedPredictors.length);
    } else if (mostCommonReason === 'expired') {
      title = 'Extend predictor TTL';
      description = `${unusedPredictors.length} predictor(s) expired before being used. Consider longer TTL.`;
      learningType = 'rule';
    }

    return {
      type: learningType,
      scope: 'runner',
      title,
      description,
      config,
      evidence: {
        missType: investigation.missType,
        investigationLevel: 'predictor',
        keyFindings: unusedPredictors.map(
          (p) =>
            `${p.predictor.analyst_slug}: ${p.predictor.direction} (${(p.predictor.confidence * 100).toFixed(0)}%) - ${p.reason}`,
        ),
      },
      suggestedTest: {
        type: 'threshold_test',
        description: `Re-run prediction with adjusted threshold to verify it would have been correct`,
        params: {
          predictionId: investigation.prediction.id,
          newThreshold: config.suggestedThreshold || config.suggestedCount,
        },
      },
    };
  }

  /**
   * Generate learning suggestion for signal-level miss
   */
  private generateSignalLevelLearning(
    investigation: MissInvestigation,
    misreadSignals: MisreadSignalAnalysis[],
  ): SuggestedLearningFromInvestigation {
    const issues = misreadSignals.map((s) => s.possibleIssue);
    const mostCommonIssue = this.getMostCommon(issues);

    let learningType: SuggestedLearningFromInvestigation['type'] =
      'weight_adjustment';
    let title = 'Adjust signal evaluation';
    let description = '';
    const config: Record<string, unknown> = {};

    if (mostCommonIssue === 'rejected_incorrectly') {
      title = 'Review signal rejection criteria';
      description = `${misreadSignals.length} signal(s) were rejected but pointed to the correct direction. Review rejection criteria.`;
      learningType = 'rule';
      config.affectedSources = [
        ...new Set(misreadSignals.map((s) => s.signal.source?.name)),
      ];
    } else if (mostCommonIssue === 'wrong_direction') {
      title = 'Analyst direction assessment needs calibration';
      description = `Signal direction was assessed opposite to actual move. Review analyst evaluation logic.`;
      learningType = 'weight_adjustment';
      const analysts = [
        ...new Set(
          misreadSignals
            .map((s) => s.signal.evaluation_result?.analyst_slug)
            .filter(Boolean),
        ),
      ];
      config.affectedAnalysts = analysts;
    }

    return {
      type: learningType,
      scope: 'analyst',
      title,
      description,
      config,
      evidence: {
        missType: investigation.missType,
        investigationLevel: 'signal',
        keyFindings: misreadSignals.map(
          (s) =>
            `Signal from ${s.signal.source?.name || 'unknown'}: ${s.signalDirection} → actual ${s.actualDirection} (${s.possibleIssue})`,
        ),
      },
      suggestedTest: {
        type: 'simulation',
        description: `Re-evaluate signals with adjusted criteria to verify correct assessment`,
        params: {
          signalIds: misreadSignals.map((s) => s.signal.id),
        },
      },
    };
  }

  /**
   * Get most common element in array
   */
  private getMostCommon<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    const counts = new Map<T, number>();
    for (const item of arr) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    let maxCount = 0;
    let mostCommon: T | undefined = arr[0];
    for (const [item, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    }
    return mostCommon;
  }

  /**
   * Generate daily investigation summary
   */
  async generateDailySummary(
    date: string,
    investigations: MissInvestigation[],
  ): Promise<DailyInvestigationSummary> {
    const byType = {
      missed_opportunity: 0,
      direction_wrong: 0,
      magnitude_wrong: 0,
      false_positive: 0,
    };

    const byLevel = {
      predictor: 0,
      signal: 0,
      source: 0,
      unpredictable: 0,
    };

    const sourceGaps = new Map<string, { type: string; count: number }>();

    for (const inv of investigations) {
      byType[inv.missType]++;
      byLevel[inv.investigationLevel]++;

      // Collect source gaps from research results
      if (inv.sourceResearch?.suggestedSources) {
        for (const source of inv.sourceResearch.suggestedSources) {
          const key = source.name;
          const existing = sourceGaps.get(key);
          if (existing) {
            existing.count++;
          } else {
            sourceGaps.set(key, { type: source.type, count: 1 });
          }
        }
      }
    }

    const learningsSuggested = investigations.filter(
      (i) => i.suggestedLearning,
    ).length;

    const topSourceGaps = Array.from(sourceGaps.entries())
      .map(([name, data]) => ({
        sourceName: name,
        sourceType: data.type,
        mentionCount: data.count,
      }))
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 10);

    return {
      date,
      totalMisses: investigations.length,
      byType,
      byLevel,
      learningsSuggested,
      topSourceGaps,
    };
  }
}
