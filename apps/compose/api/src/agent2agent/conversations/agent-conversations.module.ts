import { Module } from '@nestjs/common';
import { AgentConversationsService } from './agent-conversations.service';
import { AgentConversationsController } from './agent-conversations.controller';

// DATABASE_SERVICE and MEDIA_STORAGE_PROVIDER come from @Global planes
@Module({
  imports: [],
  providers: [AgentConversationsService],
  controllers: [AgentConversationsController],
  exports: [AgentConversationsService],
})
export class AgentConversationsModule {}
