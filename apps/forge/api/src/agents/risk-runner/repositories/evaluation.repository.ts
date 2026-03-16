import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  RiskEvaluation,
  CreateRiskEvaluationData,
  UpdateRiskEvaluationData,
} from '../interfaces/evaluation.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

export interface EvaluationFilter {
  includeTest?: boolean;
  testScenarioId?: string;
}

@Injectable()
export class EvaluationRepository {
  private readonly logger = new Logger(EvaluationRepository.name);
  private readonly schema = 'risk';
  private readonly table = 'evaluations';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private applyTestFilter<T extends { eq: (col: string, val: unknown) => T }>(
    query: T,
    filter?: EvaluationFilter,
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
    filter?: EvaluationFilter,
  ): Promise<RiskEvaluation[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('subject_id', subjectId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskEvaluation>;

    if (error) {
      this.logger.error(`Failed to fetch evaluations: ${error.message}`);
      throw new Error(`Failed to fetch evaluations: ${error.message}`);
    }

    return data ?? [];
  }

  async findByCompositeScore(
    compositeScoreId: string,
    filter?: EvaluationFilter,
  ): Promise<RiskEvaluation[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('composite_score_id', compositeScoreId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('evaluation_window', {
      ascending: true,
    })) as SupabaseSelectListResponse<RiskEvaluation>;

    if (error) {
      this.logger.error(
        `Failed to fetch evaluations by score: ${error.message}`,
      );
      throw new Error(`Failed to fetch evaluations by score: ${error.message}`);
    }

    return data ?? [];
  }

  async findById(id: string): Promise<RiskEvaluation | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskEvaluation>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch evaluation: ${error.message}`);
      throw new Error(`Failed to fetch evaluation: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<RiskEvaluation> {
    const evaluation = await this.findById(id);
    if (!evaluation) {
      throw new NotFoundException(`Evaluation not found: ${id}`);
    }
    return evaluation;
  }

  /**
   * Check if evaluation already exists for a composite score and window
   */
  async findByScoreAndWindow(
    compositeScoreId: string,
    window: '7d' | '30d' | '90d',
  ): Promise<RiskEvaluation | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('composite_score_id', compositeScoreId)
      .eq('evaluation_window', window)
      .single()) as SupabaseSelectResponse<RiskEvaluation>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch evaluation by score and window: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch evaluation by score and window: ${error.message}`,
      );
    }

    return data;
  }

  async create(
    evaluationData: CreateRiskEvaluationData,
  ): Promise<RiskEvaluation> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(evaluationData)
      .select()
      .single()) as SupabaseSelectResponse<RiskEvaluation>;

    if (error) {
      this.logger.error(`Failed to create evaluation: ${error.message}`);
      throw new Error(`Failed to create evaluation: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no evaluation returned');
    }

    this.logger.log(
      `Created evaluation: ${data.id} (${data.evaluation_window})`,
    );
    return data;
  }

  async update(
    id: string,
    updateData: UpdateRiskEvaluationData,
  ): Promise<RiskEvaluation> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskEvaluation>;

    if (error) {
      this.logger.error(`Failed to update evaluation: ${error.message}`);
      throw new Error(`Failed to update evaluation: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no evaluation returned');
    }

    this.logger.log(`Updated evaluation: ${id}`);
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete evaluation: ${error.message}`);
      throw new Error(`Failed to delete evaluation: ${error.message}`);
    }

    this.logger.log(`Deleted evaluation: ${id}`);
  }

  /**
   * Find all evaluations by window for accuracy analysis
   */
  async findAllByWindow(
    window: '7d' | '30d' | '90d',
    filter?: EvaluationFilter,
  ): Promise<RiskEvaluation[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('evaluation_window', window);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskEvaluation>;

    if (error) {
      this.logger.error(
        `Failed to fetch evaluations by window: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch evaluations by window: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Calculate average accuracy across evaluations
   */
  async calculateAverageAccuracy(
    window?: '7d' | '30d' | '90d',
    filter?: EvaluationFilter,
  ): Promise<number | null> {
    let evaluations: RiskEvaluation[];

    if (window) {
      evaluations = await this.findAllByWindow(window, filter);
    } else {
      let query = this.db.from(this.schema, this.table).select('*');

      query = this.applyTestFilter(query, filter);

      const { data, error } =
        (await query) as SupabaseSelectListResponse<RiskEvaluation>;
      if (error) {
        throw new Error(`Failed to fetch evaluations: ${error.message}`);
      }
      evaluations = data ?? [];
    }

    const withAccuracy = evaluations.filter((e) => e.score_accuracy !== null);
    if (withAccuracy.length === 0) {
      return null;
    }

    const sum = withAccuracy.reduce(
      (acc, e) => acc + (e.score_accuracy || 0),
      0,
    );
    return sum / withAccuracy.length;
  }
}
