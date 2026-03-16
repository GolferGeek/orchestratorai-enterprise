import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  SourceCrawl,
  CreateSourceCrawlData,
  UpdateSourceCrawlData,
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
 * Repository for source crawl records
 * Tracks crawl execution history and deduplication metrics
 */
@Injectable()
export class SourceCrawlRepository {
  private readonly logger = new Logger(SourceCrawlRepository.name);
  private readonly schema = 'crawler';
  private readonly table = 'source_crawls';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Find crawl by ID
   */
  async findById(id: string): Promise<SourceCrawl | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<SourceCrawl>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch crawl: ${error.message}`);
      throw new Error(`Failed to fetch crawl: ${error.message}`);
    }

    return data;
  }

  /**
   * Find recent crawls for a source
   */
  async findRecentForSource(
    sourceId: string,
    limit: number = 10,
  ): Promise<SourceCrawl[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('source_id', sourceId)
      .order('started_at', { ascending: false })
      .limit(limit)) as SupabaseSelectListResponse<SourceCrawl>;

    if (error) {
      this.logger.error(
        `Failed to fetch recent crawls for source: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch recent crawls for source: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find the latest crawl for a source
   */
  async findLatestForSource(sourceId: string): Promise<SourceCrawl | null> {
    const crawls = await this.findRecentForSource(sourceId, 1);
    return crawls[0] ?? null;
  }

  /**
   * Create a new crawl record (marks start of crawl)
   */
  async create(crawlData: CreateSourceCrawlData): Promise<SourceCrawl> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert({
        ...crawlData,
        status: crawlData.status ?? 'running',
      })
      .select()
      .single()) as SupabaseSelectResponse<SourceCrawl>;

    if (error) {
      this.logger.error(`Failed to create crawl record: ${error.message}`);
      throw new Error(`Failed to create crawl record: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no crawl record returned');
    }

    return data;
  }

  /**
   * Update crawl record
   */
  async update(
    id: string,
    updateData: UpdateSourceCrawlData,
  ): Promise<SourceCrawl> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData as unknown as Record<string, unknown>)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<SourceCrawl>;

    if (error) {
      this.logger.error(`Failed to update crawl record: ${error.message}`);
      throw new Error(`Failed to update crawl record: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no crawl record returned');
    }

    return data;
  }

  /**
   * Mark crawl as successful with metrics
   */
  async markSuccess(
    id: string,
    metrics: {
      articles_found: number;
      articles_new: number;
      duplicates_exact: number;
      duplicates_cross_source: number;
      duplicates_fuzzy_title: number;
      duplicates_phrase_overlap: number;
      crawl_duration_ms: number;
    },
  ): Promise<SourceCrawl> {
    return this.update(id, {
      status: 'success',
      completed_at: new Date().toISOString(),
      ...metrics,
    });
  }

  /**
   * Mark crawl as failed
   */
  async markError(
    id: string,
    errorMessage: string,
    durationMs?: number,
  ): Promise<SourceCrawl> {
    return this.update(id, {
      status: 'error',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
      crawl_duration_ms: durationMs,
    });
  }

  /**
   * Mark crawl as timed out
   */
  async markTimeout(id: string, durationMs?: number): Promise<SourceCrawl> {
    return this.update(id, {
      status: 'timeout',
      completed_at: new Date().toISOString(),
      error_message: 'Crawl timed out',
      crawl_duration_ms: durationMs,
    });
  }

  /**
   * Get crawl statistics for a source
   */
  async getStatsForSource(
    sourceId: string,
    days: number = 7,
  ): Promise<{
    total_crawls: number;
    successful_crawls: number;
    total_articles_found: number;
    total_articles_new: number;
    total_duplicates: number;
    avg_duration_ms: number;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('source_id', sourceId)
      .gte(
        'started_at',
        since.toISOString(),
      )) as SupabaseSelectListResponse<SourceCrawl>;

    if (error) {
      this.logger.error(`Failed to fetch crawl stats: ${error.message}`);
      throw new Error(`Failed to fetch crawl stats: ${error.message}`);
    }

    const crawls = data ?? [];
    const successfulCrawls = crawls.filter((c) => c.status === 'success');

    return {
      total_crawls: crawls.length,
      successful_crawls: successfulCrawls.length,
      total_articles_found: successfulCrawls.reduce(
        (sum, c) => sum + c.articles_found,
        0,
      ),
      total_articles_new: successfulCrawls.reduce(
        (sum, c) => sum + c.articles_new,
        0,
      ),
      total_duplicates: successfulCrawls.reduce(
        (sum, c) =>
          sum +
          c.duplicates_exact +
          c.duplicates_cross_source +
          c.duplicates_fuzzy_title +
          c.duplicates_phrase_overlap,
        0,
      ),
      avg_duration_ms:
        successfulCrawls.length > 0
          ? successfulCrawls.reduce(
              (sum, c) => sum + (c.crawl_duration_ms ?? 0),
              0,
            ) / successfulCrawls.length
          : 0,
    };
  }
}
