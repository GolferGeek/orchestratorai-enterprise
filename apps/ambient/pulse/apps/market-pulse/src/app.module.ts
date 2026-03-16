import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { FeedsModule } from './feeds/feeds.module';
import { TrendingModule } from './trending/trending.module';
import { QueueModule } from './queue/queue.module';
import { AgentCardModule } from './agent-card/agent-card.module';
import { AgentModule } from './agent/agent.module';
import { WellKnownController } from './well-known/well-known.controller';
import { MessageLoggingInterceptor } from '@agent-communication/shared-protocols';

@Module({
  imports: [FeedsModule, TrendingModule, QueueModule, AgentCardModule, AgentModule],
  controllers: [HealthController, WellKnownController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useValue: new MessageLoggingInterceptor('market-pulse'),
    },
  ],
})
export class AppModule {}
