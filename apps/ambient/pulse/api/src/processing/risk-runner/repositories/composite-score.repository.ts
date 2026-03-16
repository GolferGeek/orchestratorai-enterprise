import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  RiskCompositeScore,
  CreateCompositeScoreData,
  UpdateCompositeScoreData,
  ActiveCompositeScoreView,
} from '../interfaces/composite-score.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

export interface CompositeScoreFilter {
  includeTest?: boolean;
  testScenarioId?: string;
}

@Injectable()
export class CompositeScoreRepository {
  private readonly logger = new Logger(CompositeScoreRepository.name);
  private readonly schema = 'risk';
  private readonly table = 'composite_scores';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private applyTestFilter<T extends { eq: (col: string, val: unknown) => T }>(
    query: T,
    filter?: CompositeScoreFilter,
  ): T {
    if (filter?.testScenarioId) {
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter?.includeTest) {
      query = query.eq('is_test', false);
    }
    return query;
  }

  async findBySubject(
    subjectId: string,
    filter?: CompositeScoreFilter,
  ): Promise<RiskCompositeScore[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('subject_id', subjectId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskCompositeScore>;

    if (error) {
      this.logger.error(`Failed to fetch composite scores: ${error.message}`);
      throw new Error(`Failed to fetch composite scores: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find the active composite score for a subject (most recent active)
   */
  async findActiveBySubject(
    subjectId: string,
    filter?: CompositeScoreFilter,
  ): Promise<RiskCompositeScore | null> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('subject_id', subjectId)
      .eq('status', 'active');

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query
      .order('created_at', { ascending: false })
      .limit(1)
      .single()) as SupabaseSelectResponse<RiskCompositeScore>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch active composite score: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch active composite score: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Find all active composite scores using the view
   */
  async findAllActiveView(
    _filter?: CompositeScoreFilter,
  ): Promise<ActiveCompositeScoreView[]> {
    // Use the view which already filters for active and non-test
    const { data, error } = (await this.db
      .from(this.schema, 'active_composite_scores')
      .select('*')) as SupabaseSelectListResponse<ActiveCompositeScoreView>;

    if (error) {
      this.logger.error(
        `Failed to fetch active composite scores view: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch active composite scores view: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async findById(id: string): Promise<RiskCompositeScore | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskCompositeScore>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch composite score: ${error.message}`);
      throw new Error(`Failed to fetch composite score: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<RiskCompositeScore> {
    const score = await this.findById(id);
    if (!score) {
      throw new NotFoundException(`Composite score not found: ${id}`);
    }
    return score;
  }

  async findByTask(taskId: string): Promise<RiskCompositeScore | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('task_id', taskId)
      .single()) as SupabaseSelectResponse<RiskCompositeScore>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch composite score by task: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch composite score by task: ${error.message}`,
      );
    }

    return data;
  }

  async create(
    scoreData: CreateCompositeScoreData,
  ): Promise<RiskCompositeScore> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(scoreData)
      .select()
      .single()) as SupabaseSelectResponse<RiskCompositeScore>;

    if (error) {
      this.logger.error(`Failed to create composite score: ${error.message}`);
      throw new Error(`Failed to create composite score: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no composite score returned');
    }

    this.logger.log(
      `Created composite score: ${data.id} (score: ${data.overall_score})`,
    );
    return data;
  }

  async update(
    id: string,
    updateData: UpdateCompositeScoreData,
  ): Promise<RiskCompositeScore> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskCompositeScore>;

    if (error) {
      this.logger.error(`Failed to update composite score: ${error.message}`);
      throw new Error(`Failed to update composite score: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no composite score returned');
    }

    this.logger.log(`Updated composite score: ${id}`);
    return data;
  }

  /**
   * Mark previous scores as superseded when creating a new one
   */
  async supersedeForSubject(subjectId: string): Promise<number> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update({ status: 'superseded' })
      .eq('subject_id', subjectId)
      .eq('status', 'active')
      .select()) as QueryResult<unknown>;

    if (error) {
      this.logger.error(
        `Failed to supersede composite scores: ${error.message}`,
      );
      throw new Error(`Failed to supersede composite scores: ${error.message}`);
    }

    const supersededRows = (data ?? []) as Array<Record<string, unknown>>;
    const count = supersededRows.length;
    if (count > 0) {
      this.logger.log(
        `Superseded ${count} composite scores for subject: ${subjectId}`,
      );
    }
    return count;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete composite score: ${error.message}`);
      throw new Error(`Failed to delete composite score: ${error.message}`);
    }

    this.logger.log(`Deleted composite score: ${id}`);
  }

  /**
   * Find scores older than a given date (for evaluation processing)
   */
  async findScoresOlderThan(
    date: Date,
    filter?: CompositeScoreFilter,
  ): Promise<RiskCompositeScore[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .lt('created_at', date.toISOString())
      .eq('status', 'active');

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskCompositeScore>;

    if (error) {
      this.logger.error(
        `Failed to fetch old composite scores: ${error.message}`,
      );
      throw new Error(`Failed to fetch old composite scores: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find score history for a subject (for timeline view)
   */
  async findHistory(
    subjectId: string,
    limit: number = 30,
    filter?: CompositeScoreFilter,
  ): Promise<RiskCompositeScore[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('subject_id', subjectId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query
      .order('created_at', { ascending: false })
      .limit(limit)) as SupabaseSelectListResponse<RiskCompositeScore>;

    if (error) {
      this.logger.error(`Failed to fetch score history: ${error.message}`);
      throw new Error(`Failed to fetch score history: ${error.message}`);
    }

    return data ?? [];
  }
}
