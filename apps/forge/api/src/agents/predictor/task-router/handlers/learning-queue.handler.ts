/**
 * Learning Queue Dashboard Handler
 *
 * Handles dashboard mode requests for the learning queue.
 * The learning queue contains AI-suggested learnings pending human review.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { LearningQueueService } from '../../services/learning-queue.service';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import { ReviewLearningQueueDto } from '../../dto/learning.dto';
import type { LearningQueueStatus } from '../../interfaces/learning.interface';

interface LearningQueueFilters {
  status?: string;
  suggestedScopeLevel?: string;
  suggestedLearningType?: string;
  universeId?: string;
  targetId?: string;
}

interface LearningQueueParams {
  id?: string;
  filters?: LearningQueueFilters;
  page?: number;
  pageSize?: number;
}

interface LearningQueueRespondData {
  id: string;
  decision: 'approved' | 'rejected' | 'modified';
  reviewerNotes?: string;
  finalTitle?: string;
  finalDescription?: string;
  finalScopeLevel?: string;
  finalLearningType?: string;
  finalConfig?: Record<string, unknown>;
}

@Injectable()
export class LearningQueueHandler implements IDashboardHandler {
  private readonly logger = new Logger(LearningQueueHandler.name);
  private readonly supportedActions = ['list', 'get', 'respond'];

  constructor(private readonly learningQueueService: LearningQueueService) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[LEARNING-QUEUE-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as LearningQueueParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'respond':
        return this.handleRespond(payload, context);
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
    params?: LearningQueueParams,
  ): Promise<DashboardActionResult> {
    try {
      // Get items by status (default to pending)
      const status = (params?.filters?.status ||
        'pending') as LearningQueueStatus;
      const items = await this.learningQueueService.getItemsByStatus(status);

      // Apply additional filters
      let filtered = items;

      if (params?.filters?.suggestedScopeLevel) {
        filtered = filtered.filter(
          (i) =>
            i.suggested_scope_level === params.filters!.suggestedScopeLevel,
        );
      }

      if (params?.filters?.suggestedLearningType) {
        filtered = filtered.filter(
          (i) =>
            i.suggested_learning_type === params.filters!.suggestedLearningType,
        );
      }

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

      return buildDashboardSuccess(
        paginatedItems,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list learning queue: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to list learning queue',
      );
    }
  }

  private async handleGet(
    params?: LearningQueueParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Queue item ID is required');
    }

    try {
      const item = await this.learningQueueService.findById(params.id);
      if (!item) {
        return buildDashboardError(
          'NOT_FOUND',
          `Queue item not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(item);
    } catch (error) {
      this.logger.error(
        `Failed to get queue item: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get queue item',
      );
    }
  }

  /**
   * Handle human response to AI-suggested learning
   * Uses the ReviewLearningQueueDto to respond via LearningQueueService
   */
  private async handleRespond(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const data = payload.params as unknown as LearningQueueRespondData;

    if (!data.id || !data.decision) {
      return buildDashboardError(
        'INVALID_DATA',
        'id and decision (approved/rejected/modified) are required',
      );
    }

    const validDecisions = ['approved', 'rejected', 'modified'];
    if (!validDecisions.includes(data.decision)) {
      return buildDashboardError(
        'INVALID_DECISION',
        `Invalid decision: ${data.decision}. Must be one of: ${validDecisions.join(', ')}`,
      );
    }

    try {
      // Build the review DTO
      const reviewDto: ReviewLearningQueueDto = {
        status: data.decision,
        reviewer_notes: data.reviewerNotes,
      };

      // Add modification fields if present
      if (data.decision === 'modified') {
        if (data.finalTitle) reviewDto.final_title = data.finalTitle;
        if (data.finalDescription)
          reviewDto.final_description = data.finalDescription;
        if (data.finalScopeLevel) {
          reviewDto.final_scope_level = data.finalScopeLevel as
            | 'runner'
            | 'domain'
            | 'universe'
            | 'target';
        }
        if (data.finalLearningType) {
          reviewDto.final_learning_type = data.finalLearningType as
            | 'rule'
            | 'pattern'
            | 'weight_adjustment'
            | 'threshold'
            | 'avoid';
        }
        if (data.finalConfig) {
          reviewDto.final_config = data.finalConfig;
        }
      }

      // Call the service with user ID from context
      const result = await this.learningQueueService.respond(
        data.id,
        reviewDto,
        context.userId,
      );

      return buildDashboardSuccess({
        queueItem: result,
        message: `Learning queue item ${data.decision}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to respond to queue item: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'RESPOND_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to respond to queue item',
      );
    }
  }
}
