import { Injectable } from '@nestjs/common';
import { FeedSource } from './feeds.types';

@Injectable()
export class FeedsService {
  private feeds: FeedSource[] = [
    {
      id: 'feed-001',
      name: 'TechCrunch AI',
      type: 'RSS',
      url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
      status: 'active',
      lastFetch: '2026-03-09T08:30:00Z',
      articleCount: 142,
    },
    {
      id: 'feed-002',
      name: 'AI News Daily',
      type: 'RSS',
      url: 'https://ainewsdaily.com/feed/',
      status: 'active',
      lastFetch: '2026-03-09T08:15:00Z',
      articleCount: 89,
    },
    {
      id: 'feed-003',
      name: 'CoinDesk',
      type: 'RSS',
      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      status: 'active',
      lastFetch: '2026-03-09T07:45:00Z',
      articleCount: 213,
    },
    {
      id: 'feed-004',
      name: 'The Information',
      type: 'RSS',
      url: 'https://www.theinformation.com/feed',
      status: 'paused',
      lastFetch: '2026-03-08T22:00:00Z',
      articleCount: 57,
    },
  ];

  findAll(): FeedSource[] {
    return this.feeds;
  }

  findById(id: string): FeedSource | undefined {
    return this.feeds.find((f) => f.id === id);
  }

  create(feed: Omit<FeedSource, 'id'>): FeedSource {
    const newFeed: FeedSource = {
      ...feed,
      id: `feed-${String(this.feeds.length + 1).padStart(3, '0')}`,
    };
    this.feeds.push(newFeed);
    return newFeed;
  }

  update(id: string, updates: Partial<FeedSource>): FeedSource {
    const index = this.feeds.findIndex((f) => f.id === id);
    if (index === -1) {
      throw new Error(`Feed ${id} not found`);
    }
    this.feeds[index] = { ...this.feeds[index], ...updates, id };
    return this.feeds[index];
  }

  delete(id: string): void {
    const index = this.feeds.findIndex((f) => f.id === id);
    if (index === -1) {
      throw new Error(`Feed ${id} not found`);
    }
    this.feeds.splice(index, 1);
  }
}
