import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Inject,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
  Headers,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Public } from '@/auth/decorators/public.decorator';
import { CrawlerSourceRepository } from './repositories/source.repository';
import { ArticleRepository } from './repositories/article.repository';
import { SourceCrawlRepository } from './repositories/source-crawl.repository';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  Source,
  CreateSourceData,
  UpdateSourceData,
  Article,
  SourceCrawl,
  CrawlFrequency,
} from './interfaces';
import { CrawlerRunner } from './runners/crawler.runner';

/**
 * Predictor summary for article display
 */
interface PredictorSummary {
  id: string;
  symbol: string;
  target_id: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  confidence: number;
  analyst_slug: string;
  created_at: string;
}

/**
 * Article with associated predictors
 */
interface ArticleWithPredictors extends Article {
  predictors: PredictorSummary[];
}

/**
 * Helper to validate org slug from header
 */
function getOrgSlug(orgHeader?: string): string {
  if (!orgHeader) {
    throw new BadRequestException(
      'x-organization-slug header is required for crawler operations',
    );
  }
  return orgHeader;
}

/**
 * DTOs for request/response
 */
interface SubscriptionInfoDto {
  agent_type: 'prediction' | 'risk';
  subscription_id: string;
  target_name?: string;
  scope_name?: string;
  is_active: boolean;
  last_processed_at: string | null;
}

interface SourceWithSubscriptionsDto extends Source {
  article_count: number;
  subscriptions: SubscriptionInfoDto[];
  crawl_stats: {
    total_crawls: number;
    successful_crawls: number;
    total_articles_found: number;
    total_articles_new: number;
    total_duplicates: number;
    avg_duration_ms: number;
  };
}

interface DashboardStatsDto {
  total_sources: number;
  active_sources: number;
  total_articles: number;
  articles_today: number;
  total_crawls_24h: number;
  successful_crawls_24h: number;
  deduplication_stats: {
    exact: number;
    cross_source: number;
    fuzzy_title: number;
    phrase_overlap: number;
  };
}

interface CreateSourceDto {
  name: string;
  description?: string;
  source_type: 'web' | 'rss' | 'twitter_search' | 'api' | 'test_db';
  url: string;
  crawl_config?: {
    selector?: string;
    wait_for_element?: string;
  };
  crawl_frequency_minutes?: 5 | 10 | 15 | 30 | 60;
  is_test?: boolean;
}

interface UpdateSourceDto {
  name?: string;
  description?: string;
  source_type?: 'web' | 'rss' | 'twitter_search' | 'api' | 'test_db';
  url?: string;
  crawl_config?: {
    selector?: string;
    wait_for_element?: string;
  };
  crawl_frequency_minutes?: 5 | 10 | 15 | 30 | 60;
  is_active?: boolean;
  is_test?: boolean;
}

/**
 * CrawlerAdminController - Admin endpoints for central crawler management
 *
 * Provides unified admin view across all agents (prediction, risk, marketing)
 * for managing shared crawling infrastructure.
 */
@Controller('api/crawler/admin')
@UseGuards(JwtAuthGuard)
export class CrawlerAdminController {
  private readonly logger = new Logger(CrawlerAdminController.name);

  constructor(
    private readonly sourceRepository: CrawlerSourceRepository,
    private readonly articleRepository: ArticleRepository,
    private readonly sourceCrawlRepository: SourceCrawlRepository,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    @Optional() private readonly crawlerRunner?: CrawlerRunner,
  ) {}

  /**
   * Get predictors for a list of article IDs
   */
  private async getPredictorsForArticles(
    articleIds: string[],
  ): Promise<Map<string, PredictorSummary[]>> {
    if (articleIds.length === 0) return new Map();

    const { data, error } = (await this.db
      .from('prediction', 'predictors')
      .select(
        `
        id,
        article_id,
        target_id,
        direction,
        strength,
        confidence,
        analyst_slug,
        created_at,
        targets:target_id (symbol)
      `,
      )
      .in('article_id', articleIds)
      .eq('status', 'active')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to fetch predictors: ${error.message}`);
      return new Map();
    }

    const predictorMap = new Map<string, PredictorSummary[]>();
    for (const predictor of (data as Record<string, unknown>[]) || []) {
      const articleId = predictor.article_id as string;
      if (!articleId) continue;

      if (!predictorMap.has(articleId)) {
        predictorMap.set(articleId, []);
      }
      // Supabase join returns single object for singular FK relationship
      const target = predictor.targets as { symbol: string } | null;

      predictorMap.get(articleId)!.push({
        id: predictor.id as string,
        symbol: target?.symbol || 'Unknown',
        target_id: predictor.target_id as string,
        direction: predictor.direction as 'bullish' | 'bearish' | 'neutral',
        strength: predictor.strength as number,
        confidence: predictor.confidence as number,
        analyst_slug: predictor.analyst_slug as string,
        created_at: predictor.created_at as string,
      });
    }

    // Sort predictors by symbol within each article group
    for (const predictors of predictorMap.values()) {
      predictors.sort((a, b) => a.symbol.localeCompare(b.symbol));
    }

    return predictorMap;
  }

  /**
   * Get dashboard statistics
   */
  @Get('stats')
  async getDashboardStats(
    @Headers('x-organization-slug') orgHeader?: string,
  ): Promise<DashboardStatsDto> {
    const orgSlug = getOrgSlug(orgHeader);

    try {
      // Get all sources for org
      const allSources =
        await this.sourceRepository.findAllForDashboard(orgSlug);
      const activeSources = allSources.filter((s) => s.is_active);

      // Get article counts
      let totalArticles = 0;
      for (const source of allSources) {
        const count = await this.articleRepository.countForSource(source.id);
        totalArticles += count;
      }

      // Get 24h crawl stats
      let totalCrawls24h = 0;
      let successfulCrawls24h = 0;
      let dedupExact = 0;
      let dedupCrossSource = 0;
      let dedupFuzzyTitle = 0;
      let dedupPhraseOverlap = 0;

      for (const source of allSources) {
        const stats = await this.sourceCrawlRepository.getStatsForSource(
          source.id,
          1, // 1 day
        );
        totalCrawls24h += stats.total_crawls;
        successfulCrawls24h += stats.successful_crawls;
      }

      // Get recent crawls for dedup stats
      for (const source of allSources) {
        const recentCrawls =
          await this.sourceCrawlRepository.findRecentForSource(source.id, 20);
        for (const crawl of recentCrawls) {
          dedupExact += crawl.duplicates_exact;
          dedupCrossSource += crawl.duplicates_cross_source;
          dedupFuzzyTitle += crawl.duplicates_fuzzy_title;
          dedupPhraseOverlap += crawl.duplicates_phrase_overlap;
        }
      }

      return {
        total_sources: allSources.length,
        active_sources: activeSources.length,
        total_articles: totalArticles,
        articles_today: 0, // Would need additional query
        total_crawls_24h: totalCrawls24h,
        successful_crawls_24h: successfulCrawls24h,
        deduplication_stats: {
          exact: dedupExact,
          cross_source: dedupCrossSource,
          fuzzy_title: dedupFuzzyTitle,
          phrase_overlap: dedupPhraseOverlap,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get dashboard stats: ${String(error)}`);
      throw new HttpException(
        'Failed to get dashboard stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all sources with stats and subscriptions
   */
  @Get('sources')
  async getSources(
    @Headers('x-organization-slug') orgHeader?: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<SourceWithSubscriptionsDto[]> {
    const orgSlug = getOrgSlug(orgHeader);

    try {
      const sources =
        includeInactive === 'true'
          ? await this.sourceRepository.findAllForDashboard(orgSlug)
          : await this.sourceRepository.findAll(orgSlug);

      const result: SourceWithSubscriptionsDto[] = [];

      for (const source of sources) {
        const articleCount = await this.articleRepository.countForSource(
          source.id,
        );
        const crawlStats = await this.sourceCrawlRepository.getStatsForSource(
          source.id,
          7,
        );

        // TODO: Query subscriptions from prediction.source_subscriptions
        // and risk.source_subscriptions tables
        const subscriptions: SubscriptionInfoDto[] = [];

        result.push({
          ...source,
          article_count: articleCount,
          subscriptions,
          crawl_stats: crawlStats,
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to get sources: ${String(error)}`);
      throw new HttpException(
        'Failed to get sources',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get a single source with full details
   */
  @Get('sources/:id')
  async getSource(
    @Headers('x-organization-slug') orgHeader?: string,
    @Param('id') id?: string,
  ): Promise<SourceWithSubscriptionsDto> {
    const orgSlug = getOrgSlug(orgHeader);

    if (!id) {
      throw new BadRequestException('Source ID is required');
    }

    try {
      const source = await this.sourceRepository.findById(id);
      if (!source) {
        throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
      }

      if (source.organization_slug !== orgSlug) {
        throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
      }

      const articleCount = await this.articleRepository.countForSource(id);
      const crawlStats = await this.sourceCrawlRepository.getStatsForSource(
        id,
        7,
      );

      // TODO: Query subscriptions
      const subscriptions: SubscriptionInfoDto[] = [];

      return {
        ...source,
        article_count: articleCount,
        subscriptions,
        crawl_stats: crawlStats,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to get source: ${String(error)}`);
      throw new HttpException(
        'Failed to get source',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Create a new source
   */
  @Post('sources')
  async createSource(
    @Headers('x-organization-slug') orgHeader?: string,
    @Body() body?: CreateSourceDto,
  ): Promise<Source> {
    const orgSlug = getOrgSlug(orgHeader);

    if (!body) {
      throw new BadRequestException('Request body is required');
    }

    try {
      const sourceData: CreateSourceData = {
        organization_slug: orgSlug,
        name: body.name,
        description: body.description ?? null,
        source_type: body.source_type,
        url: body.url,
        crawl_config: body.crawl_config ?? {},
        crawl_frequency_minutes: body.crawl_frequency_minutes ?? 60,
        is_test: body.is_test ?? false,
        is_active: true,
      };

      // Use findOrCreate to prevent duplicates
      const source = await this.sourceRepository.findOrCreate(sourceData);
      this.logger.log(`Created/found source: ${source.name} (${source.id})`);

      return source;
    } catch (error) {
      this.logger.error(`Failed to create source: ${String(error)}`);
      throw new HttpException(
        'Failed to create source',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update a source
   */
  @Put('sources/:id')
  async updateSource(
    @Headers('x-organization-slug') orgHeader?: string,
    @Param('id') id?: string,
    @Body() body?: UpdateSourceDto,
  ): Promise<Source> {
    const orgSlug = getOrgSlug(orgHeader);

    if (!id) {
      throw new BadRequestException('Source ID is required');
    }

    if (!body) {
      throw new BadRequestException('Request body is required');
    }

    try {
      // Verify ownership
      const existing = await this.sourceRepository.findById(id);
      if (!existing || existing.organization_slug !== orgSlug) {
        throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
      }

      const updateData: UpdateSourceData = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined)
        updateData.description = body.description;
      if (body.source_type !== undefined)
        updateData.source_type = body.source_type;
      if (body.url !== undefined) updateData.url = body.url;
      if (body.crawl_config !== undefined)
        updateData.crawl_config = body.crawl_config;
      if (body.crawl_frequency_minutes !== undefined)
        updateData.crawl_frequency_minutes = body.crawl_frequency_minutes;
      if (body.is_active !== undefined) updateData.is_active = body.is_active;
      if (body.is_test !== undefined) updateData.is_test = body.is_test;

      const source = await this.sourceRepository.update(id, updateData);
      return source;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to update source: ${String(error)}`);
      throw new HttpException(
        'Failed to update source',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete a source (soft delete - sets is_active = false)
   */
  @Delete('sources/:id')
  async deleteSource(
    @Headers('x-organization-slug') orgHeader?: string,
    @Param('id') id?: string,
  ): Promise<{ success: boolean }> {
    const orgSlug = getOrgSlug(orgHeader);

    if (!id) {
      throw new BadRequestException('Source ID is required');
    }

    try {
      // Verify ownership
      const existing = await this.sourceRepository.findById(id);
      if (!existing || existing.organization_slug !== orgSlug) {
        throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
      }

      // Soft delete
      await this.sourceRepository.update(id, { is_active: false });
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to delete source: ${String(error)}`);
      throw new HttpException(
        'Failed to delete source',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get recent crawl history for a source
   */
  @Get('sources/:id/crawls')
  async getSourceCrawls(
    @Headers('x-organization-slug') orgHeader?: string,
    @Param('id') id?: string,
    @Query('limit') limit?: string,
  ): Promise<SourceCrawl[]> {
    const orgSlug = getOrgSlug(orgHeader);

    if (!id) {
      throw new BadRequestException('Source ID is required');
    }

    try {
      // Verify ownership
      const existing = await this.sourceRepository.findById(id);
      if (!existing || existing.organization_slug !== orgSlug) {
        throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
      }

      const crawls = await this.sourceCrawlRepository.findRecentForSource(
        id,
        limit ? parseInt(limit, 10) : 10,
      );
      return crawls;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to get source crawls: ${String(error)}`);
      throw new HttpException(
        'Failed to get source crawls',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get recent articles for a source (with optional predictors)
   */
  @Get('sources/:id/articles')
  async getSourceArticles(
    @Headers('x-organization-slug') orgHeader?: string,
    @Param('id') id?: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
    @Query('includePredictors') includePredictors?: string,
  ): Promise<Article[] | ArticleWithPredictors[]> {
    const orgSlug = getOrgSlug(orgHeader);

    if (!id) {
      throw new BadRequestException('Source ID is required');
    }

    try {
      // Verify ownership
      const existing = await this.sourceRepository.findById(id);
      if (!existing || existing.organization_slug !== orgSlug) {
        throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
      }

      const sinceDate = since ? new Date(since) : new Date(0);
      const articles = await this.articleRepository.findNewForSource(
        id,
        sinceDate,
        limit ? parseInt(limit, 10) : 50,
      );

      // If predictors requested, enrich articles with predictor data
      if (includePredictors === 'true') {
        const articleIds = articles
          .map((a) => a.id)
          .filter((id): id is string => !!id);
        const predictorMap = await this.getPredictorsForArticles(articleIds);

        return articles.map((article) => ({
          ...article,
          predictors: predictorMap.get(article.id) || [],
        }));
      }

      return articles;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to get source articles: ${String(error)}`);
      throw new HttpException(
        'Failed to get source articles',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trigger a crawl for all sources at a given frequency (no auth for dev)
   * POST /api/crawler/admin/trigger/:frequency
   */
  @Post('trigger/:frequency')
  @Public()
  async triggerCrawl(@Param('frequency') frequency: string): Promise<{
    total: number;
    successful: number;
    failed: number;
    articlesNew: number;
  }> {
    if (!this.crawlerRunner) {
      throw new HttpException(
        'Crawler runner not available',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const freq = parseInt(frequency, 10) as CrawlFrequency;
    if (![5, 10, 15, 30, 60].includes(freq)) {
      throw new BadRequestException(
        'Frequency must be one of: 5, 10, 15, 30, 60',
      );
    }

    this.logger.log(`Triggering manual crawl for ${freq}-minute sources`);

    try {
      const result = await this.crawlerRunner.crawlByFrequency(freq);
      return {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        articlesNew: result.articlesNew,
      };
    } catch (error) {
      this.logger.error(`Failed to trigger crawl: ${String(error)}`);
      throw new HttpException(
        'Failed to trigger crawl',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get summary statistics for a source
   */
  @Get('sources/:id/summary')
  async getSourceSummary(
    @Headers('x-organization-slug') orgHeader?: string,
    @Param('id') id?: string,
  ): Promise<{
    source_id: string;
    source_name: string;
    total_articles: number;
    total_predictors: number;
    articles_with_predictors: number;
    avg_predictors_per_article: number;
    recent_articles_24h: number;
    recent_predictors_24h: number;
  }> {
    const orgSlug = getOrgSlug(orgHeader);

    if (!id) {
      throw new BadRequestException('Source ID is required');
    }

    try {
      // Verify ownership
      const source = await this.sourceRepository.findById(id);
      if (!source || source.organization_slug !== orgSlug) {
        throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
      }

      // Get total articles
      const totalArticles = await this.articleRepository.countForSource(id);

      // Get article IDs for this source
      const articles = await this.articleRepository.findNewForSource(
        id,
        new Date(0),
        10000, // Large limit to get all articles
      );
      const articleIds = articles
        .map((a) => a.id)
        .filter((id): id is string => !!id);

      // Get predictors for these articles
      const predictorMap = await this.getPredictorsForArticles(articleIds);
      const totalPredictors = Array.from(predictorMap.values()).reduce(
        (sum, predictors) => sum + predictors.length,
        0,
      );
      const articlesWithPredictors = Array.from(predictorMap.keys()).length;
      const avgPredictorsPerArticle =
        articlesWithPredictors > 0
          ? totalPredictors / articlesWithPredictors
          : 0;

      // Get recent articles (24h)
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentArticles = await this.articleRepository.findNewForSource(
        id,
        since24h,
        10000,
      );
      const recentArticleIds = recentArticles
        .map((a) => a.id)
        .filter((id): id is string => !!id);
      const recentPredictorMap =
        await this.getPredictorsForArticles(recentArticleIds);
      const recentPredictors24h = Array.from(
        recentPredictorMap.values(),
      ).reduce((sum, predictors) => sum + predictors.length, 0);

      return {
        source_id: id,
        source_name: source.name,
        total_articles: totalArticles,
        total_predictors: totalPredictors,
        articles_with_predictors: articlesWithPredictors,
        avg_predictors_per_article:
          Math.round(avgPredictorsPerArticle * 10) / 10,
        recent_articles_24h: recentArticles.length,
        recent_predictors_24h: recentPredictors24h,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to get source summary: ${String(error)}`);
      throw new HttpException(
        'Failed to get source summary',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trigger crawl for a single source
   * POST /api/crawler/admin/sources/:id/crawl
   */
  @Post('sources/:id/crawl')
  async triggerSourceCrawl(
    @Headers('x-organization-slug') orgHeader: string | undefined,
    @Param('id') id: string,
  ): Promise<{
    success: boolean;
    articlesNew: number;
    error?: string;
  }> {
    const orgSlug = getOrgSlug(orgHeader);

    if (!this.crawlerRunner) {
      throw new HttpException(
        'Crawler runner not available',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Verify ownership
    const source = await this.sourceRepository.findById(id);
    if (!source || source.organization_slug !== orgSlug) {
      throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
    }

    this.logger.log(`Triggering manual crawl for source: ${source.name}`);

    try {
      const result = await this.crawlerRunner.crawlSingleSource(id);
      return {
        success: result.success,
        articlesNew: result.articlesNew,
        error: result.error,
      };
    } catch (error) {
      this.logger.error(`Failed to crawl source: ${String(error)}`);
      throw new HttpException(
        'Failed to crawl source',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
