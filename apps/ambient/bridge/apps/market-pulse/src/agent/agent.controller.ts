import { Controller, Get, Post, Body } from '@nestjs/common';
import { AgentService, ScanResult, SearchResult } from './agent.service';
import { TrendingTopic } from '../trending/trending.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('scan')
  scan(): ScanResult {
    return this.agentService.scan();
  }

  @Get('trending')
  trending(): TrendingTopic[] {
    return this.agentService.getTrending();
  }

  @Post('search')
  search(@Body() body: { query: string }): SearchResult {
    return this.agentService.search(body.query);
  }
}
