import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  RiskLearning,
  CreateRiskLearningData,
  UpdateRiskLearningData,
  RiskLearningQueueItem,
  CreateLearningQueueItemData,
  UpdateLearningQueueItemData,
  PendingLearningView,
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

export interface LearningFilter {
  includeTest?: boolean;
  testScenarioId?: string;
}

@Injectable()
export class LearningRepository {
  private readonly logger = new Logger(LearningRepository.name);
  private readonly schema = 'risk';
  private readonly learningsTable = 'learnings';
  private readonly queueTable = 'learning_queue';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private applyTestFilter<T extends { eq: (col: string, val: unknown) => T }>(
    query: T,
    filter?: LearningFilter,
  ): T {
    if (filter?.testScenarioId) {
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter?.includeTest) {
      query = query.eq('is_test', false);
    }
    return query;
  }

  // ─── LEARNINGS ────────────────────────────────────────────────────────

  async findAllLearnings(filter?: LearningFilter): Promise<RiskLearning[]> {
    let query = this.db
      .from(this.schema, this.learningsTable)
      .select('*')
      .eq('status', 'active');

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskLearning>;

    if (error) {
      this.logger.error(`Failed to fetch learnings: ${error.message}`);
      throw new Error(`Failed to fetch learnings: ${error.message}`);
    }

    return data ?? [];
  }

  async findLearningsByScope(
    scopeId: string,
    filter?: LearningFilter,
  ): Promise<RiskLearning[]> {
    let query = this.db
      .from(this.schema, this.learningsTable)
      .select('*')
      .eq('scope_id', scopeId)
      .eq('status', 'active');

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskLearning>;

    if (error) {
      this.logger.error(`Failed to fetch learnings by scope: ${error.message}`);
      throw new Error(`Failed to fetch learnings by scope: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find production-ready learnings for application
   */
  async findProductionLearnings(
    scopeLevel?: string,
    domain?: string,
    filter?: LearningFilter,
  ): Promise<RiskLearning[]> {
    let query = this.db
      .from(this.schema, this.learningsTable)
      .select('*')
      .eq('status', 'active')
      .eq('is_production', true);

    if (scopeLevel) {
      query = query.eq('scope_level', scopeLevel);
    }
    if (domain) {
      query = query.eq('domain', domain);
    }

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskLearning>;

    if (error) {
      this.logger.error(
        `Failed to fetch production learnings: ${error.message}`,
      );
      throw new Error(`Failed to fetch production learnings: ${error.message}`);
    }

    return data ?? [];
  }

  async findLearningById(id: string): Promise<RiskLearning | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.learningsTable)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskLearning>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch learning: ${error.message}`);
      throw new Error(`Failed to fetch learning: ${error.message}`);
    }

    return data;
  }

  async findLearningByIdOrThrow(id: string): Promise<RiskLearning> {
    const learning = await this.findLearningById(id);
    if (!learning) {
      throw new NotFoundException(`Learning not found: ${id}`);
    }
    return learning;
  }

  async createLearning(
    learningData: CreateRiskLearningData,
  ): Promise<RiskLearning> {
    const { data, error } = (await this.db
      .from(this.schema, this.learningsTable)
      .insert(learningData)
      .select()
      .single()) as SupabaseSelectResponse<RiskLearning>;

    if (error) {
      this.logger.error(`Failed to create learning: ${error.message}`);
      throw new Error(`Failed to create learning: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no learning returned');
    }

    this.logger.log(`Created learning: ${data.id} (${data.title})`);
    return data;
  }

  async updateLearning(
    id: string,
    updateData: UpdateRiskLearningData,
  ): Promise<RiskLearning> {
    const { data, error } = (await this.db
      .from(this.schema, this.learningsTable)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskLearning>;

    if (error) {
      this.logger.error(`Failed to update learning: ${error.message}`);
      throw new Error(`Failed to update learning: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no learning returned');
    }

    this.logger.log(`Updated learning: ${id}`);
    return data;
  }

  /**
   * Increment times_applied counter
   */
  async incrementApplied(id: string): Promise<void> {
    const learning = await this.findLearningByIdOrThrow(id);
    await this.updateLearning(id, {
      times_applied: (learning.times_applied || 0) + 1,
    });
  }

  /**
   * Increment times_helpful counter
   */
  async incrementHelpful(id: string): Promise<void> {
    const learning = await this.findLearningByIdOrThrow(id);
    await this.updateLearning(id, {
      times_helpful: (learning.times_helpful || 0) + 1,
    });
  }

  async deleteLearning(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.learningsTable)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete learning: ${error.message}`);
      throw new Error(`Failed to delete learning: ${error.message}`);
    }

    this.logger.log(`Deleted learning: ${id}`);
  }

  // ─── LEARNING QUEUE ────────────────────────────────────────────────────────

  /**
   * Find pending learning queue items using the view
   */
  async findPendingQueue(
    _filter?: LearningFilter,
  ): Promise<PendingLearningView[]> {
    // The view already filters for pending and non-test
    const { data, error } = (await this.db
      .from(this.schema, 'pending_learnings')
      .select('*')) as SupabaseSelectListResponse<PendingLearningView>;

    if (error) {
      this.logger.error(`Failed to fetch pending learnings: ${error.message}`);
      throw new Error(`Failed to fetch pending learnings: ${error.message}`);
    }

    return data ?? [];
  }

  async findQueueByScope(
    scopeId: string,
    filter?: LearningFilter,
  ): Promise<RiskLearningQueueItem[]> {
    let query = this.db
      .from(this.schema, this.queueTable)
      .select('*')
      .eq('scope_id', scopeId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskLearningQueueItem>;

    if (error) {
      this.logger.error(`Failed to fetch learning queue: ${error.message}`);
      throw new Error(`Failed to fetch learning queue: ${error.message}`);
    }

    return data ?? [];
  }

  async findQueueItemById(id: string): Promise<RiskLearningQueueItem | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.queueTable)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskLearningQueueItem>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch queue item: ${error.message}`);
      throw new Error(`Failed to fetch queue item: ${error.message}`);
    }

    return data;
  }

  async findQueueItemByIdOrThrow(id: string): Promise<RiskLearningQueueItem> {
    const item = await this.findQueueItemById(id);
    if (!item) {
      throw new NotFoundException(`Learning queue item not found: ${id}`);
    }
    return item;
  }

  async createQueueItem(
    itemData: CreateLearningQueueItemData,
  ): Promise<RiskLearningQueueItem> {
    const { data, error } = (await this.db
      .from(this.schema, this.queueTable)
      .insert(itemData)
      .select()
      .single()) as SupabaseSelectResponse<RiskLearningQueueItem>;

    if (error) {
      this.logger.error(`Failed to create queue item: ${error.message}`);
      throw new Error(`Failed to create queue item: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no queue item returned');
    }

    this.logger.log(`Created learning queue item: ${data.id}`);
    return data;
  }

  async updateQueueItem(
    id: string,
    updateData: UpdateLearningQueueItemData,
  ): Promise<RiskLearningQueueItem> {
    const { data, error } = (await this.db
      .from(this.schema, this.queueTable)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskLearningQueueItem>;

    if (error) {
      this.logger.error(`Failed to update queue item: ${error.message}`);
      throw new Error(`Failed to update queue item: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no queue item returned');
    }

    this.logger.log(`Updated learning queue item: ${id}`);
    return data;
  }

  async deleteQueueItem(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.queueTable)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete queue item: ${error.message}`);
      throw new Error(`Failed to delete queue item: ${error.message}`);
    }

    this.logger.log(`Deleted learning queue item: ${id}`);
  }

  /**
   * Count pending queue items
   */
  async countPending(filter?: LearningFilter): Promise<number> {
    const pending = await this.findPendingQueue(filter);
    return pending.length;
  }
}
