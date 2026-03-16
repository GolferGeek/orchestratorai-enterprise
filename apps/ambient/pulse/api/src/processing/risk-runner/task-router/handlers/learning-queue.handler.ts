/**
 * Learning Queue Handler
 *
 * Dashboard handler for HITL learning queue operations.
 * Supports listing pending learnings, responding to suggestions,
 * and managing the learning lifecycle.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import {
  RiskLearningService,
  LearningQueueResponse,
} from '../../services/risk-learning.service';
import { HistoricalReplayService } from '../../services/historical-replay.service';
import { LearningRepository } from '../../repositories/learning.repository';
import { LearningConfig } from '../../interfaces/learning.interface';

@Injectable()
export class LearningQueueHandler implements IDashboardHandler {
  private readonly logger = new Logger(LearningQueueHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'respond',
    'approve',
    'reject',
    'modify',
    'count',
    'replay',
    'promote',
    'retire',
  ];

  constructor(
    private readonly learningService: RiskLearningService,
    private readonly replayService: HistoricalReplayService,
    private readonly learningRepo: LearningRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing learning-queue action: ${action}`);

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(payload);
      case 'get':
        return this.handleGet(payload);
      case 'respond':
        return this.handleRespond(payload, context);
      case 'approve':
        return this.handleApprove(payload, context);
      case 'reject':
        return this.handleReject(payload, context);
      case 'modify':
        return this.handleModify(payload, context);
      case 'count':
        return this.handleCount(payload);
      case 'replay':
        return this.handleReplay(payload);
      case 'promote':
        return this.handlePromote(payload, context);
      case 'retire':
        return this.handleRetire(payload, context);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported learning-queue action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  /**
   * List pending learning queue items
   */
  private async handleList(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const includeTest = (params?.includeTest as boolean | undefined) ?? false;

    let items;
    if (scopeId) {
      items = await this.learningService.getQueueByScope(scopeId, {
        includeTest,
      });
    } else {
      items = await this.learningService.getPendingQueue({ includeTest });
    }

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedItems = items.slice(start, start + pageSize);

    return buildDashboardSuccess(
      paginatedItems,
      buildPaginationMetadata(items.length, page, pageSize),
    );
  }

  /**
   * Get a specific queue item
   */
  private async handleGet(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Queue item ID is required');
    }

    const item = await this.learningService.getQueueItemById(id);

    if (!item) {
      return buildDashboardError('NOT_FOUND', `Queue item not found: ${id}`);
    }

    return buildDashboardSuccess(item);
  }

  /**
   * Respond to a queue item (generic response)
   */
  private async handleRespond(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;
    const decision = params?.decision as
      | 'approved'
      | 'rejected'
      | 'modified'
      | undefined;
    const notes = params?.reviewerNotes as string | undefined;
    const modifiedTitle = params?.modifiedTitle as string | undefined;
    const modifiedDescription = params?.modifiedDescription as
      | string
      | undefined;
    const modifiedConfig = params?.modifiedConfig as LearningConfig | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Queue item ID is required');
    }

    if (!decision) {
      return buildDashboardError(
        'MISSING_DECISION',
        'Decision is required (approved, rejected, modified)',
      );
    }

    const validDecisions = ['approved', 'rejected', 'modified'];
    if (!validDecisions.includes(decision)) {
      return buildDashboardError(
        'INVALID_DECISION',
        `Decision must be one of: ${validDecisions.join(', ')}`,
      );
    }

    try {
      const response: LearningQueueResponse = {
        decision,
        reviewerNotes: notes,
        modifiedTitle,
        modifiedDescription,
        modifiedConfig,
      };

      const learning = await this.learningService.respondToQueueItem(
        id,
        context.userId,
        response,
      );

      if (learning) {
        return buildDashboardSuccess(
          {
            queueItemId: id,
            learningId: learning.id,
            decision,
            learningTitle: learning.title,
            learningStatus: learning.status,
          },
          {
            message: `Queue item ${decision}. Learning created: ${learning.title}`,
          },
        );
      } else {
        return buildDashboardSuccess(
          { queueItemId: id, decision },
          { message: `Queue item ${decision}` },
        );
      }
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

  /**
   * Approve a queue item (shortcut)
   */
  private async handleApprove(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const modifiedPayload: DashboardRequestPayload = {
      ...payload,
      params: {
        ...(params || {}),
        decision: 'approved',
      },
    };
    return this.handleRespond(modifiedPayload, context);
  }

  /**
   * Reject a queue item (shortcut)
   */
  private async handleReject(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const modifiedPayload: DashboardRequestPayload = {
      ...payload,
      params: {
        ...(params || {}),
        decision: 'rejected',
      },
    };
    return this.handleRespond(modifiedPayload, context);
  }

  /**
   * Modify a queue item (shortcut)
   */
  private async handleModify(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const modifiedPayload: DashboardRequestPayload = {
      ...payload,
      params: {
        ...(params || {}),
        decision: 'modified',
      },
    };
    return this.handleRespond(modifiedPayload, context);
  }

  /**
   * Get count of pending items
   */
  private async handleCount(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const includeTest = (params?.includeTest as boolean | undefined) ?? false;

    const count = await this.learningService.countPendingQueue({ includeTest });

    return buildDashboardSuccess({ pendingCount: count });
  }

  /**
   * Run historical replay test for a learning
   */
  private async handleReplay(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const learningId = params?.learningId as string | undefined;
    const windowDays = (params?.windowDays as number | undefined) ?? 30;
    const scopeId = params?.scopeId as string | undefined;

    if (!learningId) {
      return buildDashboardError(
        'MISSING_LEARNING_ID',
        'Learning ID is required',
      );
    }

    try {
      const result = await this.replayService.replayLearning(
        learningId,
        windowDays,
        scopeId,
      );

      return buildDashboardSuccess(result, {
        message: result.pass
          ? `Replay PASSED: +${(result.accuracyLift * 100).toFixed(1)}% accuracy lift`
          : `Replay FAILED: ${(result.accuracyLift * 100).toFixed(1)}% accuracy change`,
      });
    } catch (error) {
      this.logger.error(
        `Replay failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'REPLAY_FAILED',
        error instanceof Error ? error.message : 'Failed to run replay',
      );
    }
  }

  /**
   * Promote a test learning to production
   */
  private async handlePromote(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const learningId = params?.learningId as string | undefined;
    const notes = params?.notes as string | undefined;

    if (!learningId) {
      return buildDashboardError(
        'MISSING_LEARNING_ID',
        'Learning ID is required',
      );
    }

    try {
      // First validate
      const validation =
        await this.learningService.validateForPromotion(learningId);

      if (!validation.valid) {
        return buildDashboardError(
          'VALIDATION_FAILED',
          validation.errors.join(', '),
          { warnings: validation.warnings },
        );
      }

      // Promote
      const productionLearning = await this.learningService.promoteLearning(
        learningId,
        context.userId,
        notes,
      );

      return buildDashboardSuccess(
        {
          testLearningId: learningId,
          productionLearningId: productionLearning.id,
          title: productionLearning.title,
          status: productionLearning.status,
        },
        {
          message: `Learning promoted to production: ${productionLearning.title}`,
        },
      );
    } catch (error) {
      this.logger.error(
        `Promotion failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'PROMOTION_FAILED',
        error instanceof Error ? error.message : 'Failed to promote learning',
      );
    }
  }

  /**
   * Retire a learning from production
   */
  private async handleRetire(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const learningId = params?.learningId as string | undefined;
    const reason = params?.reason as string | undefined;

    if (!learningId) {
      return buildDashboardError(
        'MISSING_LEARNING_ID',
        'Learning ID is required',
      );
    }

    try {
      const learning = await this.learningService.retireLearning(
        learningId,
        context.userId,
        reason,
      );

      return buildDashboardSuccess(
        {
          learningId: learning.id,
          title: learning.title,
          status: learning.status,
        },
        { message: `Learning retired: ${learning.title}` },
      );
    } catch (error) {
      this.logger.error(
        `Retire failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'RETIRE_FAILED',
        error instanceof Error ? error.message : 'Failed to retire learning',
      );
    }
  }
}
