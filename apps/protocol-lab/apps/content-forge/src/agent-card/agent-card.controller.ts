import { Controller, Get } from '@nestjs/common';
import { AgentCardService } from './agent-card.service';

@Controller('api/agent-card')
export class AgentCardController {
  constructor(private readonly agentCardService: AgentCardService) {}

  @Get()
  getAgentCard() {
    return this.agentCardService.getAgentCard();
  }
}
