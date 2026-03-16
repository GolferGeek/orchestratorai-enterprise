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
import { SubjectRepository } from '../../repositories/subject.repository';
import { ScopeRepository } from '../../repositories/scope.repository';
import { RiskAnalysisService } from '../../services/risk-analysis.service';

@Injectable()
export class SubjectHandler implements IDashboardHandler {
  private readonly logger = new Logger(SubjectHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'update',
    'delete',
    'analyze',
  ];

  constructor(
    private readonly subjectRepo: SubjectRepository,
    private readonly scopeRepo: ScopeRepository,
    private readonly riskAnalysisService: RiskAnalysisService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing subject action: ${action}`);

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(payload);
      case 'get':
        return this.handleGet(payload);
      case 'create':
        return this.handleCreate(payload);
      case 'update':
        return this.handleUpdate(payload);
      case 'delete':
        return this.handleDelete(payload);
      case 'analyze':
        return this.handleAnalyze(payload, context);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported subject action: ${action}`,
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
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError('MISSING_SCOPE_ID', 'Scope ID is required');
    }

    const subjects = await this.subjectRepo.findByScope(scopeId);

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedSubjects = subjects.slice(start, start + pageSize);

    return buildDashboardSuccess(
      paginatedSubjects,
      buildPaginationMetadata(subjects.length, page, pageSize),
    );
  }

  private async handleGet(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Subject ID is required');
    }

    const subject = await this.subjectRepo.findById(id);

    if (!subject) {
      return buildDashboardError('NOT_FOUND', `Subject not found: ${id}`);
    }

    return buildDashboardSuccess(subject);
  }

  private async handleCreate(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = (payload.params as Record<string, unknown>) ?? {};

    if (!data.scope_id && !data.scopeId) {
      return buildDashboardError('MISSING_SCOPE_ID', 'Scope ID is required');
    }

    if (!data.identifier) {
      return buildDashboardError(
        'MISSING_IDENTIFIER',
        'Subject identifier is required',
      );
    }

    if (!data.subject_type && !data.subjectType) {
      return buildDashboardError('MISSING_TYPE', 'Subject type is required');
    }

    const subject = await this.subjectRepo.create({
      scope_id: (data.scope_id || data.scopeId) as string,
      identifier: data.identifier as string,
      name: data.name as string | undefined,
      subject_type: (data.subject_type || data.subjectType) as
        | 'stock'
        | 'crypto'
        | 'decision'
        | 'project',
      metadata: data.metadata as Record<string, unknown> | undefined,
    });

    return buildDashboardSuccess(subject);
  }

  private async handleUpdate(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Subject ID is required');
    }

    const data = { ...params };
    delete data.id;

    const subject = await this.subjectRepo.update(id, data);

    return buildDashboardSuccess(subject);
  }

  private async handleDelete(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Subject ID is required');
    }

    await this.subjectRepo.delete(id);

    return buildDashboardSuccess({ deleted: true, id });
  }

  /**
   * Analyze a subject - runs full risk analysis synchronously
   * Progress events are emitted via SSE during analysis
   * Returns final results when complete
   */
  private async handleAnalyze(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Subject ID is required');
    }

    // Get the subject
    const subject = await this.subjectRepo.findById(id);
    if (!subject) {
      return buildDashboardError('NOT_FOUND', `Subject not found: ${id}`);
    }

    // Get the scope for this subject
    const scope = await this.scopeRepo.findById(subject.scope_id);
    if (!scope) {
      return buildDashboardError(
        'NOT_FOUND',
        `Scope not found for subject: ${id}`,
      );
    }

    const taskId = context.taskId;
    this.logger.log(
      `Starting synchronous analysis for ${subject.identifier} (task: ${taskId})`,
    );

    try {
      // Run analysis synchronously - SSE progress events are emitted during analysis
      const result = await this.riskAnalysisService.analyzeSubject(
        subject,
        scope,
        context,
      );

      // Check if analysis was skipped due to no data
      if (result.noDataAvailable) {
        this.logger.log(
          `No data available for ${subject.identifier}: ${result.noDataReason}`,
        );

        return buildDashboardSuccess(
          {
            subjectId: subject.id,
            identifier: subject.identifier,
            status: 'no_data',
            taskId,
            noDataAvailable: true,
            noDataReason: result.noDataReason,
          },
          {
            message: `No recent analysis data available for ${subject.identifier}`,
          },
        );
      }

      this.logger.log(
        `Analysis complete for ${subject.identifier}: score=${result.compositeScore.overall_score}`,
      );

      // Return the actual analysis results
      return buildDashboardSuccess(
        {
          subjectId: subject.id,
          identifier: subject.identifier,
          status: 'complete',
          taskId,
          overallScore: result.compositeScore.overall_score,
          confidence: result.compositeScore.confidence,
          assessmentCount: result.assessmentCount,
          debateTriggered: result.debateTriggered,
          compositeScoreId: result.compositeScore.id,
        },
        {
          message: `Analysis complete for ${subject.identifier}: ${result.compositeScore.overall_score}% risk score`,
        },
      );
    } catch (error) {
      this.logger.error(
        `Analysis failed for ${subject.identifier}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ANALYSIS_FAILED',
        error instanceof Error ? error.message : 'Analysis failed',
        { subjectId: subject.id, identifier: subject.identifier },
      );
    }
  }
}
