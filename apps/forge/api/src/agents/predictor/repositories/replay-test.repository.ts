import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  ReplayTest,
  CreateReplayTestData,
  UpdateReplayTestData,
  ReplayTestSnapshot,
  ReplayTestResult,
  ReplayTestSummary,
  ReplayAffectedRecords,
} from '../interfaces/test-data.interface';

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
 * Repository for replay tests (prediction.replay_tests)
 * Part of Phase 8: Historical Replay in Test Lab
 */
@Injectable()
export class ReplayTestRepository {
  private readonly logger = new Logger(ReplayTestRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'replay_tests';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  // =============================================================================
  // REPLAY TEST CRUD
  // =============================================================================

  /**
   * Find a replay test by ID
   */
  async findById(id: string): Promise<ReplayTest | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<ReplayTest>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch replay test: ${error.message}`);
      throw new Error(`Failed to fetch replay test: ${error.message}`);
    }

    return data;
  }

  /**
   * Find all replay tests for an organization
   */
  async findByOrganization(organizationSlug: string): Promise<ReplayTest[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ReplayTest>;

    if (error) {
      this.logger.error(`Failed to fetch replay tests: ${error.message}`);
      throw new Error(`Failed to fetch replay tests: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find replay tests by universe
   */
  async findByUniverse(universeId: string): Promise<ReplayTest[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('universe_id', universeId)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ReplayTest>;

    if (error) {
      this.logger.error(
        `Failed to fetch replay tests by universe: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch replay tests by universe: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Create a new replay test
   */
  async create(testData: CreateReplayTestData): Promise<ReplayTest> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(testData)
      .select()
      .single()) as SupabaseSelectResponse<ReplayTest>;

    if (error) {
      this.logger.error(`Failed to create replay test: ${error.message}`);
      throw new Error(`Failed to create replay test: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no replay test returned');
    }

    this.logger.log(`Created replay test: ${data.id} (${data.name})`);
    return data;
  }

  /**
   * Update a replay test
   */
  async update(
    id: string,
    updateData: UpdateReplayTestData,
  ): Promise<ReplayTest> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<ReplayTest>;

    if (error) {
      this.logger.error(`Failed to update replay test: ${error.message}`);
      throw new Error(`Failed to update replay test: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no replay test returned');
    }

    return data;
  }

  /**
   * Mark test as snapshot created
   */
  async markSnapshotCreated(id: string): Promise<ReplayTest> {
    return this.update(id, {
      status: 'snapshot_created',
    });
  }

  /**
   * Mark test as running
   */
  async markRunning(id: string): Promise<ReplayTest> {
    return this.update(id, {
      status: 'running',
      started_at: new Date().toISOString(),
    });
  }

  /**
   * Mark test as completed
   */
  async markCompleted(
    id: string,
    results: ReplayTest['results'],
  ): Promise<ReplayTest> {
    return this.update(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      results: results ?? undefined,
    });
  }

  /**
   * Mark test as failed
   */
  async markFailed(id: string, errorMessage: string): Promise<ReplayTest> {
    return this.update(id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    });
  }

  /**
   * Mark test as restored (cleanup complete)
   */
  async markRestored(id: string): Promise<ReplayTest> {
    return this.update(id, {
      status: 'restored',
    });
  }

  /**
   * Delete a replay test
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete replay test: ${error.message}`);
      throw new Error(`Failed to delete replay test: ${error.message}`);
    }

    this.logger.log(`Deleted replay test: ${id}`);
  }

  // =============================================================================
  // SNAPSHOTS
  // =============================================================================

  /**
   * Create a snapshot using the database function
   */
  async createSnapshot(
    replayTestId: string,
    tableName: string,
    recordIds: string[],
  ): Promise<string> {
    const result = await this.db.rpc(
      'create_replay_snapshot',
      {
        p_replay_test_id: replayTestId,
        p_table_name: tableName,
        p_record_ids: recordIds,
      },
      this.schema,
    );

    if (result.error) {
      this.logger.error(`Failed to create snapshot: ${result.error.message}`);
      throw new Error(`Failed to create snapshot: ${result.error.message}`);
    }

    this.logger.log(
      `Created snapshot for ${tableName}: ${recordIds.length} records`,
    );
    return result.data as string;
  }

  /**
   * Get snapshots for a replay test
   */
  async getSnapshots(replayTestId: string): Promise<ReplayTestSnapshot[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'replay_test_snapshots')
      .select('*')
      .eq('replay_test_id', replayTestId)
      .order('created_at', {
        ascending: true,
      })) as SupabaseSelectListResponse<ReplayTestSnapshot>;

    if (error) {
      this.logger.error(`Failed to fetch snapshots: ${error.message}`);
      throw new Error(`Failed to fetch snapshots: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Restore from a snapshot using the database function
   */
  async restoreSnapshot(snapshotId: string): Promise<number> {
    const result = await this.db.rpc(
      'restore_replay_snapshot',
      {
        p_snapshot_id: snapshotId,
      },
      this.schema,
    );

    if (result.error) {
      this.logger.error(`Failed to restore snapshot: ${result.error.message}`);
      throw new Error(`Failed to restore snapshot: ${result.error.message}`);
    }

    const restoredCount = result.data as number;
    this.logger.log(`Restored ${restoredCount} records from snapshot`);
    return restoredCount;
  }

  // =============================================================================
  // RESULTS
  // =============================================================================

  /**
   * Create a comparison result
   */
  async createResult(
    resultData: Omit<ReplayTestResult, 'id' | 'created_at'>,
  ): Promise<ReplayTestResult> {
    const { data, error } = (await this.db
      .from(this.schema, 'replay_test_results')
      .insert(resultData)
      .select()
      .single()) as SupabaseSelectResponse<ReplayTestResult>;

    if (error) {
      this.logger.error(`Failed to create result: ${error.message}`);
      throw new Error(`Failed to create result: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no result returned');
    }

    return data;
  }

  /**
   * Bulk create results
   */
  async createResults(
    results: Array<Omit<ReplayTestResult, 'id' | 'created_at'>>,
  ): Promise<number> {
    if (results.length === 0) return 0;

    const { error } = await this.db
      .from(this.schema, 'replay_test_results')
      .insert(results);

    if (error) {
      this.logger.error(`Failed to bulk create results: ${error.message}`);
      throw new Error(`Failed to bulk create results: ${error.message}`);
    }

    this.logger.log(`Created ${results.length} comparison results`);
    return results.length;
  }

  /**
   * Get results for a replay test
   */
  async getResults(replayTestId: string): Promise<ReplayTestResult[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'replay_test_results')
      .select('*')
      .eq('replay_test_id', replayTestId)
      .order('created_at', {
        ascending: true,
      })) as SupabaseSelectListResponse<ReplayTestResult>;

    if (error) {
      this.logger.error(`Failed to fetch results: ${error.message}`);
      throw new Error(`Failed to fetch results: ${error.message}`);
    }

    return data ?? [];
  }

  // =============================================================================
  // SUMMARIES
  // =============================================================================

  /**
   * Get replay test summaries for an organization
   */
  async getSummaries(organizationSlug: string): Promise<ReplayTestSummary[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'replay_test_summary')
      .select('*')
      .eq('organization_slug', organizationSlug)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ReplayTestSummary>;

    if (error) {
      this.logger.error(`Failed to fetch summaries: ${error.message}`);
      throw new Error(`Failed to fetch summaries: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get a single summary by ID
   */
  async getSummaryById(id: string): Promise<ReplayTestSummary | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'replay_test_summary')
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<ReplayTestSummary>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch summary: ${error.message}`);
      throw new Error(`Failed to fetch summary: ${error.message}`);
    }

    return data;
  }

  // =============================================================================
  // AFFECTED RECORDS
  // =============================================================================

  /**
   * Get records that would be affected by a replay test
   */
  async getAffectedRecords(
    rollbackDepth: string,
    rollbackTo: string,
    universeId: string,
    targetIds?: string[],
  ): Promise<ReplayAffectedRecords[]> {
    const result = await this.db.rpc(
      'get_records_for_replay',
      {
        p_rollback_depth: rollbackDepth,
        p_rollback_to: rollbackTo,
        p_universe_id: universeId,
        p_target_ids: targetIds ?? null,
      },
      this.schema,
    );

    if (result.error) {
      this.logger.error(
        `Failed to get affected records: ${result.error.message}`,
      );
      throw new Error(
        `Failed to get affected records: ${result.error.message}`,
      );
    }

    return (result.data as ReplayAffectedRecords[]) ?? [];
  }

  // =============================================================================
  // CLEANUP
  // =============================================================================

  /**
   * Cleanup a replay test using the database function
   */
  async cleanup(replayTestId: string): Promise<unknown> {
    const result = await this.db.rpc(
      'cleanup_replay_test',
      {
        p_replay_test_id: replayTestId,
      },
      this.schema,
    );

    if (result.error) {
      this.logger.error(
        `Failed to cleanup replay test: ${result.error.message}`,
      );
      throw new Error(`Failed to cleanup replay test: ${result.error.message}`);
    }

    this.logger.log(`Cleaned up replay test: ${replayTestId}`);
    return result.data;
  }

  // =============================================================================
  // DATA DELETION (for replay execution)
  // =============================================================================

  /**
   * Delete records by IDs from a specific table
   * Used during replay test execution to remove original data
   */
  async deleteRecords(
    tableName: 'signals' | 'predictors' | 'predictions' | 'analyst_assessments',
    recordIds: string[],
  ): Promise<number> {
    if (recordIds.length === 0) return 0;

    const { error, count } = await this.db
      .from(this.schema, tableName)
      .delete({ count: 'exact' })
      .in('id', recordIds);

    if (error) {
      this.logger.error(
        `Failed to delete records from ${tableName}: ${error.message}`,
      );
      throw new Error(
        `Failed to delete records from ${tableName}: ${error.message}`,
      );
    }

    this.logger.log(`Deleted ${count} records from ${tableName}`);
    return count ?? 0;
  }

  /**
   * Mark replay-generated predictions as test data (alternative to deletion)
   */
  async markReplayPredictionsAsTest(
    replayTestId: string,
    predictionIds: string[],
  ): Promise<number> {
    if (predictionIds.length === 0) return 0;

    const { error, count } = await this.db
      .from(this.schema, 'predictions')
      .update({
        is_test_data: true,
        test_scenario_id: replayTestId,
      })
      .in('id', predictionIds);

    if (error) {
      this.logger.error(`Failed to mark predictions as test: ${error.message}`);
      throw new Error(`Failed to mark predictions as test: ${error.message}`);
    }

    return count ?? 0;
  }
}
