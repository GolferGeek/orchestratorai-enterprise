/**
 * Universe Dashboard Handler
 *
 * Handles dashboard mode requests for prediction universes.
 * Universes group targets by organization, domain, and strategy.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { UniverseService } from '../../services/universe.service';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import { CreateUniverseDto, UpdateUniverseDto } from '../../dto/universe.dto';

interface UniverseFilters {
  domain?: string;
  isActive?: boolean;
}

interface UniverseParams {
  id?: string;
  filters?: UniverseFilters;
  page?: number;
  pageSize?: number;
}

type DomainType = 'stocks' | 'crypto' | 'elections' | 'polymarket';

interface LlmProviderModel {
  provider: string;
  model: string;
}

interface LlmConfig {
  gold?: LlmProviderModel;
  silver?: LlmProviderModel;
  bronze?: LlmProviderModel;
}

interface ThresholdConfig {
  min_predictors?: number;
  min_combined_strength?: number;
  min_direction_consensus?: number;
  predictor_ttl_hours?: number;
}

interface NotificationConfig {
  urgent_enabled: boolean;
  new_prediction_enabled: boolean;
  outcome_enabled: boolean;
  channels: ('push' | 'sms' | 'email' | 'sse')[];
}

/**
 * camelCase params from transport-types contract
 * Maps to snake_case DTOs for database persistence
 */
interface CreateUniverseParams {
  name: string;
  domain: DomainType;
  description?: string;
  agentSlug?: string;
  strategyId?: string;
  isActive?: boolean;
  thresholds?: ThresholdConfig;
  llmConfig?: LlmConfig;
  notificationConfig?: NotificationConfig;
}

interface UpdateUniverseParams {
  name?: string;
  description?: string;
  domain?: DomainType;
  strategyId?: string;
  isActive?: boolean;
  thresholds?: ThresholdConfig;
  llmConfig?: LlmConfig;
  notificationConfig?: NotificationConfig;
}

@Injectable()
export class UniverseHandler implements IDashboardHandler {
  private readonly logger = new Logger(UniverseHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'update',
    'delete',
  ];

  constructor(private readonly universeService: UniverseService) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[UNIVERSE-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as UniverseParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(context, params);
      case 'get':
        return this.handleGet(params);
      case 'create':
        return this.handleCreate(context, payload);
      case 'update':
        return this.handleUpdate(params, payload);
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

  private async handleList(
    context: ExecutionContext,
    params?: UniverseParams,
  ): Promise<DashboardActionResult> {
    try {
      // Get universes for this specific agent
      const universes = await this.universeService.findByAgent(
        context.agentSlug,
        context.orgSlug,
      );

      // Apply filters if provided
      let filtered = universes;
      if (params?.filters?.domain) {
        filtered = filtered.filter((u) => u.domain === params.filters!.domain);
      }

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedUniverses = filtered.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedUniverses,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list universes: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list universes',
      );
    }
  }

  private async handleGet(
    params?: UniverseParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Universe ID is required');
    }

    try {
      const universe = await this.universeService.findById(params.id);
      if (!universe) {
        return buildDashboardError(
          'NOT_FOUND',
          `Universe not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(universe);
    } catch (error) {
      this.logger.error(
        `Failed to get universe: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get universe',
      );
    }
  }

  private async handleCreate(
    context: ExecutionContext,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    // Accept camelCase params from transport contract
    const data = payload.params as Partial<CreateUniverseParams>;

    if (!data.name || !data.domain) {
      return buildDashboardError(
        'INVALID_DATA',
        'Name and domain are required',
      );
    }

    try {
      // Map camelCase params to snake_case DTO for database
      const createDto: CreateUniverseDto = {
        name: data.name,
        domain: data.domain,
        organization_slug: context.orgSlug,
        agent_slug: data.agentSlug || context.agentSlug || 'prediction-runner',
        description: data.description,
        strategy_id: data.strategyId,
        is_active: data.isActive ?? true,
        thresholds: data.thresholds,
        llm_config: data.llmConfig,
        notification_config: data.notificationConfig,
      };

      const universe = await this.universeService.create(createDto);
      return buildDashboardSuccess(universe);
    } catch (error) {
      this.logger.error(
        `Failed to create universe: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error ? error.message : 'Failed to create universe',
      );
    }
  }

  private async handleUpdate(
    params: UniverseParams | undefined,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Universe ID is required');
    }

    // Accept camelCase params from transport contract
    const data = payload.params as Partial<UpdateUniverseParams>;

    try {
      // Map camelCase params to snake_case DTO for database
      const updateDto: UpdateUniverseDto = {};

      // Only include fields that are explicitly provided
      if (data.name !== undefined) updateDto.name = data.name;
      if (data.description !== undefined)
        updateDto.description = data.description;
      if (data.domain !== undefined) updateDto.domain = data.domain;
      if (data.strategyId !== undefined)
        updateDto.strategy_id = data.strategyId;
      if (data.isActive !== undefined) updateDto.is_active = data.isActive;
      if (data.thresholds !== undefined) updateDto.thresholds = data.thresholds;
      if (data.llmConfig !== undefined) updateDto.llm_config = data.llmConfig;
      if (data.notificationConfig !== undefined)
        updateDto.notification_config = data.notificationConfig;

      const universe = await this.universeService.update(params.id, updateDto);
      return buildDashboardSuccess(universe);
    } catch (error) {
      this.logger.error(
        `Failed to update universe: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UPDATE_FAILED',
        error instanceof Error ? error.message : 'Failed to update universe',
      );
    }
  }

  private async handleDelete(
    params?: UniverseParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Universe ID is required');
    }

    try {
      await this.universeService.delete(params.id);
      return buildDashboardSuccess({ deleted: true, id: params.id });
    } catch (error) {
      this.logger.error(
        `Failed to delete universe: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error ? error.message : 'Failed to delete universe',
      );
    }
  }
}
