import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FeedsService } from './feeds.service';
import { FeedSource } from './feeds.types';

@Controller('api/feeds')
export class FeedsController {
  constructor(private readonly feedsService: FeedsService) {}

  @Get()
  findAll(): FeedSource[] {
    return this.feedsService.findAll();
  }

  @Post()
  create(@Body() body: Omit<FeedSource, 'id'>): FeedSource {
    return this.feedsService.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: Partial<FeedSource>,
  ): FeedSource {
    const existing = this.feedsService.findById(id);
    if (!existing) {
      throw new HttpException(`Feed ${id} not found`, HttpStatus.NOT_FOUND);
    }
    return this.feedsService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string): { deleted: boolean } {
    const existing = this.feedsService.findById(id);
    if (!existing) {
      throw new HttpException(`Feed ${id} not found`, HttpStatus.NOT_FOUND);
    }
    this.feedsService.delete(id);
    return { deleted: true };
  }
}
