/**
 * Advanced Analytics Handler
 *
 * Dashboard handler for Phase 3 AI-powered features:
 * - Executive Summary (Feature 5)
 * - Scenario Analysis (Feature 9)
 * - PDF Report Export (Feature 8)
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
} from '../dashboard-handler.interface';
import { ExecutiveSummaryService } from '../../services/executive-summary.service';
import { ScenarioAnalysisService } from '../../services/scenario-analysis.service';
import { ReportGeneratorService } from '../../services/report-generator.service';
import type { ScenarioResult } from '../../services/scenario-analysis.service';

@Injectable()
export class AdvancedAnalyticsHandler implements IDashboardHandler {
  private readonly logger = new Logger(AdvancedAnalyticsHandler.name);
  private readonly supportedActions = [
    // Executive Summary
    'generate-summary',
    'get-latest-summary',
    'list-summaries',
    // Scenario Analysis
    'run-scenario',
    'save-scenario',
    'list-scenarios',
    'get-scenario',
    'delete-scenario',
    'get-scenario-templates',
    // PDF Reports
    'generate-report',
    'get-report',
    'list-reports',
    'delete-report',
    'refresh-download-url',
  ];

  constructor(
    private readonly executiveSummaryService: ExecutiveSummaryService,
    private readonly scenarioAnalysisService: ScenarioAnalysisService,
    private readonly reportGeneratorService: ReportGeneratorService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing advanced analytics action: ${action}`);

    switch (action.toLowerCase()) {
      // Executive Summary actions
      case 'generate-summary':
        return this.handleGenerateSummary(payload, context);
      case 'get-latest-summary':
        return this.handleGetLatestSummary(payload);
      case 'list-summaries':
        return this.handleListSummaries(payload);

      // Scenario Analysis actions
      case 'run-scenario':
        return this.handleRunScenario(payload);
      case 'save-scenario':
        return this.handleSaveScenario(payload);
      case 'list-scenarios':
        return this.handleListScenarios(payload);
      case 'get-scenario':
        return this.handleGetScenario(payload);
      case 'delete-scenario':
        return this.handleDeleteScenario(payload);
      case 'get-scenario-templates':
        return this.handleGetScenarioTemplates();

      // PDF Report actions
      case 'generate-report':
        return this.handleGenerateReport(payload);
      case 'get-report':
        return this.handleGetReport(payload);
      case 'list-reports':
        return this.handleListReports(payload);
      case 'delete-report':
        return this.handleDeleteReport(payload);
      case 'refresh-download-url':
        return this.handleRefreshDownloadUrl(payload);

      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported advanced analytics action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTIVE SUMMARY HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate an executive summary
   * Action: advanced-analytics.generate-summary
   * Params: { scopeId: string, summaryType?: 'daily' | 'weekly' | 'ad-hoc', forceRefresh?: boolean }
   */
  private async handleGenerateSummary(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const summaryType = params?.summaryType as
      | 'daily'
      | 'weekly'
      | 'ad-hoc'
      | undefined;
    const forceRefresh = params?.forceRefresh as boolean | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for generating summary',
      );
    }

    try {
      const result = await this.executiveSummaryService.generateSummary({
        scopeId,
        summaryType,
        forceRefresh,
        context,
      });

      return buildDashboardSuccess(
        {
          id: result.summary.id,
          scopeId: result.summary.scope_id,
          summaryType: result.summary.summary_type,
          content: result.summary.content,
          generatedAt: result.summary.generated_at,
          expiresAt: result.summary.expires_at,
        },
        { cached: result.cached },
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SUMMARY_GENERATION_FAILED',
        error instanceof Error ? error.message : 'Failed to generate summary',
      );
    }
  }

  /**
   * Get latest summary for a scope
   * Action: advanced-analytics.get-latest-summary
   * Params: { scopeId: string }
   */
  private async handleGetLatestSummary(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError('MISSING_SCOPE_ID', 'Scope ID is required');
    }

    try {
      const summary =
        await this.executiveSummaryService.getLatestSummary(scopeId);

      if (!summary) {
        return buildDashboardSuccess(null, { found: false });
      }

      return buildDashboardSuccess({
        id: summary.id,
        scopeId: summary.scope_id,
        summaryType: summary.summary_type,
        content: summary.content,
        generatedAt: summary.generated_at,
        expiresAt: summary.expires_at,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get latest summary: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'QUERY_FAILED',
        error instanceof Error ? error.message : 'Failed to get summary',
      );
    }
  }

  /**
   * List summaries for a scope
   * Action: advanced-analytics.list-summaries
   * Params: { scopeId: string, limit?: number, summaryType?: string }
   */
  private async handleListSummaries(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const limit = params?.limit as number | undefined;
    const summaryType = params?.summaryType as string | undefined;

    if (!scopeId) {
      return buildDashboardError('MISSING_SCOPE_ID', 'Scope ID is required');
    }

    try {
      const summaries = await this.executiveSummaryService.listSummaries(
        scopeId,
        { limit, summaryType },
      );

      return buildDashboardSuccess(
        summaries.map((s) => ({
          id: s.id,
          scopeId: s.scope_id,
          summaryType: s.summary_type,
          content: s.content,
          generatedAt: s.generated_at,
          expiresAt: s.expires_at,
        })),
        { count: summaries.length },
      );
    } catch (error) {
      this.logger.error(
        `Failed to list summaries: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'QUERY_FAILED',
        error instanceof Error ? error.message : 'Failed to list summaries',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO ANALYSIS HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run a scenario analysis
   * Action: advanced-analytics.run-scenario
   * Params: { scopeId: string, name: string, adjustments: Array<{dimensionSlug, adjustment}> }
   */
  private async handleRunScenario(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const name = params?.name as string | undefined;
    const adjustments = params?.adjustments as
      | Array<{
          dimensionSlug: string;
          adjustment: number;
        }>
      | undefined;

    if (!scopeId || !name || !adjustments || adjustments.length === 0) {
      return buildDashboardError(
        'INVALID_PARAMS',
        'scopeId, name, and at least one adjustment are required',
      );
    }

    try {
      const result = await this.scenarioAnalysisService.runScenario(
        scopeId,
        name,
        adjustments,
      );

      return buildDashboardSuccess(result);
    } catch (error) {
      this.logger.error(
        `Failed to run scenario: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SCENARIO_FAILED',
        error instanceof Error ? error.message : 'Failed to run scenario',
      );
    }
  }

  /**
   * Save a scenario
   * Action: advanced-analytics.save-scenario
   * Params: { scopeId, name, description?, adjustments, results?, isTemplate? }
   */
  private async handleSaveScenario(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const name = params?.name as string | undefined;
    const description = params?.description as string | undefined;
    const adjustments = params?.adjustments as
      | Array<{
          dimensionSlug: string;
          adjustment: number;
        }>
      | undefined;
    const results = params?.results as ScenarioResult | undefined;
    const isTemplate = params?.isTemplate as boolean | undefined;

    if (!scopeId || !name || !adjustments || adjustments.length === 0) {
      return buildDashboardError(
        'INVALID_PARAMS',
        'scopeId, name, and adjustments are required',
      );
    }

    try {
      const scenario = await this.scenarioAnalysisService.saveScenario({
        scopeId,
        name,
        description,
        adjustments,
        results,
        isTemplate,
      });

      return buildDashboardSuccess({
        id: scenario.id,
        scopeId: scenario.scope_id,
        name: scenario.name,
        description: scenario.description,
        adjustments: scenario.adjustments,
        isTemplate: scenario.is_template,
        createdAt: scenario.created_at,
      });
    } catch (error) {
      this.logger.error(
        `Failed to save scenario: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SAVE_FAILED',
        error instanceof Error ? error.message : 'Failed to save scenario',
      );
    }
  }

  /**
   * List scenarios for a scope
   * Action: advanced-analytics.list-scenarios
   * Params: { scopeId: string, includeTemplates?: boolean }
   */
  private async handleListScenarios(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const includeTemplates = params?.includeTemplates as boolean | undefined;

    if (!scopeId) {
      return buildDashboardError('MISSING_SCOPE_ID', 'Scope ID is required');
    }

    try {
      const scenarios = await this.scenarioAnalysisService.listScenarios(
        scopeId,
        { includeTemplates },
      );

      return buildDashboardSuccess(
        scenarios.map((s) => ({
          id: s.id,
          scopeId: s.scope_id,
          name: s.name,
          description: s.description,
          adjustments: s.adjustments,
          isTemplate: s.is_template,
          createdAt: s.created_at,
        })),
        { count: scenarios.length },
      );
    } catch (error) {
      this.logger.error(
        `Failed to list scenarios: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'QUERY_FAILED',
        error instanceof Error ? error.message : 'Failed to list scenarios',
      );
    }
  }

  /**
   * Get a specific scenario
   * Action: advanced-analytics.get-scenario
   * Params: { id: string }
   */
  private async handleGetScenario(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Scenario ID is required');
    }

    try {
      const scenario = await this.scenarioAnalysisService.getScenario(id);

      if (!scenario) {
        return buildDashboardError('NOT_FOUND', 'Scenario not found');
      }

      return buildDashboardSuccess({
        id: scenario.id,
        scopeId: scenario.scope_id,
        name: scenario.name,
        description: scenario.description,
        adjustments: scenario.adjustments,
        baselineSnapshot: scenario.baseline_snapshot,
        results: scenario.results,
        isTemplate: scenario.is_template,
        createdAt: scenario.created_at,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get scenario: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'QUERY_FAILED',
        error instanceof Error ? error.message : 'Failed to get scenario',
      );
    }
  }

  /**
   * Delete a scenario
   * Action: advanced-analytics.delete-scenario
   * Params: { id: string }
   */
  private async handleDeleteScenario(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Scenario ID is required');
    }

    try {
      await this.scenarioAnalysisService.deleteScenario(id);
      return buildDashboardSuccess({ success: true });
    } catch (error) {
      this.logger.error(
        `Failed to delete scenario: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error ? error.message : 'Failed to delete scenario',
      );
    }
  }

  /**
   * Get scenario templates
   * Action: advanced-analytics.get-scenario-templates
   */
  private async handleGetScenarioTemplates(): Promise<DashboardActionResult> {
    try {
      const templates = await this.scenarioAnalysisService.getTemplates();

      return buildDashboardSuccess(
        templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          adjustments: t.adjustments,
        })),
        { count: templates.length },
      );
    } catch (error) {
      this.logger.error(
        `Failed to get templates: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'QUERY_FAILED',
        error instanceof Error ? error.message : 'Failed to get templates',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PDF REPORT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a PDF report
   * Action: advanced-analytics.generate-report
   * Params: { scopeId, title, reportType?, config }
   */
  private async handleGenerateReport(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const title = params?.title as string | undefined;
    const reportType = params?.reportType as
      | 'comprehensive'
      | 'executive'
      | 'detailed'
      | undefined;
    const config = params?.config as Record<string, unknown> | undefined;

    if (!scopeId || !title) {
      return buildDashboardError(
        'INVALID_PARAMS',
        'scopeId and title are required',
      );
    }

    try {
      const report = await this.reportGeneratorService.generateReport({
        scopeId,
        title,
        reportType,
        config: config || {},
      });

      return buildDashboardSuccess({
        id: report.id,
        scopeId: report.scope_id,
        title: report.title,
        reportType: report.report_type,
        status: report.status,
        createdAt: report.created_at,
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate report: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'REPORT_GENERATION_FAILED',
        error instanceof Error ? error.message : 'Failed to generate report',
      );
    }
  }

  /**
   * Get a report by ID
   * Action: advanced-analytics.get-report
   * Params: { id: string }
   */
  private async handleGetReport(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Report ID is required');
    }

    try {
      const report = await this.reportGeneratorService.getReport(id);

      if (!report) {
        return buildDashboardError('NOT_FOUND', 'Report not found');
      }

      return buildDashboardSuccess({
        id: report.id,
        scopeId: report.scope_id,
        title: report.title,
        reportType: report.report_type,
        config: report.config,
        status: report.status,
        filePath: report.file_path,
        fileSize: report.file_size,
        downloadUrl: report.download_url,
        downloadExpiresAt: report.download_expires_at,
        errorMessage: report.error_message,
        generatedAt: report.generated_at,
        createdAt: report.created_at,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get report: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'QUERY_FAILED',
        error instanceof Error ? error.message : 'Failed to get report',
      );
    }
  }

  /**
   * List reports for a scope
   * Action: advanced-analytics.list-reports
   * Params: { scopeId: string, limit?: number, status?: string }
   */
  private async handleListReports(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const limit = params?.limit as number | undefined;
    const status = params?.status as string | undefined;

    if (!scopeId) {
      return buildDashboardError('MISSING_SCOPE_ID', 'Scope ID is required');
    }

    try {
      const reports = await this.reportGeneratorService.listReports(scopeId, {
        limit,
        status,
      });

      return buildDashboardSuccess(
        reports.map((r) => ({
          id: r.id,
          scopeId: r.scope_id,
          title: r.title,
          reportType: r.report_type,
          status: r.status,
          downloadUrl: r.download_url,
          downloadExpiresAt: r.download_expires_at,
          generatedAt: r.generated_at,
          createdAt: r.created_at,
        })),
        { count: reports.length },
      );
    } catch (error) {
      this.logger.error(
        `Failed to list reports: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'QUERY_FAILED',
        error instanceof Error ? error.message : 'Failed to list reports',
      );
    }
  }

  /**
   * Delete a report
   * Action: advanced-analytics.delete-report
   * Params: { id: string }
   */
  private async handleDeleteReport(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Report ID is required');
    }

    try {
      await this.reportGeneratorService.deleteReport(id);
      return buildDashboardSuccess({ success: true });
    } catch (error) {
      this.logger.error(
        `Failed to delete report: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error ? error.message : 'Failed to delete report',
      );
    }
  }

  /**
   * Refresh download URL for a report
   * Action: advanced-analytics.refresh-download-url
   * Params: { id: string }
   */
  private async handleRefreshDownloadUrl(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Report ID is required');
    }

    try {
      const downloadUrl =
        await this.reportGeneratorService.refreshDownloadUrl(id);

      if (!downloadUrl) {
        return buildDashboardError(
          'REFRESH_FAILED',
          'Could not refresh download URL - report may not be complete',
        );
      }

      return buildDashboardSuccess({
        downloadUrl,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to refresh download URL: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'REFRESH_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to refresh download URL',
      );
    }
  }
}
