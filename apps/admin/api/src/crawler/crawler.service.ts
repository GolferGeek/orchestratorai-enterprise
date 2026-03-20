import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

// ─── Row shapes ─────────────────────────────────────────────────────────────

export interface SourceRow {
  id: string;
  organization_slug: string;
  name: string;
  description: string | null;
  source_type: string;
  url: string;
  crawl_config: Record<string, unknown>;
  auth_config: Record<string, unknown> | null;
  crawl_frequency_minutes: number;
  is_active: boolean;
  is_test: boolean;
  last_crawl_at: string | null;
  last_crawl_status: string | null;
  last_error: string | null;
  consecutive_errors: number;
  created_at: string;
  updated_at: string;
}

export interface ArticleRow {
  id: string;
  organization_slug: string;
  source_id: string;
  url: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  author: string | null;
  published_at: string | null;
  content_hash: string | null;
  is_test: boolean;
  first_seen_at: string;
  metadata: Record<string, unknown> | null;
  is_duplicate: boolean;
}

export interface SourceCrawlRow {
  id: string;
  source_id: string;
  started_at: string;
  completed_at: string | null;
  crawl_duration_ms: number | null;
  status: string;
  articles_found: number;
  articles_new: number;
  duplicates_exact: number;
  duplicates_cross_source: number;
  duplicates_fuzzy_title: number;
  duplicates_phrase_overlap: number;
  error_message: string | null;
  retry_count: number;
  metadata: Record<string, unknown> | null;
}

// ─── Public response shapes (camelCase for the frontend) ────────────────────

export interface CrawlerSource {
  id: string;
  organizationSlug: string;
  name: string;
  description: string | null;
  sourceType: string;
  url: string;
  crawlConfig: Record<string, unknown>;
  authConfig: Record<string, unknown> | null;
  crawlFrequencyMinutes: number;
  isActive: boolean;
  isTest: boolean;
  lastCrawlAt: string | null;
  lastCrawlStatus: string | null;
  lastError: string | null;
  consecutiveErrors: number;
  createdAt: string;
  updatedAt: string;
  articleCount: number;
}

export interface CrawlerArticle {
  id: string;
  organizationSlug: string;
  sourceId: string;
  url: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  contentHash: string | null;
  isTest: boolean;
  firstSeenAt: string;
  metadata: Record<string, unknown> | null;
  isDuplicate: boolean;
}

export interface SourceCrawl {
  id: string;
  sourceId: string;
  startedAt: string;
  completedAt: string | null;
  crawlDurationMs: number | null;
  status: string;
  articlesFound: number;
  articlesNew: number;
  duplicatesExact: number;
  duplicatesCrossSource: number;
  duplicatesFuzzyTitle: number;
  duplicatesPhraseOverlap: number;
  errorMessage: string | null;
  retryCount: number;
  metadata: Record<string, unknown> | null;
}

function mapRowToSource(row: SourceRow, articleCount = 0): CrawlerSource {
  return {
    id: row.id,
    organizationSlug: row.organization_slug,
    name: row.name,
    description: row.description,
    sourceType: row.source_type,
    url: row.url,
    crawlConfig: row.crawl_config,
    authConfig: row.auth_config,
    crawlFrequencyMinutes: row.crawl_frequency_minutes,
    isActive: row.is_active,
    isTest: row.is_test,
    lastCrawlAt: row.last_crawl_at,
    lastCrawlStatus: row.last_crawl_status,
    lastError: row.last_error,
    consecutiveErrors: row.consecutive_errors,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    articleCount,
  };
}

function mapRowToArticle(row: ArticleRow): CrawlerArticle {
  return {
    id: row.id,
    organizationSlug: row.organization_slug,
    sourceId: row.source_id,
    url: row.url,
    title: row.title,
    content: row.content,
    summary: row.summary,
    author: row.author,
    publishedAt: row.published_at,
    contentHash: row.content_hash,
    isTest: row.is_test,
    firstSeenAt: row.first_seen_at,
    metadata: row.metadata,
    isDuplicate: row.is_duplicate,
  };
}

function mapRowToSourceCrawl(row: SourceCrawlRow): SourceCrawl {
  return {
    id: row.id,
    sourceId: row.source_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    crawlDurationMs: row.crawl_duration_ms,
    status: row.status,
    articlesFound: row.articles_found,
    articlesNew: row.articles_new,
    duplicatesExact: row.duplicates_exact,
    duplicatesCrossSource: row.duplicates_cross_source,
    duplicatesFuzzyTitle: row.duplicates_fuzzy_title,
    duplicatesPhraseOverlap: row.duplicates_phrase_overlap,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    metadata: row.metadata,
  };
}

export interface CrawlerStats {
  totalSources: number;
  activeSources: number;
  totalArticles: number;
  totalDedup: {
    exact: number;
    crossSource: number;
    fuzzyTitle: number;
    phraseOverlap: number;
  };
}

export interface SourceSummary {
  sourceId: string;
  sourceName: string;
  totalArticles: number;
  latestCrawlAt: string | null;
  avgArticlesPerCrawl: number;
  totalDedup: {
    exact: number;
    crossSource: number;
    fuzzyTitle: number;
    phraseOverlap: number;
  };
}

export interface CreateSourceDto {
  name: string;
  url: string;
  organizationSlug: string;
  description?: string;
  sourceType?: string;
  crawlFrequencyMinutes?: number;
  crawlConfig?: Record<string, unknown>;
  isActive?: boolean;
  isTest?: boolean;
}

export interface UpdateSourceDto {
  name?: string;
  url?: string;
  description?: string;
  sourceType?: string;
  crawlFrequencyMinutes?: number;
  crawlConfig?: Record<string, unknown>;
  isActive?: boolean;
  isTest?: boolean;
}

/**
 * CrawlerService — direct database queries against the crawler schema.
 *
 * No fallbacks: errors propagate to the caller.
 */
@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Aggregate stats across all sources: counts, article totals, dedup totals.
   */
  async getStats(): Promise<CrawlerStats> {
    this.logger.log('[Crawler] Fetching crawler stats');

    const { data, error } = await this.db.rawQuery(`
      SELECT
        COUNT(DISTINCT s.id)::int                                          AS total_sources,
        COUNT(DISTINCT s.id) FILTER (WHERE s.is_active = true)::int       AS active_sources,
        COUNT(DISTINCT a.id)::int                                          AS total_articles,
        COALESCE(SUM(sc.duplicates_exact), 0)::int                        AS dedup_exact,
        COALESCE(SUM(sc.duplicates_cross_source), 0)::int                 AS dedup_cross_source,
        COALESCE(SUM(sc.duplicates_fuzzy_title), 0)::int                  AS dedup_fuzzy_title,
        COALESCE(SUM(sc.duplicates_phrase_overlap), 0)::int               AS dedup_phrase_overlap
      FROM crawler.sources s
      LEFT JOIN crawler.articles a ON a.source_id = s.id
      LEFT JOIN crawler.source_crawls sc ON sc.source_id = s.id
    `);

    if (error) {
      throw new Error(`Failed to fetch crawler stats: ${error.message}`);
    }

    const row = ((data as Record<string, unknown>[]) ?? [])[0] ?? {};

    return {
      totalSources: Number(row['total_sources'] ?? 0),
      activeSources: Number(row['active_sources'] ?? 0),
      totalArticles: Number(row['total_articles'] ?? 0),
      totalDedup: {
        exact: Number(row['dedup_exact'] ?? 0),
        crossSource: Number(row['dedup_cross_source'] ?? 0),
        fuzzyTitle: Number(row['dedup_fuzzy_title'] ?? 0),
        phraseOverlap: Number(row['dedup_phrase_overlap'] ?? 0),
      },
    };
  }

  /**
   * List sources with article counts. Pass includeInactive=true to include
   * inactive sources.
   */
  async getSources(includeInactive = false): Promise<CrawlerSource[]> {
    this.logger.log(`[Crawler] Fetching sources (includeInactive=${includeInactive})`);

    const { data, error } = await this.db.rawQuery(
      `
      SELECT
        s.*,
        COUNT(a.id)::int AS article_count
      FROM crawler.sources s
      LEFT JOIN crawler.articles a ON a.source_id = s.id
      ${includeInactive ? '' : 'WHERE s.is_active = true'}
      GROUP BY s.id
      ORDER BY s.name ASC
      `,
    );

    if (error) {
      throw new Error(`Failed to fetch crawler sources: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    return rows.map((row) =>
      mapRowToSource(row as unknown as SourceRow, Number(row['article_count'] ?? 0)),
    );
  }

  /**
   * Fetch a single source by id.
   */
  async getSource(id: string): Promise<CrawlerSource> {
    this.logger.log(`[Crawler] Fetching source ${id}`);

    const { data, error } = await this.db
      .from('crawler', 'sources')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch source ${id}: ${error.message}`);
    }

    return mapRowToSource(data as SourceRow);
  }

  /**
   * Insert a new source.
   */
  async createSource(dto: CreateSourceDto): Promise<CrawlerSource> {
    this.logger.log(`[Crawler] Creating source "${dto.name}"`);

    const { data, error } = await this.db
      .from('crawler', 'sources')
      .insert({
        name: dto.name,
        url: dto.url,
        organization_slug: dto.organizationSlug,
        description: dto.description ?? null,
        source_type: dto.sourceType ?? 'web',
        crawl_frequency_minutes: dto.crawlFrequencyMinutes ?? 60,
        crawl_config: dto.crawlConfig ?? {},
        is_active: dto.isActive ?? true,
        is_test: dto.isTest ?? false,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create source: ${error.message}`);
    }

    return mapRowToSource(data as SourceRow);
  }

  /**
   * Update an existing source by id.
   */
  async updateSource(id: string, dto: UpdateSourceDto): Promise<CrawlerSource> {
    this.logger.log(`[Crawler] Updating source ${id}`);

    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates['name'] = dto.name;
    if (dto.url !== undefined) updates['url'] = dto.url;
    if (dto.description !== undefined) updates['description'] = dto.description;
    if (dto.sourceType !== undefined) updates['source_type'] = dto.sourceType;
    if (dto.crawlFrequencyMinutes !== undefined) updates['crawl_frequency_minutes'] = dto.crawlFrequencyMinutes;
    if (dto.crawlConfig !== undefined) updates['crawl_config'] = dto.crawlConfig;
    if (dto.isActive !== undefined) updates['is_active'] = dto.isActive;
    if (dto.isTest !== undefined) updates['is_test'] = dto.isTest;
    updates['updated_at'] = new Date().toISOString();

    const { data, error } = await this.db
      .from('crawler', 'sources')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update source ${id}: ${error.message}`);
    }

    return mapRowToSource(data as SourceRow);
  }

  /**
   * Soft-delete a source by setting is_active = false.
   */
  async deleteSource(id: string): Promise<{ success: boolean }> {
    this.logger.log(`[Crawler] Soft-deleting source ${id}`);

    const { error } = await this.db
      .from('crawler', 'sources')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete source ${id}: ${error.message}`);
    }

    return { success: true };
  }

  /**
   * Fetch recent crawl history for a source.
   */
  async getCrawls(sourceId: string, limit = 10): Promise<SourceCrawl[]> {
    this.logger.log(`[Crawler] Fetching crawls for source ${sourceId}`);

    const { data, error } = await this.db
      .from('crawler', 'source_crawls')
      .select('*')
      .eq('source_id', sourceId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch crawls for source ${sourceId}: ${error.message}`);
    }

    return ((data ?? []) as SourceCrawlRow[]).map(mapRowToSourceCrawl);
  }

  /**
   * Fetch articles for a source with optional since filter.
   */
  async getArticles(
    sourceId: string,
    params?: { limit?: number; since?: string },
  ): Promise<CrawlerArticle[]> {
    this.logger.log(`[Crawler] Fetching articles for source ${sourceId}`);

    const limit = params?.limit ?? 50;

    let query = this.db
      .from('crawler', 'articles')
      .select('*')
      .eq('source_id', sourceId);

    if (params?.since) {
      query = query.gt('first_seen_at', params.since);
    }

    query = query
      .order('first_seen_at', { ascending: false })
      .limit(limit);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch articles for source ${sourceId}: ${error.message}`);
    }

    return ((data ?? []) as ArticleRow[]).map(mapRowToArticle);
  }

  /**
   * Aggregate summary for a single source: article count, latest crawl,
   * average articles per crawl, and dedup totals from recent crawls.
   */
  async getSourceSummary(sourceId: string): Promise<SourceSummary> {
    this.logger.log(`[Crawler] Fetching summary for source ${sourceId}`);

    const { data, error } = await this.db.rawQuery(
      `
      SELECT
        s.id                                                                AS source_id,
        s.name                                                              AS source_name,
        COUNT(DISTINCT a.id)::int                                           AS total_articles,
        MAX(sc.started_at)                                                  AS latest_crawl_at,
        COALESCE(AVG(sc.articles_new), 0)::float                           AS avg_articles_per_crawl,
        COALESCE(SUM(sc.duplicates_exact), 0)::int                         AS dedup_exact,
        COALESCE(SUM(sc.duplicates_cross_source), 0)::int                  AS dedup_cross_source,
        COALESCE(SUM(sc.duplicates_fuzzy_title), 0)::int                   AS dedup_fuzzy_title,
        COALESCE(SUM(sc.duplicates_phrase_overlap), 0)::int                AS dedup_phrase_overlap
      FROM crawler.sources s
      LEFT JOIN crawler.articles a ON a.source_id = s.id
      LEFT JOIN crawler.source_crawls sc ON sc.source_id = s.id
      WHERE s.id = $1
      GROUP BY s.id, s.name
      `,
      [sourceId],
    );

    if (error) {
      throw new Error(`Failed to fetch summary for source ${sourceId}: ${error.message}`);
    }

    const row = ((data as Record<string, unknown>[]) ?? [])[0];

    if (!row) {
      throw new Error(`Source ${sourceId} not found`);
    }

    return {
      sourceId: row['source_id'] as string,
      sourceName: row['source_name'] as string,
      totalArticles: Number(row['total_articles'] ?? 0),
      latestCrawlAt: (row['latest_crawl_at'] as string) ?? null,
      avgArticlesPerCrawl: Math.round(Number(row['avg_articles_per_crawl'] ?? 0) * 10) / 10,
      totalDedup: {
        exact: Number(row['dedup_exact'] ?? 0),
        crossSource: Number(row['dedup_cross_source'] ?? 0),
        fuzzyTitle: Number(row['dedup_fuzzy_title'] ?? 0),
        phraseOverlap: Number(row['dedup_phrase_overlap'] ?? 0),
      },
    };
  }
}
