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

// ─── Public response shapes ──────────────────────────────────────────────────

export interface CrawlerSource extends SourceRow {
  articleCount: number;
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
  organization_slug: string;
  description?: string;
  source_type?: string;
  crawl_frequency_minutes?: number;
  crawl_config?: Record<string, unknown>;
  is_active?: boolean;
  is_test?: boolean;
}

export interface UpdateSourceDto {
  name?: string;
  url?: string;
  description?: string;
  source_type?: string;
  crawl_frequency_minutes?: number;
  crawl_config?: Record<string, unknown>;
  is_active?: boolean;
  is_test?: boolean;
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
    return rows.map((row) => ({
      ...(row as unknown as SourceRow),
      articleCount: Number(row['article_count'] ?? 0),
    }));
  }

  /**
   * Fetch a single source by id.
   */
  async getSource(id: string): Promise<SourceRow> {
    this.logger.log(`[Crawler] Fetching source ${id}`);

    const { data, error } = await this.db
      .from('crawler', 'sources')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch source ${id}: ${error.message}`);
    }

    return data as SourceRow;
  }

  /**
   * Insert a new source.
   */
  async createSource(dto: CreateSourceDto): Promise<SourceRow> {
    this.logger.log(`[Crawler] Creating source "${dto.name}"`);

    const { data, error } = await this.db
      .from('crawler', 'sources')
      .insert({
        name: dto.name,
        url: dto.url,
        organization_slug: dto.organization_slug,
        description: dto.description ?? null,
        source_type: dto.source_type ?? 'web',
        crawl_frequency_minutes: dto.crawl_frequency_minutes ?? 60,
        crawl_config: dto.crawl_config ?? {},
        is_active: dto.is_active ?? true,
        is_test: dto.is_test ?? false,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create source: ${error.message}`);
    }

    return data as SourceRow;
  }

  /**
   * Update an existing source by id.
   */
  async updateSource(id: string, dto: UpdateSourceDto): Promise<SourceRow> {
    this.logger.log(`[Crawler] Updating source ${id}`);

    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates['name'] = dto.name;
    if (dto.url !== undefined) updates['url'] = dto.url;
    if (dto.description !== undefined) updates['description'] = dto.description;
    if (dto.source_type !== undefined) updates['source_type'] = dto.source_type;
    if (dto.crawl_frequency_minutes !== undefined) updates['crawl_frequency_minutes'] = dto.crawl_frequency_minutes;
    if (dto.crawl_config !== undefined) updates['crawl_config'] = dto.crawl_config;
    if (dto.is_active !== undefined) updates['is_active'] = dto.is_active;
    if (dto.is_test !== undefined) updates['is_test'] = dto.is_test;
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

    return data as SourceRow;
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
  async getCrawls(sourceId: string, limit = 10): Promise<SourceCrawlRow[]> {
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

    return (data ?? []) as SourceCrawlRow[];
  }

  /**
   * Fetch articles for a source with optional since filter.
   */
  async getArticles(
    sourceId: string,
    params?: { limit?: number; since?: string },
  ): Promise<ArticleRow[]> {
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

    return (data ?? []) as ArticleRow[];
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
