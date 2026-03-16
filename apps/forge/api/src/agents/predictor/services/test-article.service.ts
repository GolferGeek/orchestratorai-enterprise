import { Injectable, Logger } from '@nestjs/common';
import {
  TestArticleRepository,
  TestArticle,
  CreateTestArticleData,
  UpdateTestArticleData,
} from '../repositories/test-article.repository';
import { TestAuditLogRepository } from '../repositories/test-audit-log.repository';
import { SignalDetectionService } from './signal-detection.service';
import { SignalRepository } from '../repositories/signal.repository';
import { TargetRepository } from '../repositories/target.repository';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { CreateSignalData } from '../interfaces/signal.interface';

/**
 * Validation result for test article INV-08 compliance
 */
export interface ArticleValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Result of processing an article through signal detection
 */
export interface ArticleProcessingResult {
  articleId: string;
  success: boolean;
  signalsCreated: number;
  errors: string[];
}

/**
 * Service for managing test articles in the prediction-runner module
 * Part of the Test Data Injection Framework (Phase 3)
 *
 * Responsibilities:
 * - Create and manage synthetic test articles
 * - Process test articles through signal detection pipeline
 * - Ensure INV-08 compliance (T_ prefix for target symbols)
 * - Validate synthetic markers are present
 * - Track audit trail for all operations
 */
@Injectable()
export class TestArticleService {
  private readonly logger = new Logger(TestArticleService.name);

  constructor(
    private readonly testArticleRepository: TestArticleRepository,
    private readonly testAuditLogRepository: TestAuditLogRepository,
    private readonly signalDetectionService: SignalDetectionService,
    private readonly signalRepository: SignalRepository,
    private readonly targetRepository: TargetRepository,
  ) {}

  /**
   * Create a new test article
   * Validates INV-08 compliance before creation
   *
   * @param data - Article data
   * @param userId - User creating the article (for audit trail)
   * @returns Created test article
   * @throws Error if validation fails or creation fails
   */
  async createArticle(
    data: CreateTestArticleData,
    userId: string,
  ): Promise<TestArticle> {
    // Validate article before creation
    const validation = this.validateArticle({
      ...data,
      id: '',
      created_at: new Date().toISOString(),
      processed: false,
      processed_at: null,
      metadata: data.metadata ?? {},
    } as TestArticle);

    if (!validation.isValid) {
      throw new Error(
        `Article validation failed: ${validation.errors.join(', ')}`,
      );
    }

    // Ensure synthetic markers are set
    const articleData: CreateTestArticleData = {
      ...data,
      is_synthetic: true,
      synthetic_marker: data.synthetic_marker ?? '[SYNTHETIC TEST CONTENT]',
      target_symbols: data.target_symbols ?? [],
    };

    // Create the article
    const article = await this.testArticleRepository.create(articleData);

    // Log audit entry
    await this.testAuditLogRepository.log({
      organization_slug: data.organization_slug,
      user_id: userId,
      action: 'article_created',
      resource_type: 'test_article',
      resource_id: article.id,
      details: {
        title: article.title,
        target_symbols: article.target_symbols,
        scenario_id: article.scenario_id,
      },
    });

    this.logger.log(
      `Created test article ${article.id}: "${article.title}" (${article.target_symbols.length} targets)`,
    );

    return article;
  }

  /**
   * Bulk create test articles for a scenario
   * Validates all articles before creation
   *
   * @param articles - Array of article data
   * @param userId - User creating the articles (for audit trail)
   * @returns Array of created test articles
   * @throws Error if any validation fails or creation fails
   */
  async bulkCreateArticles(
    articles: CreateTestArticleData[],
    userId: string,
  ): Promise<TestArticle[]> {
    if (articles.length === 0) {
      return [];
    }

    // Validate all articles first
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      if (!article) continue;

      const validation = this.validateArticle({
        ...article,
        id: '',
        created_at: new Date().toISOString(),
        processed: false,
        processed_at: null,
        metadata: article.metadata ?? {},
      } as TestArticle);

      if (!validation.isValid) {
        throw new Error(
          `Article ${i + 1} validation failed: ${validation.errors.join(', ')}`,
        );
      }
    }

    // Ensure synthetic markers are set for all articles
    const articlesData: CreateTestArticleData[] = articles.map((data) => ({
      ...data,
      is_synthetic: true,
      synthetic_marker: data.synthetic_marker ?? '[SYNTHETIC TEST CONTENT]',
      target_symbols: data.target_symbols ?? [],
    }));

    // Bulk create
    const created = await this.testArticleRepository.bulkCreate(articlesData);

    // Log audit entry for bulk creation
    const organizationSlug = articles[0]?.organization_slug;
    if (organizationSlug) {
      await this.testAuditLogRepository.log({
        organization_slug: organizationSlug,
        user_id: userId,
        action: 'article_generated',
        resource_type: 'bulk_operation',
        resource_id: created[0]?.scenario_id ?? 'unknown',
        details: {
          count: created.length,
          scenario_id: created[0]?.scenario_id,
        },
      });
    }

    this.logger.log(`Bulk created ${created.length} test articles`);

    return created;
  }

  /**
   * Process a test article through the signal detection pipeline
   * Creates signals for each target symbol in the article
   *
   * @param articleId - Article ID to process
   * @param ctx - Execution context for signal processing
   * @returns Processing result with signals created
   * @throws Error if article not found or processing fails
   */
  async processArticle(
    articleId: string,
    ctx: ExecutionContext,
  ): Promise<ArticleProcessingResult> {
    const article = await this.testArticleRepository.findById(articleId);

    if (!article) {
      throw new Error(`Test article not found: ${articleId}`);
    }

    if (article.processed) {
      this.logger.warn(
        `Article ${articleId} already processed, skipping duplicate processing`,
      );
      return {
        articleId,
        success: true,
        signalsCreated: 0,
        errors: ['Article already processed'],
      };
    }

    const errors: string[] = [];
    const signalsCreated: number[] = [];

    // Process each target symbol
    for (const targetSymbol of article.target_symbols) {
      try {
        // Find target by symbol
        const target = await this.targetRepository.findBySymbol(
          article.organization_slug,
          targetSymbol,
        );

        if (!target) {
          errors.push(`Target not found for symbol: ${targetSymbol}`);
          continue;
        }

        // Create a signal from the article
        const signalData: CreateSignalData = {
          target_id: target.id,
          source_id: 'test-article-source', // TODO: Create a proper test source
          content: `${article.title}\n\n${article.content}`,
          direction: this.mapSentimentToDirection(article.sentiment_expected),
          detected_at: article.published_at,
          url: `synthetic://test-article/${article.id}`,
          metadata: {
            test_article_id: article.id,
            scenario_id: article.scenario_id,
            is_synthetic: true,
            synthetic_marker: article.synthetic_marker,
            sentiment_expected: article.sentiment_expected,
            strength_expected: article.strength_expected,
          },
          // Mark as test data
          is_test_data: true,
          test_scenario_id: article.scenario_id ?? undefined,
        };

        // Create the signal
        const signal = await this.signalRepository.create(signalData);

        // Process the signal through Tier 1 detection
        const detectionResult = await this.signalDetectionService.processSignal(
          ctx,
          {
            signal,
            targetId: target.id,
          },
        );

        this.logger.debug(
          `Processed article ${articleId} for target ${targetSymbol}: ` +
            `signal ${signal.id}, predictor created: ${detectionResult.shouldCreatePredictor}`,
        );

        signalsCreated.push(signal.id as unknown as number);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(`Error processing target ${targetSymbol}: ${errorMessage}`);
        this.logger.error(
          `Error processing article ${articleId} for target ${targetSymbol}: ${errorMessage}`,
        );
      }
    }

    // Mark article as processed
    await this.testArticleRepository.markProcessed(articleId);

    // Log audit entry
    if (article.created_by) {
      await this.testAuditLogRepository.log({
        organization_slug: article.organization_slug,
        user_id: article.created_by,
        action: 'article_updated',
        resource_type: 'test_article',
        resource_id: articleId,
        details: {
          processed: true,
          signals_created: signalsCreated.length,
          errors: errors.length,
        },
      });
    }

    return {
      articleId,
      success: errors.length === 0,
      signalsCreated: signalsCreated.length,
      errors,
    };
  }

  /**
   * Get unprocessed articles for an organization
   *
   * @param orgSlug - Organization slug
   * @returns Array of unprocessed test articles
   */
  async getUnprocessedArticles(_orgSlug: string): Promise<TestArticle[]> {
    return this.testArticleRepository.findUnprocessed();
  }

  /**
   * Validate a test article for INV-08 compliance
   * Checks:
   * - All target_symbols start with T_ prefix
   * - Synthetic markers are present
   * - Required fields are populated
   *
   * @param article - Article to validate
   * @returns Validation result with errors and warnings
   */
  validateArticle(article: TestArticle): ArticleValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // INV-08: All target_symbols must start with T_
    if (article.target_symbols && article.target_symbols.length > 0) {
      for (const symbol of article.target_symbols) {
        if (!symbol.startsWith('T_')) {
          errors.push(
            `Target symbol "${symbol}" must start with T_ prefix (INV-08)`,
          );
        }
      }
    } else {
      warnings.push('No target symbols specified');
    }

    // Ensure synthetic markers are present
    if (!article.is_synthetic) {
      errors.push('Test articles must have is_synthetic=true');
    }

    if (!article.synthetic_marker) {
      warnings.push('No synthetic marker specified');
    }

    // Validate required fields
    if (!article.title || article.title.trim().length === 0) {
      errors.push('Title is required');
    }

    if (!article.content || article.content.trim().length === 0) {
      errors.push('Content is required');
    }

    if (!article.published_at) {
      errors.push('Published date is required');
    }

    // Validate expected sentiment if provided
    if (article.sentiment_expected) {
      const validSentiments = ['positive', 'negative', 'neutral'];
      if (!validSentiments.includes(article.sentiment_expected)) {
        errors.push(
          `Invalid sentiment_expected: ${article.sentiment_expected}. Must be one of: ${validSentiments.join(', ')}`,
        );
      }
    }

    // Validate expected strength if provided
    if (
      article.strength_expected !== null &&
      article.strength_expected !== undefined
    ) {
      if (article.strength_expected < 0.0 || article.strength_expected > 1.0) {
        errors.push(
          `Invalid strength_expected: ${article.strength_expected}. Must be between 0.00 and 1.00`,
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get test articles by scenario
   *
   * @param scenarioId - Scenario ID
   * @returns Array of test articles for the scenario
   */
  async getArticlesByScenario(scenarioId: string): Promise<TestArticle[]> {
    return this.testArticleRepository.findByScenario(scenarioId);
  }

  /**
   * Get test articles by target symbol
   *
   * @param targetSymbol - Target symbol (must start with T_)
   * @returns Array of test articles for the target symbol
   */
  async getArticlesByTargetSymbol(
    targetSymbol: string,
  ): Promise<TestArticle[]> {
    return this.testArticleRepository.findByTargetSymbol(targetSymbol);
  }

  /**
   * Update a test article
   *
   * @param articleId - Article ID
   * @param updateData - Data to update
   * @param userId - User making the update (for audit trail)
   * @returns Updated test article
   */
  async updateArticle(
    articleId: string,
    updateData: UpdateTestArticleData,
    userId: string,
  ): Promise<TestArticle> {
    // Validate if target_symbols are being updated
    if (updateData.target_symbols) {
      for (const symbol of updateData.target_symbols) {
        if (!symbol.startsWith('T_')) {
          throw new Error(
            `Target symbol "${symbol}" must start with T_ prefix (INV-08)`,
          );
        }
      }
    }

    const article = await this.testArticleRepository.update(
      articleId,
      updateData,
    );

    // Log audit entry
    await this.testAuditLogRepository.log({
      organization_slug: article.organization_slug,
      user_id: userId,
      action: 'article_updated',
      resource_type: 'test_article',
      resource_id: articleId,
      details: {
        updated_fields: Object.keys(updateData),
      },
    });

    return article;
  }

  /**
   * Delete a test article
   *
   * @param articleId - Article ID
   * @param userId - User deleting the article (for audit trail)
   * @param organizationSlug - Organization slug (for audit trail)
   */
  async deleteArticle(
    articleId: string,
    userId: string,
    organizationSlug: string,
  ): Promise<void> {
    await this.testArticleRepository.delete(articleId);

    // Log audit entry
    await this.testAuditLogRepository.log({
      organization_slug: organizationSlug,
      user_id: userId,
      action: 'article_deleted',
      resource_type: 'test_article',
      resource_id: articleId,
      details: {},
    });
  }

  /**
   * Map sentiment to signal direction
   * Helper method for processing articles
   */
  private mapSentimentToDirection(
    sentiment: string | null,
  ): 'bullish' | 'bearish' | 'neutral' {
    if (sentiment === 'positive') return 'bullish';
    if (sentiment === 'negative') return 'bearish';
    return 'neutral';
  }
}
