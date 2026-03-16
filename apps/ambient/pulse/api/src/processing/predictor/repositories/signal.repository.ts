import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  Signal,
  CreateSignalData,
  UpdateSignalData,
  SignalDisposition,
} from '../interfaces/signal.interface';
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
export class SignalRepository {
  private readonly logger = new Logger(SignalRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'signals';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Apply test data filter to a query builder
   * By default, excludes test data from production queries
   * Checks both is_test (main field) and is_test_data (legacy field)
   */
  private applyTestDataFilter<
    T extends { eq: (col: string, val: unknown) => T; or: (cond: string) => T },
  >(query: T, filter: TestDataFilter = DEFAULT_FILTER): T {
    if (filter.testDataOnly) {
      // Only return test data (check both is_test and is_test_data)
      query = query.or('is_test.eq.true,is_test_data.eq.true');
      if (filter.testScenarioId) {
        query = query.eq('test_scenario_id', filter.testScenarioId);
      }
    } else if (filter.testScenarioId) {
      // Return specific scenario's test data
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter.includeTestData) {
      // Exclude test data (default behavior)
      // Must check both is_test=false AND is_test_data is null/false
      query = query.or('is_test.is.null,is_test.eq.false');
      query = query.or('is_test_data.is.null,is_test_data.eq.false');
    }
    // If includeTestData is true and no scenarioId, return everything (no filter)
    return query;
  }

  /**
   * Find pending signals for processing
   * Uses FOR UPDATE SKIP LOCKED pattern to prevent race conditions
   * @param targetId - Target ID to filter by
   * @param limit - Maximum number of signals to return
   * @param filter - Test data filter (defaults to excluding test data)
   */
  async findPendingSignals(
    targetId: string,
    limit: number = 10,
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<Signal[]> {
    // Note: Supabase client doesn't directly support FOR UPDATE SKIP LOCKED
    // This would need to be implemented via a stored procedure or direct SQL
    // For now, we'll use a simple query and handle locking in claimSignal
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .eq('disposition', 'pending')
      .is('processing_worker', null);

    query = this.applyTestDataFilter(query, filter);

    const { data, error } = (await query
      .order('detected_at', { ascending: true })
      .limit(limit)) as SupabaseSelectListResponse<Signal>;

    if (error) {
      this.logger.error(`Failed to fetch pending signals: ${error.message}`);
      throw new Error(`Failed to fetch pending signals: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find pending signals grouped by URL (article)
   * Returns signals grouped so that all targets for the same article are together.
   * This enables article-centric processing: process all instruments for one article
   * before moving to the next.
   *
   * @param limit - Maximum total number of signals to return
   * @param filter - Test data filter (defaults to excluding test data)
   */
  async findPendingSignalsGroupedByUrl(
    limit: number = 200,
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<{ url: string; signals: Signal[] }[]> {
    // Get all pending signals ordered by detected_at (oldest first), then by target_id
    // This ensures we process articles in chronological order
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('disposition', 'pending')
      .is('processing_worker', null)
      .not('url', 'is', null); // Only signals with URLs

    query = this.applyTestDataFilter(query, filter);

    const { data, error } = (await query
      .order('detected_at', { ascending: true })
      .order('target_id', { ascending: true })
      .limit(limit)) as SupabaseSelectListResponse<Signal>;

    if (error) {
      this.logger.error(
        `Failed to fetch pending signals grouped: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch pending signals grouped: ${error.message}`,
      );
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Group signals by URL
    const groupMap = new Map<string, Signal[]>();
    for (const signal of data) {
      const url = signal.url || 'no-url';
      if (!groupMap.has(url)) {
        groupMap.set(url, []);
      }
      groupMap.get(url)!.push(signal);
    }

    // Convert to array of groups, preserving chronological order
    // (first signal's detected_at determines group order)
    const groups = Array.from(groupMap.entries())
      .map(([url, signals]) => ({ url, signals }))
      .sort((a, b) => {
        const aFirst = a.signals[0];
        const bFirst = b.signals[0];
        if (!aFirst || !bFirst) return 0;
        const aTime = new Date(aFirst.detected_at).getTime();
        const bTime = new Date(bFirst.detected_at).getTime();
        return aTime - bTime;
      });

    return groups;
  }

  async findById(id: string): Promise<Signal | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<Signal>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch signal: ${error.message}`);
      throw new Error(`Failed to fetch signal: ${error.message}`);
    }

    return data;
  }

  /**
   * Find existing signal for a specific article and target combination
   * Used to prevent duplicate signal creation
   */
  async findByArticleAndTarget(
    articleId: string,
    targetId: string,
  ): Promise<Signal | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .contains('metadata', { crawler_article_id: articleId })
      .limit(1)
      .single()) as SupabaseSelectResponse<Signal>;

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine (no duplicate)
      this.logger.error(
        `Failed to check for existing signal: ${error.message}`,
      );
      throw new Error(`Failed to check for existing signal: ${error.message}`);
    }

    return data;
  }

  async create(signalData: CreateSignalData): Promise<Signal> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(signalData)
      .select()
      .single()) as SupabaseSelectResponse<Signal>;

    if (error) {
      this.logger.error(`Failed to create signal: ${error.message}`);
      throw new Error(`Failed to create signal: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no signal returned');
    }

    return data;
  }

  async update(id: string, updateData: UpdateSignalData): Promise<Signal> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<Signal>;

    if (error) {
      this.logger.error(`Failed to update signal: ${error.message}`);
      throw new Error(`Failed to update signal: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no signal returned');
    }

    return data;
  }

  /**
   * Atomically claim a signal for processing
   * Sets processing_worker and disposition to 'processing'
   * Returns null if signal is already claimed
   */
  async claimSignal(id: string, workerId: string): Promise<Signal | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update({
        disposition: 'processing' as SignalDisposition,
        processing_worker: workerId,
        processing_started_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('disposition', 'pending')
      .is('processing_worker', null)
      .select()
      .single()) as SupabaseSelectResponse<Signal>;

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - signal was already claimed
        return null;
      }
      this.logger.error(`Failed to claim signal: ${error.message}`);
      throw new Error(`Failed to claim signal: ${error.message}`);
    }

    return data;
  }

  async findByTargetAndDisposition(
    targetId: string,
    disposition: SignalDisposition,
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<Signal[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .eq('disposition', disposition);

    query = this.applyTestDataFilter(query, filter);

    const { data, error } = (await query.order('detected_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<Signal>;

    if (error) {
      this.logger.error(
        `Failed to fetch signals by disposition: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch signals by disposition: ${error.message}`,
      );
    }

    return data ?? [];
  }

  // =============================================================================
  // REPLAY TEST METHODS
  // =============================================================================

  /**
   * Find signals by IDs
   * Used for replay test data injection
   */
  async findByIds(ids: string[]): Promise<Signal[]> {
    if (ids.length === 0) return [];

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .in('id', ids)) as SupabaseSelectListResponse<Signal>;

    if (error) {
      this.logger.error(`Failed to fetch signals by IDs: ${error.message}`);
      throw new Error(`Failed to fetch signals by IDs: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Create a test copy of a signal for replay testing
   * The copy is marked with is_test_data=true and test_scenario_id
   */
  async createTestCopy(
    signal: Signal,
    testScenarioId: string,
  ): Promise<Signal> {
    // Create a copy without the id, timestamps, and with test markers
    const testSignalData: CreateSignalData = {
      target_id: signal.target_id,
      source_id: signal.source_id,
      content: signal.content,
      direction: signal.direction,
      url: signal.url ?? undefined,
      detected_at: new Date().toISOString(), // New detection time
      disposition: 'pending', // Reset to pending for processing
      metadata: signal.metadata,
      // Test data markers
      is_test: true,
      is_test_data: true,
      test_scenario_id: testScenarioId,
    };

    return this.create(testSignalData);
  }
}
