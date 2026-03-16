import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  LearningLineage,
  LearningLineageWithDetails,
  CreateLearningLineageData,
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

/**
 * Repository for learning lineage (prediction.learning_lineage)
 * Tracks promotion of learnings from test to production
 */
@Injectable()
export class LearningLineageRepository {
  private readonly logger = new Logger(LearningLineageRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'learning_lineage';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Find a learning lineage record by ID
   */
  async findById(id: string): Promise<LearningLineage | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<LearningLineage>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch learning lineage: ${error.message}`);
      throw new Error(`Failed to fetch learning lineage: ${error.message}`);
    }

    return data;
  }

  /**
   * Find all learning lineage records for an organization
   */
  async findByOrganization(
    organizationSlug: string,
  ): Promise<LearningLineage[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .order('promoted_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<LearningLineage>;

    if (error) {
      this.logger.error(
        `Failed to fetch learning lineage records: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch learning lineage records: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find learning lineage records by test learning ID
   * Returns all promotions of a specific test learning
   */
  async findByTestLearning(testLearningId: string): Promise<LearningLineage[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('test_learning_id', testLearningId)
      .order('promoted_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<LearningLineage>;

    if (error) {
      this.logger.error(
        `Failed to fetch learning lineage by test learning: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch learning lineage by test learning: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find learning lineage records by production learning ID
   * Returns the promotion history of a specific production learning
   */
  async findByProductionLearning(
    productionLearningId: string,
  ): Promise<LearningLineage[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('production_learning_id', productionLearningId)
      .order('promoted_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<LearningLineage>;

    if (error) {
      this.logger.error(
        `Failed to fetch learning lineage by production learning: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch learning lineage by production learning: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find learning lineage records by promoter user ID
   * Returns all promotions made by a specific user
   */
  async findByPromoter(promotedBy: string): Promise<LearningLineage[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('promoted_by', promotedBy)
      .order('promoted_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<LearningLineage>;

    if (error) {
      this.logger.error(
        `Failed to fetch learning lineage by promoter: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch learning lineage by promoter: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Check if a test learning has already been promoted
   * Returns true if the test learning has any promotion records
   */
  async isTestLearningPromoted(testLearningId: string): Promise<boolean> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('id')
      .eq('test_learning_id', testLearningId)
      .limit(1)) as SupabaseSelectListResponse<{ id: string }>;

    if (error) {
      this.logger.error(
        `Failed to check if test learning is promoted: ${error.message}`,
      );
      throw new Error(
        `Failed to check if test learning is promoted: ${error.message}`,
      );
    }

    return (data?.length ?? 0) > 0;
  }

  /**
   * Get promotion history with user and learning details
   * Joins with users table and learnings table to enrich the data
   */
  async getPromotionHistory(
    organizationSlug: string,
  ): Promise<LearningLineageWithDetails[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select(
        `
        *,
        promoter:promoted_by(email, raw_user_meta_data),
        test_learning:test_learning_id(title),
        production_learning:production_learning_id(title)
      `,
      )
      .eq('organization_slug', organizationSlug)
      .order('promoted_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<{
      id: string;
      organization_slug: string;
      test_learning_id: string;
      production_learning_id: string;
      scenario_runs: string[];
      validation_metrics: Record<string, unknown>;
      backtest_result: Record<string, unknown> | null;
      promoted_by: string;
      promoted_at: string;
      notes: string | null;
      created_at: string;
      promoter?: {
        email: string;
        raw_user_meta_data?: { full_name?: string };
      };
      test_learning?: { title: string };
      production_learning?: { title: string };
    }>;

    if (error) {
      this.logger.error(
        `Failed to fetch promotion history with details: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch promotion history with details: ${error.message}`,
      );
    }

    // Transform the data to flatten the joined fields
    return (
      data?.map((record) => ({
        id: record.id,
        organization_slug: record.organization_slug,
        test_learning_id: record.test_learning_id,
        production_learning_id: record.production_learning_id,
        scenario_runs: record.scenario_runs,
        validation_metrics: record.validation_metrics,
        backtest_result: record.backtest_result,
        promoted_by: record.promoted_by,
        promoted_at: record.promoted_at,
        notes: record.notes,
        created_at: record.created_at,
        promoter_email: record.promoter?.email,
        promoter_name: record.promoter?.raw_user_meta_data?.full_name,
        test_learning_title: record.test_learning?.title,
        production_learning_title: record.production_learning?.title,
      })) ?? []
    );
  }

  /**
   * Create a new learning lineage record
   */
  async create(
    lineageData: CreateLearningLineageData,
  ): Promise<LearningLineage> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(lineageData)
      .select()
      .single()) as SupabaseSelectResponse<LearningLineage>;

    if (error) {
      this.logger.error(`Failed to create learning lineage: ${error.message}`);
      throw new Error(`Failed to create learning lineage: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no learning lineage returned');
    }

    this.logger.log(
      `Created learning lineage: ${data.id} (test: ${data.test_learning_id} -> production: ${data.production_learning_id})`,
    );
    return data;
  }

  /**
   * Update a learning lineage record
   */
  async update(
    id: string,
    updateData: Partial<LearningLineage>,
  ): Promise<LearningLineage> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<LearningLineage>;

    if (error) {
      this.logger.error(`Failed to update learning lineage: ${error.message}`);
      throw new Error(`Failed to update learning lineage: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no learning lineage returned');
    }

    return data;
  }

  /**
   * Delete a learning lineage record
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete learning lineage: ${error.message}`);
      throw new Error(`Failed to delete learning lineage: ${error.message}`);
    }

    this.logger.log(`Deleted learning lineage: ${id}`);
  }
}
