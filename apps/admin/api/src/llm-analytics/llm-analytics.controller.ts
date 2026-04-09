import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard, RbacGuard, RequirePermission } from '../auth';
import {
  LlmAnalyticsService,
  LlmUsageSummary,
  LlmModelFlat,
  LlmCostSummaryFlat,
  CreateLlmModelRequest,
  UpdateLlmModelRequest,
  ListUsageFilters,
  LlmUsageRow,
  LlmUsageReasoningPayload,
} from './llm-analytics.service';

@ApiTags('llm-analytics')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('llm:admin')
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

  @Get('usage/list')
  @ApiOperation({
    summary: 'Filtered list of llm_usage rows (reasoning-aware)',
    description:
      'Returns llm_usage rows without `thinking_content` (use /reasoning endpoint to lazy-load). ' +
      'CAUTION: rows may contain agent prompts and user-sourced content — PII risk; role-gated: admin only. ' +
      'Supports filtering by orgSlug (no-op: column not on table — deferred to Phase 8), ' +
      'agentName, provider, model, from/to date range, hasReasoning flag, and pagination.',
  })
  @ApiQuery({
    name: 'orgSlug',
    required: false,
    description: 'Filter by org slug (reserved — deferred to Phase 8)',
  })
  @ApiQuery({
    name: 'agentName',
    required: false,
    description: 'Filter by agent_name exact match',
  })
  @ApiQuery({
    name: 'provider',
    required: false,
    description: 'Filter by provider_name exact match',
  })
  @ApiQuery({
    name: 'model',
    required: false,
    description: 'Filter by model_name exact match',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'ISO8601 lower bound on created_at (inclusive)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'ISO8601 upper bound on created_at (inclusive)',
  })
  @ApiQuery({
    name: 'hasReasoning',
    required: false,
    description: 'true = only rows with thinking_content, false = only without',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size (default 50, max 200)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Page offset (default 0)',
  })
  @ApiResponse({
    status: 200,
    description: 'Filtered llm_usage rows (thinking_content excluded)',
  })
  async listUsage(
    @Query('orgSlug') orgSlug?: string,
    @Query('agentName') agentName?: string,
    @Query('provider') provider?: string,
    @Query('model') model?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('hasReasoning') hasReasoningRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ): Promise<LlmUsageRow[]> {
    const filters: ListUsageFilters = {
      orgSlug,
      agentName,
      provider,
      model,
      from,
      to,
      hasReasoning:
        hasReasoningRaw === 'true'
          ? true
          : hasReasoningRaw === 'false'
            ? false
            : undefined,
      limit: limitRaw !== undefined ? parseInt(limitRaw, 10) : undefined,
      offset: offsetRaw !== undefined ? parseInt(offsetRaw, 10) : undefined,
    };
    return this.llmAnalyticsService.listUsage(filters);
  }

  @Get('usage/:id/reasoning')
  @ApiOperation({
    summary: 'Lazy-load reasoning payload for a single llm_usage row',
    description:
      'Returns only the reasoning payload for a single llm_usage row. ' +
      'Use this to lazy-load expensive thinking_content on demand. ' +
      'Role-gated: admin only. ' +
      'CAUTION: thinking_content may contain full reasoning traces with sensitive context — ' +
      'audit every call if adding access logging later.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reasoning payload for the specified row',
  })
  @ApiResponse({ status: 404, description: 'Row not found' })
  async getUsageReasoning(
    @Param('id') id: string,
  ): Promise<LlmUsageReasoningPayload> {
    return this.llmAnalyticsService.getUsageReasoning(id);
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
  async createModel(
    @Body() body: CreateLlmModelRequest,
  ): Promise<LlmModelFlat> {
    return this.llmAnalyticsService.createModel(body);
  }

  @Patch('models/:provider/:slug')
  @ApiOperation({
    summary: 'Update an LLM model',
    description:
      'Updates display name, pricing, context window, or enabled status.',
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
