import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MarketingDatabaseService } from './marketing-database.service';
import { ContentTypeDto, MarketingAgentDto } from './dto';

// Database row interfaces (snake_case)
interface DbContentType {
  slug: string;
  organization_slug: string;
  name: string;
  description: string | null;
  system_context: string | null;
  created_at: string;
  updated_at: string;
}

interface DbMarketingAgent {
  slug: string;
  organization_slug: string;
  role: 'writer' | 'editor' | 'evaluator';
  name: string;
  personality: {
    system_context?: string;
    style_guidelines?: string;
    strengths?: string[];
  } | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(private marketingDb: MarketingDatabaseService) {}

  /**
   * Convert database content type row to DTO
   */
  private toContentTypeDto(row: DbContentType): ContentTypeDto {
    return {
      id: row.slug, // Use slug as ID since it's the primary key
      slug: row.slug,
      name: row.name,
      description: row.description || undefined,
      systemPromptTemplate: row.system_context || undefined,
      requiredFields: undefined, // No required_fields in new schema
      isActive: true, // All fetched rows are active (filtered in query)
    };
  }

  /**
   * Convert database agent row to DTO
   */
  private toAgentDto(row: DbMarketingAgent): MarketingAgentDto {
    return {
      id: row.slug, // Use slug as ID since it's the primary key
      slug: row.slug,
      name: row.name,
      role: row.role,
      description: row.personality?.style_guidelines || undefined,
      systemPrompt: row.personality?.system_context || undefined,
      isActive: row.is_active,
    };
  }

  /**
   * Get all active content types
   */
  async getContentTypes(): Promise<ContentTypeDto[]> {
    try {
      const rows = await this.marketingDb.queryAll<DbContentType>(
        'SELECT * FROM marketing.content_types ORDER BY name',
      );
      return rows.map((row) => this.toContentTypeDto(row));
    } catch (error) {
      this.logger.error('Failed to fetch content types', error);
      throw new Error(
        `Failed to fetch content types: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get a single content type by slug
   */
  async getContentTypeBySlug(slug: string): Promise<ContentTypeDto> {
    try {
      const row = await this.marketingDb.queryOne<DbContentType>(
        'SELECT * FROM marketing.content_types WHERE slug = $1',
        [slug],
      );

      if (!row) {
        throw new NotFoundException(`Content type '${slug}' not found`);
      }

      return this.toContentTypeDto(row);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to fetch content type ${slug}`, error);
      throw error;
    }
  }

  /**
   * Get all active marketing agents
   */
  async getAgents(): Promise<MarketingAgentDto[]> {
    try {
      const rows = await this.marketingDb.queryAll<DbMarketingAgent>(
        'SELECT * FROM marketing.agents WHERE is_active = true ORDER BY role, name',
      );
      return rows.map((row) => this.toAgentDto(row));
    } catch (error) {
      this.logger.error('Failed to fetch marketing agents', error);
      throw new Error(
        `Failed to fetch marketing agents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get agents by role
   */
  async getAgentsByRole(
    role: 'writer' | 'editor' | 'evaluator',
  ): Promise<MarketingAgentDto[]> {
    try {
      const rows = await this.marketingDb.queryAll<DbMarketingAgent>(
        'SELECT * FROM marketing.agents WHERE role = $1 AND is_active = true ORDER BY name',
        [role],
      );
      return rows.map((row) => this.toAgentDto(row));
    } catch (error) {
      this.logger.error(`Failed to fetch ${role} agents`, error);
      throw new Error(
        `Failed to fetch ${role} agents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get a single agent by slug
   */
  async getAgentBySlug(slug: string): Promise<MarketingAgentDto> {
    try {
      const row = await this.marketingDb.queryOne<DbMarketingAgent>(
        'SELECT * FROM marketing.agents WHERE slug = $1',
        [slug],
      );

      if (!row) {
        throw new NotFoundException(`Marketing agent '${slug}' not found`);
      }

      return this.toAgentDto(row);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to fetch agent ${slug}`, error);
      throw error;
    }
  }

  /**
   * Get LLM configurations for a specific agent
   */
  async getAgentLLMConfigs(agentSlug: string): Promise<
    Array<{
      llmProvider: string;
      llmModel: string;
      displayName: string | null;
      isDefault: boolean;
      isLocal: boolean;
    }>
  > {
    try {
      const rows = await this.marketingDb.queryAll<{
        llm_provider: string;
        llm_model: string;
        display_name: string | null;
        is_default: boolean;
        is_local: boolean;
      }>(
        'SELECT llm_provider, llm_model, display_name, is_default, is_local FROM marketing.agent_llm_configs WHERE agent_slug = $1 ORDER BY is_default DESC, display_name',
        [agentSlug],
      );

      return rows.map((row) => ({
        llmProvider: row.llm_provider,
        llmModel: row.llm_model,
        displayName: row.display_name,
        isDefault: row.is_default,
        isLocal: row.is_local,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to fetch LLM configs for agent ${agentSlug}`,
        error,
      );
      throw new Error(
        `Failed to fetch LLM configs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get full configuration for the swarm UI
   * Returns content types and agents grouped by role
   * Note: LLM models are now fetched separately from public.llm_models via /llm/models endpoint
   */
  async getSwarmConfiguration(): Promise<{
    contentTypes: ContentTypeDto[];
    writers: MarketingAgentDto[];
    editors: MarketingAgentDto[];
    evaluators: MarketingAgentDto[];
  }> {
    const [contentTypes, writers, editors, evaluators] = await Promise.all([
      this.getContentTypes(),
      this.getAgentsByRole('writer'),
      this.getAgentsByRole('editor'),
      this.getAgentsByRole('evaluator'),
    ]);

    return {
      contentTypes,
      writers,
      editors,
      evaluators,
    };
  }
}
