import { Module } from '@nestjs/common';
import { AgentCardService } from './agent-card.service';

@Module({
  providers: [AgentCardService],
  exports: [AgentCardService],
})
export class AgentCardModule {}
