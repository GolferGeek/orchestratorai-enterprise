import { Injectable, BadRequestException } from '@nestjs/common';
import { DraftsService } from '../drafts/drafts.service';
import { TopicsService } from '../topics/topics.service';

@Injectable()
export class AgentService {
  constructor(
    private readonly draftsService: DraftsService,
    private readonly topicsService: TopicsService,
  ) {}

  draft(topic: string) {
    if (!topic) {
      throw new BadRequestException('topic is required');
    }
    return this.draftsService.generateDraft(topic);
  }

  suggestTopics(category?: string) {
    if (category) {
      return {
        topics: this.topicsService.getByCategory(category),
        category,
        suggestedAt: new Date().toISOString(),
      };
    }
    return {
      topics: this.topicsService.getAll(),
      category: null,
      suggestedAt: new Date().toISOString(),
    };
  }

  getSourceData() {
    return {
      sources: [
        {
          agentId: 'research-hub',
          url: 'http://localhost:4001',
          dataTypes: ['narrative', 'article', 'category', 'signal'],
          description: 'AI research analysis through personality lenses',
        },
        {
          agentId: 'market-pulse',
          url: 'http://localhost:4002',
          dataTypes: ['trend-data', 'sentiment', 'market-metric', 'alert'],
          description: 'Real-time market intelligence and trend analysis',
        },
      ],
      retrievedAt: new Date().toISOString(),
    };
  }
}
