/**
 * Scenario Generator Service
 *
 * Automatically generates test scenarios from real-world events.
 * Part of Phase 4.2 and 4.3 of the Test-Based Learning Loop PRD.
 *
 * Responsibilities:
 * - Generate test scenarios from missed opportunities
 * - Generate test scenarios from learnings/evaluations
 * - Map real targets to T_ test mirror targets
 * - Generate test articles based on real events
 * - Generate test price data based on actual outcomes
 * - Link scenarios back to their source
 */

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { AiArticleGeneratorService } from './ai-article-generator.service';
import { TestTargetMirrorService } from './test-target-mirror.service';
import { TestScenarioRepository } from '../repositories/test-scenario.repository';
import { TestArticleRepository } from '../repositories/test-article.repository';
import { TestPriceDataRepository } from '../repositories/test-price-data.repository';
import { TargetRepository } from '../repositories/target.repository';
import { LearningRepository } from '../repositories/learning.repository';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  ScenarioGenerationOptions,
  GeneratedScenario,
  TestArticleGenerationRequest,
} from '../interfaces/ai-generation.interface';
import { MissedOpportunity } from '../interfaces/missed-opportunity.interface';
import { Learning } from '../interfaces/learning.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

@Injectable()
export class ScenarioGeneratorService {
  private readonly logger = new Logger(ScenarioGeneratorService.name);
  private readonly schema = 'prediction';

  constructor(
    private readonly aiArticleGeneratorService: AiArticleGeneratorService,
    private readonly testScenarioRepository: TestScenarioRepository,
    private readonly testTargetMirrorService: TestTargetMirrorService,
    private readonly testArticleRepository: TestArticleRepository,
    private readonly testPriceDataRepository: TestPriceDataRepository,
    private readonly targetRepository: TargetRepository,
    private readonly learningRepository: LearningRepository,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
  ) {}

  /**
   * Generate a test scenario from a missed opportunity
   * Maps real target to T_ test mirror
   * Creates test articles and price data
   */
  async generateFromMissedOpportunity(
    missedOpportunityId: string,
    options: ScenarioGenerationOptions,
    ctx: ExecutionContext,
  ): Promise<GeneratedScenario> {
    const startTime = Date.now();

    this.logger.log(
      `Generating test scenario from missed opportunity: ${missedOpportunityId}`,
    );

    // 1. Fetch missed opportunity
    const missedOpportunity =
      await this.getMissedOpportunity(missedOpportunityId);

    // 2. Get the real target
    const realTarget = await this.targetRepository.findByIdOrThrow(
      missedOpportunity.target_id,
    );

    // 3. Find or create T_ test mirror target
    const testTarget = await this.testTargetMirrorService.ensureMirror(
      realTarget.id,
      ctx.orgSlug,
    );

    this.logger.log(
      `Mapped ${realTarget.symbol} -> ${testTarget.symbol} (test mirror)`,
    );

    // 4. Determine scenario type from missed opportunity
    const scenarioType = this.determineScenarioTypeFromMiss(missedOpportunity);
    const sentiment =
      missedOpportunity.move_direction === 'up' ? 'bullish' : 'bearish';
    const strength = this.determineStrength(missedOpportunity.move_percentage);

    // 5. Generate test articles using AI
    const articleCount = options.articleCount || 3;
    const articleRequest: TestArticleGenerationRequest = {
      target_symbols: [testTarget.symbol],
      scenario_type: scenarioType,
      sentiment,
      strength,
      article_count: articleCount,
    };

    const articleGenResult =
      await this.aiArticleGeneratorService.generateArticles(
        articleRequest,
        ctx,
      );

    if (!articleGenResult.success || articleGenResult.articles.length === 0) {
      throw new Error(
        `Failed to generate articles: ${articleGenResult.errors?.join(', ') || 'Unknown error'}`,
      );
    }

    // 6. Create test price data based on missed opportunity price movement
    const priceData = this.generatePriceDataFromMiss(
      testTarget.symbol,
      missedOpportunity,
      ctx.orgSlug,
    );

    // 7. Create scenario in database
    const scenario = await this.testScenarioRepository.create({
      name: `Missed Opportunity: ${realTarget.symbol} ${missedOpportunity.move_direction} ${missedOpportunity.move_percentage.toFixed(1)}%`,
      description: `Test scenario generated from missed opportunity ${missedOpportunityId}. Real move: ${missedOpportunity.move_percentage.toFixed(1)}% ${missedOpportunity.move_direction} from ${missedOpportunity.move_start} to ${missedOpportunity.move_end}.`,
      injection_points: ['targets', 'sources', 'signals'],
      target_id: testTarget.id,
      organization_slug: ctx.orgSlug,
      config: {
        source_missed_opportunity_id: missedOpportunityId,
        expected_outcome: {
          direction: missedOpportunity.move_direction,
          percentage: missedOpportunity.move_percentage,
          move_start: missedOpportunity.move_start,
          move_end: missedOpportunity.move_end,
        },
        scenario_type: scenarioType,
      },
    });

    // 8. Create test articles in database
    const createdArticles = await Promise.all(
      articleGenResult.articles.map((article) =>
        this.testArticleRepository.create({
          organization_slug: ctx.orgSlug,
          scenario_id: scenario.id,
          title: article.title,
          content: article.content,
          source_name: article.simulated_source_name,
          published_at: article.simulated_published_at,
          target_symbols: article.target_symbols,
          sentiment_expected: this.mapSentiment(article.intended_sentiment),
          strength_expected: this.mapStrength(article.intended_strength),
          is_synthetic: true,
          synthetic_marker: '[SYNTHETIC TEST ARTICLE]',
          processed: false,
          metadata: {
            source_missed_opportunity_id: missedOpportunityId,
            generated_by: 'ai-article-generator',
            model_used: articleGenResult.generation_metadata.model_used,
          },
        }),
      ),
    );

    // 9. Create test price data in database
    const createdPriceData =
      await this.testPriceDataRepository.bulkCreate(priceData);

    const generationTime = Date.now() - startTime;

    this.logger.log(
      `Generated scenario ${scenario.id} from missed opportunity ${missedOpportunityId} in ${generationTime}ms`,
    );

    return {
      scenario: {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        target_id: scenario.target_id,
        organization_slug: scenario.organization_slug,
        config: scenario.config,
        status: scenario.status,
      },
      articles: createdArticles.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        target_symbols: a.target_symbols,
        sentiment_expected: a.sentiment_expected,
      })),
      priceData:
        createdPriceData.created_count > 0
          ? priceData.map((p, i) => ({
              id: `price-${i}`,
              symbol: p.symbol,
              price_timestamp: p.price_timestamp,
              open: p.open,
              high: p.high,
              low: p.low,
              close: p.close,
              volume: p.volume || 0,
            }))
          : [],
      sourceType: 'missed_opportunity',
      sourceId: missedOpportunityId,
      realTargetSymbol: realTarget.symbol,
      testTargetSymbol: testTarget.symbol,
      metadata: {
        generationTimeMs: generationTime,
        articlesGenerated: createdArticles.length,
        pricePointsGenerated: createdPriceData.created_count,
      },
    };
  }

  /**
   * Generate a test scenario from a learning/evaluation
   */
  async generateFromLearning(
    learningId: string,
    options: ScenarioGenerationOptions,
    ctx: ExecutionContext,
  ): Promise<GeneratedScenario> {
    const startTime = Date.now();

    this.logger.log(`Generating test scenario from learning: ${learningId}`);

    // 1. Fetch learning
    const learning = await this.learningRepository.findByIdOrThrow(learningId);

    // 2. Determine target from learning scope
    const realTarget = await this.getTargetFromLearning(learning);

    // 3. Find or create T_ test mirror target
    const testTarget = await this.testTargetMirrorService.ensureMirror(
      realTarget.id,
      ctx.orgSlug,
    );

    this.logger.log(
      `Mapped ${realTarget.symbol} -> ${testTarget.symbol} (test mirror)`,
    );

    // 4. Determine scenario type from learning
    const scenarioType = this.determineScenarioTypeFromLearning(learning);
    const sentiment = this.determineSentimentFromLearning(learning);
    const strength = 'moderate'; // Default for learnings

    // 5. Generate test articles using AI
    const articleCount = options.articleCount || 3;
    const articleRequest: TestArticleGenerationRequest = {
      target_symbols: [testTarget.symbol],
      scenario_type: scenarioType,
      sentiment,
      strength,
      article_count: articleCount,
      custom_prompt: options.additionalContext || learning.description,
    };

    const articleGenResult =
      await this.aiArticleGeneratorService.generateArticles(
        articleRequest,
        ctx,
      );

    if (!articleGenResult.success || articleGenResult.articles.length === 0) {
      throw new Error(
        `Failed to generate articles: ${articleGenResult.errors?.join(', ') || 'Unknown error'}`,
      );
    }

    // 6. Generate placeholder price data (learning may not have specific price movement)
    const priceData = this.generatePlaceholderPriceData(
      testTarget.symbol,
      sentiment,
      ctx.orgSlug,
    );

    // 7. Create scenario in database
    const scenario = await this.testScenarioRepository.create({
      name: `Learning: ${learning.title}`,
      description: `Test scenario generated from learning ${learningId}: ${learning.description}`,
      injection_points: ['targets', 'sources', 'signals'],
      target_id: testTarget.id,
      organization_slug: ctx.orgSlug,
      config: {
        source_learning_id: learningId,
        source_evaluation_id: learning.source_evaluation_id,
        learning_type: learning.learning_type,
        scenario_type: scenarioType,
      },
    });

    // 8. Create test articles in database
    const createdArticles = await Promise.all(
      articleGenResult.articles.map((article) =>
        this.testArticleRepository.create({
          organization_slug: ctx.orgSlug,
          scenario_id: scenario.id,
          title: article.title,
          content: article.content,
          source_name: article.simulated_source_name,
          published_at: article.simulated_published_at,
          target_symbols: article.target_symbols,
          sentiment_expected: this.mapSentiment(article.intended_sentiment),
          strength_expected: this.mapStrength(article.intended_strength),
          is_synthetic: true,
          synthetic_marker: '[SYNTHETIC TEST ARTICLE]',
          processed: false,
          metadata: {
            source_learning_id: learningId,
            generated_by: 'ai-article-generator',
            model_used: articleGenResult.generation_metadata.model_used,
          },
        }),
      ),
    );

    // 9. Create test price data in database
    const createdPriceData =
      await this.testPriceDataRepository.bulkCreate(priceData);

    const generationTime = Date.now() - startTime;

    this.logger.log(
      `Generated scenario ${scenario.id} from learning ${learningId} in ${generationTime}ms`,
    );

    return {
      scenario: {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        target_id: scenario.target_id,
        organization_slug: scenario.organization_slug,
        config: scenario.config,
        status: scenario.status,
      },
      articles: createdArticles.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        target_symbols: a.target_symbols,
        sentiment_expected: a.sentiment_expected,
      })),
      priceData:
        createdPriceData.created_count > 0
          ? priceData.map((p, i) => ({
              id: `price-${i}`,
              symbol: p.symbol,
              price_timestamp: p.price_timestamp,
              open: p.open,
              high: p.high,
              low: p.low,
              close: p.close,
              volume: p.volume || 0,
            }))
          : [],
      sourceType: 'learning',
      sourceId: learningId,
      realTargetSymbol: realTarget.symbol,
      testTargetSymbol: testTarget.symbol,
      metadata: {
        generationTimeMs: generationTime,
        articlesGenerated: createdArticles.length,
        pricePointsGenerated: createdPriceData.created_count,
      },
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Fetch missed opportunity from database
   */
  private async getMissedOpportunity(id: string): Promise<MissedOpportunity> {
    const { data, error } = (await this.db
      .from(this.schema, 'missed_opportunities')
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<MissedOpportunity>;

    if (error || !data) {
      throw new NotFoundException(`Missed opportunity not found: ${id}`);
    }

    return data;
  }

  /**
   * Get target from learning scope
   */
  private async getTargetFromLearning(learning: Learning) {
    // If learning has target_id, use that
    if (learning.target_id) {
      return this.targetRepository.findByIdOrThrow(learning.target_id);
    }

    // Otherwise, for broader scopes, we need a default target
    // For now, throw an error - in the future, we could select a representative target
    throw new Error(
      `Cannot generate scenario from learning ${learning.id} - no specific target defined. Learning scope: ${learning.scope_level}`,
    );
  }

  /**
   * Determine scenario type from missed opportunity
   */
  private determineScenarioTypeFromMiss(
    miss: MissedOpportunity,
  ): TestArticleGenerationRequest['scenario_type'] {
    // Check source gaps to infer scenario type
    const gaps = miss.source_gaps || [];

    if (gaps.some((g) => g.includes('earning'))) {
      return miss.move_direction === 'up' ? 'earnings_beat' : 'earnings_miss';
    }

    if (gaps.some((g) => g.includes('regulat'))) {
      return 'regulatory';
    }

    if (gaps.some((g) => g.includes('acquisition') || g.includes('merger'))) {
      return 'acquisition';
    }

    if (gaps.some((g) => g.includes('scandal') || g.includes('controvers'))) {
      return 'scandal';
    }

    // Default to technical if no specific pattern found
    return 'technical';
  }

  /**
   * Determine scenario type from learning
   */
  private determineScenarioTypeFromLearning(
    learning: Learning,
  ): TestArticleGenerationRequest['scenario_type'] {
    const titleLower = learning.title.toLowerCase();
    const descLower = learning.description.toLowerCase();

    if (titleLower.includes('earning') || descLower.includes('earning')) {
      return 'earnings_beat';
    }

    if (titleLower.includes('regulat') || descLower.includes('regulat')) {
      return 'regulatory';
    }

    if (
      titleLower.includes('acquisition') ||
      titleLower.includes('merger') ||
      descLower.includes('acquisition') ||
      descLower.includes('merger')
    ) {
      return 'acquisition';
    }

    if (
      titleLower.includes('scandal') ||
      titleLower.includes('controvers') ||
      descLower.includes('scandal') ||
      descLower.includes('controvers')
    ) {
      return 'scandal';
    }

    if (titleLower.includes('macro') || descLower.includes('macro')) {
      return 'macro_shock';
    }

    return 'custom';
  }

  /**
   * Determine sentiment from learning
   */
  private determineSentimentFromLearning(
    learning: Learning,
  ): 'bullish' | 'bearish' | 'neutral' | 'mixed' {
    const titleLower = learning.title.toLowerCase();
    const descLower = learning.description.toLowerCase();

    // Check for bullish indicators
    const bullishWords = ['positive', 'bullish', 'growth', 'beat', 'surge'];
    const bearishWords = [
      'negative',
      'bearish',
      'decline',
      'miss',
      'drop',
      'fall',
    ];

    const hasBullish = bullishWords.some(
      (w) => titleLower.includes(w) || descLower.includes(w),
    );
    const hasBearish = bearishWords.some(
      (w) => titleLower.includes(w) || descLower.includes(w),
    );

    if (hasBullish && hasBearish) return 'mixed';
    if (hasBullish) return 'bullish';
    if (hasBearish) return 'bearish';

    return 'neutral';
  }

  /**
   * Determine strength from move percentage
   */
  private determineStrength(
    movePercentage: number,
  ): 'strong' | 'moderate' | 'weak' {
    const abs = Math.abs(movePercentage);

    if (abs >= 10) return 'strong';
    if (abs >= 5) return 'moderate';
    return 'weak';
  }

  /**
   * Generate price data from missed opportunity
   */
  private generatePriceDataFromMiss(
    symbol: string,
    miss: MissedOpportunity,
    orgSlug: string,
  ) {
    const moveStart = new Date(miss.move_start);
    const moveEnd = new Date(miss.move_end);

    // Generate hourly price points from start to end
    const priceData = [];
    const hours = Math.ceil(
      (moveEnd.getTime() - moveStart.getTime()) / (1000 * 60 * 60),
    );

    // Start with a base price of 100 for simplicity
    const basePrice = 100;
    const finalPrice = basePrice * (1 + miss.move_percentage / 100);

    for (let i = 0; i <= hours; i++) {
      const timestamp = new Date(
        moveStart.getTime() + i * 60 * 60 * 1000,
      ).toISOString();

      // Linear interpolation of price
      const progress = i / hours;
      const currentPrice = basePrice + (finalPrice - basePrice) * progress;

      // Add some volatility (±1%)
      const volatility = currentPrice * 0.01;
      const open = currentPrice + (Math.random() - 0.5) * volatility;
      const close = currentPrice + (Math.random() - 0.5) * volatility;
      const high = Math.max(open, close) + Math.random() * volatility;
      const low = Math.min(open, close) - Math.random() * volatility;

      priceData.push({
        organization_slug: orgSlug,
        symbol,
        price_timestamp: timestamp,
        open: Math.max(0.01, open),
        high: Math.max(0.01, high),
        low: Math.max(0.01, low),
        close: Math.max(0.01, close),
        volume: Math.floor(1000000 + Math.random() * 5000000),
      });
    }

    return priceData;
  }

  /**
   * Generate placeholder price data for learning-based scenarios
   */
  private generatePlaceholderPriceData(
    symbol: string,
    sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed',
    orgSlug: string,
  ) {
    const priceData = [];
    const basePrice = 100;

    // Generate 24 hours of data
    const now = new Date();
    const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Determine price movement based on sentiment
    let finalMultiplier = 1.0;
    if (sentiment === 'bullish')
      finalMultiplier = 1.05; // 5% up
    else if (sentiment === 'bearish')
      finalMultiplier = 0.95; // 5% down
    else if (sentiment === 'mixed') finalMultiplier = 1.02; // slight up

    const finalPrice = basePrice * finalMultiplier;

    for (let i = 0; i <= 24; i++) {
      const timestamp = new Date(
        startTime.getTime() + i * 60 * 60 * 1000,
      ).toISOString();

      const progress = i / 24;
      const currentPrice = basePrice + (finalPrice - basePrice) * progress;

      const volatility = currentPrice * 0.01;
      const open = currentPrice + (Math.random() - 0.5) * volatility;
      const close = currentPrice + (Math.random() - 0.5) * volatility;
      const high = Math.max(open, close) + Math.random() * volatility;
      const low = Math.min(open, close) - Math.random() * volatility;

      priceData.push({
        organization_slug: orgSlug,
        symbol,
        price_timestamp: timestamp,
        open: Math.max(0.01, open),
        high: Math.max(0.01, high),
        low: Math.max(0.01, low),
        close: Math.max(0.01, close),
        volume: Math.floor(1000000 + Math.random() * 5000000),
      });
    }

    return priceData;
  }

  /**
   * Map sentiment string to expected format
   */
  private mapSentiment(sentiment: string): 'positive' | 'negative' | 'neutral' {
    if (sentiment === 'bullish') return 'positive';
    if (sentiment === 'bearish') return 'negative';
    return 'neutral';
  }

  /**
   * Map strength string to numeric value
   */
  private mapStrength(strength: string): number {
    if (strength === 'strong') return 0.8;
    if (strength === 'moderate') return 0.5;
    if (strength === 'weak') return 0.2;
    return 0.5; // Default
  }
}
