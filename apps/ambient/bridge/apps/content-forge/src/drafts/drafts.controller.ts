import { Controller, Get, Post, Put, Delete, Body, Param, BadRequestException } from '@nestjs/common';
import { DraftsService, CreateDraftDto, UpdateDraftDto } from './drafts.service';

@Controller('api/drafts')
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Get()
  getAll() {
    return this.draftsService.getAll();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.draftsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateDraftDto) {
    if (!dto.title || !dto.content) {
      throw new BadRequestException('title and content are required');
    }
    return this.draftsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDraftDto) {
    return this.draftsService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.draftsService.delete(id);
  }

  @Post('generate')
  generate(@Body() body: { topic: string }) {
    if (!body.topic) {
      throw new BadRequestException('topic is required');
    }
    return this.draftsService.generateDraft(body.topic);
  }
}
