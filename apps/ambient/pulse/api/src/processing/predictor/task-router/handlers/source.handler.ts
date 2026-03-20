/**
 * Source Dashboard Handler
 *
 * Handles dashboard mode requests for prediction source subscriptions.
 * Sources are managed in crawler.sources; this handler bridges them to
 * prediction.source_subscriptions so the prediction pipeline knows which
 * crawler sources feed into which targets/universes.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '../../../../shared/pulse-types';
import { SourceSubscriptionRepository } from '../../repositories/source-subscription.repository';
import { CrawlerSourceRepository } from '@/crawler/repositories/source.repository';
import { TargetRepository } from '../../repositories/target.repository';
import type { Source } from '@/crawler/interfaces/source.interface';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
} from '../dashboard-handler.interface';

interface SourceParams {
  id?: string;
  universeId?: string;
  targetId?: string;
  name?: string;
  sourceType?: string;
  scopeLevel?: string;
  domain?: string;
  crawlConfig?: Record<string, unknown>;
  authConfig?: Record<string, unknown>;
  active?: boolean;
  url?: string;
  frequency?: string;
}

@Injectable()
export class SourceHandler implements IDashboardHandler {
  private readonly logger = new Logger(SourceHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'update',
    'delete',
  ];

  constructor(
    private readonly subscriptionRepository: SourceSubscriptionRepository,
    private readonly crawlerSourceRepository: CrawlerSourceRepository,
    private readonly targetRepository: TargetRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[SOURCE-HANDLER] Action: ${action}, org: ${context.orgSlug}`,
    );

    const params = payload?.params as SourceParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params, context);
      case 'get':
        return this.handleGet(params);
      case 'create':
        return this.handleCreate(params, context);
      case 'update':
        return this.handleUpdate(params);
      case 'delete':
        return this.handleDelete(params);
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

  /**
   * List sources for a universe by querying subscriptions and joining with crawler.sources
   */
  private async handleList(
    params: SourceParams | undefined,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    try {
      let sourceIds: string[];

      if (params?.universeId) {
        // Get subscriptions for this universe
        const subscriptions = await this.subscriptionRepository.findByUniverse(
          params.universeId,
        );
        // Unique source IDs
        sourceIds = [...new Set(subscriptions.map((s) => s.source_id))];
      } else if (params?.targetId) {
        const subscriptions = await this.subscriptionRepository.findByTarget(
          params.targetId,
        );
        sourceIds = [...new Set(subscriptions.map((s) => s.source_id))];
      } else {
        // Fall back to all sources for the org
        const allSources =
          await this.crawlerSourceRepository.findAllForDashboard(
            context.orgSlug,
          );
        return buildDashboardSuccess(allSources.map(this.mapSourceToApi));
      }

      if (sourceIds.length === 0) {
        return buildDashboardSuccess([]);
      }

      // Fetch the actual crawler sources for these IDs
      const sources: Source[] = [];
      for (const id of sourceIds) {
        const source = await this.crawlerSourceRepository.findById(id);
        if (source) {
          sources.push(source);
        }
      }

      return buildDashboardSuccess(sources.map(this.mapSourceToApi));
    } catch (error) {
      this.logger.error(
        `Failed to list sources: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_SOURCES_FAILED',
        error instanceof Error ? error.message : 'Failed to list sources',
      );
    }
  }

  /**
   * Get a single source by ID
   */
  private async handleGet(
    params: SourceParams | undefined,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_SOURCE_ID', 'Source ID is required');
    }

    try {
      const source = await this.crawlerSourceRepository.findById(params.id);
      if (!source) {
        return buildDashboardError(
          'NOT_FOUND',
          `Source not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(this.mapSourceToApi(source));
    } catch (error) {
      this.logger.error(
        `Failed to get source: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_SOURCE_FAILED',
        error instanceof Error ? error.message : 'Failed to get source',
      );
    }
  }

  /**
   * Create a new source in crawler AND create a subscription linking it to the universe/target
   */
  private async handleCreate(
    params: SourceParams | undefined,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!params?.name || !params?.url) {
      return buildDashboardError(
        'MISSING_PARAMS',
        'Name and URL are required to create a source',
      );
    }

    try {
      // Create the crawler source
      const frequencyMap: Record<string, number> = {
        '5min': 5,
        '10min': 10,
        '15min': 15,
        '30min': 30,
        hourly: 60,
      };
      const crawlFrequency = frequencyMap[params.frequency ?? '15min'] ?? 15;

      const source = await this.crawlerSourceRepository.findOrCreate({
        organization_slug: context.orgSlug,
        name: params.name,
        source_type: (params.sourceType as 'web' | 'rss' | 'api') ?? 'rss',
        url: params.url,
        crawl_config: (params.crawlConfig as Record<string, unknown>) ?? {},
        crawl_frequency_minutes: crawlFrequency as 5 | 10 | 15 | 30 | 60,
        is_active: params.active ?? true,
      });

      // If universeId provided, create subscriptions for all targets in that universe
      if (params.universeId) {
        const targets = await this.targetRepository.findAll(params.universeId);
        for (const target of targets) {
          // Check if subscription already exists
          const existing =
            await this.subscriptionRepository.findBySourceAndTarget(
              source.id,
              target.id,
            );
          if (!existing) {
            await this.subscriptionRepository.create({
              source_id: source.id,
              target_id: target.id,
              universe_id: params.universeId,
              is_active: true,
            });
          }
        }
      } else if (params.targetId) {
        // Create subscription for specific target
        const existing =
          await this.subscriptionRepository.findBySourceAndTarget(
            source.id,
            params.targetId,
          );
        if (!existing) {
          // Look up universe from target
          const target = await this.targetRepository.findById(params.targetId);
          await this.subscriptionRepository.create({
            source_id: source.id,
            target_id: params.targetId,
            universe_id: target?.universe_id ?? '',
            is_active: true,
          });
        }
      }

      this.logger.log(
        `Created source ${source.name} (${source.id}) with subscriptions`,
      );

      return buildDashboardSuccess(this.mapSourceToApi(source));
    } catch (error) {
      this.logger.error(
        `Failed to create source: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_SOURCE_FAILED',
        error instanceof Error ? error.message : 'Failed to create source',
      );
    }
  }

  /**
   * Update a source (toggle active, change name, etc.)
   */
  private async handleUpdate(
    params: SourceParams | undefined,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError(
        'MISSING_SOURCE_ID',
        'Source ID is required to update',
      );
    }

    try {
      const updateData: Record<string, unknown> = {};
      if (params.name !== undefined) updateData.name = params.name;
      if (params.active !== undefined) updateData.is_active = params.active;
      if (params.crawlConfig !== undefined)
        updateData.crawl_config = params.crawlConfig;

      const source = await this.crawlerSourceRepository.update(
        params.id,
        updateData,
      );

      return buildDashboardSuccess(this.mapSourceToApi(source));
    } catch (error) {
      this.logger.error(
        `Failed to update source: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UPDATE_SOURCE_FAILED',
        error instanceof Error ? error.message : 'Failed to update source',
      );
    }
  }

  /**
   * Delete subscriptions for a source (and optionally the source itself)
   */
  private async handleDelete(
    params: SourceParams | undefined,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError(
        'MISSING_SOURCE_ID',
        'Source ID is required to delete',
      );
    }

    try {
      // Find and delete all subscriptions for this source
      const subscriptions = await this.subscriptionRepository.findBySourceId(
        params.id,
      );
      for (const sub of subscriptions) {
        await this.subscriptionRepository.delete(sub.id);
      }

      // Delete the crawler source itself
      await this.crawlerSourceRepository.delete(params.id);

      this.logger.log(
        `Deleted source ${params.id} and ${subscriptions.length} subscriptions`,
      );

      return buildDashboardSuccess({
        id: params.id,
        subscriptionsRemoved: subscriptions.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to delete source: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_SOURCE_FAILED',
        error instanceof Error ? error.message : 'Failed to delete source',
      );
    }
  }

  /**
   * Map crawler Source to the ApiSource shape expected by the frontend
   */
  private mapSourceToApi = (source: Source): Record<string, unknown> => {
    return {
      id: source.id,
      name: source.name,
      description: source.description ?? null,
      source_type: source.source_type,
      url: source.url,
      scope_level: 'universe', // Sources accessed via subscriptions are universe-scoped
      domain: null,
      universe_id: null,
      target_id: null,
      crawl_config: source.crawl_config,
      auth_config: source.auth_config ?? null,
      crawl_frequency_minutes: source.crawl_frequency_minutes,
      is_active: source.is_active,
      is_test: source.is_test,
      last_crawl_at: source.last_crawl_at ?? null,
      last_crawl_status: source.last_crawl_status ?? null,
      last_error: source.last_error ?? null,
      consecutive_errors: source.consecutive_errors,
      created_at: source.created_at,
      updated_at: source.updated_at,
    };
  };
}
