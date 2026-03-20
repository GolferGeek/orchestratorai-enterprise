import { Module } from '@nestjs/common';
import { AgentCardController } from './agent-card.controller';
import { AgentCardService } from './agent-card.service';

@Module({
  controllers: [AgentCardController],
  providers: [AgentCardService],
  exports: [AgentCardService],
})
export class AgentCardModule {}
