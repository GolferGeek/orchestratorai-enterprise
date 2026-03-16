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
import { AssessmentRepository } from '../../repositories/assessment.repository';

@Injectable()
export class AssessmentHandler implements IDashboardHandler {
  private readonly logger = new Logger(AssessmentHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'getBySubject',
    'by-subject',
    'getByTask',
    'by-task',
  ];

  constructor(private readonly assessmentRepo: AssessmentRepository) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing assessment action: ${action}`);

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(payload);
      case 'get':
        return this.handleGet(payload);
      case 'getbysubject':
      case 'by-subject':
      case 'get-by-subject':
        return this.handleGetBySubject(payload);
      case 'getbytask':
      case 'by-task':
      case 'get-by-task':
        return this.handleGetByTask(payload);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported assessment action: ${action}`,
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
    const subjectId = params?.subjectId as string | undefined;
    const taskId = params?.taskId as string | undefined;

    // Must provide either subjectId or taskId
    if (!subjectId && !taskId) {
      return buildDashboardError(
        'MISSING_FILTER',
        'Either subjectId or taskId is required. Use assessments.by-subject or assessments.by-task for specific queries.',
        { supportedFilters: ['subjectId', 'taskId'] },
      );
    }

    let assessments: Awaited<
      ReturnType<typeof this.assessmentRepo.findBySubject>
    >;
    if (subjectId) {
      assessments = await this.assessmentRepo.findBySubject(subjectId);
    } else if (taskId) {
      assessments = await this.assessmentRepo.findByTask(taskId);
    } else {
      assessments = [];
    }

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedAssessments = assessments.slice(start, start + pageSize);

    return buildDashboardSuccess(
      paginatedAssessments,
      buildPaginationMetadata(assessments.length, page, pageSize),
    );
  }

  private async handleGet(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Assessment ID is required');
    }

    const assessment = await this.assessmentRepo.findById(id);

    if (!assessment) {
      return buildDashboardError('NOT_FOUND', `Assessment not found: ${id}`);
    }

    return buildDashboardSuccess(assessment);
  }

  private async handleGetBySubject(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const subjectId = params?.subjectId as string | undefined;
    const limit = (params?.limit as number | undefined) ?? 10;

    if (!subjectId) {
      return buildDashboardError(
        'MISSING_SUBJECT_ID',
        'Subject ID is required',
      );
    }

    const assessments = await this.assessmentRepo.findRecentBySubject(
      subjectId,
      limit,
    );

    return buildDashboardSuccess(assessments, {
      totalCount: assessments.length,
    });
  }

  private async handleGetByTask(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const taskId = params?.taskId as string | undefined;

    if (!taskId) {
      return buildDashboardError('MISSING_TASK_ID', 'Task ID is required');
    }

    const assessments = await this.assessmentRepo.findByTask(taskId);

    return buildDashboardSuccess(assessments, {
      totalCount: assessments.length,
    });
  }
}
