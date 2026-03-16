import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  Learning,
  ActiveLearning,
  LearningStatus,
} from '../interfaces/learning.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

@Injectable()
export class LearningRepository {
  private readonly logger = new Logger(LearningRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'learnings';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Get active learnings for a target using database function
   * Respects scope hierarchy
   */
  async getActiveLearnings(
    targetId: string,
    tier?: string,
    analystId?: string,
  ): Promise<ActiveLearning[]> {
    const { data, error } = (await this.db.rpc(
      'get_active_learnings',
      {
        p_target_id: targetId,
        p_tier: tier || null,
        p_analyst_id: analystId || null,
      },
      this.schema,
    )) as SupabaseSelectListResponse<ActiveLearning>;

    if (error) {
      this.logger.error(`Failed to get active learnings: ${error.message}`);
      throw new Error(`Failed to get active learnings: ${error.message}`);
    }

    return data ?? [];
  }

  async findById(id: string): Promise<Learning | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<Learning>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch learning: ${error.message}`);
      throw new Error(`Failed to fetch learning: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<Learning> {
    const learning = await this.findById(id);
    if (!learning) {
      throw new NotFoundException(`Learning not found: ${id}`);
    }
    return learning;
  }

  async create(learningData: Partial<Learning>): Promise<Learning> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(learningData)
      .select()
      .single()) as SupabaseSelectResponse<Learning>;

    if (error) {
      this.logger.error(`Failed to create learning: ${error.message}`);
      throw new Error(`Failed to create learning: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no learning returned');
    }

    return data;
  }

  async update(id: string, updateData: Partial<Learning>): Promise<Learning> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<Learning>;

    if (error) {
      this.logger.error(`Failed to update learning: ${error.message}`);
      throw new Error(`Failed to update learning: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no learning returned');
    }

    return data;
  }

  async incrementApplication(id: string, wasHelpful?: boolean): Promise<void> {
    const { error } = await this.db.rpc(
      'increment_learning_application',
      {
        p_learning_id: id,
        p_was_helpful: wasHelpful ?? null,
      },
      this.schema,
    );

    if (error) {
      this.logger.error(
        `Failed to increment learning application: ${error.message}`,
      );
      throw new Error(
        `Failed to increment learning application: ${error.message}`,
      );
    }
  }

  async findByScope(
    scopeLevel: string,
    domain?: string,
    universeId?: string,
    targetId?: string,
    status?: LearningStatus,
  ): Promise<Learning[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('scope_level', scopeLevel);

    if (domain) query = query.eq('domain', domain);
    if (universeId) query = query.eq('universe_id', universeId);
    if (targetId) query = query.eq('target_id', targetId);
    if (status) query = query.eq('status', status);

    const { data, error } =
      (await query) as SupabaseSelectListResponse<Learning>;

    if (error) {
      this.logger.error(`Failed to find learnings by scope: ${error.message}`);
      throw new Error(`Failed to find learnings by scope: ${error.message}`);
    }

    return data ?? [];
  }

  async supersede(id: string, supersededById: string): Promise<Learning> {
    return this.update(id, {
      status: 'superseded',
      superseded_by: supersededById,
    });
  }

  /**
   * Get all active learnings (not filtered by target)
   * Useful for replay tests to sync all learnings
   */
  async getAllActiveLearnings(): Promise<Learning[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('status', 'active')
      .eq('is_test', false)) as SupabaseSelectListResponse<Learning>;

    if (error) {
      this.logger.error(`Failed to get all active learnings: ${error.message}`);
      throw new Error(`Failed to get all active learnings: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Create a test copy of a learning for replay test
   * The copy has is_test=true and resets application counters
   */
  async createTestCopy(
    learning: Learning,
    testScenarioId: string,
  ): Promise<Learning> {
    const testLearningData: Partial<Learning> = {
      scope_level: learning.scope_level,
      domain: learning.domain,
      universe_id: learning.universe_id,
      target_id: learning.target_id,
      analyst_id: learning.analyst_id,
      learning_type: learning.learning_type,
      title: `[TEST] ${learning.title}`,
      description: learning.description,
      config: {
        ...learning.config,
        source_learning_id: learning.id, // Track original
        test_scenario_id: testScenarioId,
      },
      source_type: learning.source_type,
      source_evaluation_id: learning.source_evaluation_id,
      source_missed_opportunity_id: learning.source_missed_opportunity_id,
      status: 'active',
      version: 1,
      times_applied: 0,
      times_helpful: 0,
      is_test: true,
    };

    return this.create(testLearningData);
  }

  /**
   * Delete test learnings for a specific test scenario
   * Used during replay test cleanup
   */
  async deleteTestLearnings(testScenarioId: string): Promise<number> {
    const { error, count } = await this.db
      .from(this.schema, this.table)
      .delete({ count: 'exact' })
      .eq('is_test', true)
      .contains('config', { test_scenario_id: testScenarioId });

    if (error) {
      this.logger.error(`Failed to delete test learnings: ${error.message}`);
      throw new Error(`Failed to delete test learnings: ${error.message}`);
    }

    return count ?? 0;
  }
}
