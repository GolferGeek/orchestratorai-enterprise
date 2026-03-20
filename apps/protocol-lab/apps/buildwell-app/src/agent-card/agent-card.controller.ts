import { Controller, Get } from '@nestjs/common';
import { AgentCardService } from './agent-card.service';
import { AgentCard } from '@agent-communication/shared-types';

@Controller('api/agent-card')
export class AgentCardController {
  constructor(private readonly agentCardService: AgentCardService) {}

  @Get()
  getCard(): AgentCard {
    return this.agentCardService.getCard();
  }
}
