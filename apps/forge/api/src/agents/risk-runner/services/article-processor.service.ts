/* eslint-disable @typescript-eslint/require-await */
// Disabled unsafe rules due to Supabase RPC calls returning generic 'any' types
import { Injectable, Logger } from '@nestjs/common';
import {
  RiskSourceSubscriptionRepository,
  RiskCrawlerArticle,
  RiskDimensionMapping,
  RiskSubjectFilter,
  CrawlerArticle,
} from '../repositories/source-subscription.repository';

/**
 * Result of processing articles for a subscription or scope
 */
export interface RiskArticleProcessResult {
  scope_id: string;
  subscription_id: string | null;
  articles_processed: number;
  dimension_updates_triggered: number;
  articles_skipped: number;
  reanalysis_triggered: boolean;
  errors: string[];
}

/**
 * Processed article ready for dimension analysis
 */
export interface ProcessedRiskArticle {
  article_id: string;
  subscription_id: string;
  source_id: string;
  url: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  first_seen_at: string;
  dimension_mapping: RiskDimensionMapping;
  subject_filter: RiskSubjectFilter;
  extracted_data: Record<string, unknown>;
}

/**
 * RiskArticleProcessorService
 *
 * Pulls articles from the central crawler and prepares them for
 * risk dimension analysis. This is the risk-runner's integration
 * point with the shared crawler infrastructure.
 *
 * Flow:
 * 1. Pull new articles from subscribed sources (via RiskSourceSubscriptionRepository)
 * 2. Extract relevant data based on dimension mapping
 * 3. Apply subject filters to determine which subjects are affected
 * 4. Trigger dimension reanalysis if configured
 * 5. Update the subscription watermark
 *
 * Unlike prediction signals, risk articles don't create new records directly.
 * Instead, they trigger re-analysis of existing risk dimensions for subjects.
 */
@Injectable()
export class RiskArticleProcessorService {
  private readonly logger = new Logger(RiskArticleProcessorService.name);

  constructor(
    private readonly subscriptionRepository: RiskSourceSubscriptionRepository,
  ) {}

  /**
   * Process new articles for a specific subscription
   */
  async processSubscription(
    subscriptionId: string,
    limit: number = 100,
  ): Promise<RiskArticleProcessResult> {
    const subscription =
      await this.subscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    const result: RiskArticleProcessResult = {
      scope_id: subscription.scope_id,
      subscription_id: subscriptionId,
      articles_processed: 0,
      dimension_updates_triggered: 0,
      articles_skipped: 0,
      reanalysis_triggered: false,
      errors: [],
    };

    try {
      // Pull new articles since last processed
      const articles = await this.subscriptionRepository.getNewArticles(
        subscriptionId,
        limit,
      );

      this.logger.debug(
        `Found ${articles.length} new articles for subscription ${subscriptionId}`,
      );

      // Process each article
      let latestArticleTime: Date | null = null;
      const processedArticles: ProcessedRiskArticle[] = [];

      for (const article of articles) {
        try {
          const processed = await this.processArticle(
            article,
            subscriptionId,
            subscription.dimension_mapping,
            subscription.subject_filter,
          );

          if (processed) {
            processedArticles.push(processed);
            result.articles_processed++;
          } else {
            result.articles_skipped++;
          }

          // Track latest article time for watermark
          const articleTime = new Date(article.first_seen_at);
          if (!latestArticleTime || articleTime > latestArticleTime) {
            latestArticleTime = articleTime;
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

      // Trigger dimension updates if we have processed articles
      if (processedArticles.length > 0) {
        result.dimension_updates_triggered = await this.triggerDimensionUpdates(
          subscription.scope_id,
          processedArticles,
        );

        if (subscription.auto_reanalyze) {
          result.reanalysis_triggered = true;
        }
      }

      // Update watermark if we processed any articles
      if (latestArticleTime) {
        await this.subscriptionRepository.updateWatermark(
          subscriptionId,
          latestArticleTime,
        );
      }

      this.logger.log(
        `Processed ${result.articles_processed} articles for subscription ${subscriptionId}: ` +
          `${result.dimension_updates_triggered} dimension updates triggered`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Subscription processing failed: ${errorMessage}`);
      this.logger.error(
        `Failed to process subscription ${subscriptionId}: ${errorMessage}`,
      );
      return result;
    }
  }

  /**
   * Process new articles for a scope across all its subscriptions
   */
  async processScope(
    scopeId: string,
    limit: number = 100,
  ): Promise<RiskArticleProcessResult> {
    const result: RiskArticleProcessResult = {
      scope_id: scopeId,
      subscription_id: null,
      articles_processed: 0,
      dimension_updates_triggered: 0,
      articles_skipped: 0,
      reanalysis_triggered: false,
      errors: [],
    };

    try {
      // Pull new articles across all subscriptions for this scope
      const articlesWithContext =
        await this.subscriptionRepository.getNewArticlesForScope(
          scopeId,
          limit,
        );

      this.logger.debug(
        `Found ${articlesWithContext.length} new articles for scope ${scopeId}`,
      );

      // Group by subscription to update watermarks efficiently
      const articlesBySubscription = new Map<
        string,
        { articles: RiskCrawlerArticle[]; latestTime: Date | null }
      >();

      for (const article of articlesWithContext) {
        if (!articlesBySubscription.has(article.subscription_id)) {
          articlesBySubscription.set(article.subscription_id, {
            articles: [],
            latestTime: null,
          });
        }
        const sub = articlesBySubscription.get(article.subscription_id)!;
        sub.articles.push(article);

        const articleTime = new Date(article.first_seen_at);
        if (!sub.latestTime || articleTime > sub.latestTime) {
          sub.latestTime = articleTime;
        }
      }

      // Process all articles
      const processedArticles: ProcessedRiskArticle[] = [];

      for (const article of articlesWithContext) {
        try {
          const processed = await this.processArticle(
            article,
            article.subscription_id,
            article.dimension_mapping,
            article.subject_filter,
          );

          if (processed) {
            processedArticles.push(processed);
            result.articles_processed++;
          } else {
            result.articles_skipped++;
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(
            `Failed to process article ${article.id}: ${errorMessage}`,
          );
        }
      }

      // Trigger dimension updates
      if (processedArticles.length > 0) {
        result.dimension_updates_triggered = await this.triggerDimensionUpdates(
          scopeId,
          processedArticles,
        );
        result.reanalysis_triggered = true;
      }

      // Update watermarks for all subscriptions
      for (const [subId, subData] of articlesBySubscription) {
        if (subData.latestTime) {
          await this.subscriptionRepository.updateWatermark(
            subId,
            subData.latestTime,
          );
        }
      }

      this.logger.log(
        `Processed ${result.articles_processed} articles for scope ${scopeId}: ` +
          `${result.dimension_updates_triggered} dimension updates triggered`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Scope processing failed: ${errorMessage}`);
      this.logger.error(`Failed to process scope ${scopeId}: ${errorMessage}`);
      return result;
    }
  }

  /**
   * Process a single article and extract risk-relevant data
   */
  private async processArticle(
    article: CrawlerArticle,
    subscriptionId: string,
    dimensionMapping: RiskDimensionMapping,
    subjectFilter: RiskSubjectFilter,
  ): Promise<ProcessedRiskArticle | null> {
    // Skip if no dimensions are mapped
    if (
      !dimensionMapping.dimensions ||
      dimensionMapping.dimensions.length === 0
    ) {
      this.logger.debug(`Article ${article.id} skipped - no dimensions mapped`);
      return null;
    }

    // Extract relevant data from article
    const extractedData = this.extractRiskData(article, dimensionMapping);

    // If no relevant data extracted, skip
    if (Object.keys(extractedData).length === 0) {
      this.logger.debug(
        `Article ${article.id} skipped - no relevant data extracted`,
      );
      return null;
    }

    return {
      article_id: article.id,
      subscription_id: subscriptionId,
      source_id: article.source_id,
      url: article.url,
      title: article.title,
      content: article.content,
      summary: article.summary,
      first_seen_at: article.first_seen_at,
      dimension_mapping: dimensionMapping,
      subject_filter: subjectFilter,
      extracted_data: extractedData,
    };
  }

  /**
   * Extract risk-relevant data from article content
   * This is a simple extraction - could be enhanced with LLM analysis
   */
  private extractRiskData(
    article: CrawlerArticle,
    dimensionMapping: RiskDimensionMapping,
  ): Record<string, unknown> {
    const text =
      `${article.title ?? ''} ${article.content ?? ''}`.toLowerCase();
    const extracted: Record<string, unknown> = {};

    // Basic sentiment analysis (placeholder - could use LLM)
    const sentiment = this.analyzeSentiment(text);
    if (sentiment !== 0) {
      extracted.sentiment = sentiment;
    }

    // Risk keywords detection
    const riskIndicators = this.detectRiskIndicators(text);
    if (riskIndicators.length > 0) {
      extracted.risk_indicators = riskIndicators;
    }

    // Store article reference
    extracted.article_url = article.url;
    extracted.article_title = article.title;
    extracted.first_seen_at = article.first_seen_at;
    extracted.mapped_dimensions = dimensionMapping.dimensions;

    return extracted;
  }

  /**
   * Simple sentiment analysis (placeholder)
   * Returns -1 to 1 (negative to positive)
   */
  private analyzeSentiment(text: string): number {
    const positiveWords = [
      'growth',
      'success',
      'positive',
      'gain',
      'improve',
      'stable',
      'strong',
      'opportunity',
      'advantage',
      'profitable',
    ];
    const negativeWords = [
      'risk',
      'decline',
      'loss',
      'negative',
      'concern',
      'threat',
      'warning',
      'danger',
      'crisis',
      'failure',
      'lawsuit',
      'investigation',
    ];

    let score = 0;
    for (const word of positiveWords) {
      if (text.includes(word)) score += 1;
    }
    for (const word of negativeWords) {
      if (text.includes(word)) score -= 1;
    }

    // Normalize to -1 to 1
    const maxPossible = Math.max(positiveWords.length, negativeWords.length);
    return score / maxPossible;
  }

  /**
   * Detect specific risk indicators in text
   */
  private detectRiskIndicators(text: string): string[] {
    const indicators: string[] = [];

    const riskPatterns: Record<string, string[]> = {
      legal: ['lawsuit', 'litigation', 'legal action', 'court', 'settlement'],
      regulatory: [
        'sec',
        'investigation',
        'violation',
        'compliance',
        'fine',
        'penalty',
      ],
      financial: ['debt', 'bankruptcy', 'default', 'downgrade', 'credit'],
      operational: ['outage', 'breach', 'hack', 'failure', 'disruption'],
      reputational: ['scandal', 'controversy', 'criticism', 'backlash'],
      market: ['volatility', 'crash', 'selloff', 'recession', 'downturn'],
    };

    for (const [category, keywords] of Object.entries(riskPatterns)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          indicators.push(category);
          break; // One indicator per category
        }
      }
    }

    return [...new Set(indicators)];
  }

  /**
   * Trigger dimension updates based on processed articles
   * Returns the number of updates triggered
   */
  private async triggerDimensionUpdates(
    scopeId: string,
    processedArticles: ProcessedRiskArticle[],
  ): Promise<number> {
    // Group articles by dimension for efficient processing
    const articlesByDimension = new Map<string, ProcessedRiskArticle[]>();

    for (const article of processedArticles) {
      for (const dimension of article.dimension_mapping.dimensions) {
        if (!articlesByDimension.has(dimension)) {
          articlesByDimension.set(dimension, []);
        }
        articlesByDimension.get(dimension)!.push(article);
      }
    }

    // For now, just log what would be triggered
    // In a full implementation, this would call DimensionAnalyzerService
    // to re-analyze the affected dimensions with the new data
    for (const [dimension, articles] of articlesByDimension) {
      this.logger.debug(
        `Dimension ${dimension} would be updated with ${articles.length} articles for scope ${scopeId}`,
      );
    }

    return articlesByDimension.size;
  }

  /**
   * Get subscription statistics for a scope
   */
  async getSubscriptionStats(scopeId: string) {
    return this.subscriptionRepository.getSubscriptionStats(scopeId);
  }
}
