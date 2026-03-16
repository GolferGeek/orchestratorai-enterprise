import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ArticlesService } from './articles.service';

@Controller('api/articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  getArticles(@Query('category') category?: string, @Query('q') query?: string) {
    if (query) {
      return this.articlesService.search(query);
    }
    if (category) {
      return this.articlesService.getByCategoryId(category);
    }
    return this.articlesService.getAll();
  }

  @Get(':id')
  getArticle(@Param('id') id: string) {
    const article = this.articlesService.getById(id);
    if (!article) {
      throw new NotFoundException(`Article "${id}" not found`);
    }
    return article;
  }
}
