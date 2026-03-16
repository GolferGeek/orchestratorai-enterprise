/**
 * Learning Dashboard Handler
 *
 * Handles dashboard mode requests for prediction learnings.
 * Learnings are rules, patterns, and weight adjustments that guide predictions.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { LearningService } from '../../services/learning.service';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import { CreateLearningDto, UpdateLearningDto } from '../../dto/learning.dto';

interface LearningFilters {
  scopeLevel?: string;
  learningType?: string;
  sourceType?: string;
  status?: string;
  targetId?: string;
  universeId?: string;
  analystId?: string;
}

interface LearningParams {
  id?: string;
  filters?: LearningFilters;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class LearningHandler implements IDashboardHandler {
  private readonly logger = new Logger(LearningHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'update',
    'supersede',
  ];

  constructor(private readonly learningService: LearningService) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[LEARNING-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as LearningParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'create':
        return this.handleCreate(payload);
      case 'update':
        return this.handleUpdate(params, payload);
      case 'supersede':
        return this.handleSupersede(params, payload);
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
    params?: LearningParams,
  ): Promise<DashboardActionResult> {
    try {
      // Get learnings based on target (uses scope hierarchy)
      const targetId = params?.filters?.targetId;
      const analystId = params?.filters?.analystId;
      const scopeLevel = params?.filters?.scopeLevel;
      const status = params?.filters?.status as
        | 'active'
        | 'superseded'
        | 'disabled'
        | undefined;

      let learnings: Array<{ learning_type: string; source_type?: string }>;

      if (targetId) {
        // Get active learnings for a target using scope resolution
        learnings = await this.learningService.getActiveLearnings(
          targetId,
          undefined, // tier
          analystId,
        );
      } else if (scopeLevel) {
        // Get learnings by scope
        learnings = await this.learningService.findByScope(
          scopeLevel,
          params?.filters?.universeId ? undefined : undefined, // domain not available in filters
          params?.filters?.universeId,
          params?.filters?.targetId,
          status,
        );
      } else {
        // Return empty - must specify target or scope
        learnings = [];
      }

      // Apply additional filters
      let filtered = learnings;

      if (params?.filters?.learningType) {
        filtered = filtered.filter(
          (l) => l.learning_type === params.filters!.learningType,
        );
      }

      if (params?.filters?.sourceType) {
        filtered = filtered.filter(
          (l) => l.source_type === params.filters!.sourceType,
        );
      }

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedLearnings = filtered.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedLearnings,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list learnings: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list learnings',
      );
    }
  }

  private async handleGet(
    params?: LearningParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Learning ID is required');
    }

    try {
      const learning = await this.learningService.findById(params.id);
      if (!learning) {
        return buildDashboardError(
          'NOT_FOUND',
          `Learning not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(learning);
    } catch (error) {
      this.logger.error(
        `Failed to get learning: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get learning',
      );
    }
  }

  private async handleCreate(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = payload.params as Partial<CreateLearningDto>;

    if (
      !data.scope_level ||
      !data.learning_type ||
      !data.title ||
      !data.description
    ) {
      return buildDashboardError(
        'INVALID_DATA',
        'scope_level, learning_type, title, and description are required',
      );
    }

    try {
      const createDto: CreateLearningDto = {
        scope_level: data.scope_level as
          | 'runner'
          | 'domain'
          | 'universe'
          | 'target',
        learning_type: data.learning_type as
          | 'rule'
          | 'pattern'
          | 'weight_adjustment'
          | 'threshold'
          | 'avoid',
        title: data.title,
        description: data.description,
        config: data.config,
        source_type: data.source_type || 'human',
        domain: data.domain,
        universe_id: data.universe_id,
        target_id: data.target_id,
        analyst_id: data.analyst_id,
        source_evaluation_id: data.source_evaluation_id,
        source_missed_opportunity_id: data.source_missed_opportunity_id,
        status: data.status || 'active',
      };

      const learning = await this.learningService.create(createDto);
      return buildDashboardSuccess(learning);
    } catch (error) {
      this.logger.error(
        `Failed to create learning: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error ? error.message : 'Failed to create learning',
      );
    }
  }

  private async handleUpdate(
    params: LearningParams | undefined,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Learning ID is required');
    }

    const data = payload.params as Partial<UpdateLearningDto>;

    try {
      const updateDto: UpdateLearningDto = {};

      if (data.title !== undefined) updateDto.title = data.title;
      if (data.description !== undefined)
        updateDto.description = data.description;
      if (data.config !== undefined) updateDto.config = data.config;
      if (data.status !== undefined) updateDto.status = data.status;

      const learning = await this.learningService.update(params.id, updateDto);
      return buildDashboardSuccess(learning);
    } catch (error) {
      this.logger.error(
        `Failed to update learning: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UPDATE_FAILED',
        error instanceof Error ? error.message : 'Failed to update learning',
      );
    }
  }

  /**
   * Supersede a learning with a new version
   */
  private async handleSupersede(
    params: LearningParams | undefined,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError(
        'MISSING_ID',
        'Learning ID to supersede is required',
      );
    }

    const data = payload.params as Partial<CreateLearningDto>;

    if (
      !data.scope_level ||
      !data.learning_type ||
      !data.title ||
      !data.description
    ) {
      return buildDashboardError(
        'INVALID_DATA',
        'scope_level, learning_type, title, and description are required for new version',
      );
    }

    try {
      const newLearningDto: CreateLearningDto = {
        scope_level: data.scope_level as
          | 'runner'
          | 'domain'
          | 'universe'
          | 'target',
        learning_type: data.learning_type as
          | 'rule'
          | 'pattern'
          | 'weight_adjustment'
          | 'threshold'
          | 'avoid',
        title: data.title,
        description: data.description,
        config: data.config,
        source_type: data.source_type || 'human',
        domain: data.domain,
        universe_id: data.universe_id,
        target_id: data.target_id,
        analyst_id: data.analyst_id,
      };

      const newLearning = await this.learningService.supersede(
        params.id,
        newLearningDto,
      );
      return buildDashboardSuccess({
        superseded: params.id,
        newLearning,
      });
    } catch (error) {
      this.logger.error(
        `Failed to supersede learning: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SUPERSEDE_FAILED',
        error instanceof Error ? error.message : 'Failed to supersede learning',
      );
    }
  }
}
