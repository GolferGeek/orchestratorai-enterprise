import { Controller, Get } from '@nestjs/common';
import { AgentCardService } from '../agent-card/agent-card.service';
import { AgentCard } from '@agent-communication/shared-types';

@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly agentCardService: AgentCardService) {}

  @Get('agent.json')
  getAgentCard(): AgentCard {
    return this.agentCardService.getCard();
  }
}
