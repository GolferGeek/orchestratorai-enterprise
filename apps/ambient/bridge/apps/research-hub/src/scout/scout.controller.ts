import { Controller, Get, Query } from '@nestjs/common';
import { ScoutService } from './scout.service';

@Controller('api/scout')
export class ScoutController {
  constructor(private readonly scoutService: ScoutService) {}

  @Get('watchlist')
  getWatchlist(@Query('category') category?: string) {
    if (category) {
      return this.scoutService.getByCategory(category);
    }
    return this.scoutService.getWatchlist();
  }
}
