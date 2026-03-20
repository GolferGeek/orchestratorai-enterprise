import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
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
  CreateLlmModelRequest,
  UpdateLlmModelRequest,
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

  @Post('models')
  @ApiOperation({
    summary: 'Register a new LLM model',
    description: 'Creates a new entry in the llm_models table.',
  })
  @ApiResponse({ status: 201, description: 'Model created' })
  async createModel(@Body() body: CreateLlmModelRequest): Promise<LlmModelFlat> {
    return this.llmAnalyticsService.createModel(body);
  }

  @Patch('models/:provider/:slug')
  @ApiOperation({
    summary: 'Update an LLM model',
    description: 'Updates display name, pricing, context window, or enabled status.',
  })
  @ApiResponse({ status: 200, description: 'Model updated' })
  async updateModel(
    @Param('provider') provider: string,
    @Param('slug') slug: string,
    @Body() body: UpdateLlmModelRequest,
  ): Promise<LlmModelFlat> {
    return this.llmAnalyticsService.updateModel(provider, slug, body);
  }
}
