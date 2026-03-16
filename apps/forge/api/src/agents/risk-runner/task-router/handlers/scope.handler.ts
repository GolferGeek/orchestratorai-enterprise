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
import { ScopeRepository } from '../../repositories/scope.repository';
import { RiskAnalysisService } from '../../services/risk-analysis.service';

@Injectable()
export class ScopeHandler implements IDashboardHandler {
  private readonly logger = new Logger(ScopeHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'update',
    'delete',
    'analyze',
  ];

  constructor(
    private readonly scopeRepo: ScopeRepository,
    private readonly riskAnalysisService: RiskAnalysisService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing scope action: ${action}`);

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(payload, context);
      case 'get':
        return this.handleGet(payload);
      case 'create':
        return this.handleCreate(payload, context);
      case 'update':
        return this.handleUpdate(payload);
      case 'delete':
        return this.handleDelete(payload);
      case 'analyze':
        return this.handleAnalyze(payload, context);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported scope action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  private async handleList(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const organizationSlug = context.orgSlug;

    if (!organizationSlug) {
      return buildDashboardError(
        'MISSING_ORG',
        'Organization slug is required',
      );
    }

    const scopes = await this.scopeRepo.findAll(organizationSlug);

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedScopes = scopes.slice(start, start + pageSize);

    return buildDashboardSuccess(
      paginatedScopes,
      buildPaginationMetadata(scopes.length, page, pageSize),
    );
  }

  private async handleGet(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Scope ID is required');
    }

    const scope = await this.scopeRepo.findById(id);

    if (!scope) {
      return buildDashboardError('NOT_FOUND', `Scope not found: ${id}`);
    }

    return buildDashboardSuccess(scope);
  }

  private async handleCreate(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const data = (payload.params as Record<string, unknown>) ?? {};

    if (!data.name) {
      return buildDashboardError('MISSING_NAME', 'Scope name is required');
    }

    if (!data.domain) {
      return buildDashboardError('MISSING_DOMAIN', 'Scope domain is required');
    }

    const scope = await this.scopeRepo.create({
      organization_slug: context.orgSlug,
      agent_slug: context.agentSlug,
      name: data.name as string,
      description: data.description as string | undefined,
      domain: data.domain as 'investment' | 'business' | 'project' | 'personal',
      llm_config: data.llm_config as Record<string, unknown> | undefined,
      thresholds: data.thresholds as Record<string, unknown> | undefined,
      analysis_config: data.analysis_config as
        | Record<string, unknown>
        | undefined,
    });

    return buildDashboardSuccess(scope);
  }

  private async handleUpdate(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Scope ID is required');
    }

    const data = { ...params };
    delete data.id;

    const scope = await this.scopeRepo.update(id, data);

    return buildDashboardSuccess(scope);
  }

  private async handleDelete(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Scope ID is required');
    }

    await this.scopeRepo.delete(id);

    return buildDashboardSuccess({ deleted: true, id });
  }

  /**
   * Analyze all subjects in a scope - batch risk analysis
   */
  private async handleAnalyze(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Scope ID is required');
    }

    // Get the scope
    const scope = await this.scopeRepo.findById(id);
    if (!scope) {
      return buildDashboardError('NOT_FOUND', `Scope not found: ${id}`);
    }

    try {
      const results = await this.riskAnalysisService.analyzeScope(
        scope,
        context,
      );

      const successCount = results.length;
      const avgScore =
        successCount > 0
          ? Math.round(
              results.reduce(
                (sum, r) => sum + r.compositeScore.overall_score,
                0,
              ) / successCount,
            )
          : 0;

      return buildDashboardSuccess(
        {
          scopeId: scope.id,
          scopeName: scope.name,
          analyzedCount: successCount,
          averageScore: avgScore,
          results: results.map((r) => ({
            subjectId: r.subject.id,
            identifier: r.subject.identifier,
            overallScore: r.compositeScore.overall_score,
            debateTriggered: r.debateTriggered,
          })),
        },
        {
          message: `Batch analysis complete for ${scope.name}: ${successCount} subjects analyzed, avg score=${avgScore}`,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to analyze scope ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ANALYSIS_FAILED',
        error instanceof Error ? error.message : 'Batch analysis failed',
      );
    }
  }
}
