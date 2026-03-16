import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  LlmAnalyticsService,
  LlmUsageSummary,
  LlmModelFlat,
  LlmCostSummaryFlat,
} from './llm-analytics.service';

@ApiTags('llm-analytics')
@ApiBearerAuth('JWT-auth')
@Controller('admin/llm')
export class LlmAnalyticsController {
  constructor(private readonly llmAnalyticsService: LlmAnalyticsService) {}

  @Get('usage')
  @ApiOperation({
    summary: 'Aggregated LLM usage across products',
    description: 'Queries the database directly to collect LLM usage records.',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated LLM usage data',
  })
  async getUsage(): Promise<LlmUsageSummary[]> {
    return this.llmAnalyticsService.getUsage();
  }

  @Get('models')
  @ApiOperation({
    summary: 'Available models and usage stats',
    description:
      'Lists all LLM models with aggregated usage stats from the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Model usage statistics',
  })
  async getModels(): Promise<LlmModelFlat[]> {
    return this.llmAnalyticsService.getModels();
  }

  @Get('costs')
  @ApiOperation({
    summary: 'Cost tracking by product/model/org',
    description:
      'Aggregates cost data from the database, grouped by agent and model.',
  })
  @ApiResponse({
    status: 200,
    description: 'Cost breakdown by org and product',
  })
  async getCosts(): Promise<LlmCostSummaryFlat[]> {
    return this.llmAnalyticsService.getCosts();
  }
}
