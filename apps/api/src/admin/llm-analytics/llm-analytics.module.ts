import { Module } from '@nestjs/common';
import { LLMModule } from '@orchestratorai/planes/llm';
import { LlmAnalyticsController } from './llm-analytics.controller';
import { LlmAnalyticsService } from './llm-analytics.service';

@Module({
  // For ModelCatalogSyncService, which backs the catalog refresh endpoint.
  imports: [LLMModule],
  controllers: [LlmAnalyticsController],
  providers: [LlmAnalyticsService],
})
export class LlmAnalyticsModule {}
