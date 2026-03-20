import { Controller, Get } from '@nestjs/common';
import { TrendingService, TrendingTopic } from './trending.service';

@Controller('api/trending')
export class TrendingController {
  constructor(private readonly trendingService: TrendingService) {}

  @Get()
  findAll(): TrendingTopic[] {
    return this.trendingService.findAll();
  }
}
