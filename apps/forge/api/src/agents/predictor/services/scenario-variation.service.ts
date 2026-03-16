/**
 * Scenario Variation Service
 *
 * Generates variations of existing test scenarios for Phase 4.4.
 * Prevents overfitting by testing the system with different versions of the same
 * base scenario (timing shifts, sentiment strength changes, conflicting signals,
 * language ambiguity).
 *
 * Part of the Test-Based Learning Loop PRD.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { AiArticleGeneratorService } from './ai-article-generator.service';
import { TestScenarioRepository } from '../repositories/test-scenario.repository';
import {
  TestArticleRepository,
  TestArticle,
} from '../repositories/test-article.repository';
import {
  TestPriceDataRepository,
  TestPriceData,
} from '../repositories/test-price-data.repository';
import {
  ScenarioVariationRequest,
  ScenarioVariationResult,
  ScenarioVariation,
  VariationType,
  TestArticleGenerationRequest,
} from '../interfaces/ai-generation.interface';
import { TestScenario } from '../interfaces/test-data.interface';

@Injectable()
export class ScenarioVariationService {
  private readonly logger = new Logger(ScenarioVariationService.name);

  constructor(
    private readonly testScenarioRepository: TestScenarioRepository,
    private readonly testArticleRepository: TestArticleRepository,
    private readonly testPriceDataRepository: TestPriceDataRepository,
    private readonly aiArticleGeneratorService: AiArticleGeneratorService,
  ) {}

  /**
   * Generate variations of an existing scenario
   */
  async generateVariations(
    request: ScenarioVariationRequest,
    ctx: ExecutionContext,
  ): Promise<ScenarioVariationResult> {
    const startTime = Date.now();

    this.logger.log(
      `Generating variations for scenario: ${request.sourceScenarioId}`,
    );
    this.logger.debug(
      `Variation types: ${request.variationTypes.join(', ')} (${request.variationsPerType || 1} per type)`,
    );

    try {
      // 1. Fetch the source scenario
      const sourceScenario = await this.testScenarioRepository.findById(
        request.sourceScenarioId,
      );

      if (!sourceScenario) {
        throw new NotFoundException(
          `Source scenario not found: ${request.sourceScenarioId}`,
        );
      }

      // 2. Fetch source scenario's articles and price data
      const sourceArticles = await this.testArticleRepository.findByScenario(
        request.sourceScenarioId,
      );
      const sourcePriceData = await this.testPriceDataRepository.findByScenario(
        request.sourceScenarioId,
      );

      this.logger.debug(
        `Source scenario has ${sourceArticles.length} articles and ${sourcePriceData.length} price data points`,
      );

      // 3. Generate variations for each type
      const variations: ScenarioVariation[] = [];
      const errors: string[] = [];
      const variationsPerType = request.variationsPerType || 1;

      for (const variationType of request.variationTypes) {
        for (let i = 0; i < variationsPerType; i++) {
          try {
            const variation = await this.generateSingleVariation(
              sourceScenario,
              sourceArticles,
              sourcePriceData,
              variationType,
              i + 1,
              ctx,
            );
            variations.push(variation);
          } catch (error) {
            const errorMessage = `Failed to generate ${variationType} variation ${i + 1}: ${error instanceof Error ? error.message : String(error)}`;
            this.logger.error(errorMessage);
            errors.push(errorMessage);
          }
        }
      }

      const generationTime = Date.now() - startTime;

      this.logger.log(
        `Generated ${variations.length} variations in ${generationTime}ms`,
      );

      return {
        success: variations.length > 0,
        sourceScenario: {
          id: sourceScenario.id,
          name: sourceScenario.name,
          description: sourceScenario.description,
          target_id: sourceScenario.target_id,
          organization_slug: sourceScenario.organization_slug,
          config: sourceScenario.config,
          status: sourceScenario.status,
        },
        variations,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to generate variations: ${errorMessage}`);

      throw error;
    }
  }

  /**
   * Generate a single variation based on type
   */
  private async generateSingleVariation(
    sourceScenario: TestScenario,
    sourceArticles: TestArticle[],
    sourcePriceData: TestPriceData[],
    variationType: VariationType,
    variationIndex: number,
    ctx: ExecutionContext,
  ): Promise<ScenarioVariation> {
    this.logger.debug(
      `Generating ${variationType} variation ${variationIndex}`,
    );

    switch (variationType) {
      case 'timing_shift':
        return this.generateTimingVariation(
          sourceScenario,
          sourceArticles,
          sourcePriceData,
          variationIndex,
          ctx,
        );

      case 'sentiment_weaker':
        return this.generateSentimentVariation(
          sourceScenario,
          sourceArticles,
          sourcePriceData,
          'weaker',
          variationIndex,
          ctx,
        );

      case 'sentiment_stronger':
        return this.generateSentimentVariation(
          sourceScenario,
          sourceArticles,
          sourcePriceData,
          'stronger',
          variationIndex,
          ctx,
        );

      case 'conflicting_signal':
        return this.generateConflictingSignalVariation(
          sourceScenario,
          sourceArticles,
          sourcePriceData,
          variationIndex,
          ctx,
        );

      case 'language_ambiguity':
        return this.generateLanguageAmbiguityVariation(
          sourceScenario,
          sourceArticles,
          sourcePriceData,
          variationIndex,
          ctx,
        );

      case 'negation':
        return this.generateNegationVariation(
          sourceScenario,
          sourceArticles,
          sourcePriceData,
          variationIndex,
          ctx,
        );

      case 'delayed_outcome':
        return this.generateDelayedOutcomeVariation(
          sourceScenario,
          sourceArticles,
          sourcePriceData,
          variationIndex,
          ctx,
        );

      case 'multi_article':
        return this.generateMultiArticleVariation(
          sourceScenario,
          sourceArticles,
          sourcePriceData,
          variationIndex,
          ctx,
        );

      default:
        throw new Error(`Unsupported variation type: ${String(variationType)}`);
    }
  }

  // ============================================================================
  // Variation Type Implementations
  // ============================================================================

  /**
   * Timing Shift Variation
   * Shifts all timestamps by a configurable amount
   */
  private async generateTimingVariation(
    sourceScenario: TestScenario,
    sourceArticles: TestArticle[],
    sourcePriceData: TestPriceData[],
    variationIndex: number,
    _ctx: ExecutionContext,
  ): Promise<ScenarioVariation> {
    // Determine shift amount (vary by index)
    const shiftHours =
      variationIndex === 1 ? 2 : variationIndex === 2 ? -24 : 12;
    const shiftMs = shiftHours * 60 * 60 * 1000;

    const variationConfig = {
      shift_hours: shiftHours,
      shift_direction: shiftHours > 0 ? 'forward' : 'backward',
    };

    // Create variation scenario
    const variationScenario = await this.testScenarioRepository.create({
      name: `${sourceScenario.name} - Timing Shift (${shiftHours > 0 ? '+' : ''}${shiftHours}h)`,
      description: `${sourceScenario.description || ''} [Variation: All timestamps shifted by ${shiftHours} hours]`,
      injection_points: sourceScenario.injection_points,
      target_id: sourceScenario.target_id || undefined,
      organization_slug: sourceScenario.organization_slug,
      config: {
        ...sourceScenario.config,
        parent_scenario_id: sourceScenario.id,
        variation_type: 'timing_shift',
        variation_config: variationConfig,
      },
    });

    // Clone articles with shifted timestamps
    const clonedArticles = await Promise.all(
      sourceArticles.map((article) => {
        const shiftedPublishedAt = new Date(
          new Date(article.published_at).getTime() + shiftMs,
        ).toISOString();

        return this.testArticleRepository.create({
          organization_slug: article.organization_slug,
          scenario_id: variationScenario.id,
          title: article.title,
          content: article.content,
          source_name: article.source_name,
          published_at: shiftedPublishedAt,
          target_symbols: article.target_symbols,
          sentiment_expected: this.nullToUndefined(
            article.sentiment_expected,
          ) as 'positive' | 'negative' | 'neutral' | undefined,
          strength_expected: this.nullToUndefined(article.strength_expected),
          is_synthetic: article.is_synthetic,
          synthetic_marker: this.nullToUndefined(article.synthetic_marker),
          processed: false,
          metadata: {
            ...article.metadata,
            variation_from_article_id: article.id,
          },
        });
      }),
    );

    // Clone price data with shifted timestamps
    const shiftedPriceData = sourcePriceData.map((price) => ({
      ...price,
      scenario_id: variationScenario.id,
      price_timestamp: new Date(
        new Date(price.price_timestamp).getTime() + shiftMs,
      ).toISOString(),
    }));

    const _createdPriceData =
      await this.testPriceDataRepository.bulkCreate(shiftedPriceData);

    return {
      parentScenarioId: sourceScenario.id,
      variationType: 'timing_shift',
      variationName: `Timing Shift (${shiftHours > 0 ? '+' : ''}${shiftHours}h)`,
      variationConfig,
      scenario: {
        id: variationScenario.id,
        name: variationScenario.name,
        description: variationScenario.description,
        target_id: variationScenario.target_id,
        organization_slug: variationScenario.organization_slug,
        config: variationScenario.config,
        status: variationScenario.status,
      },
      articles: clonedArticles.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        target_symbols: a.target_symbols,
        sentiment_expected: a.sentiment_expected,
      })),
      priceData: shiftedPriceData.map((p, i) => ({
        id: `price-${i}`,
        symbol: p.symbol,
        price_timestamp: p.price_timestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume || 0,
      })),
    };
  }

  /**
   * Sentiment Variation (Weaker or Stronger)
   * Uses AI to regenerate articles with adjusted sentiment strength
   */
  private async generateSentimentVariation(
    sourceScenario: TestScenario,
    sourceArticles: TestArticle[],
    sourcePriceData: TestPriceData[],
    direction: 'weaker' | 'stronger',
    variationIndex: number,
    ctx: ExecutionContext,
  ): Promise<ScenarioVariation> {
    const variationConfig = {
      sentiment_adjustment: direction,
      strength_multiplier: direction === 'weaker' ? 0.5 : 1.5,
    };

    // Create variation scenario
    const variationScenario = await this.testScenarioRepository.create({
      name: `${sourceScenario.name} - ${direction === 'weaker' ? 'Weaker' : 'Stronger'} Sentiment`,
      description: `${sourceScenario.description || ''} [Variation: Sentiment strength adjusted ${direction}]`,
      injection_points: sourceScenario.injection_points,
      target_id: this.nullToUndefined(sourceScenario.target_id),
      organization_slug: sourceScenario.organization_slug,
      config: {
        ...sourceScenario.config,
        parent_scenario_id: sourceScenario.id,
        variation_type:
          direction === 'weaker' ? 'sentiment_weaker' : 'sentiment_stronger',
        variation_config: variationConfig,
      },
    });

    // Regenerate articles with adjusted sentiment
    const regeneratedArticles = [];

    for (const sourceArticle of sourceArticles) {
      // Determine original sentiment
      const originalSentiment =
        sourceArticle.sentiment_expected === 'positive'
          ? 'bullish'
          : sourceArticle.sentiment_expected === 'negative'
            ? 'bearish'
            : 'neutral';

      // Determine adjusted strength
      const originalStrength = this.inferStrength(
        sourceArticle.strength_expected || 0.5,
      );
      const adjustedStrength =
        direction === 'weaker'
          ? this.weakenStrength(originalStrength)
          : this.strengthenStrength(originalStrength);

      // Use AI to regenerate article
      const customPrompt = `Rewrite the following article with ${direction} sentiment language. Keep the same basic story and target symbols, but adjust the emotional intensity ${direction}.

Original article:
Title: ${sourceArticle.title}
Content: ${sourceArticle.content}

Target symbols: ${sourceArticle.target_symbols.join(', ')}
Adjust sentiment to be ${direction} than the original.`;

      const articleRequest: TestArticleGenerationRequest = {
        target_symbols: sourceArticle.target_symbols,
        scenario_type: 'custom',
        sentiment: originalSentiment,
        strength: adjustedStrength,
        custom_prompt: customPrompt,
        article_count: 1,
      };

      const genResult = await this.aiArticleGeneratorService.generateArticles(
        articleRequest,
        ctx,
      );

      if (genResult.success && genResult.articles.length > 0) {
        const generatedArticle = genResult.articles[0];

        if (generatedArticle) {
          const createdArticle = await this.testArticleRepository.create({
            organization_slug: sourceArticle.organization_slug,
            scenario_id: variationScenario.id,
            title: generatedArticle.title,
            content: generatedArticle.content,
            source_name: generatedArticle.simulated_source_name,
            published_at: generatedArticle.simulated_published_at,
            target_symbols: generatedArticle.target_symbols,
            sentiment_expected: this.mapSentiment(
              generatedArticle.intended_sentiment,
            ),
            strength_expected: this.mapStrength(
              generatedArticle.intended_strength,
            ),
            is_synthetic: true,
            synthetic_marker: '[SYNTHETIC TEST ARTICLE]',
            processed: false,
            metadata: {
              variation_from_article_id: sourceArticle.id,
              generated_by: 'ai-article-generator',
              variation_type:
                direction === 'weaker'
                  ? 'sentiment_weaker'
                  : 'sentiment_stronger',
            },
          });

          regeneratedArticles.push(createdArticle);
        }
      }
    }

    // Clone price data (no changes needed for sentiment variation)
    const clonedPriceData = sourcePriceData.map((price) => ({
      ...price,
      scenario_id: variationScenario.id,
    }));

    const _createdPriceData =
      await this.testPriceDataRepository.bulkCreate(clonedPriceData);

    return {
      parentScenarioId: sourceScenario.id,
      variationType:
        direction === 'weaker' ? 'sentiment_weaker' : 'sentiment_stronger',
      variationName: `${direction === 'weaker' ? 'Weaker' : 'Stronger'} Sentiment`,
      variationConfig,
      scenario: {
        id: variationScenario.id,
        name: variationScenario.name,
        description: variationScenario.description,
        target_id: variationScenario.target_id,
        organization_slug: variationScenario.organization_slug,
        config: variationScenario.config,
        status: variationScenario.status,
      },
      articles: regeneratedArticles.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        target_symbols: a.target_symbols,
        sentiment_expected: a.sentiment_expected,
      })),
      priceData: clonedPriceData.map((p, i) => ({
        id: `price-${i}`,
        symbol: p.symbol,
        price_timestamp: p.price_timestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume || 0,
      })),
    };
  }

  /**
   * Conflicting Signal Variation
   * Adds an opposing article to test mixed signal handling
   */
  private async generateConflictingSignalVariation(
    sourceScenario: TestScenario,
    sourceArticles: TestArticle[],
    sourcePriceData: TestPriceData[],
    variationIndex: number,
    ctx: ExecutionContext,
  ): Promise<ScenarioVariation> {
    const variationConfig = {
      adds_conflicting_article: true,
      conflicting_count: 1,
    };

    // Create variation scenario
    const variationScenario = await this.testScenarioRepository.create({
      name: `${sourceScenario.name} - Conflicting Signal`,
      description: `${sourceScenario.description || ''} [Variation: Added conflicting signal article]`,
      injection_points: sourceScenario.injection_points,
      target_id: this.nullToUndefined(sourceScenario.target_id),
      organization_slug: sourceScenario.organization_slug,
      config: {
        ...sourceScenario.config,
        parent_scenario_id: sourceScenario.id,
        variation_type: 'conflicting_signal',
        variation_config: variationConfig,
      },
    });

    // Clone original articles
    const clonedArticles = await Promise.all(
      sourceArticles.map((article) =>
        this.testArticleRepository.create({
          organization_slug: article.organization_slug,
          scenario_id: variationScenario.id,
          title: article.title,
          content: article.content,
          source_name: article.source_name,
          published_at: article.published_at,
          target_symbols: article.target_symbols,
          sentiment_expected: this.nullToUndefined(
            article.sentiment_expected,
          ) as 'positive' | 'negative' | 'neutral' | undefined,
          strength_expected: this.nullToUndefined(article.strength_expected),
          is_synthetic: article.is_synthetic,
          synthetic_marker: this.nullToUndefined(article.synthetic_marker),
          processed: false,
          metadata: {
            ...article.metadata,
            variation_from_article_id: article.id,
          },
        }),
      ),
    );

    // Generate conflicting article (opposite sentiment)
    const firstArticle = sourceArticles[0];
    if (firstArticle) {
      const originalSentiment =
        firstArticle.sentiment_expected === 'positive'
          ? 'bullish'
          : firstArticle.sentiment_expected === 'negative'
            ? 'bearish'
            : 'neutral';
      const oppositeSentiment =
        originalSentiment === 'bullish'
          ? 'bearish'
          : originalSentiment === 'bearish'
            ? 'bullish'
            : 'neutral';

      const customPrompt = `Generate a conflicting article about ${firstArticle.target_symbols.join(', ')} that contradicts the original article. If the original was positive, make this negative, and vice versa.

Original article sentiment: ${originalSentiment}
Target symbols: ${firstArticle.target_symbols.join(', ')}

Generate an article with opposite sentiment.`;

      const articleRequest: TestArticleGenerationRequest = {
        target_symbols: firstArticle.target_symbols,
        scenario_type: 'custom',
        sentiment: oppositeSentiment,
        strength: 'moderate',
        custom_prompt: customPrompt,
        article_count: 1,
      };

      const genResult = await this.aiArticleGeneratorService.generateArticles(
        articleRequest,
        ctx,
      );

      if (genResult.success && genResult.articles.length > 0) {
        const generatedArticle = genResult.articles[0];

        if (generatedArticle) {
          // Add conflicting article with a timestamp between original articles
          const publishedAt = firstArticle.published_at
            ? new Date(
                new Date(firstArticle.published_at).getTime() + 30 * 60 * 1000,
              ).toISOString()
            : new Date().toISOString();

          const conflictingArticle = await this.testArticleRepository.create({
            organization_slug: firstArticle.organization_slug,
            scenario_id: variationScenario.id,
            title: generatedArticle.title,
            content: generatedArticle.content,
            source_name: generatedArticle.simulated_source_name,
            published_at: publishedAt,
            target_symbols: generatedArticle.target_symbols,
            sentiment_expected: this.mapSentiment(
              generatedArticle.intended_sentiment,
            ),
            strength_expected: this.mapStrength(
              generatedArticle.intended_strength,
            ),
            is_synthetic: true,
            synthetic_marker: '[SYNTHETIC TEST ARTICLE]',
            processed: false,
            metadata: {
              generated_by: 'ai-article-generator',
              variation_type: 'conflicting_signal',
              is_conflicting_signal: true,
            },
          });

          clonedArticles.push(conflictingArticle);
        }
      }
    }

    // Clone price data
    const clonedPriceData = sourcePriceData.map((price) => ({
      ...price,
      scenario_id: variationScenario.id,
    }));

    const _createdPriceData =
      await this.testPriceDataRepository.bulkCreate(clonedPriceData);

    return {
      parentScenarioId: sourceScenario.id,
      variationType: 'conflicting_signal',
      variationName: 'Conflicting Signal',
      variationConfig,
      scenario: {
        id: variationScenario.id,
        name: variationScenario.name,
        description: variationScenario.description,
        target_id: variationScenario.target_id,
        organization_slug: variationScenario.organization_slug,
        config: variationScenario.config,
        status: variationScenario.status,
      },
      articles: clonedArticles.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        target_symbols: a.target_symbols,
        sentiment_expected: a.sentiment_expected,
      })),
      priceData: clonedPriceData.map((p, i) => ({
        id: `price-${i}`,
        symbol: p.symbol,
        price_timestamp: p.price_timestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume || 0,
      })),
    };
  }

  /**
   * Language Ambiguity Variation
   * Uses AI to add hedged/uncertain language
   */
  private async generateLanguageAmbiguityVariation(
    sourceScenario: TestScenario,
    sourceArticles: TestArticle[],
    sourcePriceData: TestPriceData[],
    variationIndex: number,
    ctx: ExecutionContext,
  ): Promise<ScenarioVariation> {
    const variationConfig = {
      adds_hedging_language: true,
      hedging_words: [
        'may',
        'might',
        'could',
        'reportedly',
        'allegedly',
        'rumored',
      ],
    };

    // Create variation scenario
    const variationScenario = await this.testScenarioRepository.create({
      name: `${sourceScenario.name} - Language Ambiguity`,
      description: `${sourceScenario.description || ''} [Variation: Added hedged/uncertain language]`,
      injection_points: sourceScenario.injection_points,
      target_id: this.nullToUndefined(sourceScenario.target_id),
      organization_slug: sourceScenario.organization_slug,
      config: {
        ...sourceScenario.config,
        parent_scenario_id: sourceScenario.id,
        variation_type: 'language_ambiguity',
        variation_config: variationConfig,
      },
    });

    // Regenerate articles with hedged language
    const regeneratedArticles = [];

    for (const sourceArticle of sourceArticles) {
      const originalSentiment =
        sourceArticle.sentiment_expected === 'positive'
          ? 'bullish'
          : sourceArticle.sentiment_expected === 'negative'
            ? 'bearish'
            : 'neutral';

      const customPrompt = `Rewrite the following article adding hedged and uncertain language. Use qualifiers like "may", "might", "could", "reportedly", "allegedly", "rumored", "speculation suggests", etc. Keep the same basic story and sentiment, but make it less certain.

Original article:
Title: ${sourceArticle.title}
Content: ${sourceArticle.content}

Target symbols: ${sourceArticle.target_symbols.join(', ')}
Add uncertainty and hedging language throughout.`;

      const articleRequest: TestArticleGenerationRequest = {
        target_symbols: sourceArticle.target_symbols,
        scenario_type: 'custom',
        sentiment: originalSentiment,
        strength: 'weak', // Hedged language implies weaker signal
        custom_prompt: customPrompt,
        article_count: 1,
      };

      const genResult = await this.aiArticleGeneratorService.generateArticles(
        articleRequest,
        ctx,
      );

      if (genResult.success && genResult.articles.length > 0) {
        const generatedArticle = genResult.articles[0];

        if (generatedArticle) {
          const createdArticle = await this.testArticleRepository.create({
            organization_slug: sourceArticle.organization_slug,
            scenario_id: variationScenario.id,
            title: generatedArticle.title,
            content: generatedArticle.content,
            source_name: generatedArticle.simulated_source_name,
            published_at: generatedArticle.simulated_published_at,
            target_symbols: generatedArticle.target_symbols,
            sentiment_expected: this.mapSentiment(
              generatedArticle.intended_sentiment,
            ),
            strength_expected: this.mapStrength(
              generatedArticle.intended_strength,
            ),
            is_synthetic: true,
            synthetic_marker: '[SYNTHETIC TEST ARTICLE]',
            processed: false,
            metadata: {
              variation_from_article_id: sourceArticle.id,
              generated_by: 'ai-article-generator',
              variation_type: 'language_ambiguity',
            },
          });

          regeneratedArticles.push(createdArticle);
        }
      }
    }

    // Clone price data
    const clonedPriceData = sourcePriceData.map((price) => ({
      ...price,
      scenario_id: variationScenario.id,
    }));

    const _createdPriceData =
      await this.testPriceDataRepository.bulkCreate(clonedPriceData);

    return {
      parentScenarioId: sourceScenario.id,
      variationType: 'language_ambiguity',
      variationName: 'Language Ambiguity',
      variationConfig,
      scenario: {
        id: variationScenario.id,
        name: variationScenario.name,
        description: variationScenario.description,
        target_id: variationScenario.target_id,
        organization_slug: variationScenario.organization_slug,
        config: variationScenario.config,
        status: variationScenario.status,
      },
      articles: regeneratedArticles.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        target_symbols: a.target_symbols,
        sentiment_expected: a.sentiment_expected,
      })),
      priceData: clonedPriceData.map((p, i) => ({
        id: `price-${i}`,
        symbol: p.symbol,
        price_timestamp: p.price_timestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume || 0,
      })),
    };
  }

  /**
   * Negation Variation
   * Generates articles with negation patterns (e.g., "not as bad as feared")
   */
  private async generateNegationVariation(
    sourceScenario: TestScenario,
    sourceArticles: TestArticle[],
    sourcePriceData: TestPriceData[],
    variationIndex: number,
    ctx: ExecutionContext,
  ): Promise<ScenarioVariation> {
    const variationConfig = {
      uses_negation_patterns: true,
      negation_examples: [
        'not as bad as feared',
        'better than expected loss',
        'less severe than anticipated',
      ],
    };

    // Create variation scenario
    const variationScenario = await this.testScenarioRepository.create({
      name: `${sourceScenario.name} - Negation Pattern`,
      description: `${sourceScenario.description || ''} [Variation: Uses negation language patterns]`,
      injection_points: sourceScenario.injection_points,
      target_id: this.nullToUndefined(sourceScenario.target_id),
      organization_slug: sourceScenario.organization_slug,
      config: {
        ...sourceScenario.config,
        parent_scenario_id: sourceScenario.id,
        variation_type: 'negation',
        variation_config: variationConfig,
      },
    });

    // Regenerate articles with negation patterns
    const regeneratedArticles = [];

    for (const sourceArticle of sourceArticles) {
      const originalSentiment =
        sourceArticle.sentiment_expected === 'positive'
          ? 'bullish'
          : sourceArticle.sentiment_expected === 'negative'
            ? 'bearish'
            : 'neutral';

      const customPrompt = `Rewrite the following article using negation patterns. Use phrases like "not as bad as feared", "better than expected loss", "less severe than anticipated", etc. The sentiment should be slightly opposite but expressed through negation of the opposite extreme.

Original article:
Title: ${sourceArticle.title}
Content: ${sourceArticle.content}

Target symbols: ${sourceArticle.target_symbols.join(', ')}
Use negation language patterns to express the sentiment.`;

      const articleRequest: TestArticleGenerationRequest = {
        target_symbols: sourceArticle.target_symbols,
        scenario_type: 'custom',
        sentiment: originalSentiment,
        strength: 'moderate',
        custom_prompt: customPrompt,
        article_count: 1,
      };

      const genResult = await this.aiArticleGeneratorService.generateArticles(
        articleRequest,
        ctx,
      );

      if (genResult.success && genResult.articles.length > 0) {
        const generatedArticle = genResult.articles[0];

        if (generatedArticle) {
          const createdArticle = await this.testArticleRepository.create({
            organization_slug: sourceArticle.organization_slug,
            scenario_id: variationScenario.id,
            title: generatedArticle.title,
            content: generatedArticle.content,
            source_name: generatedArticle.simulated_source_name,
            published_at: generatedArticle.simulated_published_at,
            target_symbols: generatedArticle.target_symbols,
            sentiment_expected: this.mapSentiment(
              generatedArticle.intended_sentiment,
            ),
            strength_expected: this.mapStrength(
              generatedArticle.intended_strength,
            ),
            is_synthetic: true,
            synthetic_marker: '[SYNTHETIC TEST ARTICLE]',
            processed: false,
            metadata: {
              variation_from_article_id: sourceArticle.id,
              generated_by: 'ai-article-generator',
              variation_type: 'negation',
            },
          });

          regeneratedArticles.push(createdArticle);
        }
      }
    }

    // Clone price data
    const clonedPriceData = sourcePriceData.map((price) => ({
      ...price,
      scenario_id: variationScenario.id,
    }));

    const _createdPriceData =
      await this.testPriceDataRepository.bulkCreate(clonedPriceData);

    return {
      parentScenarioId: sourceScenario.id,
      variationType: 'negation',
      variationName: 'Negation Pattern',
      variationConfig,
      scenario: {
        id: variationScenario.id,
        name: variationScenario.name,
        description: variationScenario.description,
        target_id: variationScenario.target_id,
        organization_slug: variationScenario.organization_slug,
        config: variationScenario.config,
        status: variationScenario.status,
      },
      articles: regeneratedArticles.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        target_symbols: a.target_symbols,
        sentiment_expected: a.sentiment_expected,
      })),
      priceData: clonedPriceData.map((p, i) => ({
        id: `price-${i}`,
        symbol: p.symbol,
        price_timestamp: p.price_timestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume || 0,
      })),
    };
  }

  /**
   * Delayed Outcome Variation
   * Extends time between article publication and outcome price
   */
  private async generateDelayedOutcomeVariation(
    sourceScenario: TestScenario,
    sourceArticles: TestArticle[],
    sourcePriceData: TestPriceData[],
    variationIndex: number,
    _ctx: ExecutionContext,
  ): Promise<ScenarioVariation> {
    // Delay by different amounts based on index
    const delayHours =
      variationIndex === 1 ? 24 : variationIndex === 2 ? 72 : 168;
    const delayMs = delayHours * 60 * 60 * 1000;

    const variationConfig = {
      delay_hours: delayHours,
      delay_description: `Outcome delayed by ${delayHours} hours`,
    };

    // Create variation scenario
    const variationScenario = await this.testScenarioRepository.create({
      name: `${sourceScenario.name} - Delayed Outcome (${delayHours}h)`,
      description: `${sourceScenario.description || ''} [Variation: Outcome delayed by ${delayHours} hours]`,
      injection_points: sourceScenario.injection_points,
      target_id: this.nullToUndefined(sourceScenario.target_id),
      organization_slug: sourceScenario.organization_slug,
      config: {
        ...sourceScenario.config,
        parent_scenario_id: sourceScenario.id,
        variation_type: 'delayed_outcome',
        variation_config: variationConfig,
      },
    });

    // Clone articles (no timestamp changes)
    const clonedArticles = await Promise.all(
      sourceArticles.map((article) =>
        this.testArticleRepository.create({
          organization_slug: article.organization_slug,
          scenario_id: variationScenario.id,
          title: article.title,
          content: article.content,
          source_name: article.source_name,
          published_at: article.published_at,
          target_symbols: article.target_symbols,
          sentiment_expected: this.nullToUndefined(
            article.sentiment_expected,
          ) as 'positive' | 'negative' | 'neutral' | undefined,
          strength_expected: this.nullToUndefined(article.strength_expected),
          is_synthetic: article.is_synthetic,
          synthetic_marker: this.nullToUndefined(article.synthetic_marker),
          processed: false,
          metadata: {
            ...article.metadata,
            variation_from_article_id: article.id,
          },
        }),
      ),
    );

    // Shift price data timestamps forward (delay the outcome)
    const delayedPriceData = sourcePriceData.map((price) => ({
      ...price,
      scenario_id: variationScenario.id,
      price_timestamp: new Date(
        new Date(price.price_timestamp).getTime() + delayMs,
      ).toISOString(),
    }));

    const _createdPriceData =
      await this.testPriceDataRepository.bulkCreate(delayedPriceData);

    return {
      parentScenarioId: sourceScenario.id,
      variationType: 'delayed_outcome',
      variationName: `Delayed Outcome (${delayHours}h)`,
      variationConfig,
      scenario: {
        id: variationScenario.id,
        name: variationScenario.name,
        description: variationScenario.description,
        target_id: variationScenario.target_id,
        organization_slug: variationScenario.organization_slug,
        config: variationScenario.config,
        status: variationScenario.status,
      },
      articles: clonedArticles.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        target_symbols: a.target_symbols,
        sentiment_expected: a.sentiment_expected,
      })),
      priceData: delayedPriceData.map((p, i) => ({
        id: `price-${i}`,
        symbol: p.symbol,
        price_timestamp: p.price_timestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume || 0,
      })),
    };
  }

  /**
   * Multi-Article Variation
   * Adds multiple articles in sequence to test cumulative signal handling
   */
  private async generateMultiArticleVariation(
    sourceScenario: TestScenario,
    sourceArticles: TestArticle[],
    sourcePriceData: TestPriceData[],
    variationIndex: number,
    ctx: ExecutionContext,
  ): Promise<ScenarioVariation> {
    const additionalArticleCount = 2; // Add 2 more articles

    const variationConfig = {
      additional_articles: additionalArticleCount,
      sequence_interval_hours: 1,
    };

    // Create variation scenario
    const variationScenario = await this.testScenarioRepository.create({
      name: `${sourceScenario.name} - Multi-Article`,
      description: `${sourceScenario.description || ''} [Variation: Added ${additionalArticleCount} sequential articles]`,
      injection_points: sourceScenario.injection_points,
      target_id: this.nullToUndefined(sourceScenario.target_id),
      organization_slug: sourceScenario.organization_slug,
      config: {
        ...sourceScenario.config,
        parent_scenario_id: sourceScenario.id,
        variation_type: 'multi_article',
        variation_config: variationConfig,
      },
    });

    // Clone original articles
    const allArticles = await Promise.all(
      sourceArticles.map((article) =>
        this.testArticleRepository.create({
          organization_slug: article.organization_slug,
          scenario_id: variationScenario.id,
          title: article.title,
          content: article.content,
          source_name: article.source_name,
          published_at: article.published_at,
          target_symbols: article.target_symbols,
          sentiment_expected: this.nullToUndefined(
            article.sentiment_expected,
          ) as 'positive' | 'negative' | 'neutral' | undefined,
          strength_expected: this.nullToUndefined(article.strength_expected),
          is_synthetic: article.is_synthetic,
          synthetic_marker: this.nullToUndefined(article.synthetic_marker),
          processed: false,
          metadata: {
            ...article.metadata,
            variation_from_article_id: article.id,
          },
        }),
      ),
    );

    // Generate additional articles
    const firstArticle = sourceArticles[0];
    if (firstArticle) {
      const originalSentiment =
        firstArticle.sentiment_expected === 'positive'
          ? 'bullish'
          : firstArticle.sentiment_expected === 'negative'
            ? 'bearish'
            : 'neutral';

      for (let i = 0; i < additionalArticleCount; i++) {
        const customPrompt = `Generate a follow-up article about ${firstArticle.target_symbols.join(', ')} that reinforces the same sentiment as the original. This is article ${i + 2} in a sequence of related articles.

Target symbols: ${firstArticle.target_symbols.join(', ')}
Sentiment: ${originalSentiment}
Make this article consistent with the original sentiment but with a different angle or new details.`;

        const articleRequest: TestArticleGenerationRequest = {
          target_symbols: firstArticle.target_symbols,
          scenario_type: 'custom',
          sentiment: originalSentiment,
          strength: 'moderate',
          custom_prompt: customPrompt,
          article_count: 1,
        };

        const genResult = await this.aiArticleGeneratorService.generateArticles(
          articleRequest,
          ctx,
        );

        if (genResult.success && genResult.articles.length > 0) {
          const generatedArticle = genResult.articles[0];

          if (generatedArticle) {
            // Stagger publication times by 1 hour intervals
            const publishedAt = new Date(
              new Date(firstArticle.published_at).getTime() +
                (i + 1) * 60 * 60 * 1000,
            ).toISOString();

            const additionalArticle = await this.testArticleRepository.create({
              organization_slug: firstArticle.organization_slug,
              scenario_id: variationScenario.id,
              title: generatedArticle.title,
              content: generatedArticle.content,
              source_name: generatedArticle.simulated_source_name,
              published_at: publishedAt,
              target_symbols: generatedArticle.target_symbols,
              sentiment_expected: this.mapSentiment(
                generatedArticle.intended_sentiment,
              ),
              strength_expected: this.mapStrength(
                generatedArticle.intended_strength,
              ),
              is_synthetic: true,
              synthetic_marker: '[SYNTHETIC TEST ARTICLE]',
              processed: false,
              metadata: {
                generated_by: 'ai-article-generator',
                variation_type: 'multi_article',
                sequence_position: i + 2,
              },
            });

            allArticles.push(additionalArticle);
          }
        }
      }
    }

    // Clone price data
    const clonedPriceData = sourcePriceData.map((price) => ({
      ...price,
      scenario_id: variationScenario.id,
    }));

    const _createdPriceData =
      await this.testPriceDataRepository.bulkCreate(clonedPriceData);

    return {
      parentScenarioId: sourceScenario.id,
      variationType: 'multi_article',
      variationName: 'Multi-Article',
      variationConfig,
      scenario: {
        id: variationScenario.id,
        name: variationScenario.name,
        description: variationScenario.description,
        target_id: variationScenario.target_id,
        organization_slug: variationScenario.organization_slug,
        config: variationScenario.config,
        status: variationScenario.status,
      },
      articles: allArticles.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        target_symbols: a.target_symbols,
        sentiment_expected: a.sentiment_expected,
      })),
      priceData: clonedPriceData.map((p, i) => ({
        id: `price-${i}`,
        symbol: p.symbol,
        price_timestamp: p.price_timestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume || 0,
      })),
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Convert null to undefined for optional fields
   */
  private nullToUndefined<T>(value: T | null): T | undefined {
    return value === null ? undefined : value;
  }

  /**
   * Infer strength category from numeric value
   */
  private inferStrength(value: number): 'strong' | 'moderate' | 'weak' {
    if (value >= 0.7) return 'strong';
    if (value >= 0.4) return 'moderate';
    return 'weak';
  }

  /**
   * Weaken a strength category
   */
  private weakenStrength(
    strength: 'strong' | 'moderate' | 'weak',
  ): 'strong' | 'moderate' | 'weak' {
    if (strength === 'strong') return 'moderate';
    if (strength === 'moderate') return 'weak';
    return 'weak';
  }

  /**
   * Strengthen a strength category
   */
  private strengthenStrength(
    strength: 'strong' | 'moderate' | 'weak',
  ): 'strong' | 'moderate' | 'weak' {
    if (strength === 'weak') return 'moderate';
    if (strength === 'moderate') return 'strong';
    return 'strong';
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
