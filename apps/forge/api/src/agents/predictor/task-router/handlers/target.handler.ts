/**
 * Target Dashboard Handler
 *
 * Handles dashboard mode requests for prediction targets.
 * Targets are specific assets/symbols within a universe (e.g., AAPL in a stocks universe).
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { TargetService } from '../../services/target.service';
import { TargetSnapshotService } from '../../services/target-snapshot.service';
import { TargetRepository } from '../../repositories/target.repository';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import { CreateTargetDto, UpdateTargetDto } from '../../dto/target.dto';

interface TargetFilters {
  universeId?: string;
  isActive?: boolean;
  targetType?: string;
}

interface TargetParams {
  id?: string;
  universeId?: string;
  targetId?: string;
  period?: string;
  filters?: TargetFilters;
  page?: number;
  pageSize?: number;
}

type TargetType = 'stock' | 'crypto' | 'election' | 'polymarket';

interface LlmProviderModel {
  provider: string;
  model: string;
}

interface LlmConfig {
  gold?: LlmProviderModel;
  silver?: LlmProviderModel;
  bronze?: LlmProviderModel;
}

/**
 * camelCase params from transport-types contract
 * Maps to snake_case DTOs for database persistence
 */
interface CreateTargetParams {
  universeId: string;
  symbol: string;
  name: string;
  targetType: TargetType;
  context?: string;
  isActive?: boolean;
  llmConfigOverride?: LlmConfig;
  metadata?: Record<string, unknown>;
}

interface UpdateTargetParams {
  name?: string;
  context?: string;
  isActive?: boolean;
  llmConfigOverride?: LlmConfig;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class TargetHandler implements IDashboardHandler {
  private readonly logger = new Logger(TargetHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'update',
    'delete',
    'prices',
    'priceHistory',
  ];

  constructor(
    private readonly targetService: TargetService,
    private readonly targetSnapshotService: TargetSnapshotService,
    private readonly targetRepository: TargetRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[TARGET-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as TargetParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'create':
        return this.handleCreate(payload);
      case 'update':
        return this.handleUpdate(params, payload);
      case 'delete':
        return this.handleDelete(params);
      case 'prices':
        return this.handlePrices();
      case 'pricehistory':
        return this.handlePriceHistory(params);
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

  private async handleList(
    params?: TargetParams,
  ): Promise<DashboardActionResult> {
    const universeId = params?.universeId || params?.filters?.universeId;

    if (!universeId) {
      return buildDashboardError(
        'MISSING_UNIVERSE_ID',
        'universeId is required. Call universes.list first to get available universes.',
        {
          hint: 'Use action "universes.list" to get universes for this agent, then pass universeId in params',
        },
      );
    }

    try {
      const targets =
        params?.filters?.isActive === false
          ? await this.targetService.findByUniverse(universeId)
          : await this.targetService.findActiveByUniverse(universeId);

      // Apply type filter if provided
      let filtered = targets;
      if (params?.filters?.targetType) {
        filtered = filtered.filter(
          (t) => t.target_type === params.filters!.targetType,
        );
      }

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedTargets = filtered.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedTargets,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list targets: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list targets',
      );
    }
  }

  private async handleGet(
    params?: TargetParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Target ID is required');
    }

    try {
      const target = await this.targetService.findById(params.id);
      if (!target) {
        return buildDashboardError(
          'NOT_FOUND',
          `Target not found: ${params.id}`,
        );
      }

      // Also get effective LLM config
      const llmConfig = await this.targetService.getEffectiveLlmConfig(target);

      return buildDashboardSuccess({
        ...target,
        effectiveLlmConfig: llmConfig,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get target: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get target',
      );
    }
  }

  private async handleCreate(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    // Accept camelCase params from transport contract
    const data = payload.params as Partial<CreateTargetParams>;

    if (!data.universeId || !data.symbol || !data.name || !data.targetType) {
      return buildDashboardError(
        'INVALID_DATA',
        'universeId, symbol, name, and targetType are required',
      );
    }

    try {
      // Map camelCase params to snake_case DTO for database
      const createDto: CreateTargetDto = {
        universe_id: data.universeId,
        symbol: data.symbol,
        name: data.name,
        target_type: data.targetType,
        context: data.context,
        is_active: data.isActive ?? true,
        llm_config_override: data.llmConfigOverride,
        metadata: data.metadata,
      };

      const target = await this.targetService.create(createDto);
      return buildDashboardSuccess(target);
    } catch (error) {
      this.logger.error(
        `Failed to create target: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error ? error.message : 'Failed to create target',
      );
    }
  }

  private async handleUpdate(
    params: TargetParams | undefined,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Target ID is required');
    }

    // Accept camelCase params from transport contract
    const data = payload.params as Partial<UpdateTargetParams>;

    try {
      // Map camelCase params to snake_case DTO for database
      const updateDto: UpdateTargetDto = {};

      // Only include fields that are explicitly provided
      if (data.name !== undefined) updateDto.name = data.name;
      if (data.context !== undefined) updateDto.context = data.context;
      if (data.isActive !== undefined) updateDto.is_active = data.isActive;
      if (data.llmConfigOverride !== undefined)
        updateDto.llm_config_override = data.llmConfigOverride;
      if (data.metadata !== undefined) updateDto.metadata = data.metadata;

      const target = await this.targetService.update(params.id, updateDto);
      return buildDashboardSuccess(target);
    } catch (error) {
      this.logger.error(
        `Failed to update target: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UPDATE_FAILED',
        error instanceof Error ? error.message : 'Failed to update target',
      );
    }
  }

  private async handleDelete(
    params?: TargetParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Target ID is required');
    }

    try {
      await this.targetService.delete(params.id);
      return buildDashboardSuccess({ deleted: true, id: params.id });
    } catch (error) {
      this.logger.error(
        `Failed to delete target: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error ? error.message : 'Failed to delete target',
      );
    }
  }

  private async handlePrices(): Promise<DashboardActionResult> {
    try {
      const targets = await this.targetRepository.findAllActive();

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const pricesWithChange = await Promise.all(
        targets.map(async (target) => {
          let change24h: {
            change_absolute: number | null;
            change_percent: number | null;
          } = { change_absolute: null, change_percent: null };

          try {
            change24h = await this.targetSnapshotService.calculateChange(
              target.id,
              twentyFourHoursAgo.toISOString(),
              now.toISOString(),
            );
          } catch {
            // Ignore - target may have no snapshots
          }

          return {
            id: target.id,
            symbol: target.symbol,
            name: target.name,
            target_type: target.target_type,
            universe_id: target.universe_id,
            current_price: target.current_price,
            price_updated_at: target.price_updated_at,
            change_24h_absolute: change24h.change_absolute,
            change_24h_percent: change24h.change_percent,
          };
        }),
      );

      return buildDashboardSuccess(pricesWithChange);
    } catch (error) {
      this.logger.error(
        `Failed to get prices: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'PRICES_FAILED',
        error instanceof Error ? error.message : 'Failed to get prices',
      );
    }
  }

  private async handlePriceHistory(
    params?: TargetParams,
  ): Promise<DashboardActionResult> {
    const targetId = params?.targetId || params?.id;
    if (!targetId) {
      return buildDashboardError(
        'MISSING_TARGET_ID',
        'targetId is required for price history',
      );
    }

    const periodMap: Record<string, number> = {
      day: 24,
      '2days': 48,
      '3days': 72,
      week: 168,
      month: 720,
    };

    const period = params?.period || 'day';
    const hours = periodMap[period] || 24;

    try {
      const target = await this.targetService.findById(targetId);
      if (!target) {
        return buildDashboardError(
          'NOT_FOUND',
          `Target not found: ${targetId}`,
        );
      }

      const snapshots = await this.targetSnapshotService.getHistory(
        targetId,
        hours,
      );

      const now = new Date();
      const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const changeSummary = await this.targetSnapshotService.calculateChange(
        targetId,
        start.toISOString(),
        now.toISOString(),
      );

      return buildDashboardSuccess({
        target: {
          id: target.id,
          symbol: target.symbol,
          name: target.name,
          target_type: target.target_type,
          current_price: target.current_price,
        },
        period,
        hours,
        snapshots,
        change: changeSummary,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get price history: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'PRICE_HISTORY_FAILED',
        error instanceof Error ? error.message : 'Failed to get price history',
      );
    }
  }
}
