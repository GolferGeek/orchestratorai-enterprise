import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  MissedOpportunity,
  MissDetectionConfig,
  DEFAULT_MISS_CONFIG,
} from '../interfaces/missed-opportunity.interface';

/**
 * @deprecated Use BaselinePredictionService + MissInvestigationService instead.
 *
 * This service scans price snapshots for significant moves without predictions.
 * The new approach uses baseline predictions to ensure every instrument has a
 * prediction, then evaluates outcomes through the standard prediction pipeline.
 *
 * Migration path:
 * 1. BaselinePredictionService creates "flat" predictions for instruments without explicit predictions
 * 2. Outcome tracking resolves these predictions
 * 3. MissInvestigationService identifies misses (baseline was flat but moved)
 * 4. SourceResearchService researches what caused the move
 *
 * This service is kept for backward compatibility and ad-hoc detection of
 * significant moves in historical data where baselines weren't created.
 */

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

interface TargetSnapshot {
  id: string;
  target_id: string;
  captured_at: string;
  value: number;
  metadata: Record<string, unknown> | null;
}

interface SignificantMove {
  start: TargetSnapshot;
  end: TargetSnapshot;
  percentage: number;
  direction: 'up' | 'down';
}

@Injectable()
export class MissedOpportunityDetectionService {
  private readonly logger = new Logger(MissedOpportunityDetectionService.name);
  private readonly schema = 'prediction';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Detect missed opportunities for a target
   * Finds significant price moves that were not predicted
   */
  async detectMissedOpportunities(
    targetId: string,
    config?: MissDetectionConfig,
  ): Promise<MissedOpportunity[]> {
    const effectiveConfig = { ...DEFAULT_MISS_CONFIG, ...config };

    this.logger.log(
      `Detecting missed opportunities for target: ${targetId}, lookback: ${effectiveConfig.lookback_hours}h`,
    );

    // Get price snapshots for lookback period
    const lookbackDate = new Date();
    lookbackDate.setHours(
      lookbackDate.getHours() - effectiveConfig.lookback_hours,
    );

    const { data: snapshots, error: snapshotsError } = (await this.db
      .from(this.schema, 'target_snapshots')
      .select('id, target_id, captured_at, value, metadata')
      .eq('target_id', targetId)
      .gte('captured_at', lookbackDate.toISOString())
      .order('captured_at', {
        ascending: true,
      })) as SupabaseSelectListResponse<TargetSnapshot>;

    if (snapshotsError) {
      this.logger.error(`Failed to fetch snapshots: ${snapshotsError.message}`);
      throw new Error(`Failed to fetch snapshots: ${snapshotsError.message}`);
    }

    if (!snapshots || snapshots.length < 2) {
      this.logger.log('Not enough snapshots to detect moves');
      return [];
    }

    // Find significant moves
    const significantMoves = this.findSignificantMoves(
      snapshots,
      effectiveConfig.min_move_percentage,
    );

    if (significantMoves.length === 0) {
      this.logger.log('No significant moves found');
      return [];
    }

    this.logger.log(
      `Found ${significantMoves.length} significant move(s) to check`,
    );

    // Check each move for prediction coverage
    const missedOpportunities: MissedOpportunity[] = [];

    for (const move of significantMoves) {
      const moveStart = new Date(move.start.captured_at);
      const moveEnd = new Date(move.end.captured_at);

      // Check if we had predictions during this move
      const hadPrediction = await this.checkPredictionCoverage(
        targetId,
        moveStart,
        moveEnd,
        effectiveConfig.max_prediction_gap_hours,
      );

      if (!hadPrediction) {
        this.logger.log(
          `Missed opportunity detected: ${move.direction} ${move.percentage.toFixed(2)}% from ${move.start.captured_at} to ${move.end.captured_at}`,
        );

        // Calculate significance score (0-1)
        // Higher score for larger moves
        const significanceScore = Math.min(
          1.0,
          Math.abs(move.percentage) / 20, // 20% = max score
        );

        // Create missed opportunity record
        const missedOpportunity = await this.createMissedOpportunity({
          target_id: targetId,
          detected_at: new Date().toISOString(),
          move_start: move.start.captured_at,
          move_end: move.end.captured_at,
          move_direction: move.direction,
          move_percentage: move.percentage,
          significance_score: significanceScore,
          analysis_status: 'pending',
          discovered_drivers: [],
          source_gaps: [],
          suggested_learnings: [],
        });

        if (missedOpportunity) {
          missedOpportunities.push(missedOpportunity);
        }
      } else {
        this.logger.log(
          `Move was covered by predictions: ${move.direction} ${move.percentage.toFixed(2)}%`,
        );
      }
    }

    this.logger.log(
      `Detected ${missedOpportunities.length} missed opportunities`,
    );
    return missedOpportunities;
  }

  /**
   * Calculate percentage change between two prices
   */
  private calculateMovePercentage(
    startPrice: number,
    endPrice: number,
  ): number {
    if (startPrice === 0) return 0;
    return ((endPrice - startPrice) / startPrice) * 100;
  }

  /**
   * Find significant price moves in snapshot data
   * Uses a sliding window approach to find local peaks and troughs
   */
  private findSignificantMoves(
    snapshots: TargetSnapshot[],
    minMovePercentage: number,
  ): SignificantMove[] {
    const moves: SignificantMove[] = [];

    if (snapshots.length < 2) return moves;

    // Simple approach: compare start and end of window
    // More sophisticated: find local peaks/troughs
    let windowStart = 0;

    while (windowStart < snapshots.length - 1) {
      const startSnapshot = snapshots[windowStart];
      if (!startSnapshot) continue;

      let maxEndIdx = windowStart + 1;
      let maxMove = 0;

      // Find the largest move from this starting point
      for (let i = windowStart + 1; i < snapshots.length; i++) {
        const endSnapshot = snapshots[i];
        if (!endSnapshot) continue;

        const move = this.calculateMovePercentage(
          startSnapshot.value,
          endSnapshot.value,
        );
        if (Math.abs(move) > Math.abs(maxMove)) {
          maxMove = move;
          maxEndIdx = i;
        }
      }

      // If move is significant, record it
      if (Math.abs(maxMove) >= minMovePercentage) {
        const endSnapshot = snapshots[maxEndIdx];
        if (!endSnapshot) continue;

        const direction: 'up' | 'down' = maxMove > 0 ? 'up' : 'down';
        moves.push({
          start: startSnapshot,
          end: endSnapshot,
          percentage: maxMove,
          direction,
        });

        // Move window to end of this move
        windowStart = maxEndIdx;
      } else {
        windowStart++;
      }
    }

    return moves;
  }

  /**
   * Check if we had predictions during the move period
   * Returns true if we had active predictions
   */
  private async checkPredictionCoverage(
    targetId: string,
    moveStart: Date,
    moveEnd: Date,
    maxGapHours: number,
  ): Promise<boolean> {
    // Check if we had any predictions that overlapped with this move
    const { data: predictions, error } = (await this.db
      .from(this.schema, 'predictions')
      .select('id, created_at, expires_at')
      .eq('target_id', targetId)
      .gte('created_at', moveStart.toISOString())
      .lte('created_at', moveEnd.toISOString())
      .limit(1)) as SupabaseSelectListResponse<{
      id: string;
      created_at: string;
      expires_at: string;
    }>;

    if (error) {
      this.logger.error(`Failed to check predictions: ${error.message}`);
      throw new Error(`Failed to check predictions: ${error.message}`);
    }

    // If we had any predictions during the move, we covered it
    if (predictions && predictions.length > 0) {
      return true;
    }

    // Also check if we had a prediction before the move that extended into it
    const gapCheckDate = new Date(moveStart);
    gapCheckDate.setHours(gapCheckDate.getHours() - maxGapHours);

    const { data: recentPredictions, error: recentError } = (await this.db
      .from(this.schema, 'predictions')
      .select('id, created_at, expires_at')
      .eq('target_id', targetId)
      .gte('created_at', gapCheckDate.toISOString())
      .lte('created_at', moveStart.toISOString())
      .gte('expires_at', moveStart.toISOString())
      .limit(1)) as SupabaseSelectListResponse<{
      id: string;
      created_at: string;
      expires_at: string;
    }>;

    if (recentError) {
      this.logger.error(
        `Failed to check recent predictions: ${recentError.message}`,
      );
      throw new Error(
        `Failed to check recent predictions: ${recentError.message}`,
      );
    }

    return !!(recentPredictions && recentPredictions.length > 0);
  }

  /**
   * Create a missed opportunity record
   */
  private async createMissedOpportunity(
    data: Omit<MissedOpportunity, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<MissedOpportunity | null> {
    const { data: created, error } = (await this.db
      .from(this.schema, 'missed_opportunities')
      .insert(data)
      .select()
      .single()) as SupabaseSelectResponse<MissedOpportunity>;

    if (error) {
      this.logger.error(
        `Failed to create missed opportunity: ${error.message}`,
      );
      return null;
    }

    return created;
  }
}
