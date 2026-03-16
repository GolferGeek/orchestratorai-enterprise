/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// Disabled unsafe rules due to Supabase RPC calls returning generic 'any' types
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';

/**
 * Article from central crawler
 * Matches the crawler.articles table structure
 */
export interface CrawlerArticle {
  id: string;
  organization_slug: string;
  source_id: string;
  url: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  author: string | null;
  published_at: string | null;
  content_hash: string;
  title_normalized: string | null;
  key_phrases: string[] | null;
  fingerprint_hash: string | null;
  raw_data: Record<string, unknown> | null;
  first_seen_at: string;
  is_test: boolean;
  metadata: Record<string, unknown> | null;
}

/**
 * Dimension mapping configuration for risk subscriptions
 */
export interface RiskDimensionMapping {
  dimensions: string[];
  weight: number;
  auto_apply: boolean;
}

/**
 * Subject filter configuration
 */
export interface RiskSubjectFilter {
  subject_ids: string[];
  subject_types: string[];
  identifier_pattern: string | null;
  apply_to_all: boolean;
}

/**
 * Risk source subscription record
 */
export interface RiskSourceSubscription {
  id: string;
  source_id: string;
  scope_id: string;
  dimension_mapping: RiskDimensionMapping;
  subject_filter: RiskSubjectFilter;
  last_processed_at: string;
  auto_reanalyze: boolean;
  reanalyze_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Article with subscription context for processing
 */
export interface RiskCrawlerArticle extends CrawlerArticle {
  subscription_id: string;
  dimension_mapping: RiskDimensionMapping;
  subject_filter: RiskSubjectFilter;
}

/**
 * RiskSourceSubscriptionRepository
 *
 * Manages risk.source_subscriptions - the bridge between
 * crawler.sources and risk scopes.
 */
@Injectable()
export class RiskSourceSubscriptionRepository {
  private readonly logger = new Logger(RiskSourceSubscriptionRepository.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Find subscription by ID
   */
  async findById(id: string): Promise<RiskSourceSubscription | null> {
    const { data, error } = await this.db
      .from('risk', 'source_subscriptions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapFromDb(data as Record<string, unknown>);
  }

  /**
   * Find subscriptions by scope ID
   */
  async findByScope(scopeId: string): Promise<RiskSourceSubscription[]> {
    const { data, error } = await this.db
      .from('risk', 'source_subscriptions')
      .select('*')
      .eq('scope_id', scopeId)
      .eq('is_active', true);

    if (error) {
      this.logger.error(
        `Failed to find subscriptions for scope ${scopeId}: ${error.message}`,
      );
      return [];
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return rows.map((row: Record<string, unknown>) => this.mapFromDb(row));
  }

  /**
   * Find subscriptions by source ID
   */
  async findBySource(sourceId: string): Promise<RiskSourceSubscription[]> {
    const { data, error } = await this.db
      .from('risk', 'source_subscriptions')
      .select('*')
      .eq('source_id', sourceId)
      .eq('is_active', true);

    if (error) {
      this.logger.error(
        `Failed to find subscriptions for source ${sourceId}: ${error.message}`,
      );
      return [];
    }

    const sourceRows = (data ?? []) as Array<Record<string, unknown>>;
    return sourceRows.map((row: Record<string, unknown>) =>
      this.mapFromDb(row),
    );
  }

  /**
   * Create a new subscription
   */
  async create(data: {
    source_id: string;
    scope_id: string;
    dimension_mapping?: Partial<RiskDimensionMapping>;
    subject_filter?: Partial<RiskSubjectFilter>;
    auto_reanalyze?: boolean;
    reanalyze_threshold?: number;
  }): Promise<RiskSourceSubscription> {
    const { data: created, error } = await this.db
      .from('risk', 'source_subscriptions')
      .insert({
        source_id: data.source_id,
        scope_id: data.scope_id,
        dimension_mapping: {
          dimensions: [],
          weight: 1.0,
          auto_apply: true,
          ...data.dimension_mapping,
        },
        subject_filter: {
          subject_ids: [],
          subject_types: [],
          identifier_pattern: null,
          apply_to_all: false,
          ...data.subject_filter,
        },
        auto_reanalyze: data.auto_reanalyze ?? true,
        reanalyze_threshold: data.reanalyze_threshold ?? 0.1,
      })
      .select()
      .single();

    if (error || !created) {
      throw new Error(
        `Failed to create subscription: ${error?.message ?? 'Unknown error'}`,
      );
    }

    return this.mapFromDb(created as Record<string, unknown>);
  }

  /**
   * Update subscription
   */
  async update(
    id: string,
    updates: Partial<{
      dimension_mapping: RiskDimensionMapping;
      subject_filter: RiskSubjectFilter;
      auto_reanalyze: boolean;
      reanalyze_threshold: number;
      is_active: boolean;
    }>,
  ): Promise<RiskSourceSubscription> {
    const { data, error } = await this.db
      .from('risk', 'source_subscriptions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(
        `Failed to update subscription: ${error?.message ?? 'Unknown error'}`,
      );
    }

    return this.mapFromDb(data as Record<string, unknown>);
  }

  /**
   * Get new articles for a subscription (pull model)
   * Uses the risk.get_new_articles_for_subscription function
   */
  async getNewArticles(
    subscriptionId: string,
    limit: number = 100,
  ): Promise<CrawlerArticle[]> {
    const { data, error } = await this.db.rpc(
      'get_new_articles_for_subscription',
      {
        p_subscription_id: subscriptionId,
        p_limit: limit,
      },
    );

    if (error) {
      this.logger.error(
        `Failed to get new articles for subscription ${subscriptionId}: ${error.message}`,
      );
      return [];
    }

    const articleRows = (data ?? []) as Array<Record<string, unknown>>;
    return articleRows.map((row: Record<string, unknown>) => ({
      id: row.article_id as string,
      organization_slug: '', // Not returned by function, will be filled by caller if needed
      source_id: row.source_id as string,
      url: row.url as string,
      title: (row.title as string) ?? null,
      content: (row.content as string) ?? null,
      summary: (row.summary as string) ?? null,
      author: null,
      published_at: (row.published_at as string) ?? null,
      content_hash: row.content_hash as string,
      title_normalized: null,
      key_phrases: null,
      fingerprint_hash: null,
      raw_data: (row.raw_data as Record<string, unknown>) ?? null,
      first_seen_at: row.first_seen_at as string,
      is_test: false,
      metadata: null,
    }));
  }

  /**
   * Get new articles for a scope across all subscriptions
   * Uses the risk.get_new_articles_for_scope function
   */
  async getNewArticlesForScope(
    scopeId: string,
    limit: number = 100,
  ): Promise<RiskCrawlerArticle[]> {
    const { data, error } = await this.db.rpc('get_new_articles_for_scope', {
      p_scope_id: scopeId,
      p_limit: limit,
    });

    if (error) {
      this.logger.error(
        `Failed to get new articles for scope ${scopeId}: ${error.message}`,
      );
      return [];
    }

    const scopeArticleRows = (data ?? []) as Array<Record<string, unknown>>;
    return scopeArticleRows.map((row: Record<string, unknown>) => ({
      id: row.article_id as string,
      organization_slug: '',
      source_id: row.source_id as string,
      url: row.url as string,
      title: (row.title as string) ?? null,
      content: (row.content as string) ?? null,
      summary: (row.summary as string) ?? null,
      author: null,
      published_at: (row.published_at as string) ?? null,
      content_hash: row.content_hash as string,
      title_normalized: null,
      key_phrases: null,
      fingerprint_hash: null,
      raw_data: (row.raw_data as Record<string, unknown>) ?? null,
      first_seen_at: row.first_seen_at as string,
      is_test: false,
      metadata: null,
      // Subscription context
      subscription_id: row.subscription_id as string,
      dimension_mapping: row.dimension_mapping as RiskDimensionMapping,
      subject_filter: row.subject_filter as RiskSubjectFilter,
    }));
  }

  /**
   * Update watermark after processing articles
   */
  async updateWatermark(
    subscriptionId: string,
    lastProcessedAt: Date,
  ): Promise<void> {
    const { error } = await this.db.rpc('update_subscription_watermark', {
      p_subscription_id: subscriptionId,
      p_last_processed_at: lastProcessedAt.toISOString(),
    });

    if (error) {
      this.logger.error(
        `Failed to update watermark for subscription ${subscriptionId}: ${error.message}`,
      );
    }
  }

  /**
   * Get subscription stats view
   */
  async getSubscriptionStats(scopeId: string): Promise<
    Array<{
      subscription_id: string;
      source_id: string;
      source_name: string;
      source_url: string;
      scope_id: string;
      scope_name: string;
      is_active: boolean;
      auto_reanalyze: boolean;
      last_processed_at: string;
      pending_articles: number;
      processed_articles: number;
    }>
  > {
    const { data, error } = await this.db
      .from('risk', 'subscription_stats')
      .select('*')
      .eq('scope_id', scopeId);

    if (error) {
      this.logger.error(`Failed to get subscription stats: ${error.message}`);
      return [];
    }

    const statsRows = (data ?? []) as Array<Record<string, unknown>>;
    return statsRows.map((row: Record<string, unknown>) => ({
      subscription_id: row.subscription_id as string,
      source_id: row.source_id as string,
      source_name: row.source_name as string,
      source_url: row.source_url as string,
      scope_id: row.scope_id as string,
      scope_name: row.scope_name as string,
      is_active: row.is_active as boolean,
      auto_reanalyze: row.auto_reanalyze as boolean,
      last_processed_at: row.last_processed_at as string,
      pending_articles: Number(row.pending_articles),
      processed_articles: Number(row.processed_articles),
    }));
  }

  private mapFromDb(row: Record<string, unknown>): RiskSourceSubscription {
    return {
      id: row.id as string,
      source_id: row.source_id as string,
      scope_id: row.scope_id as string,
      dimension_mapping: row.dimension_mapping as RiskDimensionMapping,
      subject_filter: row.subject_filter as RiskSubjectFilter,
      last_processed_at: row.last_processed_at as string,
      auto_reanalyze: row.auto_reanalyze as boolean,
      reanalyze_threshold: row.reanalyze_threshold as number,
      is_active: row.is_active as boolean,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
