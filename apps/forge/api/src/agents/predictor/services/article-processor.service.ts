import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  SourceSubscriptionRepository,
  CrawlerArticle,
} from '../repositories/source-subscription.repository';
import { PredictorRepository } from '../repositories/predictor.repository';
import { TargetRepository } from '../repositories/target.repository';
import { TargetSnapshotRepository } from '../repositories/target-snapshot.repository';
import { AnalystEnsembleService } from './analyst-ensemble.service';
import { LlmTierResolverService } from './llm-tier-resolver.service';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';
import { Article as CrawlerServiceArticle } from '@/crawler/interfaces';
import { Target } from '../interfaces/target.interface';
import { EnsembleInput } from '../interfaces/ensemble.interface';
import {
  CreatePredictorData,
  PredictorDirection,
} from '../interfaces/predictor.interface';
import {
  ThresholdConfig,
  DEFAULT_THRESHOLD_CONFIG,
} from '../interfaces/threshold-evaluation.interface';

/**
 * Result of processing articles for a subscription
 */
export interface ArticleProcessResult {
  subscription_id: string;
  target_id: string;
  articles_processed: number;
  predictors_created: number;
  articles_skipped: number;
  errors: string[];
}

/**
 * Result of analyzing which instruments an article affects
 */
export interface InstrumentRelevanceResult {
  article_id: string;
  relevant_targets: Array<{
    target: Target;
    relevance_score: number;
    direction_hint: PredictorDirection;
  }>;
}

/**
 * ArticleProcessorService
 *
 * Processes articles from the central crawler and creates predictors directly.
 * This replaces the signals layer - articles go straight to predictors.
 *
 * Flow:
 * 1. Pull new articles from subscribed sources
 * 2. Analyze which instruments (targets) each article affects
 * 3. For each relevant instrument, run ensemble and create predictor
 * 4. Update the subscription watermark
 *
 * Key Changes from Signal-Based Approach:
 * - NO signals created - articles → predictors directly
 * - LLM determines instrument relevance (not keyword matching per target)
 * - Single article read, multiple predictors (only for relevant instruments)
 */
@Injectable()
export class ArticleProcessorService {
  private readonly logger = new Logger(ArticleProcessorService.name);
  private readonly config: ThresholdConfig = DEFAULT_THRESHOLD_CONFIG;

  constructor(
    private readonly subscriptionRepository: SourceSubscriptionRepository,
    private readonly predictorRepository: PredictorRepository,
    private readonly targetRepository: TargetRepository,
    private readonly targetSnapshotRepository: TargetSnapshotRepository,
    private readonly ensembleService: AnalystEnsembleService,
    private readonly llmTierResolver: LlmTierResolverService,
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    private readonly observabilityEventsService: ObservabilityEventsService,
  ) {}

  /**
   * Create execution context for observability events
   */
  private createObservabilityContext(taskId: string): ExecutionContext {
    return {
      orgSlug: 'system',
      userId: NIL_UUID,
      conversationId: NIL_UUID,
      taskId,
      planId: NIL_UUID,
      deliverableId: NIL_UUID,
      agentSlug: 'article-processor',
      agentType: 'service',
      provider: NIL_UUID,
      model: NIL_UUID,
    };
  }

  /**
   * Process new articles for all active targets
   * This is the main entry point called by the runner
   */
  async processAllTargets(limit: number = 100): Promise<{
    articles_processed: number;
    predictors_created: number;
    targets_affected: number;
    errors: string[];
  }> {
    const result = {
      articles_processed: 0,
      predictors_created: 0,
      targets_affected: 0,
      errors: [] as string[],
    };

    try {
      // Get all active targets
      const targets = await this.targetRepository.findAllActive();
      if (targets.length === 0) {
        this.logger.debug('No active targets found');
        return result;
      }

      // Get unique articles across all subscriptions
      const processedArticleIds = new Set<string>();

      for (const target of targets) {
        // Skip test targets (T_ prefix)
        if (target.symbol.startsWith('T_')) continue;

        const subscriptions = await this.subscriptionRepository.findByTarget(
          target.id,
        );

        for (const subscription of subscriptions) {
          if (!subscription.is_active) continue;

          const articles = await this.subscriptionRepository.getNewArticles(
            subscription.id,
            limit,
          );

          for (const article of articles) {
            // Skip if already processed in this run
            if (processedArticleIds.has(article.id)) continue;
            processedArticleIds.add(article.id);

            try {
              const predictorCount = await this.processArticleForAllTargets(
                article,
                targets,
              );
              result.articles_processed++;
              result.predictors_created += predictorCount;
              if (predictorCount > 0) {
                result.targets_affected++;
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
              result.errors.push(
                `Failed to process article ${article.id}: ${errorMessage}`,
              );
              this.logger.error(
                `Failed to process article ${article.id}: ${errorMessage}`,
              );
            }
          }

          // Update watermark
          if (articles.length > 0) {
            const latestTime = new Date(
              Math.max(
                ...articles.map((a) => new Date(a.first_seen_at).getTime()),
              ),
            );
            await this.subscriptionRepository.updateWatermark(
              subscription.id,
              latestTime,
            );
          }
        }
      }

      this.logger.log(
        `Processed ${result.articles_processed} articles: ` +
          `${result.predictors_created} predictors created`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Processing failed: ${errorMessage}`);
      this.logger.error(`Failed to process articles: ${errorMessage}`);
      return result;
    }
  }

  /**
   * Process a single article by ID — event-driven entry point.
   * Fetches the article from crawler.articles and runs it through
   * the same pipeline as processAllTargets, but for just one article.
   */
  async processArticleById(articleId: string): Promise<{
    articles_processed: number;
    predictors_created: number;
    targets_affected: number;
    errors: string[];
  }> {
    const result = {
      articles_processed: 0,
      predictors_created: 0,
      targets_affected: 0,
      errors: [] as string[],
    };

    try {
      // Fetch article from crawler.articles
      const { data: article, error } = await this.subscriptionRepository.getArticleById(articleId);
      if (error || !article) {
        result.errors.push(`Article not found: ${articleId}`);
        return result;
      }

      // Get all active targets
      const targets = await this.targetRepository.findAllActive();
      if (targets.length === 0) {
        this.logger.debug('No active targets found');
        return result;
      }

      const predictorCount = await this.processArticleForAllTargets(article, targets);
      result.articles_processed = 1;
      result.predictors_created = predictorCount;
      if (predictorCount > 0) {
        result.targets_affected = 1;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to process article ${articleId}: ${errorMessage}`);
      this.logger.error(`Failed to process article ${articleId}: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Process a single article and determine which targets it affects
   * Creates predictors for each relevant target
   */
  async processArticleForAllTargets(
    article: CrawlerArticle,
    targets: Target[],
  ): Promise<number> {
    const taskId = `article-${article.id}-${Date.now()}`;
    const ctx = this.createObservabilityContext(taskId);

    // Analyze which instruments this article is relevant to
    const relevantTargets = await this.analyzeInstrumentRelevance(
      ctx,
      article,
      targets,
    );

    if (relevantTargets.length === 0) {
      this.logger.debug(
        `Article ${article.id} not relevant to any tracked instruments`,
      );
      return 0;
    }

    let predictorsCreated = 0;

    // For each relevant target, run ensemble and create predictor
    for (const { target, direction_hint } of relevantTargets) {
      try {
        const predictor = await this.createPredictorFromArticle(
          ctx,
          article,
          target,
          direction_hint,
        );
        if (predictor) {
          predictorsCreated++;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to create predictor for ${target.symbol} from article ${article.id}: ${errorMessage}`,
        );
      }
    }

    // Emit observability event
    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'article.processed',
      status: predictorsCreated > 0 ? 'completed' : 'skipped',
      message: `Article processed: ${predictorsCreated} predictors created for ${relevantTargets.length} instruments`,
      progress: 100,
      step: 'article-processed',
      payload: {
        articleId: article.id,
        articleTitle: article.title,
        articleUrl: article.url,
        relevantInstruments: relevantTargets.map((t) => t.target.symbol),
        predictorsCreated,
      },
      timestamp: Date.now(),
    });

    return predictorsCreated;
  }

  /**
   * Analyze which instruments an article is relevant to
   * Uses keyword matching for efficiency, LLM could be added for more accuracy
   */
  private async analyzeInstrumentRelevance(
    ctx: ExecutionContext,
    article: CrawlerArticle,
    targets: Target[],
  ): Promise<
    Array<{
      target: Target;
      relevance_score: number;
      direction_hint: PredictorDirection;
    }>
  > {
    const text =
      `${article.title ?? ''} ${article.content ?? ''}`.toLowerCase();
    const relevant: Array<{
      target: Target;
      relevance_score: number;
      direction_hint: PredictorDirection;
    }> = [];

    for (const target of targets) {
      // Skip test targets
      if (target.symbol.startsWith('T_')) continue;

      // Check if article mentions this instrument
      const mentions = this.checkInstrumentMention(text, target);
      if (mentions.mentioned) {
        // Infer direction from content using LLM
        const direction = await this.inferDirection(text, target.symbol);
        relevant.push({
          target,
          relevance_score: mentions.score,
          direction_hint: direction,
        });
      }
    }

    return relevant;
  }

  /**
   * Check if article mentions an instrument
   */
  private checkInstrumentMention(
    text: string,
    target: Target,
  ): { mentioned: boolean; score: number } {
    const symbol = target.symbol.toLowerCase();
    const name = target.name.toLowerCase();

    // Check for direct symbol mention
    const symbolPattern = new RegExp(`\\b${symbol}\\b`, 'i');
    const hasSymbol = symbolPattern.test(text);

    // Check for company name mention
    const hasName = text.includes(name);

    // Check for partial company name (first word)
    const firstName = name.split(' ')[0] || '';
    const hasFirstName = firstName.length > 3 && text.includes(firstName);

    if (hasSymbol) {
      return { mentioned: true, score: 1.0 };
    } else if (hasName) {
      return { mentioned: true, score: 0.9 };
    } else if (hasFirstName) {
      return { mentioned: true, score: 0.7 };
    }

    return { mentioned: false, score: 0 };
  }

  /**
   * Infer direction from article content using LLM analysis
   * Falls back to neutral if LLM call fails
   */
  private async inferDirection(
    text: string,
    targetSymbol: string,
  ): Promise<PredictorDirection> {
    try {
      const resolved = await this.llmTierResolver.resolveTier('bronze');
      const ctx: ExecutionContext = {
        orgSlug: 'system',
        userId: NIL_UUID,
        conversationId: NIL_UUID,
        taskId: NIL_UUID,
        planId: NIL_UUID,
        deliverableId: NIL_UUID,
        agentSlug: 'direction-inference',
        agentType: 'service',
        provider: resolved.provider,
        model: resolved.model,
      };

      // Truncate text to avoid excessive token usage
      const truncatedText =
        text.length > 2000 ? text.substring(0, 2000) + '...' : text;

      const systemPrompt = `You are a financial sentiment classifier. Given a news article, determine its sentiment impact on the specified stock. Respond with ONLY a JSON object.

Consider:
- Negation: "did NOT surge" is bearish, not bullish
- Context: "surge in layoffs" is bearish despite the word "surge"
- Nuance: distinguish between direct company news vs general market commentary
- Already priced in: old news or expected outcomes should be neutral

Respond with: {"direction": "bullish" | "bearish" | "neutral", "reasoning": "one sentence"}`;

      const userPrompt = `What is the sentiment impact of this article on ${targetSymbol}?\n\n${truncatedText}`;

      const response = await this.llmService.generateResponse(
        systemPrompt,
        userPrompt,
        { executionContext: ctx },
      );

      const responseText =
        typeof response === 'string' ? response : response.content;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { direction?: string };
        const dir = (parsed.direction || '').toLowerCase();
        if (dir === 'bullish') return 'bullish';
        if (dir === 'bearish') return 'bearish';
      }
      return 'neutral';
    } catch (error) {
      this.logger.warn(
        `LLM direction inference failed, defaulting to neutral: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return 'neutral';
    }
  }

  /**
   * Create per-analyst predictors from an article for a specific target.
   * Runs three-way fork ensemble (5 analysts x 3 forks = 15 assessments).
   * Creates one predictor per non-flat assessment.
   */
  private async createPredictorFromArticle(
    ctx: ExecutionContext,
    article: CrawlerArticle,
    target: Target,
    _directionHint: PredictorDirection,
  ): Promise<boolean> {
    // Resolve LLM provider/model
    const resolved = await this.llmTierResolver.resolveTier('silver');
    const ensembleCtx: ExecutionContext = {
      ...ctx,
      provider: resolved.provider,
      model: resolved.model,
    };

    // Build ensemble input from article with market data
    const articleContent = await this.buildArticleContentWithMarketData(
      article,
      target,
    );
    const ensembleInput: EnsembleInput = {
      targetId: target.id,
      content: articleContent,
      metadata: {
        article_id: article.id,
        article_title: article.title,
        article_url: article.url,
        source_id: article.source_id,
      },
    };

    // Run three-way fork ensemble (5 analysts x 3 forks)
    const threeWayResult = await this.ensembleService.runThreeWayForkEnsemble(
      ensembleCtx,
      target,
      ensembleInput,
    );

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.config.predictor_ttl_hours);

    // Collect all assessments with their fork type
    const allAssessments = [
      ...threeWayResult.userForkAssessments.map((a) => ({
        assessment: a,
        forkType: 'user' as const,
      })),
      ...threeWayResult.aiForkAssessments.map((a) => ({
        assessment: a,
        forkType: 'ai' as const,
      })),
      ...threeWayResult.arbitratorForkAssessments.map((a) => ({
        assessment: a,
        forkType: 'arbitrator' as const,
      })),
    ];

    let predictorsCreated = 0;

    for (const { assessment, forkType } of allAssessments) {
      const direction = this.mapDirection(assessment.direction);

      // Skip flat/neutral assessments - only keep directional predictors
      if (direction === 'neutral') {
        this.logger.debug(
          `Skipping flat predictor for ${target.symbol} from ${assessment.analyst.slug}/${forkType}`,
        );
        continue;
      }

      const strength = Math.round(assessment.confidence * 10);

      const predictorData: CreatePredictorData = {
        article_id: article.id,
        target_id: target.id,
        direction,
        strength,
        confidence: assessment.confidence,
        reasoning: assessment.reasoning,
        analyst_slug: assessment.analyst.slug,
        analyst_assessment: {
          direction,
          confidence: assessment.confidence,
          reasoning: assessment.reasoning,
          key_factors: assessment.key_factors,
          risks: assessment.risks,
        },
        fork_type: forkType,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        is_test: article.is_test,
      };

      const predictor = await this.predictorRepository.create(predictorData);
      predictorsCreated++;

      this.logger.debug(
        `Created predictor ${predictor.id} for ${target.symbol} ` +
          `(${assessment.analyst.slug}/${forkType}: ${direction}, strength: ${strength})`,
      );
    }

    if (predictorsCreated > 0) {
      this.logger.log(
        `Created ${predictorsCreated} predictors for ${target.symbol} from article ${article.id}`,
      );

      // Emit predictor.created event
      await this.observabilityEventsService.push({
        context: ensembleCtx,
        source_app: 'prediction-runner',
        hook_event_type: 'predictor.created',
        status: 'completed',
        message: `${predictorsCreated} predictors created for ${target.symbol} (5 analysts x 3 forks, flat filtered)`,
        progress: 100,
        step: 'predictor-created',
        payload: {
          articleId: article.id,
          articleTitle: article.title || null,
          articleUrl: article.url,
          targetId: target.id,
          targetSymbol: target.symbol,
          predictorsCreated,
          metadata: threeWayResult.metadata,
        },
        timestamp: Date.now(),
      });
    } else {
      this.logger.debug(
        `No directional predictors for ${target.symbol} from article ${article.id} (all flat)`,
      );
    }

    return predictorsCreated > 0;
  }

  /**
   * Build content string from article for ensemble evaluation
   */
  private buildArticleContent(article: CrawlerArticle): string {
    const parts = [
      `Title: ${article.title ?? 'Unknown'}`,
      `Source: ${article.source_id}`,
      `Content: ${article.content ?? article.summary ?? 'No content'}`,
    ];

    if (article.key_phrases && article.key_phrases.length > 0) {
      parts.push(`Key phrases: ${article.key_phrases.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Build content string from article with market data context
   */
  private async buildArticleContentWithMarketData(
    article: CrawlerArticle,
    target: Target,
  ): Promise<string> {
    const base = this.buildArticleContent(article);
    try {
      const snapshot = await this.targetSnapshotRepository.findLatest(
        target.id,
      );
      if (snapshot) {
        const meta = snapshot.metadata || {};
        const marketParts = [
          '',
          `## Market Data for ${target.symbol}`,
          `Current Price: $${snapshot.value.toFixed(2)}`,
        ];
        if (meta.open) marketParts.push(`Open: $${meta.open.toFixed(2)}`);
        if (meta.high) marketParts.push(`High: $${meta.high.toFixed(2)}`);
        if (meta.low) marketParts.push(`Low: $${meta.low.toFixed(2)}`);
        if (meta.volume)
          marketParts.push(`Volume: ${meta.volume.toLocaleString()}`);
        if (meta.change_24h != null)
          marketParts.push(`24h Change: ${meta.change_24h.toFixed(2)}%`);
        marketParts.push(`Price As Of: ${snapshot.captured_at}`);
        return base + '\n' + marketParts.join('\n');
      }
    } catch {
      // Non-critical - continue without market data
    }
    return base;
  }

  /**
   * Map ensemble direction to predictor direction type
   */
  private mapDirection(direction: string): PredictorDirection {
    const normalized = direction.toLowerCase();
    if (normalized === 'bullish' || normalized === 'up') return 'bullish';
    if (normalized === 'bearish' || normalized === 'down') return 'bearish';
    return 'neutral';
  }

  /**
   * Legacy method - process a specific target (kept for backward compatibility)
   * @deprecated Use processAllTargets instead
   */
  async processTarget(
    targetId: string,
    limit: number = 100,
  ): Promise<ArticleProcessResult> {
    const result: ArticleProcessResult = {
      subscription_id: 'all',
      target_id: targetId,
      articles_processed: 0,
      predictors_created: 0,
      articles_skipped: 0,
      errors: [],
    };

    try {
      const target = await this.targetRepository.findById(targetId);
      if (!target) {
        throw new Error(`Target not found: ${targetId}`);
      }

      const allTargets = await this.targetRepository.findAllActive();
      const subscriptions =
        await this.subscriptionRepository.findByTarget(targetId);

      for (const subscription of subscriptions) {
        if (!subscription.is_active) continue;

        const articles = await this.subscriptionRepository.getNewArticles(
          subscription.id,
          limit,
        );

        for (const article of articles) {
          try {
            const predictorCount = await this.processArticleForAllTargets(
              article,
              allTargets,
            );
            result.articles_processed++;
            result.predictors_created += predictorCount;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(
              `Failed to process article ${article.id}: ${errorMessage}`,
            );
          }
        }

        // Update watermark
        if (articles.length > 0) {
          const latestTime = new Date(
            Math.max(
              ...articles.map((a) => new Date(a.first_seen_at).getTime()),
            ),
          );
          await this.subscriptionRepository.updateWatermark(
            subscription.id,
            latestTime,
          );
        }
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Target processing failed: ${errorMessage}`);
      this.logger.error(
        `Failed to process target ${targetId}: ${errorMessage}`,
      );
      return result;
    }
  }

  /**
   * Legacy method - process subscription (kept for backward compatibility)
   * @deprecated Use processAllTargets instead
   */
  async processSubscription(
    subscriptionId: string,
    limit: number = 100,
  ): Promise<ArticleProcessResult> {
    const subscription =
      await this.subscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }
    return this.processTarget(subscription.target_id, limit);
  }

  /**
   * Legacy method - process article for subscriptions
   * @deprecated Predictors are now created directly
   */
  async processArticleForSubscriptions(
    article: CrawlerServiceArticle,
    _source: { id: string; organization_slug: string },
  ): Promise<number> {
    const targets = await this.targetRepository.findAllActive();
    const crawlerArticle: CrawlerArticle = {
      id: article.id,
      organization_slug: article.organization_slug,
      source_id: article.source_id,
      url: article.url,
      title: article.title ?? null,
      content: article.content ?? null,
      summary: article.summary ?? null,
      author: article.author ?? null,
      published_at: article.published_at ?? null,
      content_hash: article.content_hash,
      title_normalized: article.title_normalized ?? null,
      key_phrases: article.key_phrases ?? null,
      fingerprint_hash: article.fingerprint_hash ?? null,
      raw_data: article.raw_data ?? null,
      is_test: article.is_test,
      first_seen_at: article.first_seen_at,
      metadata: article.metadata,
    };

    return this.processArticleForAllTargets(crawlerArticle, targets);
  }
}
