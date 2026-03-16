import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { NarrativesService } from '../narratives/narratives.service';
import { ArticlesService } from '../articles/articles.service';
import { ScoutService } from '../scout/scout.service';

export interface AnalyzeRequest {
  topic: string;
  personality?: string;
}

export interface SearchRequest {
  query: string;
  category?: string;
}

@Injectable()
export class AgentService {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly narrativesService: NarrativesService,
    private readonly articlesService: ArticlesService,
    private readonly scoutService: ScoutService,
  ) {}

  analyze(request: AnalyzeRequest) {
    if (!request.topic) {
      throw new BadRequestException('topic is required');
    }

    const articles = this.articlesService.search(request.topic);
    const categories = this.categoriesService.getAll();
    const matchingCategories = categories.filter((c) =>
      c.name.toLowerCase().includes(request.topic.toLowerCase()) ||
      c.description.toLowerCase().includes(request.topic.toLowerCase()),
    );

    const personality = request.personality || 'pragmatist';
    const narrative = this.narrativesService.getByPersonality(personality);

    const signals = this.scoutService.getWatchlist().filter((s) =>
      s.title.toLowerCase().includes(request.topic.toLowerCase()) ||
      s.description.toLowerCase().includes(request.topic.toLowerCase()),
    );

    return {
      topic: request.topic,
      personality,
      narrative: narrative ? narrative.content : null,
      relatedArticles: articles,
      relatedCategories: matchingCategories,
      relatedSignals: signals,
      analyzedAt: new Date().toISOString(),
    };
  }

  search(request: SearchRequest) {
    if (!request.query) {
      throw new BadRequestException('query is required');
    }

    const articles = request.category
      ? this.articlesService.getByCategoryId(request.category)
      : this.articlesService.search(request.query);

    const categories = this.categoriesService.getAll().filter((c) =>
      c.name.toLowerCase().includes(request.query.toLowerCase()) ||
      c.description.toLowerCase().includes(request.query.toLowerCase()),
    );

    return {
      query: request.query,
      category: request.category || null,
      articles,
      categories,
      totalResults: articles.length + categories.length,
      searchedAt: new Date().toISOString(),
    };
  }

  getNarrative(personality: string) {
    const narrative = this.narrativesService.getByPersonality(personality);
    if (!narrative) {
      throw new NotFoundException(
        `Personality "${personality}" not found. Available: ${this.narrativesService.getAllPersonalities().join(', ')}`,
      );
    }
    return narrative;
  }

  getSignals() {
    return {
      signals: this.scoutService.getWatchlist(),
      retrievedAt: new Date().toISOString(),
    };
  }
}
