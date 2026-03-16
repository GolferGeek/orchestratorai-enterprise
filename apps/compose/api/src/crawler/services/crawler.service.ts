import { Injectable, Logger } from '@nestjs/common';
import {
  CrawlerSourceRepository,
  ArticleRepository,
  SourceCrawlRepository,
} from '../repositories';
import {
  DeduplicationService,
  DEFAULT_DEDUP_CONFIG,
} from './deduplication.service';
import {
  Source,
  CreateSourceData,
  CrawlFrequency,
  SourceDueForCrawl,
  Article,
  CreateArticleData,
  SourceCrawl,
  CrawlResult,
} from '../interfaces';

/**
 * CrawlerService - Central crawling infrastructure
 *
 * Provides:
 * - Source management (findOrCreate)
 * - Crawl orchestration
 * - Article storage with 4-layer deduplication
 *
 * Agents subscribe to sources and pull articles on their own schedule.
 */
@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(
    private readonly sourceRepository: CrawlerSourceRepository,
    private readonly articleRepository: ArticleRepository,
    private readonly sourceCrawlRepository: SourceCrawlRepository,
    private readonly deduplicationService: DeduplicationService,
  ) {}

  // ==========================================================================
  // SOURCE MANAGEMENT
  // ==========================================================================

  /**
   * Find or create a source by URL
   * Used by agents when adding a new source - prevents duplicate sources
   */
  async findOrCreateSource(sourceData: CreateSourceData): Promise<Source> {
    return this.sourceRepository.findOrCreate(sourceData);
  }

  /**
   * Find source by ID
   */
  async findSourceById(id: string): Promise<Source | null> {
    return this.sourceRepository.findById(id);
  }

  /**
   * Find all sources for an organization
   */
  async findAllSources(organizationSlug: string): Promise<Source[]> {
    return this.sourceRepository.findAll(organizationSlug);
  }

  /**
   * Find sources due for crawling
   */
  async findSourcesDueForCrawl(
    frequency?: CrawlFrequency,
  ): Promise<SourceDueForCrawl[]> {
    return this.sourceRepository.findDueForCrawl(frequency);
  }

  /**
   * Update source after successful crawl
   */
  async markSourceCrawlSuccess(sourceId: string): Promise<void> {
    return this.sourceRepository.markCrawlSuccess(sourceId);
  }

  /**
   * Update source after failed crawl
   */
  async markSourceCrawlError(
    sourceId: string,
    errorMessage: string,
  ): Promise<void> {
    return this.sourceRepository.markCrawlError(sourceId, errorMessage);
  }

  // ==========================================================================
  // ARTICLE MANAGEMENT
  // ==========================================================================

  /**
   * Store a crawled article with deduplication
   *
   * @returns The article (new or existing) and whether it was new
   */
  async storeArticle(
    articleData: CreateArticleData,
    dedupConfig: typeof DEFAULT_DEDUP_CONFIG = DEFAULT_DEDUP_CONFIG,
  ): Promise<{
    article: Article;
    isNew: boolean;
    duplicateType?: 'exact' | 'cross_source' | 'fuzzy_title' | 'phrase_overlap';
  }> {
    // Check for duplicates using 4-layer deduplication
    const dedupResult = await this.deduplicationService.checkDuplicate(
      articleData.organization_slug,
      articleData.source_id,
      articleData.content_hash,
      articleData.title ?? '',
      articleData.content ?? '',
      dedupConfig,
    );

    if (dedupResult.is_duplicate) {
      // Return existing article
      const existingArticle = dedupResult.existing_article_id
        ? await this.articleRepository.findById(dedupResult.existing_article_id)
        : null;

      return {
        article: existingArticle ?? ({} as Article),
        isNew: false,
        duplicateType: dedupResult.duplicate_type,
      };
    }

    // Generate fingerprint data
    const titleNormalized = articleData.title
      ? this.deduplicationService.normalizeTitle(articleData.title)
      : null;
    const keyPhrases = articleData.title
      ? this.deduplicationService.extractKeyPhrases(
          articleData.title,
          articleData.content ?? '',
        )
      : null;
    const fingerprintHash =
      keyPhrases && keyPhrases.length > 0
        ? this.deduplicationService.generateFingerprintHash(keyPhrases)
        : null;

    // Create new article with fingerprint data
    const article = await this.articleRepository.create({
      ...articleData,
      title_normalized: titleNormalized,
      key_phrases: keyPhrases,
      fingerprint_hash: fingerprintHash,
    });

    return { article, isNew: true };
  }

  /**
   * Find new articles for a source since a given timestamp
   * Used by agents to pull new articles
   */
  async findNewArticlesForSource(
    sourceId: string,
    since: Date,
    limit: number = 100,
  ): Promise<Article[]> {
    return this.articleRepository.findNewForSource(sourceId, since, limit);
  }

  /**
   * Find new articles for multiple sources
   * Used for efficient batch pulling across subscriptions
   */
  async findNewArticlesForSources(
    sourceIds: string[],
    since: Date,
    limit: number = 100,
  ): Promise<Article[]> {
    return this.articleRepository.findNewForSources(sourceIds, since, limit);
  }

  // ==========================================================================
  // CRAWL MANAGEMENT
  // ==========================================================================

  /**
   * Start a crawl (create crawl record)
   */
  async startCrawl(sourceId: string): Promise<SourceCrawl> {
    return this.sourceCrawlRepository.create({ source_id: sourceId });
  }

  /**
   * Complete a crawl with success metrics
   */
  async completeCrawlSuccess(
    crawlId: string,
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
    return this.sourceCrawlRepository.markSuccess(crawlId, metrics);
  }

  /**
   * Complete a crawl with error
   */
  async completeCrawlError(
    crawlId: string,
    errorMessage: string,
    durationMs?: number,
  ): Promise<SourceCrawl> {
    return this.sourceCrawlRepository.markError(
      crawlId,
      errorMessage,
      durationMs,
    );
  }

  /**
   * Crawl a source and store articles
   *
   * This is a high-level method that:
   * 1. Creates a crawl record
   * 2. Processes items and stores articles with deduplication
   * 3. Updates crawl metrics
   *
   * NOTE: The actual HTTP fetching (Firecrawl, RSS) is done by the caller.
   * This method handles storage and deduplication.
   *
   * @param source - Source being crawled
   * @param items - Items fetched from the source
   * @returns Crawl result with new articles
   */
  async crawlSource(
    source: Source,
    items: Array<{
      url: string;
      title?: string;
      content?: string;
      summary?: string;
      author?: string;
      published_at?: string;
      raw_data?: Record<string, unknown>;
    }> = [],
  ): Promise<{
    result: { success: boolean; error?: string };
    articles_found: number;
    articles_new: number;
    new_articles: Article[];
  }> {
    const startTime = Date.now();

    // Create crawl record
    const crawl = await this.startCrawl(source.id);

    try {
      // Process items and store articles
      const processResult = await this.processCrawledItems(
        source.id,
        source.organization_slug,
        items,
      );

      // Complete crawl with success
      await this.completeCrawlSuccess(crawl.id, {
        articles_found: processResult.articles_found,
        articles_new: processResult.articles_new,
        duplicates_exact: processResult.duplicates.exact,
        duplicates_cross_source: processResult.duplicates.cross_source,
        duplicates_fuzzy_title: processResult.duplicates.fuzzy_title,
        duplicates_phrase_overlap: processResult.duplicates.phrase_overlap,
        crawl_duration_ms: Date.now() - startTime,
      });

      return {
        result: { success: true },
        articles_found: processResult.articles_found,
        articles_new: processResult.articles_new,
        new_articles: processResult.new_articles,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Complete crawl with error
      await this.completeCrawlError(
        crawl.id,
        errorMessage,
        Date.now() - startTime,
      );

      return {
        result: { success: false, error: errorMessage },
        articles_found: 0,
        articles_new: 0,
        new_articles: [],
      };
    }
  }

  /**
   * Process crawled items and store as articles
   *
   * @param sourceId - Source that was crawled
   * @param organizationSlug - Organization slug
   * @param items - Crawled items to process
   * @returns CrawlResult with statistics
   */
  async processCrawledItems(
    sourceId: string,
    organizationSlug: string,
    items: Array<{
      url: string;
      title?: string;
      content?: string;
      summary?: string;
      author?: string;
      published_at?: string;
      raw_data?: Record<string, unknown>;
    }>,
  ): Promise<CrawlResult> {
    const result: CrawlResult = {
      source_id: sourceId,
      articles_found: items.length,
      articles_new: 0,
      duplicates: {
        exact: 0,
        cross_source: 0,
        fuzzy_title: 0,
        phrase_overlap: 0,
      },
      new_articles: [],
      errors: [],
    };

    for (const item of items) {
      try {
        // Generate content hash
        const contentToHash = `${item.title ?? ''}|${item.content ?? ''}|${item.url}`;
        const contentHash =
          this.deduplicationService.generateContentHash(contentToHash);

        // Store with deduplication
        const { article, isNew, duplicateType } = await this.storeArticle({
          organization_slug: organizationSlug,
          source_id: sourceId,
          url: item.url,
          title: item.title ?? null,
          content: item.content ?? null,
          summary: item.summary ?? null,
          author: item.author ?? null,
          published_at: item.published_at ?? null,
          content_hash: contentHash,
          raw_data: item.raw_data ?? null,
        });

        if (isNew) {
          result.articles_new++;
          result.new_articles.push(article);
        } else if (duplicateType) {
          result.duplicates[duplicateType]++;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(
          `Failed to process item ${item.url}: ${errorMessage}`,
        );
        this.logger.error(`Failed to process crawled item: ${errorMessage}`);
      }
    }

    return result;
  }
}
