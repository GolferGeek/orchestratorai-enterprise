/**
 * Correlation Handler
 *
 * Phase 5: Dashboard handler for cross-subject correlation analysis
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
import { CorrelationAnalysisService } from '../../services/correlation-analysis.service';

@Injectable()
export class CorrelationHandler implements IDashboardHandler {
  private readonly logger = new Logger(CorrelationHandler.name);
  private readonly supportedActions = ['matrix', 'pair', 'concentration'];

  constructor(
    private readonly correlationService: CorrelationAnalysisService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing correlation action: ${action}`);

    switch (action.toLowerCase()) {
      case 'matrix':
        return this.handleMatrix(payload);
      case 'pair':
        return this.handlePair(payload);
      case 'concentration':
        return this.handleConcentration(payload);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported correlation action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  /**
   * Get correlation matrix for a scope
   * Action: correlations.matrix
   * Params: { scopeId: string, includeInactive?: boolean }
   */
  private async handleMatrix(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for correlation matrix',
      );
    }

    try {
      const matrix = await this.correlationService.generateCorrelationMatrix(
        scopeId,
        {
          includeInactiveSubjects: params?.includeInactive as
            | boolean
            | undefined,
        },
      );

      return buildDashboardSuccess(matrix, {
        subjectCount: matrix.subjects.length,
        pairCount: matrix.matrix.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate correlation matrix: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'MATRIX_GENERATION_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to generate correlation matrix',
      );
    }
  }

  /**
   * Get correlation between two specific subjects
   * Action: correlations.pair
   * Params: { subjectAId: string, subjectBId: string }
   */
  private async handlePair(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const subjectAId = params?.subjectAId as string | undefined;
    const subjectBId = params?.subjectBId as string | undefined;

    if (!subjectAId || !subjectBId) {
      return buildDashboardError(
        'MISSING_SUBJECT_IDS',
        'Both subjectAId and subjectBId are required',
      );
    }

    try {
      const correlation =
        await this.correlationService.calculateSubjectCorrelation(
          subjectAId,
          subjectBId,
        );

      if (!correlation) {
        return buildDashboardSuccess(null, {
          message: 'Insufficient shared dimensions to calculate correlation',
        });
      }

      return buildDashboardSuccess(correlation);
    } catch (error) {
      this.logger.error(
        `Failed to calculate pair correlation: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CORRELATION_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to calculate correlation',
      );
    }
  }

  /**
   * Get concentration risk analysis for a scope
   * Action: correlations.concentration
   * Params: { scopeId: string }
   */
  private async handleConcentration(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for concentration analysis',
      );
    }

    try {
      const concentration =
        await this.correlationService.analyzeConcentrationRisk(scopeId);

      return buildDashboardSuccess(concentration, {
        riskLevel: concentration.risk_level,
      });
    } catch (error) {
      this.logger.error(
        `Failed to analyze concentration risk: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CONCENTRATION_ANALYSIS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to analyze concentration risk',
      );
    }
  }
}
