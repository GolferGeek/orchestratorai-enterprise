import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { DraftsModule } from '../drafts/drafts.module';
import { TopicsModule } from '../topics/topics.module';

@Module({
  imports: [DraftsModule, TopicsModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
