import {
  Controller,
  Get,
  Post,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { QueueService, QueueArticle } from './queue.service';

@Controller('api/queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get()
  findAll(): QueueArticle[] {
    return this.queueService.findAll();
  }

  @Post(':id/send')
  send(@Param('id') id: string): QueueArticle {
    const article = this.queueService.findById(id);
    if (!article) {
      throw new HttpException(
        `Article ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    if (article.status !== 'pending') {
      throw new HttpException(
        `Article ${id} cannot be sent — current status: ${article.status}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.queueService.send(id);
  }
}
