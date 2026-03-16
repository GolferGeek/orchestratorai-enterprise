import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  Source,
  CreateSourceData,
  UpdateSourceData,
  CrawlFrequency,
  SourceDueForCrawl,
} from '../interfaces';

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
 * Repository for central crawler sources
 * Shared across all agents (prediction, risk, marketing, etc.)
 */
@Injectable()
export class CrawlerSourceRepository {
  private readonly logger = new Logger(CrawlerSourceRepository.name);
  private readonly schema = 'crawler';
  private readonly table = 'sources';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Find all sources for an organization
   */
  async findAll(organizationSlug: string): Promise<Source[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('is_active', true)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<Source>;

    if (error) {
      this.logger.error(`Failed to fetch sources: ${error.message}`);
      throw new Error(`Failed to fetch sources: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find source by ID
   */
  async findById(id: string): Promise<Source | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<Source>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch source: ${error.message}`);
      throw new Error(`Failed to fetch source: ${error.message}`);
    }

    return data;
  }

  /**
   * Find source by ID or throw
   */
  async findByIdOrThrow(id: string): Promise<Source> {
    const source = await this.findById(id);
    if (!source) {
      throw new NotFoundException(`Source not found: ${id}`);
    }
    return source;
  }

  /**
   * Find source by URL within an organization
   * Used for findOrCreate pattern
   */
  async findByUrl(
    organizationSlug: string,
    url: string,
  ): Promise<Source | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('url', url)
      .single()) as SupabaseSelectResponse<Source>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch source by URL: ${error.message}`);
      throw new Error(`Failed to fetch source by URL: ${error.message}`);
    }

    return data;
  }

  /**
   * Find or create source by URL
   * Returns existing source if URL already registered, otherwise creates new
   */
  async findOrCreate(sourceData: CreateSourceData): Promise<Source> {
    // Check if source already exists
    const existing = await this.findByUrl(
      sourceData.organization_slug,
      sourceData.url,
    );

    if (existing) {
      this.logger.debug(
        `Source already exists for URL: ${sourceData.url}, returning existing`,
      );
      return existing;
    }

    // Create new source
    return this.create(sourceData);
  }

  /**
   * Find sources due for crawling based on frequency
   */
  async findDueForCrawl(
    frequency?: CrawlFrequency,
  ): Promise<SourceDueForCrawl[]> {
    const { data, error } = (await this.db.rpc(
      'get_sources_due_for_crawl',
      {
        p_frequency_minutes: frequency ?? null,
      },
      this.schema,
    )) as SupabaseSelectListResponse<SourceDueForCrawl>;

    if (error) {
      this.logger.error(
        `Failed to fetch sources due for crawl: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch sources due for crawl: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find all sources for dashboard (includes inactive)
   */
  async findAllForDashboard(organizationSlug: string): Promise<Source[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<Source>;

    if (error) {
      this.logger.error(
        `Failed to fetch all sources for dashboard: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch all sources for dashboard: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Create a new source
   */
  async create(sourceData: CreateSourceData): Promise<Source> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(sourceData as unknown as Record<string, unknown>)
      .select()
      .single()) as SupabaseSelectResponse<Source>;

    if (error) {
      this.logger.error(`Failed to create source: ${error.message}`);
      throw new Error(`Failed to create source: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no source returned');
    }

    this.logger.log(`Created source: ${data.name} (${data.id})`);
    return data;
  }

  /**
   * Update an existing source
   */
  async update(id: string, updateData: UpdateSourceData): Promise<Source> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData as unknown as Record<string, unknown>)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<Source>;

    if (error) {
      this.logger.error(`Failed to update source: ${error.message}`);
      throw new Error(`Failed to update source: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no source returned');
    }

    return data;
  }

  /**
   * Delete a source
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete source: ${error.message}`);
      throw new Error(`Failed to delete source: ${error.message}`);
    }
  }

  /**
   * Mark source as successfully crawled
   */
  async markCrawlSuccess(id: string): Promise<void> {
    await this.update(id, {
      last_crawl_at: new Date().toISOString(),
      last_crawl_status: 'success',
      last_error: null,
      consecutive_errors: 0,
    });
  }

  /**
   * Mark source crawl as failed
   */
  async markCrawlError(id: string, errorMessage: string): Promise<void> {
    const source = await this.findByIdOrThrow(id);
    await this.update(id, {
      last_crawl_at: new Date().toISOString(),
      last_crawl_status: 'error',
      last_error: errorMessage,
      consecutive_errors: source.consecutive_errors + 1,
    });
  }
}
