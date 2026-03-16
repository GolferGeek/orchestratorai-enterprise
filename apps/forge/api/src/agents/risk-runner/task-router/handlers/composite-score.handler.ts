/* eslint-disable @typescript-eslint/restrict-template-expressions */
// Disabled unsafe rules due to Supabase RPC calls returning generic 'any' types
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
import { CompositeScoreRepository } from '../../repositories/composite-score.repository';

@Injectable()
export class CompositeScoreHandler implements IDashboardHandler {
  private readonly logger = new Logger(CompositeScoreHandler.name);
  private readonly supportedActions = [
    'list',
    'list-active',
    'get',
    'getBySubject',
    'history',
  ];

  constructor(private readonly compositeScoreRepo: CompositeScoreRepository) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing composite-score action: ${action}`);

    switch (action.toLowerCase()) {
      case 'list':
      case 'list-active':
        return this.handleList(payload);
      case 'get':
        return this.handleGet(payload);
      case 'getbysubject':
        return this.handleGetBySubject(payload);
      case 'history':
        return this.handleHistory(payload);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported composite-score action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  private async handleList(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const filters = payload.filters;
    // Check both params and filters for scopeId (frontend sends via filters)
    const scopeId =
      (params?.scopeId as string) || (filters?.scopeId as string) || undefined;

    this.logger.debug(
      `[handleList] scopeId from params: ${params?.scopeId}, from filters: ${filters?.scopeId}, final: ${scopeId}`,
    );

    // Get all active composite scores
    let scores = await this.compositeScoreRepo.findAllActiveView();

    this.logger.debug(`[handleList] Total scores from view: ${scores.length}`);
    if (scores.length > 0 && scores[0]) {
      const first = scores[0];
      this.logger.debug(
        `[handleList] First score: id=${first.id}, overall_score=${first.overall_score}, scope_id=${first.scope_id}`,
      );
    }

    // Filter by scopeId if provided
    if (scopeId) {
      scores = scores.filter((s) => s.scope_id === scopeId);
      this.logger.debug(
        `[handleList] After filter by scopeId ${scopeId}: ${scores.length} scores`,
      );
    }

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedScores = scores.slice(start, start + pageSize);

    return buildDashboardSuccess(
      paginatedScores,
      buildPaginationMetadata(scores.length, page, pageSize),
    );
  }

  private async handleGet(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError(
        'MISSING_ID',
        'Composite score ID is required',
      );
    }

    const score = await this.compositeScoreRepo.findById(id);

    if (!score) {
      return buildDashboardError(
        'NOT_FOUND',
        `Composite score not found: ${id}`,
      );
    }

    return buildDashboardSuccess(score);
  }

  private async handleGetBySubject(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const subjectId = params?.subjectId as string | undefined;

    if (!subjectId) {
      return buildDashboardError(
        'MISSING_SUBJECT_ID',
        'Subject ID is required',
      );
    }

    const score = await this.compositeScoreRepo.findActiveBySubject(subjectId);

    if (!score) {
      return buildDashboardSuccess(null);
    }

    return buildDashboardSuccess(score);
  }

  private async handleHistory(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const subjectId = params?.subjectId as string | undefined;
    const limit = (params?.limit as number | undefined) ?? 30;

    if (!subjectId) {
      return buildDashboardError(
        'MISSING_SUBJECT_ID',
        'Subject ID is required',
      );
    }

    const scores = await this.compositeScoreRepo.findHistory(subjectId, limit);

    return buildDashboardSuccess(scores, {
      totalCount: scores.length,
    });
  }
}
