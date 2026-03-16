/**
 * Review Queue Dashboard Handler
 *
 * Handles dashboard mode requests for the signal review queue.
 * The review queue contains signals with confidence 0.4-0.7 that need human review.
 * This is the HITL component for signal processing.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import {
  ReviewQueueService,
  ReviewQueueItem,
} from '../../services/review-queue.service';
import { ReviewResponseDto } from '../../dto/review-queue.dto';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';

interface ReviewQueueFilters {
  targetId?: string;
  fromDate?: string;
  toDate?: string;
}

interface ReviewQueueParams {
  id?: string;
  filters?: ReviewQueueFilters;
  page?: number;
  pageSize?: number;
}

interface ReviewQueueRespondData {
  reviewId: string;
  decision: 'approve' | 'reject' | 'modify';
  strengthOverride?: number;
  notes?: string;
  learningNote?: string;
}

@Injectable()
export class ReviewQueueHandler implements IDashboardHandler {
  private readonly logger = new Logger(ReviewQueueHandler.name);
  private readonly supportedActions = ['list', 'get', 'respond'];

  constructor(private readonly reviewQueueService: ReviewQueueService) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[REVIEW-QUEUE-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as ReviewQueueParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'respond':
        return this.handleRespond(payload);
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
    params?: ReviewQueueParams,
  ): Promise<DashboardActionResult> {
    try {
      // Get pending items, optionally filtered by target
      const targetId = params?.filters?.targetId;
      const items = await this.reviewQueueService.getPendingReviews(targetId);

      // Apply date filters
      let filtered: ReviewQueueItem[] = items;

      if (params?.filters?.fromDate) {
        const fromDate = new Date(params.filters.fromDate);
        filtered = filtered.filter((i) => new Date(i.created_at) >= fromDate);
      }

      if (params?.filters?.toDate) {
        const toDate = new Date(params.filters.toDate);
        filtered = filtered.filter((i) => new Date(i.created_at) <= toDate);
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
        `Failed to list review queue: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list review queue',
      );
    }
  }

  private async handleGet(
    params?: ReviewQueueParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Review item ID is required');
    }

    try {
      const item = await this.reviewQueueService.getReviewItem(params.id);
      if (!item) {
        return buildDashboardError(
          'NOT_FOUND',
          `Review item not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(item);
    } catch (error) {
      this.logger.error(
        `Failed to get review item: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get review item',
      );
    }
  }

  /**
   * Handle human response to signal in review queue
   * Can approve, reject, or modify with strength override
   * Optionally provide a learning note
   */
  private async handleRespond(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = payload.params as unknown as ReviewQueueRespondData;

    if (!data.reviewId || !data.decision) {
      return buildDashboardError(
        'INVALID_DATA',
        'reviewId and decision (approve/reject/modify) are required',
      );
    }

    const validDecisions = ['approve', 'reject', 'modify'];
    if (!validDecisions.includes(data.decision)) {
      return buildDashboardError(
        'INVALID_DECISION',
        `Invalid decision: ${data.decision}. Must be one of: ${validDecisions.join(', ')}`,
      );
    }

    try {
      // Build the ReviewResponseDto for the service
      const responseDto: ReviewResponseDto = {
        review_id: data.reviewId,
        decision: data.decision,
        strength_override: data.strengthOverride,
        notes: data.notes,
        learning_note: data.learningNote,
      };

      const result =
        await this.reviewQueueService.handleReviewResponse(responseDto);

      return buildDashboardSuccess({
        predictor: result.predictor,
        learning: result.learning,
        message: `Signal ${data.decision === 'reject' ? 'rejected' : 'approved'} successfully`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to respond to review item: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'RESPOND_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to respond to review item',
      );
    }
  }
}
