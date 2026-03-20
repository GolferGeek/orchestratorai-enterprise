import { Controller, Get, Param } from '@nestjs/common';
import { TopicsService } from './topics.service';

@Controller('api/topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Get()
  getAll() {
    return this.topicsService.getAll();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.topicsService.getById(id);
  }
}
