import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { DraftsModule } from './drafts/drafts.module';
import { TopicsModule } from './topics/topics.module';
import { AgentCardModule } from './agent-card/agent-card.module';
import { AgentModule } from './agent/agent.module';
import { WorkflowModule } from './workflow/workflow.module';
import { WellKnownController } from './well-known/well-known.controller';
import { MessageLoggingInterceptor } from '@agent-communication/shared-protocols';

@Module({
  imports: [
    DraftsModule,
    TopicsModule,
    AgentCardModule,
    AgentModule,
    WorkflowModule,
  ],
  controllers: [HealthController, WellKnownController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useValue: new MessageLoggingInterceptor('content-forge'),
    },
  ],
})
export class AppModule {}
