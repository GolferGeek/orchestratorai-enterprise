import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AgentService, AnalyzeRequest, SearchRequest } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('analyze')
  analyze(@Body() request: AnalyzeRequest) {
    return this.agentService.analyze(request);
  }

  @Post('search')
  search(@Body() request: SearchRequest) {
    return this.agentService.search(request);
  }

  @Get('narrative/:personality')
  getNarrative(@Param('personality') personality: string) {
    return this.agentService.getNarrative(personality);
  }

  @Get('signals')
  getSignals() {
    return this.agentService.getSignals();
  }
}
