import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('draft')
  draft(@Body() body: { topic: string }) {
    return this.agentService.draft(body.topic);
  }

  @Get('suggest-topics')
  suggestTopics(@Query('category') category?: string) {
    return this.agentService.suggestTopics(category);
  }

  @Get('sources')
  getSources() {
    return this.agentService.getSourceData();
  }
}
