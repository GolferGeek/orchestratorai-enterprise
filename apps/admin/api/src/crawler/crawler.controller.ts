import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CrawlerService,
  CreateSourceDto,
  UpdateSourceDto,
} from './crawler.service';

/**
 * CrawlerController — admin endpoints for the crawler schema.
 *
 * Base path: admin/crawler
 * No auth extraction needed — same pattern as other admin controllers.
 */
@Controller('admin/crawler')
export class CrawlerController {
  private readonly logger = new Logger(CrawlerController.name);

  constructor(private readonly crawlerService: CrawlerService) {}

  /**
   * GET admin/crawler/stats
   * Aggregate stats: source counts, article total, dedup totals.
   */
  @Get('stats')
  async getStats() {
    this.logger.log('[CrawlerController] GET stats');
    return this.crawlerService.getStats();
  }

  /**
   * GET admin/crawler/sources
   * List sources. Pass ?includeInactive=true to include inactive.
   */
  @Get('sources')
  async getSources(@Query('includeInactive') includeInactive?: string) {
    this.logger.log('[CrawlerController] GET sources');
    return this.crawlerService.getSources(includeInactive === 'true');
  }

  /**
   * GET admin/crawler/sources/:id
   * Fetch a single source by id.
   */
  @Get('sources/:id')
  async getSource(@Param('id') id: string) {
    this.logger.log(`[CrawlerController] GET sources/${id}`);
    const source = await this.crawlerService.getSource(id);
    if (!source) {
      throw new NotFoundException(`Source ${id} not found`);
    }
    return source;
  }

  /**
   * POST admin/crawler/sources
   * Create a new crawl source.
   */
  @Post('sources')
  async createSource(@Body() body: CreateSourceDto) {
    this.logger.log('[CrawlerController] POST sources');
    return this.crawlerService.createSource(body);
  }

  /**
   * PATCH admin/crawler/sources/:id
   * Update an existing source.
   */
  @Patch('sources/:id')
  async updateSource(@Param('id') id: string, @Body() body: UpdateSourceDto) {
    this.logger.log(`[CrawlerController] PUT sources/${id}`);
    return this.crawlerService.updateSource(id, body);
  }

  /**
   * DELETE admin/crawler/sources/:id
   * Soft-delete a source (sets is_active = false).
   */
  @Delete('sources/:id')
  async deleteSource(@Param('id') id: string) {
    this.logger.log(`[CrawlerController] DELETE sources/${id}`);
    return this.crawlerService.deleteSource(id);
  }

  /**
   * GET admin/crawler/sources/:id/crawls
   * Recent crawl history. Pass ?limit=N to override default of 10.
   */
  @Get('sources/:id/crawls')
  async getCrawls(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.log(`[CrawlerController] GET sources/${id}/crawls`);
    return this.crawlerService.getCrawls(id, limit ? parseInt(limit, 10) : undefined);
  }

  /**
   * GET admin/crawler/sources/:id/articles
   * Articles for a source. Supports ?limit=N and ?since=<ISO timestamp>.
   */
  @Get('sources/:id/articles')
  async getArticles(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    this.logger.log(`[CrawlerController] GET sources/${id}/articles`);
    return this.crawlerService.getArticles(id, {
      limit: limit ? parseInt(limit, 10) : undefined,
      since,
    });
  }

  /**
   * GET admin/crawler/sources/:id/summary
   * Aggregated summary stats for a source.
   */
  @Get('sources/:id/summary')
  async getSourceSummary(@Param('id') id: string) {
    this.logger.log(`[CrawlerController] GET sources/${id}/summary`);
    return this.crawlerService.getSourceSummary(id);
  }
}
