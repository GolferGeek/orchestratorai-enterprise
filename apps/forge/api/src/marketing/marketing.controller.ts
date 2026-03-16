import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketingService } from './marketing.service';
import { ContentTypeDto, MarketingAgentDto } from './dto';

/**
 * Marketing Swarm Configuration Controller
 *
 * Provides endpoints for the Marketing Swarm UI to fetch:
 * - Content types (blog posts, social media, etc.)
 * - Marketing agents (writers, editors, evaluators)
 *
 * Note: LLM model selection is handled via /llm/models endpoint.
 * The frontend sends provider/model selections directly.
 *
 * All endpoints are read-only and require authentication.
 */
@Controller('marketing')
@UseGuards(JwtAuthGuard)
export class MarketingController {
  constructor(private marketingService: MarketingService) {}

  /**
   * Get full swarm configuration in a single request
   * GET /marketing/config
   *
   * Returns all content types and agents grouped by role.
   * This is the primary endpoint for the Marketing Swarm UI initialization.
   *
   * Note: LLM models are fetched separately from /llm/models endpoint.
   */
  @Get('config')
  async getSwarmConfiguration(): Promise<{
    contentTypes: ContentTypeDto[];
    writers: MarketingAgentDto[];
    editors: MarketingAgentDto[];
    evaluators: MarketingAgentDto[];
  }> {
    return this.marketingService.getSwarmConfiguration();
  }

  /**
   * Get all active content types
   * GET /marketing/content-types
   */
  @Get('content-types')
  async getContentTypes(): Promise<ContentTypeDto[]> {
    return this.marketingService.getContentTypes();
  }

  /**
   * Get a single content type by slug
   * GET /marketing/content-types/:slug
   */
  @Get('content-types/:slug')
  async getContentTypeBySlug(
    @Param('slug') slug: string,
  ): Promise<ContentTypeDto> {
    return this.marketingService.getContentTypeBySlug(slug);
  }

  /**
   * Get all active marketing agents
   * GET /marketing/agents
   * GET /marketing/agents?role=writer|editor|evaluator
   */
  @Get('agents')
  async getAgents(
    @Query('role') role?: 'writer' | 'editor' | 'evaluator',
  ): Promise<MarketingAgentDto[]> {
    if (role) {
      return this.marketingService.getAgentsByRole(role);
    }
    return this.marketingService.getAgents();
  }

  /**
   * Get a single agent by slug
   * GET /marketing/agents/:slug
   */
  @Get('agents/:slug')
  async getAgentBySlug(
    @Param('slug') slug: string,
  ): Promise<MarketingAgentDto> {
    return this.marketingService.getAgentBySlug(slug);
  }

  /**
   * Get LLM configurations for a specific agent
   * GET /marketing/agents/:slug/llm-configs
   */
  @Get('agents/:slug/llm-configs')
  async getAgentLLMConfigs(@Param('slug') slug: string): Promise<
    Array<{
      llmProvider: string;
      llmModel: string;
      displayName: string | null;
      isDefault: boolean;
      isLocal: boolean;
    }>
  > {
    return this.marketingService.getAgentLLMConfigs(slug);
  }
}
