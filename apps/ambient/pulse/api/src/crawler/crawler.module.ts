import { Module } from '@nestjs/common';
// ObservabilityPlaneModule is @Global() — no import needed here

// Repositories
import {
  CrawlerSourceRepository,
  ArticleRepository,
  SourceCrawlRepository,
} from './repositories';

// Services
import { CrawlerService, DeduplicationService } from './services';

// Runners
import { CrawlerRunner } from './runners';

// Controllers
import { CrawlerAdminController } from './crawler-admin.controller';

/**
 * CrawlerModule - Central crawling infrastructure
 *
 * Provides shared crawling capabilities for all agents:
 * - Source management (findOrCreate prevents duplicates)
 * - Article storage with 4-layer deduplication
 * - Crawl tracking and metrics
 * - Scheduled crawling via CrawlerRunner
 *
 * Agents use this module to:
 * 1. Register sources via CrawlerService.findOrCreateSource()
 * 2. Pull new articles via CrawlerService.findNewArticlesForSource()
 *
 * The CrawlerRunner handles scheduled crawling and stores articles
 * in crawler.articles. Agents pull articles on their own schedule.
 */
@Module({
  imports: [],
  controllers: [CrawlerAdminController],
  providers: [
    // Repositories
    CrawlerSourceRepository,
    ArticleRepository,
    SourceCrawlRepository,
    // Services
    DeduplicationService,
    CrawlerService,
    // Runners
    CrawlerRunner,
  ],
  exports: [
    // Export repositories for advanced use cases
    CrawlerSourceRepository,
    ArticleRepository,
    SourceCrawlRepository,
    // Export services (primary interface)
    DeduplicationService,
    CrawlerService,
  ],
})
export class CrawlerModule {}
