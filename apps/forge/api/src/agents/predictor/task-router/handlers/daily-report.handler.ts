import { Injectable, Logger } from '@nestjs/common';
import { DashboardRequestPayload } from '../../../shared/types/forge-types';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardError,
  buildDashboardSuccess,
} from '../dashboard-handler.interface';
import { DailyPostmortemService } from '../../services/daily-postmortem.service';

interface DailyReportParams {
  runId?: string;
  artifactType?: 'html' | 'markdown' | 'json';
  limit?: number;
  runDate?: string;
  overnightMoveThresholdPct?: number;
  recommendationId?: string;
  decision?: 'approve' | 'reject' | 'apply' | 'escalate' | 'replay';
  actionSource?: 'dashboard' | 'openclaw-web' | 'openclaw-phone';
  note?: string;
  escalateTo?:
    | 'instrument_context'
    | 'domain_context'
    | 'prediction_global_context';
}

@Injectable()
export class DailyReportHandler implements IDashboardHandler {
  private readonly logger = new Logger(DailyReportHandler.name);
  private readonly supportedActions = [
    'run',
    'list',
    'get',
    'getHtml',
    'getMarkdown',
    'getJson',
    'decide',
  ];

  constructor(
    private readonly dailyPostmortemService: DailyPostmortemService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = (payload.params ?? {}) as DailyReportParams;
    this.logger.debug(
      `[DAILY-REPORT-HANDLER] ${action} org=${context.orgSlug} agent=${context.agentSlug}`,
    );

    switch (action.toLowerCase()) {
      case 'run':
        return this.handleRun(params, context);
      case 'list':
        return this.handleList(params, context);
      case 'get':
        return this.handleGet(params);
      case 'gethtml':
        return this.handleGetArtifact(params, 'html');
      case 'getmarkdown':
        return this.handleGetArtifact(params, 'markdown');
      case 'getjson':
        return this.handleGetArtifact(params, 'json');
      case 'decide':
        return this.handleDecide(params, context);
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

  private async handleRun(
    params: DailyReportParams,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    try {
      const result = await this.dailyPostmortemService.runDailyReport(context, {
        runDate: params.runDate,
        overnightMoveThresholdPct: params.overnightMoveThresholdPct,
      });
      return buildDashboardSuccess(result);
    } catch (error) {
      this.logger.debug(
        `[DAILY-REPORT-HANDLER] run failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'RUN_FAILED',
        error instanceof Error ? error.message : 'Failed to run daily report',
      );
    }
  }

  private async handleList(
    params: DailyReportParams,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    try {
      const runs = await this.dailyPostmortemService.listRuns(
        context.orgSlug,
        context.agentSlug,
        params.limit ?? 20,
      );
      return buildDashboardSuccess(runs, { totalCount: runs.length });
    } catch (error) {
      this.logger.debug(
        `[DAILY-REPORT-HANDLER] list failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list daily reports',
      );
    }
  }

  private async handleGet(
    params: DailyReportParams,
  ): Promise<DashboardActionResult> {
    if (!params.runId) {
      return buildDashboardError('MISSING_RUN_ID', 'runId is required');
    }
    try {
      const run = await this.dailyPostmortemService.getRun(params.runId);
      if (!run) {
        return buildDashboardError(
          'NOT_FOUND',
          `Daily report run not found: ${params.runId}`,
        );
      }
      return buildDashboardSuccess(run);
    } catch (error) {
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get daily report',
      );
    }
  }

  private async handleGetArtifact(
    params: DailyReportParams,
    artifactType: 'html' | 'markdown' | 'json',
  ): Promise<DashboardActionResult> {
    if (!params.runId) {
      return buildDashboardError('MISSING_RUN_ID', 'runId is required');
    }
    try {
      const artifact = await this.dailyPostmortemService.getArtifact(
        params.runId,
        artifactType,
      );
      if (!artifact) {
        return buildDashboardError(
          'NOT_FOUND',
          `Daily report run not found: ${params.runId}`,
        );
      }
      return buildDashboardSuccess(artifact);
    } catch (error) {
      return buildDashboardError(
        'GET_ARTIFACT_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get daily report artifact',
      );
    }
  }

  private async handleDecide(
    params: DailyReportParams,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!params.recommendationId || !params.decision) {
      return buildDashboardError(
        'MISSING_DECISION_PARAMS',
        'recommendationId and decision are required',
      );
    }
    try {
      const recommendation =
        await this.dailyPostmortemService.decideRecommendation(context, {
          recommendationId: params.recommendationId,
          decision: params.decision,
          actionSource: params.actionSource ?? 'dashboard',
          note: params.note,
          escalateTo: params.escalateTo,
        });
      return buildDashboardSuccess(recommendation);
    } catch (error) {
      return buildDashboardError(
        'DECIDE_FAILED',
        error instanceof Error ? error.message : 'Failed to process decision',
      );
    }
  }
}
