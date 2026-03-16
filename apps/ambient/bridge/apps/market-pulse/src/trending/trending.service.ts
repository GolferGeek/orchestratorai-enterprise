import { Injectable } from '@nestjs/common';

export interface TrendingTopic {
  id: string;
  topic: string;
  category: string;
  direction: 'rising' | 'stable' | 'declining';
  relevanceScore: number;
  relatedArticleCount: number;
  firstSeen: string;
  lastUpdated: string;
}

@Injectable()
export class TrendingService {
  private topics: TrendingTopic[] = [
    {
      id: 'trend-001',
      topic: 'GPT-5 Release Speculation',
      category: 'AI Models',
      direction: 'rising',
      relevanceScore: 0.95,
      relatedArticleCount: 34,
      firstSeen: '2026-03-07T10:00:00Z',
      lastUpdated: '2026-03-09T09:00:00Z',
    },
    {
      id: 'trend-002',
      topic: 'Agent-to-Agent Communication Protocols',
      category: 'AI Infrastructure',
      direction: 'rising',
      relevanceScore: 0.91,
      relatedArticleCount: 18,
      firstSeen: '2026-03-05T14:00:00Z',
      lastUpdated: '2026-03-09T08:30:00Z',
    },
    {
      id: 'trend-003',
      topic: 'EU AI Act Enforcement Updates',
      category: 'Regulation',
      direction: 'stable',
      relevanceScore: 0.82,
      relatedArticleCount: 22,
      firstSeen: '2026-03-01T08:00:00Z',
      lastUpdated: '2026-03-09T07:00:00Z',
    },
    {
      id: 'trend-004',
      topic: 'Bitcoin ETF Inflows Surge',
      category: 'Crypto',
      direction: 'rising',
      relevanceScore: 0.88,
      relatedArticleCount: 29,
      firstSeen: '2026-03-06T12:00:00Z',
      lastUpdated: '2026-03-09T08:45:00Z',
    },
    {
      id: 'trend-005',
      topic: 'Open Source LLM Benchmarks',
      category: 'AI Models',
      direction: 'stable',
      relevanceScore: 0.76,
      relatedArticleCount: 15,
      firstSeen: '2026-03-03T09:00:00Z',
      lastUpdated: '2026-03-08T22:00:00Z',
    },
    {
      id: 'trend-006',
      topic: 'Autonomous Coding Agents',
      category: 'AI Applications',
      direction: 'rising',
      relevanceScore: 0.93,
      relatedArticleCount: 27,
      firstSeen: '2026-03-04T11:00:00Z',
      lastUpdated: '2026-03-09T09:15:00Z',
    },
    {
      id: 'trend-007',
      topic: 'Nvidia Blackwell GPU Supply',
      category: 'Hardware',
      direction: 'declining',
      relevanceScore: 0.68,
      relatedArticleCount: 11,
      firstSeen: '2026-02-28T15:00:00Z',
      lastUpdated: '2026-03-08T16:00:00Z',
    },
    {
      id: 'trend-008',
      topic: 'AI-Powered Drug Discovery Breakthroughs',
      category: 'AI Applications',
      direction: 'stable',
      relevanceScore: 0.79,
      relatedArticleCount: 13,
      firstSeen: '2026-03-02T10:00:00Z',
      lastUpdated: '2026-03-09T06:00:00Z',
    },
  ];

  findAll(): TrendingTopic[] {
    return this.topics.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}
