import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { FeedsModule } from '../feeds/feeds.module';
import { TrendingModule } from '../trending/trending.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [FeedsModule, TrendingModule, QueueModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
