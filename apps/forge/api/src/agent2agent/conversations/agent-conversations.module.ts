import { Module } from '@nestjs/common';
import { AgentConversationsService } from './agent-conversations.service';
import { AgentConversationsController } from './agent-conversations.controller';
import { EngineeringModule } from '@/engineering/engineering.module';
import { MarketingSwarmModule } from '../../agents/marketing-swarm/marketing-swarm.module';

// DATABASE_SERVICE and MEDIA_STORAGE_PROVIDER come from @Global planes
@Module({
  imports: [EngineeringModule, MarketingSwarmModule],
  providers: [AgentConversationsService],
  controllers: [AgentConversationsController],
  exports: [AgentConversationsService],
})
export class AgentConversationsModule {}
