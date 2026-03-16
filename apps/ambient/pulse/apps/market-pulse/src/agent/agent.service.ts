import { Injectable } from '@nestjs/common';
import { FeedsService } from '../feeds/feeds.service';
import { TrendingService, TrendingTopic } from '../trending/trending.service';
import { QueueService, QueueArticle } from '../queue/queue.service';

export interface ScanResult {
  feedsScanned: number;
  articlesFound: number;
  newArticles: number;
  timestamp: string;
}

export interface SearchResult {
  query: string;
  results: QueueArticle[];
  totalResults: number;
  timestamp: string;
}

@Injectable()
export class AgentService {
  constructor(
    private readonly feedsService: FeedsService,
    private readonly trendingService: TrendingService,
    private readonly queueService: QueueService,
  ) {}

  scan(): ScanResult {
    const feeds = this.feedsService.findAll();
    const activeFeeds = feeds.filter((f) => f.status === 'active');
    const totalArticles = activeFeeds.reduce(
      (sum, f) => sum + f.articleCount,
      0,
    );

    return {
      feedsScanned: activeFeeds.length,
      articlesFound: totalArticles,
      newArticles: Math.floor(Math.random() * 12) + 3,
      timestamp: new Date().toISOString(),
    };
  }

  getTrending(): TrendingTopic[] {
    return this.trendingService.findAll();
  }

  search(query: string): SearchResult {
    const allArticles = this.queueService.findAll();
    const lowerQuery = query.toLowerCase();
    const matched = allArticles.filter(
      (a) =>
        a.title.toLowerCase().includes(lowerQuery) ||
        a.summary.toLowerCase().includes(lowerQuery) ||
        a.source.toLowerCase().includes(lowerQuery),
    );

    return {
      query,
      results: matched,
      totalResults: matched.length,
      timestamp: new Date().toISOString(),
    };
  }
}
