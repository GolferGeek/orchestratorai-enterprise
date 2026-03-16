import { Module } from '@nestjs/common';
import { LlmAnalyticsController } from './llm-analytics.controller';
import { LlmAnalyticsService } from './llm-analytics.service';

@Module({
  controllers: [LlmAnalyticsController],
  providers: [LlmAnalyticsService],
})
export class LlmAnalyticsModule {}
