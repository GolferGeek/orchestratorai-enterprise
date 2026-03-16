import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  Predictor,
  CreatePredictorData,
  UpdatePredictorData,
} from '../interfaces/predictor.interface';
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
export class PredictorRepository {
  private readonly logger = new Logger(PredictorRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'predictors';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

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

  async findActiveByTarget(
    targetId: string,
    filter: TestDataFilter = DEFAULT_FILTER,
  ): Promise<Predictor[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString());

    query = this.applyTestDataFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<Predictor>;

    if (error) {
      this.logger.error(`Failed to fetch active predictors: ${error.message}`);
      throw new Error(`Failed to fetch active predictors: ${error.message}`);
    }

    return data ?? [];
  }

  async findById(id: string): Promise<Predictor | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<Predictor>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch predictor: ${error.message}`);
      throw new Error(`Failed to fetch predictor: ${error.message}`);
    }

    return data;
  }

  /**
   * Find all predictors consumed by a specific prediction
   * Used for lineage/deep-dive views to show which predictors contributed
   */
  async findByPredictionId(predictionId: string): Promise<Predictor[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('consumed_by_prediction_id', predictionId)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<Predictor>;

    if (error) {
      this.logger.error(
        `Failed to fetch predictors by prediction: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch predictors by prediction: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find all predictors for a specific article
   * Used for displaying predictors created from an article
   */
  async findByArticleId(articleId: string): Promise<Predictor[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('article_id', articleId)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<Predictor>;

    if (error) {
      this.logger.error(
        `Failed to fetch predictors by article: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch predictors by article: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find predictors for multiple articles
   * Used for bulk fetching predictors for article lists
   */
  async findByArticleIds(
    articleIds: string[],
  ): Promise<Map<string, Predictor[]>> {
    if (articleIds.length === 0) return new Map();

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .in('article_id', articleIds)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<Predictor>;

    if (error) {
      this.logger.error(
        `Failed to fetch predictors by articles: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch predictors by articles: ${error.message}`,
      );
    }

    // Group predictors by article_id
    const predictorMap = new Map<string, Predictor[]>();
    for (const predictor of data ?? []) {
      if (predictor.article_id) {
        if (!predictorMap.has(predictor.article_id)) {
          predictorMap.set(predictor.article_id, []);
        }
        predictorMap.get(predictor.article_id)!.push(predictor);
      }
    }

    return predictorMap;
  }

  async create(predictorData: CreatePredictorData): Promise<Predictor> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(predictorData)
      .select()
      .single()) as SupabaseSelectResponse<Predictor>;

    if (error) {
      this.logger.error(`Failed to create predictor: ${error.message}`);
      throw new Error(`Failed to create predictor: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no predictor returned');
    }

    return data;
  }

  async update(
    id: string,
    updateData: UpdatePredictorData,
  ): Promise<Predictor> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<Predictor>;

    if (error) {
      this.logger.error(`Failed to update predictor: ${error.message}`);
      throw new Error(`Failed to update predictor: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no predictor returned');
    }

    return data;
  }

  /**
   * Expire old predictors for a target
   * Sets status to 'expired' for predictors past their TTL
   */
  async expireOldPredictors(targetId: string): Promise<number> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update({ status: 'expired' })
      .eq('target_id', targetId)
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString())
      .select('id')) as SupabaseSelectListResponse<{ id: string }>;

    if (error) {
      this.logger.error(`Failed to expire old predictors: ${error.message}`);
      throw new Error(`Failed to expire old predictors: ${error.message}`);
    }

    const expiredCount = (data ?? []).length;
    if (expiredCount > 0) {
      this.logger.debug(
        `Expired ${expiredCount} predictors for target ${targetId}`,
      );
    }

    return expiredCount;
  }

  /**
   * Mark a predictor as consumed by a prediction
   * Sets status to 'consumed' and records the prediction ID and timestamp
   */
  async consumePredictor(id: string, predictionId: string): Promise<Predictor> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update({
        status: 'consumed',
        consumed_at: new Date().toISOString(),
        consumed_by_prediction_id: predictionId,
      })
      .eq('id', id)
      .eq('status', 'active')
      .select()
      .single()) as SupabaseSelectResponse<Predictor>;

    if (error) {
      this.logger.error(`Failed to consume predictor: ${error.message}`);
      throw new Error(`Failed to consume predictor: ${error.message}`);
    }

    if (!data) {
      throw new Error('Consume succeeded but no predictor returned');
    }

    return data;
  }

  // =============================================================================
  // REPLAY TEST METHODS
  // =============================================================================

  /**
   * Find predictors by IDs
   * Used for replay test data injection
   */
  async findByIds(ids: string[]): Promise<Predictor[]> {
    if (ids.length === 0) return [];

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .in('id', ids)) as SupabaseSelectListResponse<Predictor>;

    if (error) {
      this.logger.error(`Failed to fetch predictors by IDs: ${error.message}`);
      throw new Error(`Failed to fetch predictors by IDs: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Create a test copy of a predictor for replay testing
   * The copy is marked with is_test_data=true and test_scenario_id
   */
  async createTestCopy(
    predictor: Predictor,
    testScenarioId: string,
  ): Promise<Predictor> {
    // Create a copy without the id, timestamps, and with test markers
    // Use direct insert with test markers since CreatePredictorData doesn't include them
    const testPredictorData = {
      article_id: predictor.article_id,
      target_id: predictor.target_id,
      direction: predictor.direction,
      strength: predictor.strength,
      confidence: predictor.confidence,
      reasoning: predictor.reasoning,
      analyst_slug: predictor.analyst_slug,
      analyst_assessment: predictor.analyst_assessment,
      expires_at: predictor.expires_at,
      status: 'active', // Reset to active for processing
      // Test data markers
      is_test_data: true,
      test_scenario_id: testScenarioId,
    };

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(testPredictorData)
      .select()
      .single()) as SupabaseSelectResponse<Predictor>;

    if (error) {
      this.logger.error(
        `Failed to create test copy predictor: ${error.message}`,
      );
      throw new Error(`Failed to create test copy predictor: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create test copy succeeded but no predictor returned');
    }

    return data;
  }
}
