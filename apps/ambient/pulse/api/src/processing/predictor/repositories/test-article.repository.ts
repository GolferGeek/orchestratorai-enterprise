import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

type SupabaseInsertResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseUpdateResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

/**
 * Test Article entity - represents synthetic news articles for testing
 * Based on prediction.test_articles table
 */
export interface TestArticle {
  id: string;
  organization_slug: string;
  scenario_id: string | null;
  title: string;
  content: string;
  source_name: string;
  published_at: string;
  target_symbols: string[];
  sentiment_expected: string | null; // positive, negative, neutral
  strength_expected: number | null; // decimal(3,2)
  is_synthetic: boolean;
  synthetic_marker: string | null;
  processed: boolean;
  processed_at: string | null;
  created_by: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

/**
 * Data for creating a new test article
 */
export interface CreateTestArticleData {
  id?: string;
  organization_slug: string;
  scenario_id?: string;
  title: string;
  content: string;
  source_name?: string;
  published_at: string;
  target_symbols?: string[];
  sentiment_expected?: 'positive' | 'negative' | 'neutral';
  strength_expected?: number;
  is_synthetic?: boolean;
  synthetic_marker?: string;
  processed?: boolean;
  processed_at?: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Data for updating a test article
 */
export interface UpdateTestArticleData {
  title?: string;
  content?: string;
  source_name?: string;
  published_at?: string;
  target_symbols?: string[];
  sentiment_expected?: 'positive' | 'negative' | 'neutral';
  strength_expected?: number;
  is_synthetic?: boolean;
  synthetic_marker?: string;
  processed?: boolean;
  processed_at?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Repository for test articles (prediction.test_articles)
 * Part of the Test Data Injection Framework (Phase 3)
 */
@Injectable()
export class TestArticleRepository {
  private readonly logger = new Logger(TestArticleRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'test_articles';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Find a test article by ID
   */
  async findById(id: string): Promise<TestArticle | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<TestArticle>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch test article: ${error.message}`);
      throw new Error(`Failed to fetch test article: ${error.message}`);
    }

    return data;
  }

  /**
   * Find all test articles for an organization
   */
  async findByOrganization(organizationSlug: string): Promise<TestArticle[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .order('published_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<TestArticle>;

    if (error) {
      this.logger.error(`Failed to fetch test articles: ${error.message}`);
      throw new Error(`Failed to fetch test articles: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find test articles by scenario
   */
  async findByScenario(scenarioId: string): Promise<TestArticle[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('scenario_id', scenarioId)
      .order('published_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<TestArticle>;

    if (error) {
      this.logger.error(
        `Failed to fetch test articles by scenario: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch test articles by scenario: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find test articles by target symbol
   * Articles can have multiple target symbols, so we use array contains
   */
  async findByTargetSymbol(targetSymbol: string): Promise<TestArticle[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .contains('target_symbols', [targetSymbol])
      .order('published_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<TestArticle>;

    if (error) {
      this.logger.error(
        `Failed to fetch test articles by target symbol: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch test articles by target symbol: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find unprocessed test articles
   * Optionally filter by scenario
   */
  async findUnprocessed(scenarioId?: string): Promise<TestArticle[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('processed', false);

    if (scenarioId) {
      query = query.eq('scenario_id', scenarioId);
    }

    const { data, error } = (await query.order('published_at', {
      ascending: true,
    })) as SupabaseSelectListResponse<TestArticle>;

    if (error) {
      this.logger.error(
        `Failed to fetch unprocessed test articles: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch unprocessed test articles: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Create a new test article
   */
  async create(articleData: CreateTestArticleData): Promise<TestArticle> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(articleData)
      .select()
      .single()) as SupabaseInsertResponse<TestArticle>;

    if (error) {
      this.logger.error(`Failed to create test article: ${error.message}`);
      throw new Error(`Failed to create test article: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no test article returned');
    }

    this.logger.log(`Created test article: ${data.id} (${data.title})`);
    return data;
  }

  /**
   * Bulk create test articles
   * Returns the number of articles created
   */
  async bulkCreate(articles: CreateTestArticleData[]): Promise<TestArticle[]> {
    if (articles.length === 0) {
      return [];
    }

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(articles)
      .select()) as SupabaseSelectListResponse<TestArticle>;

    if (error) {
      this.logger.error(
        `Failed to bulk create test articles: ${error.message}`,
      );
      throw new Error(`Failed to bulk create test articles: ${error.message}`);
    }

    const created = data ?? [];
    this.logger.log(`Bulk created ${created.length} test articles`);
    return created;
  }

  /**
   * Update a test article
   */
  async update(
    id: string,
    updateData: UpdateTestArticleData,
  ): Promise<TestArticle> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseUpdateResponse<TestArticle>;

    if (error) {
      this.logger.error(`Failed to update test article: ${error.message}`);
      throw new Error(`Failed to update test article: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no test article returned');
    }

    return data;
  }

  /**
   * Mark a test article as processed
   */
  async markProcessed(id: string): Promise<TestArticle> {
    return this.update(id, {
      processed: true,
      processed_at: new Date().toISOString(),
    });
  }

  /**
   * Bulk mark test articles as processed
   * Returns the number of articles marked
   */
  async bulkMarkProcessed(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .in('id', ids)
      .select()) as SupabaseSelectListResponse<TestArticle>;

    if (error) {
      this.logger.error(
        `Failed to bulk mark test articles as processed: ${error.message}`,
      );
      throw new Error(
        `Failed to bulk mark test articles as processed: ${error.message}`,
      );
    }

    const count = data?.length ?? 0;
    this.logger.log(`Bulk marked ${count} test articles as processed`);
    return count;
  }

  /**
   * Delete a test article
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete test article: ${error.message}`);
      throw new Error(`Failed to delete test article: ${error.message}`);
    }

    this.logger.log(`Deleted test article: ${id}`);
  }

  /**
   * Delete all test articles for a scenario
   * Returns the number of articles deleted
   */
  async deleteByScenario(scenarioId: string): Promise<number> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('scenario_id', scenarioId)
      .select()) as SupabaseSelectListResponse<TestArticle>;

    if (error) {
      this.logger.error(
        `Failed to delete test articles by scenario: ${error.message}`,
      );
      throw new Error(
        `Failed to delete test articles by scenario: ${error.message}`,
      );
    }

    const count = data?.length ?? 0;
    this.logger.log(
      `Deleted ${count} test articles for scenario ${scenarioId}`,
    );
    return count;
  }
}
