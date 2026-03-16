import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  TestScenario,
  CreateTestScenarioData,
  UpdateTestScenarioData,
  TestScenarioSummary,
  CleanupResult,
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
 * Repository for test scenarios (prediction.test_scenarios)
 * Part of the Test Data Injection Framework (Phase 3)
 */
@Injectable()
export class TestScenarioRepository {
  private readonly logger = new Logger(TestScenarioRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'test_scenarios';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Find a test scenario by ID
   */
  async findById(id: string): Promise<TestScenario | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<TestScenario>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch test scenario: ${error.message}`);
      throw new Error(`Failed to fetch test scenario: ${error.message}`);
    }

    return data;
  }

  /**
   * Find all test scenarios for an organization
   */
  async findByOrganization(organizationSlug: string): Promise<TestScenario[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<TestScenario>;

    if (error) {
      this.logger.error(`Failed to fetch test scenarios: ${error.message}`);
      throw new Error(`Failed to fetch test scenarios: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find active test scenarios for an organization
   */
  async findActiveByOrganization(
    organizationSlug: string,
  ): Promise<TestScenario[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .in('status', ['active', 'running'])
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<TestScenario>;

    if (error) {
      this.logger.error(
        `Failed to fetch active test scenarios: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch active test scenarios: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find test scenarios by target
   */
  async findByTarget(targetId: string): Promise<TestScenario[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<TestScenario>;

    if (error) {
      this.logger.error(
        `Failed to fetch test scenarios by target: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch test scenarios by target: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Create a new test scenario
   */
  async create(scenarioData: CreateTestScenarioData): Promise<TestScenario> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(scenarioData)
      .select()
      .single()) as SupabaseSelectResponse<TestScenario>;

    if (error) {
      this.logger.error(`Failed to create test scenario: ${error.message}`);
      throw new Error(`Failed to create test scenario: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no test scenario returned');
    }

    this.logger.log(`Created test scenario: ${data.id} (${data.name})`);
    return data;
  }

  /**
   * Update a test scenario
   */
  async update(
    id: string,
    updateData: UpdateTestScenarioData,
  ): Promise<TestScenario> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<TestScenario>;

    if (error) {
      this.logger.error(`Failed to update test scenario: ${error.message}`);
      throw new Error(`Failed to update test scenario: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no test scenario returned');
    }

    return data;
  }

  /**
   * Mark a scenario as running
   */
  async markRunning(id: string): Promise<TestScenario> {
    return this.update(id, {
      status: 'running',
      started_at: new Date().toISOString(),
    });
  }

  /**
   * Mark a scenario as completed
   */
  async markCompleted(
    id: string,
    results: TestScenario['results'],
  ): Promise<TestScenario> {
    return this.update(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      results: results ?? undefined,
    });
  }

  /**
   * Mark a scenario as failed
   */
  async markFailed(id: string, errorMessage: string): Promise<TestScenario> {
    return this.update(id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      results: { errors: [errorMessage] },
    });
  }

  /**
   * Delete a test scenario (does not clean up test data - use cleanup functions)
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete test scenario: ${error.message}`);
      throw new Error(`Failed to delete test scenario: ${error.message}`);
    }

    this.logger.log(`Deleted test scenario: ${id}`);
  }

  /**
   * Cleanup a test scenario and all its data using the database function
   */
  async cleanupScenario(scenarioId: string): Promise<CleanupResult> {
    const result = await this.db.rpc(
      'cleanup_test_scenario',
      { p_scenario_id: scenarioId },
      this.schema,
    );

    if (result.error) {
      this.logger.error(
        `Failed to cleanup test scenario: ${result.error.message}`,
      );
      throw new Error(
        `Failed to cleanup test scenario: ${result.error.message}`,
      );
    }

    const tables_cleaned = (
      (result.data as Array<{ table_name: string; rows_deleted: number }>) ?? []
    ).map((t) => ({ table_name: t.table_name, rows_deleted: t.rows_deleted }));
    const total_deleted = tables_cleaned.reduce(
      (sum, t) => sum + t.rows_deleted,
      0,
    );

    this.logger.log(
      `Cleaned up test scenario ${scenarioId}: ${total_deleted} rows from ${tables_cleaned.length} tables`,
    );

    return { tables_cleaned, total_deleted };
  }

  /**
   * Cleanup ALL test data using the database function
   * WARNING: This deletes all test data across all scenarios
   */
  async cleanupAllTestData(): Promise<CleanupResult> {
    const result = await this.db.rpc('cleanup_all_test_data', {}, this.schema);

    if (result.error) {
      this.logger.error(
        `Failed to cleanup all test data: ${result.error.message}`,
      );
      throw new Error(
        `Failed to cleanup all test data: ${result.error.message}`,
      );
    }

    const tables_cleaned = (
      (result.data as Array<{ table_name: string; rows_deleted: number }>) ?? []
    ).map((t) => ({ table_name: t.table_name, rows_deleted: t.rows_deleted }));
    const total_deleted = tables_cleaned.reduce(
      (sum, t) => sum + t.rows_deleted,
      0,
    );

    this.logger.warn(
      `Cleaned up ALL test data: ${total_deleted} rows from ${tables_cleaned.length} tables`,
    );

    return { tables_cleaned, total_deleted };
  }

  /**
   * Get test scenario summaries with data counts
   */
  async getSummaries(organizationSlug: string): Promise<TestScenarioSummary[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'test_scenario_summary')
      .select('*')
      .eq('organization_slug', organizationSlug)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<TestScenarioSummary>;

    if (error) {
      this.logger.error(
        `Failed to fetch test scenario summaries: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch test scenario summaries: ${error.message}`,
      );
    }

    return data ?? [];
  }
}
