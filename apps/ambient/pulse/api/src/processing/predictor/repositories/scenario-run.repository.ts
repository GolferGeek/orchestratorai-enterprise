import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  ScenarioRun,
  CreateScenarioRunData,
  UpdateScenarioRunData,
  ScenarioRunStatus,
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
 * Repository for scenario runs (prediction.scenario_runs)
 * Tracks execution of test scenarios
 */
@Injectable()
export class ScenarioRunRepository {
  private readonly logger = new Logger(ScenarioRunRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'scenario_runs';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Find a scenario run by ID
   */
  async findById(id: string): Promise<ScenarioRun | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<ScenarioRun>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch scenario run: ${error.message}`);
      throw new Error(`Failed to fetch scenario run: ${error.message}`);
    }

    return data;
  }

  /**
   * Find all scenario runs for a specific test scenario
   */
  async findByScenario(scenarioId: string): Promise<ScenarioRun[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('scenario_id', scenarioId)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ScenarioRun>;

    if (error) {
      this.logger.error(`Failed to fetch scenario runs: ${error.message}`);
      throw new Error(`Failed to fetch scenario runs: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find all scenario runs for an organization
   */
  async findByOrganization(organizationSlug: string): Promise<ScenarioRun[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ScenarioRun>;

    if (error) {
      this.logger.error(
        `Failed to fetch scenario runs by organization: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch scenario runs by organization: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find scenario runs by status
   */
  async findByStatus(
    organizationSlug: string,
    status: ScenarioRunStatus,
  ): Promise<ScenarioRun[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('status', status)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ScenarioRun>;

    if (error) {
      this.logger.error(
        `Failed to fetch scenario runs by status: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch scenario runs by status: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find scenario runs by outcome match status
   */
  async findByOutcomeMatch(
    organizationSlug: string,
    outcomeMatch: boolean,
  ): Promise<ScenarioRun[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('outcome_match', outcomeMatch)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ScenarioRun>;

    if (error) {
      this.logger.error(
        `Failed to fetch scenario runs by outcome match: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch scenario runs by outcome match: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find completed scenario runs (for analysis)
   */
  async findCompleted(organizationSlug: string): Promise<ScenarioRun[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('status', 'completed')
      .not('outcome_match', 'is', null)
      .order('completed_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ScenarioRun>;

    if (error) {
      this.logger.error(
        `Failed to fetch completed scenario runs: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch completed scenario runs: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Create a new scenario run
   */
  async create(runData: CreateScenarioRunData): Promise<ScenarioRun> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(runData)
      .select()
      .single()) as SupabaseSelectResponse<ScenarioRun>;

    if (error) {
      this.logger.error(`Failed to create scenario run: ${error.message}`);
      throw new Error(`Failed to create scenario run: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no scenario run returned');
    }

    this.logger.log(
      `Created scenario run: ${data.id} for scenario ${data.scenario_id}`,
    );
    return data;
  }

  /**
   * Update a scenario run
   */
  async update(
    id: string,
    updateData: UpdateScenarioRunData,
  ): Promise<ScenarioRun> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<ScenarioRun>;

    if (error) {
      this.logger.error(`Failed to update scenario run: ${error.message}`);
      throw new Error(`Failed to update scenario run: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no scenario run returned');
    }

    return data;
  }

  /**
   * Mark a scenario run as running
   */
  async markRunning(id: string): Promise<ScenarioRun> {
    return this.update(id, {
      status: 'running',
      started_at: new Date().toISOString(),
    });
  }

  /**
   * Mark a scenario run as completed
   */
  async markCompleted(
    id: string,
    outcomeActual: Record<string, unknown>,
    outcomeMatch: boolean,
  ): Promise<ScenarioRun> {
    return this.update(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      outcome_actual: outcomeActual,
      outcome_match: outcomeMatch,
    });
  }

  /**
   * Mark a scenario run as failed
   */
  async markFailed(id: string, errorMessage: string): Promise<ScenarioRun> {
    return this.update(id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    });
  }

  /**
   * Delete a scenario run
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete scenario run: ${error.message}`);
      throw new Error(`Failed to delete scenario run: ${error.message}`);
    }

    this.logger.log(`Deleted scenario run: ${id}`);
  }

  /**
   * Get statistics for scenario runs
   */
  async getStatistics(scenarioId: string): Promise<{
    total_runs: number;
    completed_runs: number;
    failed_runs: number;
    running_runs: number;
    success_rate: number;
    outcome_match_rate: number;
  }> {
    const runs = await this.findByScenario(scenarioId);

    const total_runs = runs.length;
    const completed_runs = runs.filter((r) => r.status === 'completed').length;
    const failed_runs = runs.filter((r) => r.status === 'failed').length;
    const running_runs = runs.filter((r) => r.status === 'running').length;

    const success_rate = total_runs > 0 ? completed_runs / total_runs : 0;

    const matchedRuns = runs.filter(
      (r) => r.status === 'completed' && r.outcome_match === true,
    ).length;
    const outcome_match_rate =
      completed_runs > 0 ? matchedRuns / completed_runs : 0;

    return {
      total_runs,
      completed_runs,
      failed_runs,
      running_runs,
      success_rate,
      outcome_match_rate,
    };
  }
}
