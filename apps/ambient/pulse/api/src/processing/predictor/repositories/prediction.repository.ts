import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  Prediction,
  CreatePredictionData,
  UpdatePredictionData,
  PredictionStatus,
} from '../interfaces/prediction.interface';
import { TestDataFilter } from '../interfaces/test-data.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

/**
 * Default filter that excludes test data from production queries
 */
const DEFAULT_FILTER: TestDataFilter = { includeTestData: false };

@Injectable()
export class PredictionRepository {
  private readonly logger = new Logger(PredictionRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'predictions';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Returns the completion timestamp of the latest EOD settlement, if any.
   * This timestamp defines the start of the current trading window.
   */
  private async getLatestSettlementCompletedAt(): Promise<string | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'eod_settlement_log')
      .select('completed_at')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as SupabaseSelectResponse<{ completed_at: string }>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch latest settlement boundary: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch latest settlement boundary: ${error.message}`,
      );
    }

    return data?.completed_at ?? null;
  }

  /**
   * Apply test data filter to a query builder
   * By default, excludes test data from production queries
   */
  private applyTestDataFilter<
    T extends { eq: (col: string, val: unknown) => T; or: (cond: string) => T },
  >(query: T, filter: TestDataFilter = DEFAULT_FILTER): T {
    if (filter.testDataOnly) {
      query = query.eq('is_test_data', true);
      if (filter.testScenarioId) {
        query = query.eq('test_scenario_id', filter.testScenarioId);
      }
    } else if (filter.testScenarioId) {
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter.includeTestData) {
      query = query.or('is_test_data.is.null,is_test_data.eq.false');
    }
    return query;
  }

  async findById(id: string): Promise<Prediction | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<Prediction>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch prediction: ${error.message}`);
      throw new Error(`Failed to fetch prediction: ${error.message}`);
    }

    return data;
  }

  async findByTarget(
    targetId: string,
    status?: PredictionStatus,
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<Prediction[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId);

    if (status) {
      query = query.eq('status', status);
      if (status === 'active') {
        const tradingWindowStart = await this.getLatestSettlementCompletedAt();
        if (tradingWindowStart) {
          query = query.gt('created_at', tradingWindowStart);
        }
      }
    }

    query = this.applyTestDataFilter(query, filter);
    query = query.order('predicted_at', { ascending: false });

    const { data, error } =
      (await query) as SupabaseSelectListResponse<Prediction>;

    if (error) {
      this.logger.error(`Failed to fetch predictions: ${error.message}`);
      throw new Error(`Failed to fetch predictions: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find an active prediction for a specific target and analyst.
   * Returns the most recent active prediction for this analyst+target pair.
   * Used by the upsert logic to decide whether to update or create.
   */
  async findByTargetAndAnalyst(
    targetId: string,
    analystSlug: string,
    status?: PredictionStatus,
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<Prediction | null> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .eq('analyst_slug', analystSlug);

    if (status) {
      query = query.eq('status', status);
    }

    query = this.applyTestDataFilter(query, filter);

    const { data, error } = (await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as SupabaseSelectResponse<Prediction>;

    if (error) {
      this.logger.error(
        `Failed to find prediction for target=${targetId} analyst=${analystSlug}: ${error.message}`,
      );
      throw new Error(
        `Failed to find prediction by target+analyst: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Find predictions by universe ID
   * Since predictions link to targets which link to universes,
   * we need to join through the targets table
   */
  async findByUniverse(
    universeId: string,
    status?: PredictionStatus,
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<Prediction[]> {
    this.logger.debug(
      `[findByUniverse] Starting - universeId: ${universeId}, status: ${status}, filter: ${JSON.stringify(filter)}`,
    );

    // First get all target IDs for this universe
    const { data: targets, error: targetError } = (await this.db
      .from(this.schema, 'targets')
      .select('id')
      .eq('universe_id', universeId)) as QueryResult<unknown>;

    if (targetError) {
      this.logger.error(`Failed to fetch targets: ${targetError.message}`);
      throw new Error(`Failed to fetch targets: ${targetError.message}`);
    }

    const targetRows = (targets ?? []) as Array<{ id: string }>;
    this.logger.debug(
      `[findByUniverse] Found ${targetRows.length} targets for universe`,
    );

    if (targetRows.length === 0) {
      return [];
    }

    const targetIds = targetRows.map((t: { id: string }) => t.id);
    this.logger.debug(`[findByUniverse] Target IDs: ${targetIds.join(', ')}`);

    // Query ALL predictions for these targets first (without filters) to debug
    const { data: allPredictions } = (await this.db
      .from(this.schema, this.table)
      .select('id, status, is_test_data')
      .in('target_id', targetIds)) as QueryResult<unknown>;

    const allPredictionRows = (allPredictions ?? []) as Array<
      Record<string, unknown>
    >;
    this.logger.debug(
      `[findByUniverse] All predictions for targets (no filters): ${allPredictionRows.length}`,
    );
    if (allPredictionRows.length > 0) {
      this.logger.debug(
        `[findByUniverse] Sample predictions: ${JSON.stringify(allPredictionRows.slice(0, 3))}`,
      );
    }

    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .in('target_id', targetIds);

    if (status) {
      query = query.eq('status', status);
      if (status === 'active') {
        const tradingWindowStart = await this.getLatestSettlementCompletedAt();
        if (tradingWindowStart) {
          query = query.gt('created_at', tradingWindowStart);
        }
      }
    }

    query = this.applyTestDataFilter(query, filter);
    query = query.order('predicted_at', { ascending: false });

    const { data, error } =
      (await query) as SupabaseSelectListResponse<Prediction>;

    if (error) {
      this.logger.error(
        `Failed to fetch predictions by universe: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch predictions by universe: ${error.message}`,
      );
    }

    this.logger.debug(
      `[findByUniverse] Final result after filters: ${data?.length ?? 0} predictions`,
    );

    return data ?? [];
  }

  async create(predictionData: CreatePredictionData): Promise<Prediction> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(predictionData)
      .select()
      .single()) as SupabaseSelectResponse<Prediction>;

    if (error) {
      this.logger.error(`Failed to create prediction: ${error.message}`);
      throw new Error(`Failed to create prediction: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no prediction returned');
    }

    return data;
  }

  async update(
    id: string,
    updateData: UpdatePredictionData,
  ): Promise<Prediction> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<Prediction>;

    if (error) {
      this.logger.error(`Failed to update prediction: ${error.message}`);
      throw new Error(`Failed to update prediction: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no prediction returned');
    }

    return data;
  }

  /**
   * Backfill analyst slug for legacy predictions when it can be reconstructed.
   */
  async backfillAnalystSlug(id: string, analystSlug: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .update({ analyst_slug: analystSlug })
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to backfill analyst slug: ${error.message}`);
      throw new Error(`Failed to backfill analyst slug: ${error.message}`);
    }
  }

  /**
   * Update the analyst_ensemble JSONB field specifically
   * Used for adding version history without affecting other fields
   */
  async updateAnalystEnsemble(
    id: string,
    ensemble: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .update({ analyst_ensemble: ensemble })
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to update analyst_ensemble: ${error.message}`);
      throw new Error(`Failed to update analyst_ensemble: ${error.message}`);
    }
  }

  /**
   * Find predictions that are past their timeframe and need resolution
   * Returns active predictions where expires_at is in the past
   * @param filter - Test data filter (defaults to excluding test data)
   */
  async findPendingResolution(
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<Prediction[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString());

    query = this.applyTestDataFilter(query, filter);

    const { data, error } = (await query.order('expires_at', {
      ascending: true,
    })) as SupabaseSelectListResponse<Prediction>;

    if (error) {
      this.logger.error(
        `Failed to fetch pending resolution predictions: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch pending resolution predictions: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Resolve a prediction with the actual outcome value
   * Sets outcome_value, outcome_captured_at, and status to 'resolved'
   */
  async resolve(id: string, outcomeValue: number): Promise<Prediction> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update({
        status: 'resolved',
        outcome_value: outcomeValue,
        outcome_captured_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'active')
      .select()
      .single()) as SupabaseSelectResponse<Prediction>;

    if (error) {
      this.logger.error(`Failed to resolve prediction: ${error.message}`);
      throw new Error(`Failed to resolve prediction: ${error.message}`);
    }

    if (!data) {
      throw new Error('Resolve succeeded but no prediction returned');
    }

    return data;
  }

  /**
   * Find active predictions in the current trading window.
   *
   * EOD-first lifecycle: once nightly settlement completes, previous-window
   * predictions are considered processed for trading regardless of expires_at.
   * @param filter - Test data filter (defaults to excluding test data)
   */
  async findActivePredictions(
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<Prediction[]> {
    return this.findActivePredictionsForTradingWindow(filter);
  }

  /**
   * Find active predictions that belong to the current trading window.
   *
   * Trading window starts immediately after the latest completed EOD settlement.
   * This enforces an EOD-first lifecycle: predictions from earlier windows are
   * considered already processed for trading, even if they have not expired.
   */
  async findActivePredictionsForTradingWindow(
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<Prediction[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('status', 'active');

    const tradingWindowStart = await this.getLatestSettlementCompletedAt();
    if (tradingWindowStart) {
      query = query.gt('created_at', tradingWindowStart);
    }

    query = this.applyTestDataFilter(query, filter);

    const { data, error } = (await query.order('predicted_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<Prediction>;

    if (error) {
      this.logger.error(
        `Failed to fetch trading-window active predictions: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch trading-window active predictions: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Count active directional predictions missing analyst_slug.
   * Used for deciding whether missing-analyst records are one-off anomalies.
   */
  async countActiveDirectionalMissingAnalystSlug(
    excludePredictionId?: string,
  ): Promise<number> {
    let query = this.db
      .from(this.schema, this.table)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .in('direction', ['up', 'down'])
      .is('analyst_slug', null)
      .eq('is_arbitrator', false);

    if (excludePredictionId) {
      query = query.neq('id', excludePredictionId);
    }

    const { count, error } = await query;
    if (error) {
      this.logger.error(
        `Failed to count missing-analyst predictions: ${error.message}`,
      );
      throw new Error(
        `Failed to count missing-analyst predictions: ${error.message}`,
      );
    }

    return count ?? 0;
  }

  /**
   * Mark prediction as non-tradable by cancelling it with resolution notes.
   */
  async markPredictionNonTradable(
    id: string,
    reason: string,
  ): Promise<Prediction> {
    return this.update(id, {
      status: 'cancelled',
      resolution_notes: reason,
    });
  }

  /**
   * Mark all past-due active predictions as expired.
   * Returns all predictions transitioned in this operation.
   */
  async expirePastDueActivePredictions(): Promise<Prediction[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString())
      .select('*')) as SupabaseSelectListResponse<Prediction>;

    if (error) {
      this.logger.error(
        `Failed to expire past-due predictions: ${error.message}`,
      );
      throw new Error(
        `Failed to expire past-due predictions: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find resolved predictions that haven't been evaluated yet
   * @param filter - Test data filter (defaults to excluding test data)
   */
  async findResolvedWithoutEvaluation(
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<Prediction[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('status', 'resolved')
      .not('outcome_value', 'is', null)
      .is('resolution_notes', null);

    query = this.applyTestDataFilter(query, filter);

    const { data, error } = (await query.order('outcome_captured_at', {
      ascending: true,
    })) as SupabaseSelectListResponse<Prediction>;

    if (error) {
      this.logger.error(
        `Failed to fetch predictions for evaluation: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch predictions for evaluation: ${error.message}`,
      );
    }

    return data ?? [];
  }
}
