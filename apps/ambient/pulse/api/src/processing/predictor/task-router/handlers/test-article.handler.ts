/**
 * Test Article Dashboard Handler
 *
 * Handles dashboard mode requests for synthetic test articles.
 * Part of Phase 3: Test Data Management UI.
 *
 * Supports:
 * - CRUD operations on test articles
 * - Bulk create for importing multiple articles
 * - Mark articles as processed
 * - Filter by scenario, target symbol, processed status
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import {
  TestArticleRepository,
  TestArticle,
  CreateTestArticleData,
  UpdateTestArticleData,
} from '../../repositories/test-article.repository';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import { AiArticleGeneratorService } from '../../services/ai-article-generator.service';
import { TestArticleGenerationRequest } from '../../interfaces/ai-generation.interface';

interface TestArticleFilters {
  scenarioId?: string;
  targetSymbol?: string;
  processed?: boolean;
  sentiment?: string;
}

interface TestArticleParams {
  id?: string;
  organizationSlug?: string;
  filters?: TestArticleFilters;
  page?: number;
  pageSize?: number;
}

interface CreateTestArticleParams {
  scenario_id?: string;
  title: string;
  content: string;
  source_name?: string;
  published_at: string;
  target_symbols?: string[];
  sentiment_expected?: 'positive' | 'negative' | 'neutral';
  strength_expected?: number;
  is_synthetic?: boolean;
  synthetic_marker?: string;
  metadata?: Record<string, unknown>;
}

interface UpdateTestArticleParams {
  title?: string;
  content?: string;
  source_name?: string;
  published_at?: string;
  target_symbols?: string[];
  sentiment_expected?: 'positive' | 'negative' | 'neutral';
  strength_expected?: number;
  is_synthetic?: boolean;
  synthetic_marker?: string;
  metadata?: Record<string, unknown>;
}

interface BulkCreateParams {
  articles: CreateTestArticleParams[];
}

@Injectable()
export class TestArticleHandler implements IDashboardHandler {
  private readonly logger = new Logger(TestArticleHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'update',
    'delete',
    'bulk-create',
    'mark-processed',
    'list-unprocessed',
    'generate',
  ];

  constructor(
    private readonly testArticleRepository: TestArticleRepository,
    private readonly aiArticleGeneratorService: AiArticleGeneratorService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[TEST-ARTICLE-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as TestArticleParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(context, params);
      case 'get':
        return this.handleGet(params);
      case 'create':
        return this.handleCreate(context, payload);
      case 'update':
        return this.handleUpdate(params, payload);
      case 'delete':
        return this.handleDelete(params);
      case 'bulk-create':
      case 'bulkcreate':
        return this.handleBulkCreate(context, payload);
      case 'mark-processed':
      case 'markprocessed':
        return this.handleMarkProcessed(params);
      case 'list-unprocessed':
      case 'listunprocessed':
        return this.handleListUnprocessed(params);
      case 'generate':
        return this.handleGenerate(context, payload);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleList(
    context: ExecutionContext,
    params?: TestArticleParams,
  ): Promise<DashboardActionResult> {
    try {
      let articles: TestArticle[];

      // Determine how to fetch based on filters
      const scenarioId = params?.filters?.scenarioId;
      const targetSymbol = params?.filters?.targetSymbol;

      if (scenarioId) {
        articles = await this.testArticleRepository.findByScenario(scenarioId);
      } else if (targetSymbol) {
        articles =
          await this.testArticleRepository.findByTargetSymbol(targetSymbol);
      } else {
        articles = await this.testArticleRepository.findByOrganization(
          context.orgSlug,
        );
      }

      // Apply additional filters
      let filtered = articles;

      if (params?.filters?.processed !== undefined) {
        filtered = filtered.filter(
          (a) => a.processed === params.filters!.processed,
        );
      }

      if (params?.filters?.sentiment) {
        filtered = filtered.filter(
          (a) => a.sentiment_expected === params.filters!.sentiment,
        );
      }

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedArticles = filtered.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedArticles,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list test articles: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list test articles',
      );
    }
  }

  private async handleGet(
    params?: TestArticleParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Test article ID is required');
    }

    try {
      const article = await this.testArticleRepository.findById(params.id);
      if (!article) {
        return buildDashboardError(
          'NOT_FOUND',
          `Test article not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(article);
    } catch (error) {
      this.logger.error(
        `Failed to get test article: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get test article',
      );
    }
  }

  private async handleCreate(
    context: ExecutionContext,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = payload.params as unknown as CreateTestArticleParams;

    if (!data.title || !data.content || !data.published_at) {
      return buildDashboardError(
        'INVALID_DATA',
        'title, content, and published_at are required',
      );
    }

    // Validate target symbols have T_ prefix
    if (data.target_symbols && data.target_symbols.length > 0) {
      const invalidSymbols = data.target_symbols.filter(
        (s) => !s.startsWith('T_'),
      );
      if (invalidSymbols.length > 0) {
        return buildDashboardError(
          'INVALID_SYMBOLS',
          `Target symbols must start with T_ prefix. Invalid: ${invalidSymbols.join(', ')}`,
        );
      }
    }

    try {
      const createData: CreateTestArticleData = {
        organization_slug: context.orgSlug,
        scenario_id: data.scenario_id,
        title: data.title,
        content: data.content,
        source_name: data.source_name ?? 'Test News Source',
        published_at: data.published_at,
        target_symbols: data.target_symbols ?? [],
        sentiment_expected: data.sentiment_expected,
        strength_expected: data.strength_expected,
        is_synthetic: data.is_synthetic ?? true,
        synthetic_marker: data.synthetic_marker ?? '[SYNTHETIC TEST ARTICLE]',
        processed: false,
        created_by: context.userId,
        metadata: data.metadata ?? {},
      };

      const article = await this.testArticleRepository.create(createData);
      return buildDashboardSuccess(article);
    } catch (error) {
      this.logger.error(
        `Failed to create test article: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to create test article',
      );
    }
  }

  private async handleUpdate(
    params: TestArticleParams | undefined,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Test article ID is required');
    }

    const data = payload.params as unknown as UpdateTestArticleParams;

    // Validate target symbols if provided
    if (data.target_symbols && data.target_symbols.length > 0) {
      const invalidSymbols = data.target_symbols.filter(
        (s) => !s.startsWith('T_'),
      );
      if (invalidSymbols.length > 0) {
        return buildDashboardError(
          'INVALID_SYMBOLS',
          `Target symbols must start with T_ prefix. Invalid: ${invalidSymbols.join(', ')}`,
        );
      }
    }

    try {
      const updateData: UpdateTestArticleData = {};

      if (data.title !== undefined) updateData.title = data.title;
      if (data.content !== undefined) updateData.content = data.content;
      if (data.source_name !== undefined)
        updateData.source_name = data.source_name;
      if (data.published_at !== undefined)
        updateData.published_at = data.published_at;
      if (data.target_symbols !== undefined)
        updateData.target_symbols = data.target_symbols;
      if (data.sentiment_expected !== undefined)
        updateData.sentiment_expected = data.sentiment_expected;
      if (data.strength_expected !== undefined)
        updateData.strength_expected = data.strength_expected;
      if (data.is_synthetic !== undefined)
        updateData.is_synthetic = data.is_synthetic;
      if (data.synthetic_marker !== undefined)
        updateData.synthetic_marker = data.synthetic_marker;
      if (data.metadata !== undefined) updateData.metadata = data.metadata;

      const article = await this.testArticleRepository.update(
        params.id,
        updateData,
      );
      return buildDashboardSuccess(article);
    } catch (error) {
      this.logger.error(
        `Failed to update test article: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UPDATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to update test article',
      );
    }
  }

  private async handleDelete(
    params?: TestArticleParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Test article ID is required');
    }

    try {
      await this.testArticleRepository.delete(params.id);
      return buildDashboardSuccess({ deleted: true, id: params.id });
    } catch (error) {
      this.logger.error(
        `Failed to delete test article: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to delete test article',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Bulk Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleBulkCreate(
    context: ExecutionContext,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = payload.params as unknown as BulkCreateParams;

    if (!data.articles || !Array.isArray(data.articles)) {
      return buildDashboardError(
        'INVALID_DATA',
        'articles array is required for bulk create',
      );
    }

    // Validate all articles
    for (let i = 0; i < data.articles.length; i++) {
      const article = data.articles[i];
      if (!article) {
        return buildDashboardError(
          'INVALID_DATA',
          `Article at index ${i} is undefined`,
        );
      }
      if (!article.title || !article.content || !article.published_at) {
        return buildDashboardError(
          'INVALID_DATA',
          `Article at index ${i} missing required fields (title, content, published_at)`,
        );
      }

      // Validate target symbols
      if (article.target_symbols && article.target_symbols.length > 0) {
        const invalidSymbols = article.target_symbols.filter(
          (s) => !s.startsWith('T_'),
        );
        if (invalidSymbols.length > 0) {
          return buildDashboardError(
            'INVALID_SYMBOLS',
            `Article at index ${i} has invalid symbols: ${invalidSymbols.join(', ')}`,
          );
        }
      }
    }

    try {
      const createDataList: CreateTestArticleData[] = data.articles.map(
        (article) => ({
          organization_slug: context.orgSlug,
          scenario_id: article.scenario_id,
          title: article.title,
          content: article.content,
          source_name: article.source_name ?? 'Test News Source',
          published_at: article.published_at,
          target_symbols: article.target_symbols ?? [],
          sentiment_expected: article.sentiment_expected,
          strength_expected: article.strength_expected,
          is_synthetic: article.is_synthetic ?? true,
          synthetic_marker:
            article.synthetic_marker ?? '[SYNTHETIC TEST ARTICLE]',
          processed: false,
          created_by: context.userId,
          metadata: article.metadata ?? {},
        }),
      );

      const articles =
        await this.testArticleRepository.bulkCreate(createDataList);
      return buildDashboardSuccess({
        created_count: articles.length,
        articles,
      });
    } catch (error) {
      this.logger.error(
        `Failed to bulk create test articles: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'BULK_CREATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to bulk create test articles',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Processing Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleMarkProcessed(
    params?: TestArticleParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Test article ID is required');
    }

    try {
      const article = await this.testArticleRepository.markProcessed(params.id);
      return buildDashboardSuccess(article);
    } catch (error) {
      this.logger.error(
        `Failed to mark test article as processed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'MARK_PROCESSED_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to mark test article as processed',
      );
    }
  }

  private async handleListUnprocessed(
    params?: TestArticleParams,
  ): Promise<DashboardActionResult> {
    try {
      const scenarioId = params?.filters?.scenarioId;
      const articles =
        await this.testArticleRepository.findUnprocessed(scenarioId);

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedArticles = articles.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedArticles,
        buildPaginationMetadata(articles.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list unprocessed test articles: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_UNPROCESSED_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to list unprocessed test articles',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI Generation Operations (Phase 4.1)
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleGenerate(
    context: ExecutionContext,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const request = payload.params as unknown as TestArticleGenerationRequest;

    // Validate request parameters
    if (!request.target_symbols || request.target_symbols.length === 0) {
      return buildDashboardError(
        'INVALID_REQUEST',
        'target_symbols is required and must contain at least one symbol',
      );
    }

    // Validate target symbols have T_ prefix (INV-08 compliance)
    const invalidSymbols = request.target_symbols.filter(
      (s) => !s.startsWith('T_'),
    );
    if (invalidSymbols.length > 0) {
      return buildDashboardError(
        'INVALID_SYMBOLS',
        `Target symbols must start with T_ prefix (INV-08). Invalid symbols: ${invalidSymbols.join(', ')}`,
        { invalidSymbols },
      );
    }

    if (!request.scenario_type) {
      return buildDashboardError(
        'INVALID_REQUEST',
        'scenario_type is required',
      );
    }

    if (!request.sentiment) {
      return buildDashboardError('INVALID_REQUEST', 'sentiment is required');
    }

    if (!request.strength) {
      return buildDashboardError('INVALID_REQUEST', 'strength is required');
    }

    try {
      this.logger.log(
        `Generating AI articles for scenario: ${request.scenario_type}, sentiment: ${request.sentiment}, strength: ${request.strength}`,
      );

      // Call AI article generator service
      const generationResult =
        await this.aiArticleGeneratorService.generateArticles(request, context);

      if (!generationResult.success) {
        return buildDashboardError(
          'GENERATION_FAILED',
          'Failed to generate articles',
          {
            errors: generationResult.errors,
            metadata: generationResult.generation_metadata,
          },
        );
      }

      // Create articles in database
      const requestWithScenario = request as TestArticleGenerationRequest & {
        scenario_id?: string;
      };

      const createDataList: CreateTestArticleData[] =
        generationResult.articles.map((article) => ({
          organization_slug: context.orgSlug,
          scenario_id: requestWithScenario.scenario_id, // Optional scenario_id from request
          title: article.title,
          content: article.content,
          source_name: article.simulated_source_name,
          published_at: article.simulated_published_at,
          target_symbols: article.target_symbols,
          sentiment_expected:
            article.intended_sentiment === 'bullish'
              ? 'positive'
              : article.intended_sentiment === 'bearish'
                ? 'negative'
                : 'neutral',
          strength_expected: this.mapStrengthToNumeric(
            article.intended_strength,
          ),
          is_synthetic: true,
          synthetic_marker: '[SYNTHETIC TEST ARTICLE]',
          processed: false,
          created_by: context.userId,
          metadata: {
            ai_generated: true,
            model_used: generationResult.generation_metadata.model_used,
            generation_timestamp: new Date().toISOString(),
            scenario_type: request.scenario_type,
          },
        }));

      // Bulk create articles in database
      const createdArticles =
        await this.testArticleRepository.bulkCreate(createDataList);

      this.logger.log(
        `Successfully generated and created ${createdArticles.length} articles`,
      );

      return buildDashboardSuccess({
        articles: createdArticles,
        generation_metadata: generationResult.generation_metadata,
        created_count: createdArticles.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate articles: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GENERATION_FAILED',
        error instanceof Error ? error.message : 'Failed to generate articles',
      );
    }
  }

  /**
   * Map strength string to numeric value
   */
  private mapStrengthToNumeric(strength: string): number {
    switch (strength.toLowerCase()) {
      case 'strong':
        return 0.8;
      case 'moderate':
        return 0.5;
      case 'weak':
        return 0.2;
      default:
        return 0.5;
    }
  }
}
