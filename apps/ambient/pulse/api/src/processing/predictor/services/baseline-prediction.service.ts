/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// Disabled unsafe rules due to Supabase RPC calls returning generic 'any' types
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { PredictionRepository } from '../repositories/prediction.repository';
import { TargetSnapshotService } from './target-snapshot.service';
import { CreatePredictionData } from '../interfaces/prediction.interface';

/**
 * Baseline Prediction Service
 *
 * Creates "flat" baseline predictions for instruments that don't have
 * explicit predictions. This enables the learning system to:
 *
 * 1. Evaluate ALL instruments, not just those with predictions
 * 2. Detect missed opportunities (baseline was flat but instrument moved)
 * 3. Build a complete dataset for learning
 *
 * Baseline predictions are marked with:
 * - direction: 'flat'
 * - confidence: 0.5 (neutral)
 * - reasoning: indicates it's a baseline
 * - analyst_ensemble: { baseline: true }
 */
@Injectable()
export class BaselinePredictionService {
  private readonly logger = new Logger(BaselinePredictionService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly predictionRepository: PredictionRepository,
    private readonly targetSnapshotService: TargetSnapshotService,
  ) {}

  /**
   * Create baseline predictions for all instruments without predictions
   * Should be called at end of day (e.g., 4:30 PM ET after market close)
   *
   * @param date - The date to create baselines for (YYYY-MM-DD)
   * @param universeId - Optional: limit to specific universe
   * @returns Summary of baselines created
   */
  async createBaselinePredictions(
    date: string,
    universeId?: string,
  ): Promise<{
    created: number;
    skipped: number;
    errors: number;
    targets: string[];
  }> {
    this.logger.log(`Creating baseline predictions for ${date}`);

    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;

    // Get all active targets
    let targetsQuery = this.db
      .from('prediction', 'targets')
      .select('id, symbol, name, universe_id')
      .eq('is_active', true)
      .eq('is_archived', false);

    if (universeId) {
      targetsQuery = targetsQuery.eq('universe_id', universeId);
    }

    const { data: targets, error: targetsError } = await targetsQuery;

    if (targetsError) {
      this.logger.error(`Failed to fetch targets: ${targetsError.message}`);
      throw new Error(`Failed to fetch targets: ${targetsError.message}`);
    }

    const targetRows = (targets ?? []) as Array<{
      id: string;
      symbol: string;
      name: string;
      universe_id: string;
    }>;
    if (targetRows.length === 0) {
      this.logger.log('No active targets found');
      return { created: 0, skipped: 0, errors: 0, targets: [] };
    }

    // Get targets that already have predictions for today
    const { data: existingPredictions, error: predError } = await this.db
      .from('prediction', 'predictions')
      .select('target_id')
      .gte('predicted_at', startOfDay)
      .lte('predicted_at', endOfDay);

    if (predError) {
      this.logger.error(
        `Failed to fetch existing predictions: ${predError.message}`,
      );
      throw new Error(
        `Failed to fetch existing predictions: ${predError.message}`,
      );
    }

    const existingPredictionRows = (existingPredictions || []) as Array<{
      target_id: string;
    }>;
    const existingTargetIds = new Set(
      existingPredictionRows.map((p: { target_id: string }) => p.target_id),
    );

    // Filter to targets without predictions
    const targetsNeedingBaseline = targetRows.filter(
      (t: { id: string }) => !existingTargetIds.has(t.id),
    );

    this.logger.log(
      `${targetsNeedingBaseline.length} of ${targetRows.length} targets need baseline predictions`,
    );

    let created = 0;
    let skipped = 0;
    let errors = 0;
    const createdTargets: string[] = [];

    for (const target of targetsNeedingBaseline) {
      try {
        // Get current price for entry_price
        const currentPrice = await this.getCurrentPrice(target.id);

        if (currentPrice === null) {
          this.logger.warn(
            `No price available for ${target.symbol}, skipping baseline`,
          );
          skipped++;
          continue;
        }

        // Create baseline prediction
        const baseline = await this.createBaseline(
          target.id,
          target.symbol,
          currentPrice,
          date,
        );

        if (baseline) {
          created++;
          createdTargets.push(target.symbol);
        }
      } catch (error) {
        errors++;
        this.logger.error(
          `Failed to create baseline for ${target.symbol}: ` +
            `${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    this.logger.log(
      `Baseline creation complete: ${created} created, ${skipped} skipped, ${errors} errors`,
    );

    return {
      created,
      skipped,
      errors,
      targets: createdTargets,
    };
  }

  /**
   * Create a single baseline prediction
   */
  private async createBaseline(
    targetId: string,
    symbol: string,
    entryPrice: number,
    date: string,
  ): Promise<string | null> {
    const now = new Date();
    const expiresAt = new Date(date);
    expiresAt.setDate(expiresAt.getDate() + 1); // Expires next day
    expiresAt.setHours(16, 0, 0, 0); // 4 PM

    const predictionData: CreatePredictionData = {
      target_id: targetId,
      direction: 'flat',
      confidence: 0.5, // Neutral confidence
      magnitude: 'small', // Expect minimal movement
      reasoning: `Baseline prediction for ${symbol}: No signals or predictors triggered an explicit prediction. Defaulting to flat (no significant movement expected).`,
      timeframe_hours: 24,
      predicted_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      entry_price: entryPrice,
      target_price: entryPrice, // No movement expected
      stop_loss: entryPrice * 0.98, // 2% stop loss as safety
      analyst_ensemble: {
        baseline: true,
        reason: 'no_explicit_prediction',
        created_at: now.toISOString(),
      },
      llm_ensemble: {
        baseline: true,
        tiers_used: [],
      },
      status: 'active',
    };

    const prediction = await this.predictionRepository.create(predictionData);

    this.logger.debug(
      `Created baseline prediction for ${symbol}: ${prediction.id}`,
    );

    return prediction.id;
  }

  /**
   * Get current price for a target
   * Uses the most recent snapshot
   */
  private async getCurrentPrice(targetId: string): Promise<number | null> {
    try {
      // Get most recent snapshot
      const { data: snapshot, error } = await this.db
        .from('prediction', 'target_snapshots')
        .select('value')
        .eq('target_id', targetId)
        .order('captured_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !snapshot) {
        return null;
      }

      return (snapshot as { value: number }).value;
    } catch {
      return null;
    }
  }

  /**
   * Check if a prediction is a baseline prediction
   */
  isBaselinePrediction(prediction: {
    analyst_ensemble?: Record<string, unknown>;
  }): boolean {
    return prediction.analyst_ensemble?.baseline === true;
  }

  /**
   * Get all baseline predictions for a date
   */
  async getBaselinePredictions(
    date: string,
    universeId?: string,
  ): Promise<
    Array<{
      id: string;
      target_id: string;
      symbol: string;
      entry_price: number;
      status: string;
    }>
  > {
    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;

    let query = this.db
      .from('prediction', 'predictions')
      .select(
        `
        id,
        target_id,
        entry_price,
        status,
        target:targets(symbol, universe_id)
      `,
      )
      .gte('predicted_at', startOfDay)
      .lte('predicted_at', endOfDay)
      .eq('direction', 'flat')
      .contains('analyst_ensemble', { baseline: true });

    if (universeId) {
      query = query.eq('target.universe_id', universeId);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(
        `Failed to fetch baseline predictions: ${error.message}`,
      );
      return [];
    }

    const rows = (data || []) as Array<Record<string, unknown>>;
    return rows.map((p: Record<string, unknown>) => {
      // target can be an object or array from Supabase join
      const targetData = Array.isArray(p.target) ? p.target[0] : p.target;
      return {
        id: p.id as string,
        target_id: p.target_id as string,
        symbol:
          (targetData as { symbol: string } | undefined)?.symbol || 'UNKNOWN',
        entry_price: p.entry_price as number,
        status: p.status as string,
      };
    });
  }

  /**
   * Get statistics about baseline predictions
   */
  async getBaselineStats(
    startDate: string,
    endDate: string,
  ): Promise<{
    totalBaselines: number;
    resolvedBaselines: number;
    missedOpportunities: number;
    correctFlat: number;
  }> {
    const { data, error } = await this.db
      .from('prediction', 'predictions')
      .select('id, status, outcome_value, direction')
      .gte('predicted_at', `${startDate}T00:00:00Z`)
      .lte('predicted_at', `${endDate}T23:59:59Z`)
      .eq('direction', 'flat')
      .contains('analyst_ensemble', { baseline: true });

    if (error) {
      this.logger.error(`Failed to fetch baseline stats: ${error.message}`);
      return {
        totalBaselines: 0,
        resolvedBaselines: 0,
        missedOpportunities: 0,
        correctFlat: 0,
      };
    }

    const predictions = (data || []) as Array<Record<string, unknown>>;
    const resolved = predictions.filter(
      (p: Record<string, unknown>) => p.status === 'resolved',
    );
    const significantMoveThreshold = 0.5; // 0.5%

    const missedOpportunities = resolved.filter(
      (p: Record<string, unknown>) =>
        p.outcome_value !== null &&
        Math.abs(p.outcome_value as number) > significantMoveThreshold,
    );

    const correctFlat = resolved.filter(
      (p: Record<string, unknown>) =>
        p.outcome_value !== null &&
        Math.abs(p.outcome_value as number) <= significantMoveThreshold,
    );

    return {
      totalBaselines: predictions.length,
      resolvedBaselines: resolved.length,
      missedOpportunities: missedOpportunities.length,
      correctFlat: correctFlat.length,
    };
  }
}
