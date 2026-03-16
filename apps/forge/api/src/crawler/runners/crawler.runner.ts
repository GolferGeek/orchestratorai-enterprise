import { Injectable, Logger } from '@nestjs/common';
import { CrawlerService } from '../services/crawler.service';
import { CrawlerSourceRepository } from '../repositories/source.repository';
import { CrawlFrequency, Source } from '../interfaces';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';
import * as Parser from 'rss-parser';

// Extended RSS item type with common fields not in the base Parser.Item
interface RssItem extends Parser.Item {
  description?: string;
  author?: string;
  'content:encoded'?: string;
  guid?: string;
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  creator?: string;
  pubDate?: string;
  isoDate?: string;
}

/**
 * CrawlerRunner - Central Source Crawler
 *
 * Crawls sources and stores articles in crawler.articles for shared access.
 * This is the central crawling infrastructure used by all agents.
 *
 * Flow:
 * 1. Get sources due for crawl from crawler.sources
 * 2. Fetch content (Firecrawl, RSS, API)
 * 3. Store articles in crawler.articles with deduplication
 *
 * Agents pull articles from crawler.articles on their own schedule.
 *
 * Schedule:
 * - 5 min: Breaking news sources
 * - 10 min: High-priority sources
 * - 15 min: Default frequency
 * - 30 min: Regular sources
 * - 60 min: Hourly sources
 */
@Injectable()
export class CrawlerRunner {
  private readonly logger = new Logger(CrawlerRunner.name);
  private readonly rssParser = new Parser({
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; OrchestratorAI/1.0; +https://orchestrator.ai)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    timeout: 30000,
  });
  private isRunning: Record<CrawlFrequency, boolean> = {
    5: false,
    10: false,
    15: false,
    30: false,
    60: false,
  };

  constructor(
    private readonly crawlerSourceRepository: CrawlerSourceRepository,
    private readonly crawlerService: CrawlerService,
    private readonly observabilityEventsService: ObservabilityEventsService,
  ) {}

  /**
   * Crawl all sources with a specific frequency
   */
  async crawlByFrequency(frequency: CrawlFrequency): Promise<{
    total: number;
    successful: number;
    failed: number;
    articlesNew: number;
  }> {
    // Prevent overlapping runs for same frequency
    if (this.isRunning[frequency]) {
      this.logger.warn(
        `Skipping ${frequency}-min crawl - previous run still in progress`,
      );
      return { total: 0, successful: 0, failed: 0, articlesNew: 0 };
    }

    this.isRunning[frequency] = true;
    const startTime = Date.now();

    // Create execution context for observability
    const ctx: ExecutionContext = {
      orgSlug: 'system',
      userId: NIL_UUID,
      conversationId: NIL_UUID,
      taskId: `crawl-${frequency}min-${Date.now()}`,
      planId: NIL_UUID,
      deliverableId: NIL_UUID,
      agentSlug: 'crawler-runner',
      agentType: 'runner',
      provider: NIL_UUID,
      model: NIL_UUID,
    };

    this.logger.log(`Starting ${frequency}-minute source crawl`);

    // Emit source.crawl.started event
    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'crawler',
      hook_event_type: 'source.crawl.started',
      status: 'started',
      message: `Starting ${frequency}-minute source crawl`,
      progress: 0,
      step: 'crawl-started',
      payload: {
        frequency,
        crawlType: 'scheduled',
        schema: 'crawler',
      },
      timestamp: Date.now(),
    });

    let total = 0;
    let successful = 0;
    let failed = 0;
    let articlesNew = 0;

    try {
      // Get sources due for crawl from crawler.sources
      const sourcesDue =
        await this.crawlerSourceRepository.findDueForCrawl(frequency);
      total = sourcesDue.length;

      if (total === 0) {
        this.logger.debug(`No ${frequency}-min sources due for crawl`);
        return { total: 0, successful: 0, failed: 0, articlesNew: 0 };
      }

      this.logger.log(`Found ${total} sources due for ${frequency}-min crawl`);

      // Process each source
      for (const sourceDue of sourcesDue) {
        try {
          const result = await this.crawlSource(sourceDue.source_id);
          if (result.success) {
            successful++;
            articlesNew += result.articlesNew;
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
          this.logger.error(
            `Error crawling source ${sourceDue.source_id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Completed ${frequency}-min crawl: ${successful}/${total} successful, ` +
          `${articlesNew} new articles (${duration}ms)`,
      );

      // Emit source.crawl.completed event
      await this.observabilityEventsService.push({
        context: ctx,
        source_app: 'crawler',
        hook_event_type: 'source.crawl.completed',
        status: 'completed',
        message: `Completed ${frequency}-min crawl: ${successful}/${total} successful, ${articlesNew} new articles`,
        progress: 100,
        step: 'crawl-completed',
        payload: {
          frequency,
          total,
          successful,
          failed,
          articlesNew,
          durationMs: duration,
        },
        timestamp: Date.now(),
      });

      return { total, successful, failed, articlesNew };
    } finally {
      this.isRunning[frequency] = false;
    }
  }

  /**
   * Crawl a single source and store articles in crawler.articles
   */
  private async crawlSource(sourceId: string): Promise<{
    success: boolean;
    articlesNew: number;
  }> {
    try {
      // Get the full source record
      const source = await this.crawlerSourceRepository.findById(sourceId);
      if (!source) {
        this.logger.warn(`Source not found: ${sourceId}`);
        return { success: false, articlesNew: 0 };
      }

      // Fetch content based on source type
      let items: Array<{
        url: string;
        title?: string;
        content?: string;
        summary?: string;
        author?: string;
        published_at?: string;
        raw_data?: Record<string, unknown>;
      }> = [];

      try {
        switch (source.source_type) {
          case 'rss':
            items = await this.fetchRssItems(source);
            break;
          case 'web':
            items = await this.fetchWebItems(source);
            break;
          case 'api':
            items = await this.fetchApiItems(source);
            break;
          default:
            this.logger.warn(`Unsupported source type: ${source.source_type}`);
            return { success: false, articlesNew: 0 };
        }
      } catch (fetchError) {
        const errorMessage =
          fetchError instanceof Error
            ? fetchError.message
            : 'Unknown fetch error';
        this.logger.error(
          `Failed to fetch from source ${source.name}: ${errorMessage}`,
        );
        await this.crawlerSourceRepository.markCrawlError(
          sourceId,
          errorMessage,
        );
        return { success: false, articlesNew: 0 };
      }

      // Store articles in crawler.articles via CrawlerService
      const crawlResult = await this.crawlerService.crawlSource(source, items);

      if (!crawlResult.result.success) {
        await this.crawlerSourceRepository.markCrawlError(
          sourceId,
          crawlResult.result.error || 'Crawl failed',
        );
        return { success: false, articlesNew: 0 };
      }

      // Mark source as successfully crawled
      await this.crawlerSourceRepository.markCrawlSuccess(sourceId);

      this.logger.debug(
        `Source ${source.name}: ${crawlResult.articles_found} found, ${crawlResult.articles_new} new`,
      );

      return {
        success: true,
        articlesNew: crawlResult.articles_new,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error crawling source ${sourceId}: ${message}`);
      return { success: false, articlesNew: 0 };
    }
  }

  /**
   * Fetch items from an RSS feed
   */
  private async fetchRssItems(source: Source): Promise<
    Array<{
      url: string;
      title?: string;
      content?: string;
      summary?: string;
      author?: string;
      published_at?: string;
      raw_data?: Record<string, unknown>;
    }>
  > {
    const feed = await this.rssParser.parseURL(source.url);

    return (feed.items || []).map((item: RssItem) => ({
      url: item.link || item.guid || '',
      title: item.title || undefined,
      content:
        item.content ||
        item['content:encoded'] ||
        item.description ||
        undefined,
      summary: item.contentSnippet || item.description || undefined,
      author: item.creator || item.author || undefined,
      published_at: item.pubDate || item.isoDate || undefined,
      raw_data: item as Record<string, unknown>,
    }));
  }

  /**
   * Fetch items from a web page
   * NOTE: Firecrawl integration would be added here
   */
  private fetchWebItems(source: Source): Promise<
    Array<{
      url: string;
      title?: string;
      content?: string;
      summary?: string;
      raw_data?: Record<string, unknown>;
    }>
  > {
    // For now, just return the URL - Firecrawl would be integrated here
    // The prediction-runner has Firecrawl service, but crawler module should
    // eventually have its own or share via a common service
    this.logger.debug(
      `Web crawling not yet implemented in central crawler for: ${source.url}`,
    );
    return Promise.resolve([
      {
        url: source.url,
        title: undefined,
        content: undefined,
        summary: undefined,
        raw_data: {},
      },
    ]);
  }

  /**
   * Fetch items from an API endpoint
   */
  private async fetchApiItems(source: Source): Promise<
    Array<{
      url: string;
      title?: string;
      content?: string;
      raw_data?: Record<string, unknown>;
    }>
  > {
    // Basic API fetch - can be enhanced with auth_config
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Try to extract items from common API response patterns
    const items = (
      Array.isArray(data)
        ? data
        : (data.items as unknown[]) ||
          (data.articles as unknown[]) ||
          (data.results as unknown[]) || [data]
    ) as Record<string, unknown>[];

    return items.map((item) => ({
      url: (item.url || item.link || source.url) as string,
      title: (item.title || item.headline) as string | undefined,
      content: (item.content || item.body || item.text) as string | undefined,
      raw_data: item,
    }));
  }

  /**
   * Manually trigger a crawl for a specific source (for testing/debugging)
   */
  async crawlSingleSource(sourceId: string): Promise<{
    success: boolean;
    articlesNew: number;
    error?: string;
  }> {
    try {
      return await this.crawlSource(sourceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, articlesNew: 0, error: message };
    }
  }
}
