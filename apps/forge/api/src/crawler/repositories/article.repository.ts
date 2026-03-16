import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  Article,
  CreateArticleData,
  ArticleFingerprint,
  ArticleWithPhraseOverlap,
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
 * Repository for crawler articles
 * Shared content store for all agents
 */
@Injectable()
export class ArticleRepository {
  private readonly logger = new Logger(ArticleRepository.name);
  private readonly schema = 'crawler';
  private readonly table = 'articles';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Find article by ID
   */
  async findById(id: string): Promise<Article | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<Article>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch article: ${error.message}`);
      throw new Error(`Failed to fetch article: ${error.message}`);
    }

    return data;
  }

  /**
   * Find article by content hash (exact deduplication)
   */
  async findByContentHash(
    organizationSlug: string,
    contentHash: string,
  ): Promise<Article | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('content_hash', contentHash)
      .single()) as SupabaseSelectResponse<Article>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch article by content hash: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch article by content hash: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Check if content hash exists (Layer 2 cross-source dedup)
   */
  async checkContentHashExists(
    organizationSlug: string,
    contentHash: string,
    excludeSourceId?: string,
  ): Promise<boolean> {
    const { data, error } = (await this.db.rpc(
      'check_content_hash_exists',
      {
        p_organization_slug: organizationSlug,
        p_content_hash: contentHash,
        p_exclude_source_id: excludeSourceId ?? null,
      },
      this.schema,
    )) as { data: boolean | null; error: { message: string } | null };

    if (error) {
      this.logger.error(`Failed to check content hash: ${error.message}`);
      throw new Error(`Failed to check content hash: ${error.message}`);
    }

    return data ?? false;
  }

  /**
   * Find recent article fingerprints for fuzzy matching (Layer 3)
   */
  async findRecentFingerprints(
    organizationSlug: string,
    hoursBack: number = 72,
    limit: number = 100,
  ): Promise<ArticleFingerprint[]> {
    const { data, error } = (await this.db.rpc(
      'find_recent_article_fingerprints',
      {
        p_organization_slug: organizationSlug,
        p_hours_back: hoursBack,
        p_limit: limit,
      },
      this.schema,
    )) as {
      data: ArticleFingerprint[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to fetch recent fingerprints: ${error.message}`,
      );
      throw new Error(`Failed to fetch recent fingerprints: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find articles by phrase overlap (Layer 4)
   */
  async findByPhraseOverlap(
    organizationSlug: string,
    keyPhrases: string[],
    hoursBack: number = 72,
    limit: number = 50,
  ): Promise<ArticleWithPhraseOverlap[]> {
    const { data, error } = (await this.db.rpc(
      'find_articles_by_phrase_overlap',
      {
        p_organization_slug: organizationSlug,
        p_key_phrases: keyPhrases,
        p_hours_back: hoursBack,
        p_limit: limit,
      },
      this.schema,
    )) as {
      data: ArticleWithPhraseOverlap[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to find articles by phrase overlap: ${error.message}`,
      );
      throw new Error(
        `Failed to find articles by phrase overlap: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find articles for a source since a given timestamp (for pull model)
   */
  async findNewForSource(
    sourceId: string,
    since: Date,
    limit: number = 100,
  ): Promise<Article[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('source_id', sourceId)
      .eq('is_test', false)
      .gt('first_seen_at', since.toISOString())
      .order('first_seen_at', { ascending: true })
      .limit(limit)) as SupabaseSelectListResponse<Article>;

    if (error) {
      this.logger.error(
        `Failed to fetch new articles for source: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch new articles for source: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find articles for multiple sources since given timestamps
   * Used for efficient batch pulling across subscriptions
   */
  async findNewForSources(
    sourceIds: string[],
    since: Date,
    limit: number = 100,
  ): Promise<Article[]> {
    if (sourceIds.length === 0) {
      return [];
    }

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .in('source_id', sourceIds)
      .eq('is_test', false)
      .gt('first_seen_at', since.toISOString())
      .order('first_seen_at', { ascending: true })
      .limit(limit)) as SupabaseSelectListResponse<Article>;

    if (error) {
      this.logger.error(
        `Failed to fetch new articles for sources: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch new articles for sources: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Create a new article
   */
  async create(articleData: CreateArticleData): Promise<Article> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(articleData as unknown as Record<string, unknown>)
      .select()
      .single()) as SupabaseSelectResponse<Article>;

    if (error) {
      // Handle unique constraint violation (duplicate)
      if (error.code === '23505') {
        this.logger.debug(
          `Article already exists for content hash: ${articleData.content_hash}`,
        );
        const existing = await this.findByContentHash(
          articleData.organization_slug,
          articleData.content_hash,
        );
        if (existing) {
          return existing;
        }
      }
      this.logger.error(`Failed to create article: ${error.message}`);
      throw new Error(`Failed to create article: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no article returned');
    }

    this.logger.debug(
      `Created article: ${data.title ?? data.url} (${data.id})`,
    );
    return data;
  }

  /**
   * Create article if not exists (upsert by content hash)
   * Returns existing article if duplicate found
   */
  async createIfNotExists(
    articleData: CreateArticleData,
  ): Promise<{ article: Article; isNew: boolean }> {
    // Check if article already exists by content hash
    const existing = await this.findByContentHash(
      articleData.organization_slug,
      articleData.content_hash,
    );

    if (existing) {
      return { article: existing, isNew: false };
    }

    const article = await this.create(articleData);
    return { article, isNew: true };
  }

  /**
   * Update article fingerprint data
   */
  async updateFingerprint(
    id: string,
    titleNormalized: string,
    keyPhrases: string[],
    fingerprintHash: string,
  ): Promise<void> {
    const { error } = (await this.db
      .from(this.schema, this.table)
      .update({
        title_normalized: titleNormalized,
        key_phrases: keyPhrases,
        fingerprint_hash: fingerprintHash,
      })
      .eq('id', id)) as QueryResult<unknown>;

    if (error) {
      this.logger.error(
        `Failed to update article fingerprint: ${error.message}`,
      );
      throw new Error(`Failed to update article fingerprint: ${error.message}`);
    }
  }

  /**
   * Count articles for a source
   */
  async countForSource(sourceId: string): Promise<number> {
    const { count, error } = (await this.db
      .from(this.schema, this.table)
      .select('*', { count: 'exact', head: true })
      .eq('source_id', sourceId)) as {
      count: number | null;
      data: unknown;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to count articles: ${error.message}`);
      throw new Error(`Failed to count articles: ${error.message}`);
    }

    return count ?? 0;
  }
}
