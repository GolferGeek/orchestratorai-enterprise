import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ResearchClientService } from '../research-client/research-client.service';

@Controller('api/explore')
export class ExplorerController {
  constructor(private readonly researchClient: ResearchClientService) {}

  @Get('discovery')
  async getDiscovery() {
    return this.researchClient.discover();
  }

  @Get('categories')
  async getCategories() {
    return this.researchClient.getCategories();
  }

  @Get('articles')
  async getArticles(
    @Query('q') query?: string,
    @Query('category') category?: string,
  ) {
    return this.researchClient.getArticles(query, category);
  }

  @Get('articles/:id')
  async getArticle(@Param('id') id: string) {
    return this.researchClient.getArticle(id);
  }

  @Get('signals')
  async getSignals(@Query('category') category?: string) {
    return this.researchClient.getSignals(category);
  }

  @Get('narratives/:personality')
  async getNarrative(@Param('personality') personality: string) {
    return this.researchClient.getNarrative(personality);
  }

  @Post('analyze')
  async analyze(@Body() body: { topic: string; personality?: string }) {
    return this.researchClient.analyze(body.topic, body.personality);
  }

  @Post('search')
  async search(@Body() body: { query: string; category?: string }) {
    return this.researchClient.search(body.query, body.category);
  }

  @Get('full-demo')
  async fullDemo() {
    const [card, categories, articles, signals] = await Promise.all([
      this.researchClient.discover(),
      this.researchClient.getCategories(),
      this.researchClient.getArticles(),
      this.researchClient.getSignals(),
    ]);

    const narrative = await this.researchClient.getNarrative('pragmatist');

    const analysis = await this.researchClient.analyze(
      'AI agents in enterprise workflows',
      'analyst',
    );

    const searchResults = await this.researchClient.search('machine learning', undefined);

    return {
      summary: 'Full ResearchHub capability demonstration via AgentConsumer',
      consumedAt: new Date().toISOString(),
      researchHubCard: card,
      results: {
        categories,
        articles,
        signals,
        narrative,
        analysis,
        search: searchResults,
      },
    };
  }
}
