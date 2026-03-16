import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

/**
 * Source subscription for prediction targets
 */
export interface SourceSubscription {
  id: string;
  source_id: string;
  target_id: string;
  universe_id: string;
  filter_config: {
    keywords_include?: string[];
    keywords_exclude?: string[];
    min_relevance_score?: number;
  };
  last_processed_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSubscriptionData {
  source_id: string;
  target_id: string;
  universe_id: string;
  filter_config?: SourceSubscription['filter_config'];
  is_active?: boolean;
}

export interface UpdateSubscriptionData {
  filter_config?: SourceSubscription['filter_config'];
  last_processed_at?: string;
  is_active?: boolean;
}

/**
 * Article from central crawler
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
  is_test: boolean;
  first_seen_at: string;
  metadata: Record<string, unknown>;
}

/**
 * Subscription stats from view
 */
export interface SubscriptionStats {
  subscription_id: string;
  source_id: string;
  source_name: string;
  source_url: string;
  target_id: string;
  target_symbol: string;
  target_name: string;
  universe_id: string;
  universe_name: string;
  is_active: boolean;
  last_processed_at: string;
  pending_articles: number;
  processed_articles: number;
}

/**
 * SourceSubscriptionRepository
 *
 * Manages prediction.source_subscriptions which link prediction targets
 * to sources in the central crawler schema.
 *
 * Used for the pull model: prediction agents subscribe to sources and
 * pull new articles on their own schedule.
 */
@Injectable()
export class SourceSubscriptionRepository {
  private readonly logger = new Logger(SourceSubscriptionRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'source_subscriptions';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Find subscription by ID
   */
  async findById(id: string): Promise<SourceSubscription | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<SourceSubscription>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch subscription: ${error.message}`);
      throw new Error(`Failed to fetch subscription: ${error.message}`);
    }

    return data;
  }

  /**
   * Find subscriptions by target
   */
  async findByTarget(targetId: string): Promise<SourceSubscription[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .eq('is_active', true)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<SourceSubscription>;

    if (error) {
      this.logger.error(
        `Failed to fetch subscriptions by target: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch subscriptions by target: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find subscriptions by universe
   */
  async findByUniverse(universeId: string): Promise<SourceSubscription[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('universe_id', universeId)
      .eq('is_active', true)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<SourceSubscription>;

    if (error) {
      this.logger.error(
        `Failed to fetch subscriptions by universe: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch subscriptions by universe: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find subscriptions by source
   * Used when processing a newly crawled article to find all targets subscribed to that source
   */
  async findBySourceId(sourceId: string): Promise<SourceSubscription[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('source_id', sourceId)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<SourceSubscription>;

    if (error) {
      this.logger.error(
        `Failed to fetch subscriptions by source: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch subscriptions by source: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find subscription by source and target (unique constraint)
   */
  async findBySourceAndTarget(
    sourceId: string,
    targetId: string,
  ): Promise<SourceSubscription | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('source_id', sourceId)
      .eq('target_id', targetId)
      .single()) as SupabaseSelectResponse<SourceSubscription>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch subscription by source and target: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch subscription by source and target: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Create a subscription
   */
  async create(data: CreateSubscriptionData): Promise<SourceSubscription> {
    const { data: subscription, error } = (await this.db
      .from(this.schema, this.table)
      .insert({
        ...data,
        filter_config: data.filter_config ?? {
          keywords_include: [],
          keywords_exclude: [],
          min_relevance_score: 0.5,
        },
        is_active: data.is_active ?? true,
      })
      .select()
      .single()) as SupabaseSelectResponse<SourceSubscription>;

    if (error) {
      this.logger.error(`Failed to create subscription: ${error.message}`);
      throw new Error(`Failed to create subscription: ${error.message}`);
    }

    if (!subscription) {
      throw new Error('Create succeeded but no subscription returned');
    }

    this.logger.log(
      `Created subscription: source=${data.source_id}, target=${data.target_id}`,
    );
    return subscription;
  }

  /**
   * Update a subscription
   */
  async update(
    id: string,
    data: UpdateSubscriptionData,
  ): Promise<SourceSubscription> {
    const { data: subscription, error } = (await this.db
      .from(this.schema, this.table)
      .update(data)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<SourceSubscription>;

    if (error) {
      this.logger.error(`Failed to update subscription: ${error.message}`);
      throw new Error(`Failed to update subscription: ${error.message}`);
    }

    if (!subscription) {
      throw new Error('Update succeeded but no subscription returned');
    }

    return subscription;
  }

  /**
   * Delete a subscription
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete subscription: ${error.message}`);
      throw new Error(`Failed to delete subscription: ${error.message}`);
    }
  }

  /**
   * Update watermark after processing articles
   */
  async updateWatermark(id: string, timestamp?: Date): Promise<void> {
    await this.update(id, {
      last_processed_at: (timestamp ?? new Date()).toISOString(),
    });
  }

  /**
   * Get a single article by ID from crawler.articles.
   * Used by the event-driven path when Pulse DB watcher fires on article INSERT.
   */
  async getArticleById(
    articleId: string,
  ): Promise<{ data: CrawlerArticle | null; error: SupabaseError }> {
    const { data, error } = (await this.db
      .from('crawler', 'articles')
      .select('*')
      .eq('id', articleId)
      .single()) as SupabaseSelectResponse<Record<string, unknown>>;

    if (error) {
      return { data: null, error };
    }

    if (!data) {
      return { data: null, error: null };
    }

    return {
      data: {
        id: data.id as string,
        organization_slug: data.organization_slug as string,
        source_id: data.source_id as string,
        url: data.url as string,
        title: data.title as string | null,
        content: data.content as string | null,
        summary: data.summary as string | null,
        author: data.author as string | null,
        published_at: data.published_at as string | null,
        content_hash: data.content_hash as string,
        title_normalized: data.title_normalized as string | null,
        key_phrases: data.key_phrases as string[] | null,
        fingerprint_hash: data.fingerprint_hash as string | null,
        raw_data: data.raw_data as Record<string, unknown> | null,
        is_test: (data.is_test as boolean) ?? false,
        first_seen_at: data.first_seen_at as string,
        metadata: (data.metadata as Record<string, unknown>) ?? {},
      },
      error: null,
    };
  }

  /**
   * Get new articles for a subscription using the database function
   */
  async getNewArticles(
    subscriptionId: string,
    limit: number = 100,
  ): Promise<CrawlerArticle[]> {
    const { data, error } = (await this.db.rpc(
      'get_new_articles_for_subscription',
      {
        p_subscription_id: subscriptionId,
        p_limit: limit,
      },
      this.schema,
    )) as {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get new articles: ${error.message}`);
      throw new Error(`Failed to get new articles: ${error.message}`);
    }

    // Map the RPC response to CrawlerArticle interface
    return (data ?? []).map((row) => ({
      id: row.article_id as string,
      organization_slug: '', // Not returned by function
      source_id: row.source_id as string,
      url: row.url as string,
      title: row.title as string | null,
      content: row.content as string | null,
      summary: row.summary as string | null,
      author: null, // Not returned by function
      published_at: row.published_at as string | null,
      content_hash: row.content_hash as string,
      title_normalized: row.title_normalized as string | null,
      key_phrases: row.key_phrases as string[] | null,
      fingerprint_hash: null, // Not returned by function
      raw_data: row.raw_data as Record<string, unknown> | null,
      is_test: false,
      first_seen_at: row.first_seen_at as string,
      metadata: {},
    }));
  }

  /**
   * Get new articles for a target across all subscriptions
   */
  async getNewArticlesForTarget(
    targetId: string,
    limit: number = 100,
  ): Promise<Array<CrawlerArticle & { subscription_id: string }>> {
    const { data, error } = (await this.db.rpc(
      'get_new_articles_for_target',
      {
        p_target_id: targetId,
        p_limit: limit,
      },
      this.schema,
    )) as {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to get new articles for target: ${error.message}`,
      );
      throw new Error(
        `Failed to get new articles for target: ${error.message}`,
      );
    }

    return (data ?? []).map((row) => ({
      id: row.article_id as string,
      subscription_id: row.subscription_id as string,
      organization_slug: '',
      source_id: row.source_id as string,
      url: row.url as string,
      title: row.title as string | null,
      content: row.content as string | null,
      summary: row.summary as string | null,
      author: null,
      published_at: row.published_at as string | null,
      content_hash: row.content_hash as string,
      title_normalized: row.title_normalized as string | null,
      key_phrases: row.key_phrases as string[] | null,
      fingerprint_hash: null,
      raw_data: row.raw_data as Record<string, unknown> | null,
      is_test: false,
      first_seen_at: row.first_seen_at as string,
      metadata: {},
    }));
  }

  /**
   * Get subscription stats from view
   */
  async getStats(): Promise<SubscriptionStats[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'subscription_stats')
      .select('*')) as SupabaseSelectListResponse<SubscriptionStats>;

    if (error) {
      this.logger.error(`Failed to get subscription stats: ${error.message}`);
      throw new Error(`Failed to get subscription stats: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get stats for a specific target
   */
  async getStatsForTarget(targetId: string): Promise<SubscriptionStats[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'subscription_stats')
      .select('*')
      .eq(
        'target_id',
        targetId,
      )) as SupabaseSelectListResponse<SubscriptionStats>;

    if (error) {
      this.logger.error(
        `Failed to get subscription stats for target: ${error.message}`,
      );
      throw new Error(
        `Failed to get subscription stats for target: ${error.message}`,
      );
    }

    return data ?? [];
  }
}
