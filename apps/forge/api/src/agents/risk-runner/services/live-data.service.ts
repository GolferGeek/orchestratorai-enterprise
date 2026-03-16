/**
 * Live Data Integration Service
 *
 * Manages external data sources for automatic risk data updates.
 * Supports Firecrawl, API, RSS, and webhook sources.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  asArray,
  asPostgrestResult,
  asRecord,
  asString,
  isRecord,
} from '../utils/safe-access';

// Data source types
export type DataSourceType = 'firecrawl' | 'api' | 'rss' | 'webhook' | 'manual';

// Source status
export type DataSourceStatus = 'active' | 'paused' | 'error' | 'disabled';

// Fetch status
export type FetchStatus = 'success' | 'failed' | 'timeout' | 'rate_limited';

// Schedule presets
export type SchedulePreset = 'hourly' | 'daily' | 'weekly' | 'realtime';

// Dimension mapping configuration
export interface DimensionMapping {
  sourceField: string;
  transform?: 'normalize' | 'inverse_normalize' | 'scale' | 'none';
  threshold?: number;
  weight?: number;
}

// Subject filter configuration for data sources
export interface DataSourceSubjectFilter {
  subjectIds?: string[];
  subjectTypes?: string[];
  identifierPattern?: string;
}

// Firecrawl configuration
export interface FirecrawlConfig {
  url: string;
  selector?: string;
  extractFields?: string[];
  authentication?: {
    type: 'bearer' | 'basic' | 'api_key';
    credentials: string;
  };
}

// API configuration
export interface ApiConfig {
  endpoint: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  responseMapping?: Record<string, string>;
}

// RSS configuration
export interface RssConfig {
  feedUrl: string;
  relevantCategories?: string[];
  sentimentAnalysis?: boolean;
}

// Webhook configuration
export interface WebhookConfig {
  webhookId: string;
  secretKey: string;
  expectedPayloadSchema?: Record<string, unknown>;
}

// Source configuration (union type)
export type SourceConfig =
  | FirecrawlConfig
  | ApiConfig
  | RssConfig
  | WebhookConfig
  | Record<string, unknown>;

// Data source record
export interface DataSource {
  id: string;
  scopeId: string;
  name: string;
  description: string | null;
  sourceType: DataSourceType;
  config: SourceConfig;
  schedule: string | null;
  dimensionMapping: Record<string, DimensionMapping>;
  subjectFilter: DataSourceSubjectFilter | null;
  status: DataSourceStatus;
  errorMessage: string | null;
  errorCount: number;
  lastFetchAt: string | null;
  lastFetchStatus: FetchStatus | null;
  lastFetchData: unknown;
  nextFetchAt: string | null;
  autoReanalyze: boolean;
  reanalyzeThreshold: number;
  createdAt: string;
  updatedAt: string;
}

// Fetch history record
export interface FetchHistoryRecord {
  id: string;
  dataSourceId: string;
  status: FetchStatus;
  fetchDurationMs: number | null;
  rawResponse: unknown;
  parsedData: unknown;
  errorMessage: string | null;
  dimensionsUpdated: string[];
  subjectsAffected: string[];
  reanalysisTriggered: boolean;
  reanalysisTaskIds: string[];
  fetchedAt: string;
}

// Create data source params
export interface CreateDataSourceParams {
  scopeId: string;
  name: string;
  description?: string;
  sourceType: DataSourceType;
  config: SourceConfig;
  schedule?: string;
  dimensionMapping?: Record<string, DimensionMapping>;
  subjectFilter?: DataSourceSubjectFilter;
  autoReanalyze?: boolean;
  reanalyzeThreshold?: number;
}

// Fetch result
export interface FetchResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
  dimensionsUpdated: string[];
  reanalysisTriggered: boolean;
}

@Injectable()
export class LiveDataService {
  private readonly logger = new Logger(LiveDataService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Create a new data source
   */
  async createDataSource(params: CreateDataSourceParams): Promise<DataSource> {
    this.logger.debug(
      `[LIVE-DATA] Creating data source "${params.name}" of type ${params.sourceType}`,
    );

    const nextFetch = params.schedule
      ? this.calculateNextFetch(params.schedule)
      : null;

    const result = asPostgrestResult(
      await this.db
        .from('risk', 'data_sources')
        .insert({
          scope_id: params.scopeId,
          name: params.name,
          description: params.description || null,
          source_type: params.sourceType,
          config: params.config,
          schedule: params.schedule || null,
          dimension_mapping: params.dimensionMapping || {},
          subject_filter: params.subjectFilter || null,
          auto_reanalyze: params.autoReanalyze ?? true,
          reanalyze_threshold: params.reanalyzeThreshold ?? 0.1,
          next_fetch_at: nextFetch,
        })
        .select()
        .single(),
    );
    const row = asRecord(result.data);

    if (result.error?.message || !row) {
      throw new Error(
        `Failed to create data source: ${result.error?.message || 'Unknown error'}`,
      );
    }

    return this.mapDataSourceFromDb(row);
  }

  /**
   * Get a data source by ID
   */
  async getDataSource(dataSourceId: string): Promise<DataSource | null> {
    const result = asPostgrestResult(
      await this.db
        .from('risk', 'data_sources')
        .select('*')
        .eq('id', dataSourceId)
        .single(),
    );
    const row = asRecord(result.data);

    if (result.error?.message || !row) {
      return null;
    }

    return this.mapDataSourceFromDb(row);
  }

  /**
   * List data sources for a scope
   */
  async listDataSources(
    scopeId: string,
    options?: {
      status?: DataSourceStatus;
      sourceType?: DataSourceType;
      limit?: number;
      offset?: number;
    },
  ): Promise<DataSource[]> {
    let query = this.db
      .from('risk', 'data_sources')
      .select('*')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false });

    if (options?.status) {
      query = query.eq('status', options.status);
    }
    if (options?.sourceType) {
      query = query.eq('source_type', options.sourceType);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 10) - 1,
      );
    }

    const result = asPostgrestResult(await query);

    if (result.error?.message) {
      throw new Error(`Failed to list data sources: ${result.error.message}`);
    }

    return (asArray(result.data) ?? [])
      .filter(isRecord)
      .map((s) => this.mapDataSourceFromDb(s));
  }

  /**
   * Update a data source
   */
  async updateDataSource(
    dataSourceId: string,
    updates: Partial<
      Pick<
        DataSource,
        | 'name'
        | 'description'
        | 'config'
        | 'schedule'
        | 'dimensionMapping'
        | 'subjectFilter'
        | 'autoReanalyze'
        | 'reanalyzeThreshold'
        | 'status'
      >
    >,
  ): Promise<DataSource> {
    const dbUpdates: Record<string, unknown> = {};

    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined)
      dbUpdates.description = updates.description;
    if (updates.config !== undefined) dbUpdates.config = updates.config;
    if (updates.schedule !== undefined) {
      dbUpdates.schedule = updates.schedule;
      dbUpdates.next_fetch_at = updates.schedule
        ? this.calculateNextFetch(updates.schedule)
        : null;
    }
    if (updates.dimensionMapping !== undefined)
      dbUpdates.dimension_mapping = updates.dimensionMapping;
    if (updates.subjectFilter !== undefined)
      dbUpdates.subject_filter = updates.subjectFilter;
    if (updates.autoReanalyze !== undefined)
      dbUpdates.auto_reanalyze = updates.autoReanalyze;
    if (updates.reanalyzeThreshold !== undefined)
      dbUpdates.reanalyze_threshold = updates.reanalyzeThreshold;
    if (updates.status !== undefined) {
      dbUpdates.status = updates.status;
      if (updates.status === 'active') {
        dbUpdates.error_message = null;
        dbUpdates.error_count = 0;
      }
    }

    const result = asPostgrestResult(
      await this.db
        .from('risk', 'data_sources')
        .update(dbUpdates)
        .eq('id', dataSourceId)
        .select()
        .single(),
    );
    const row = asRecord(result.data);

    if (result.error?.message || !row) {
      throw new Error(
        `Failed to update data source: ${result.error?.message || 'Unknown error'}`,
      );
    }

    return this.mapDataSourceFromDb(row);
  }

  /**
   * Delete a data source
   */
  async deleteDataSource(dataSourceId: string): Promise<void> {
    const { error } = await this.db
      .from('risk', 'data_sources')
      .delete()
      .eq('id', dataSourceId);

    if (error) {
      throw new Error(`Failed to delete data source: ${error.message}`);
    }
  }

  /**
   * Manually fetch data from a source
   */
  async fetchData(dataSourceId: string): Promise<FetchResult> {
    const source = await this.getDataSource(dataSourceId);
    if (!source) {
      throw new Error(`Data source not found: ${dataSourceId}`);
    }

    this.logger.debug(
      `[LIVE-DATA] Fetching data from source "${source.name}" (${source.sourceType})`,
    );

    const startTime = Date.now();
    let result: FetchResult;

    try {
      switch (source.sourceType) {
        case 'firecrawl':
          result = await this.fetchFromFirecrawl(source);
          break;
        case 'api':
          result = await this.fetchFromApi(source);
          break;
        case 'rss':
          result = await this.fetchFromRss(source);
          break;
        case 'webhook':
          // Webhooks are push-based, not pull-based
          result = {
            success: true,
            data: source.lastFetchData,
            durationMs: 0,
            dimensionsUpdated: [],
            reanalysisTriggered: false,
          };
          break;
        case 'manual':
          result = {
            success: true,
            data: source.lastFetchData,
            durationMs: 0,
            dimensionsUpdated: [],
            reanalysisTriggered: false,
          };
          break;
        default:
          throw new Error(
            `Unsupported source type: ${String(source.sourceType)}`,
          );
      }

      result.durationMs = Date.now() - startTime;

      // Record fetch history
      await this.recordFetchHistory(source.id, {
        status: 'success',
        fetchDurationMs: result.durationMs,
        rawResponse: result.data,
        parsedData: result.data,
        dimensionsUpdated: result.dimensionsUpdated,
        subjectsAffected: [],
        reanalysisTriggered: result.reanalysisTriggered,
      });

      // Update source with fetch status
      await this.updateSourceFetchStatus(source.id, 'success', result.data);

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Record failed fetch
      await this.recordFetchHistory(source.id, {
        status: 'failed',
        fetchDurationMs: durationMs,
        errorMessage,
        dimensionsUpdated: [],
        subjectsAffected: [],
        reanalysisTriggered: false,
      });

      // Update source with error
      await this.updateSourceFetchStatus(
        source.id,
        'failed',
        null,
        errorMessage,
      );

      return {
        success: false,
        error: errorMessage,
        durationMs,
        dimensionsUpdated: [],
        reanalysisTriggered: false,
      };
    }
  }

  /**
   * Fetch from Firecrawl source (placeholder - would use actual Firecrawl SDK)
   */
  private async fetchFromFirecrawl(source: DataSource): Promise<FetchResult> {
    const config = source.config as FirecrawlConfig;

    // In production, this would use the Firecrawl service
    // For now, return a simulated response
    this.logger.debug(`[LIVE-DATA] Fetching from Firecrawl URL: ${config.url}`);

    // Simulate fetch delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      success: true,
      data: {
        url: config.url,
        fetchedAt: new Date().toISOString(),
        content: 'Simulated Firecrawl content',
        extractedFields: config.extractFields?.reduce(
          (acc, field) => {
            acc[field] = Math.random();
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      durationMs: 0,
      dimensionsUpdated: Object.keys(source.dimensionMapping),
      reanalysisTriggered: source.autoReanalyze,
    };
  }

  /**
   * Fetch from API source
   */
  private async fetchFromApi(source: DataSource): Promise<FetchResult> {
    const config = source.config as ApiConfig;

    this.logger.debug(
      `[LIVE-DATA] Fetching from API: ${config.method} ${config.endpoint}`,
    );

    // In production, this would make the actual API call
    // For now, return a simulated response
    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      success: true,
      data: {
        endpoint: config.endpoint,
        method: config.method,
        fetchedAt: new Date().toISOString(),
        response: {
          status: 200,
          data: {
            price: Math.random() * 100,
            volume: Math.random() * 1000000,
            change: (Math.random() - 0.5) * 10,
          },
        },
      },
      durationMs: 0,
      dimensionsUpdated: Object.keys(source.dimensionMapping),
      reanalysisTriggered: source.autoReanalyze,
    };
  }

  /**
   * Fetch from RSS source
   */
  private async fetchFromRss(source: DataSource): Promise<FetchResult> {
    const config = source.config as RssConfig;

    this.logger.debug(`[LIVE-DATA] Fetching from RSS: ${config.feedUrl}`);

    // In production, this would parse the RSS feed
    // For now, return a simulated response
    await new Promise((resolve) => setTimeout(resolve, 200));

    return {
      success: true,
      data: {
        feedUrl: config.feedUrl,
        fetchedAt: new Date().toISOString(),
        items: [
          {
            title: 'Sample News Item',
            description: 'Simulated RSS content',
            pubDate: new Date().toISOString(),
            sentiment: config.sentimentAnalysis ? 0.5 : undefined,
          },
        ],
      },
      durationMs: 0,
      dimensionsUpdated: Object.keys(source.dimensionMapping),
      reanalysisTriggered: source.autoReanalyze,
    };
  }

  /**
   * Record fetch history
   */
  private async recordFetchHistory(
    dataSourceId: string,
    record: {
      status: FetchStatus;
      fetchDurationMs?: number | null;
      rawResponse?: unknown;
      parsedData?: unknown;
      errorMessage?: string | null;
      dimensionsUpdated?: string[];
      subjectsAffected?: string[];
      reanalysisTriggered?: boolean;
    },
  ): Promise<void> {
    await this.db.from('risk', 'data_source_fetch_history').insert({
      data_source_id: dataSourceId,
      status: record.status,
      fetch_duration_ms: record.fetchDurationMs ?? null,
      raw_response: record.rawResponse ?? null,
      parsed_data: record.parsedData ?? null,
      error_message: record.errorMessage ?? null,
      dimensions_updated: record.dimensionsUpdated ?? [],
      subjects_affected: record.subjectsAffected ?? [],
      reanalysis_triggered: record.reanalysisTriggered ?? false,
    });
  }

  /**
   * Update source fetch status
   */
  private async updateSourceFetchStatus(
    dataSourceId: string,
    status: 'success' | 'failed',
    data: unknown,
    errorMessage?: string,
  ): Promise<void> {
    const source = await this.getDataSource(dataSourceId);
    if (!source) return;

    const updates: Record<string, unknown> = {
      last_fetch_at: new Date().toISOString(),
      last_fetch_status: status === 'success' ? 'success' : 'failed',
    };

    if (status === 'success') {
      updates.last_fetch_data = data;
      updates.error_message = null;
      updates.error_count = 0;
      updates.status = 'active';

      if (source.schedule) {
        updates.next_fetch_at = this.calculateNextFetch(source.schedule);
      }
    } else {
      updates.error_message = errorMessage;
      updates.error_count = (source.errorCount || 0) + 1;

      // Set to error status if too many failures
      if ((source.errorCount || 0) >= 2) {
        updates.status = 'error';
      }
    }

    await this.db
      .from('risk', 'data_sources')
      .update(updates)
      .eq('id', dataSourceId);
  }

  /**
   * Get fetch history for a data source
   */
  async getFetchHistory(
    dataSourceId: string,
    limit: number = 20,
  ): Promise<FetchHistoryRecord[]> {
    const result = asPostgrestResult(
      await this.db
        .from('risk', 'data_source_fetch_history')
        .select('*')
        .eq('data_source_id', dataSourceId)
        .order('fetched_at', { ascending: false })
        .limit(limit),
    );

    if (result.error?.message) {
      throw new Error(`Failed to get fetch history: ${result.error.message}`);
    }

    const rows = (asArray(result.data) ?? []).filter(isRecord);
    return rows.map((row) => ({
      id: asString(row['id']) ?? '',
      dataSourceId: asString(row['data_source_id']) ?? '',
      status: asString(row['status']) as FetchStatus,
      fetchDurationMs: row['fetch_duration_ms'] as number | null,
      rawResponse: row['raw_response'],
      parsedData: row['parsed_data'],
      errorMessage: asString(row['error_message']),
      dimensionsUpdated: (asArray(row['dimensions_updated']) ?? []).filter(
        (v): v is string => typeof v === 'string',
      ),
      subjectsAffected: (asArray(row['subjects_affected']) ?? []).filter(
        (v): v is string => typeof v === 'string',
      ),
      reanalysisTriggered: Boolean(row['reanalysis_triggered']),
      reanalysisTaskIds: (asArray(row['reanalysis_task_ids']) ?? []).filter(
        (v): v is string => typeof v === 'string',
      ),
      fetchedAt: asString(row['fetched_at']) ?? '',
    }));
  }

  /**
   * Calculate next fetch time from schedule
   */
  private calculateNextFetch(schedule: string): string {
    const now = new Date();

    // Handle presets
    switch (schedule) {
      case 'hourly':
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
        now.setSeconds(0);
        return now.toISOString();

      case 'daily':
        now.setDate(now.getDate() + 1);
        now.setHours(0);
        now.setMinutes(0);
        now.setSeconds(0);
        return now.toISOString();

      case 'weekly':
        now.setDate(now.getDate() + 7);
        now.setHours(0);
        now.setMinutes(0);
        now.setSeconds(0);
        return now.toISOString();

      case 'realtime':
        // 5 minutes for realtime
        now.setMinutes(now.getMinutes() + 5);
        return now.toISOString();

      default:
        // Assume cron expression - default to 1 hour for now
        // In production, would parse cron expression
        now.setHours(now.getHours() + 1);
        return now.toISOString();
    }
  }

  /**
   * Get sources that are due for fetching
   */
  async getSourcesDueForFetch(): Promise<DataSource[]> {
    const result = asPostgrestResult(
      await this.db
        .from('risk', 'data_sources')
        .select('*')
        .eq('status', 'active')
        .lte('next_fetch_at', new Date().toISOString())
        .order('next_fetch_at', { ascending: true }),
    );

    if (result.error?.message) {
      throw new Error(`Failed to get due sources: ${result.error.message}`);
    }

    return (asArray(result.data) ?? [])
      .filter(isRecord)
      .map((s) => this.mapDataSourceFromDb(s));
  }

  /**
   * Get source health summary
   */
  async getHealthSummary(scopeId: string): Promise<{
    total: number;
    active: number;
    paused: number;
    error: number;
    disabled: number;
    lastFetchSuccess: number;
    lastFetchFailed: number;
  }> {
    const sources = await this.listDataSources(scopeId);

    return {
      total: sources.length,
      active: sources.filter((s) => s.status === 'active').length,
      paused: sources.filter((s) => s.status === 'paused').length,
      error: sources.filter((s) => s.status === 'error').length,
      disabled: sources.filter((s) => s.status === 'disabled').length,
      lastFetchSuccess: sources.filter((s) => s.lastFetchStatus === 'success')
        .length,
      lastFetchFailed: sources.filter((s) => s.lastFetchStatus === 'failed')
        .length,
    };
  }

  /**
   * Map database record to domain object
   */
  private mapDataSourceFromDb(row: Record<string, unknown>): DataSource {
    return {
      id: row.id as string,
      scopeId: row.scope_id as string,
      name: row.name as string,
      description: row.description as string | null,
      sourceType: row.source_type as DataSourceType,
      config: row.config as SourceConfig,
      schedule: row.schedule as string | null,
      dimensionMapping: row.dimension_mapping as Record<
        string,
        DimensionMapping
      >,
      subjectFilter: row.subject_filter as DataSourceSubjectFilter | null,
      status: row.status as DataSourceStatus,
      errorMessage: row.error_message as string | null,
      errorCount: row.error_count as number,
      lastFetchAt: row.last_fetch_at as string | null,
      lastFetchStatus: row.last_fetch_status as FetchStatus | null,
      lastFetchData: row.last_fetch_data,
      nextFetchAt: row.next_fetch_at as string | null,
      autoReanalyze: row.auto_reanalyze as boolean,
      reanalyzeThreshold: row.reanalyze_threshold as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
