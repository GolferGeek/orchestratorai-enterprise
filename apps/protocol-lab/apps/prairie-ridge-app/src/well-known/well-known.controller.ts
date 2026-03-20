import { Controller, Get } from '@nestjs/common';
import { AgentCardService } from '../agent-card/agent-card.service';

@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly agentCardService: AgentCardService) {}

  @Get('agent.json')
  getAgentJson() {
    return this.agentCardService.getAgentCard();
  }
}
