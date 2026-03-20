import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { CategoriesModule } from './categories/categories.module';
import { NarrativesModule } from './narratives/narratives.module';
import { ArticlesModule } from './articles/articles.module';
import { ScoutModule } from './scout/scout.module';
import { AgentCardModule } from './agent-card/agent-card.module';
import { AgentModule } from './agent/agent.module';
import { WellKnownController } from './well-known/well-known.controller';
import { LlmsTxtController } from './well-known/llms-txt.controller';
import { ContentNegotiationInterceptor } from './content-negotiation/content-negotiation.interceptor';
import { MessageLoggingInterceptor } from '@agent-communication/shared-protocols';

@Module({
  imports: [
    CategoriesModule,
    NarrativesModule,
    ArticlesModule,
    ScoutModule,
    AgentCardModule,
    AgentModule,
  ],
  controllers: [HealthController, WellKnownController, LlmsTxtController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ContentNegotiationInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useValue: new MessageLoggingInterceptor('research-hub'),
    },
  ],
})
export class AppModule {}
