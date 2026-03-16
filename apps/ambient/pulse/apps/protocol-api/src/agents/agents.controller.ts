import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  HttpCode,
} from '@nestjs/common';
import { AgentsService } from './agents.service';

@Controller('api/agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  getAllAgents() {
    return this.agentsService.getAllAgents();
  }

  @Get(':id')
  getAgent(@Param('id') id: string) {
    const agent = this.agentsService.getAgent(id);
    if (!agent) {
      throw new NotFoundException(`Agent ${id} not found`);
    }
    return agent;
  }

  @Post('discover')
  @HttpCode(200)
  async discoverAgent(@Body() body: { url: string }) {
    return this.agentsService.discoverAgent(body.url);
  }

  @Post('heartbeat')
  @HttpCode(200)
  updateHeartbeat(@Body() body: { agentId: string }) {
    const agent = this.agentsService.updateHeartbeat(body.agentId);
    if (!agent) {
      throw new NotFoundException(`Agent ${body.agentId} not found`);
    }
    return agent;
  }
}
