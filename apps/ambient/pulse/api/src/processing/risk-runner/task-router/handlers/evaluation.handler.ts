/**
 * Evaluation Handler
 *
 * Dashboard handler for risk evaluation operations.
 * Supports viewing evaluations, calculating accuracy metrics,
 * and triggering manual evaluations.
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
import { RiskEvaluationService } from '../../services/risk-evaluation.service';
import { EvaluationRepository } from '../../repositories/evaluation.repository';

@Injectable()
export class EvaluationHandler implements IDashboardHandler {
  private readonly logger = new Logger(EvaluationHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'getBySubject',
    'getByScore',
    'metrics',
    'accuracy',
    'byWindow',
  ];

  constructor(
    private readonly evaluationService: RiskEvaluationService,
    private readonly evaluationRepo: EvaluationRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing evaluation action: ${action}`);

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(payload);
      case 'get':
        return this.handleGet(payload);
      case 'getbysubject':
        return this.handleGetBySubject(payload);
      case 'getbyscore':
        return this.handleGetByScore(payload);
      case 'metrics':
      case 'accuracy':
        return this.handleMetrics(payload);
      case 'bywindow':
        return this.handleByWindow(payload);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported evaluation action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  /**
   * List evaluations (optionally by window)
   */
  private async handleList(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const window = params?.window as '7d' | '30d' | '90d' | undefined;
    const includeTest = (params?.includeTest as boolean | undefined) ?? false;

    let evaluations;
    if (window) {
      evaluations = await this.evaluationRepo.findAllByWindow(window, {
        includeTest,
      });
    } else {
      // Get from all windows
      const windows: Array<'7d' | '30d' | '90d'> = ['7d', '30d', '90d'];
      evaluations = [];
      for (const w of windows) {
        const windowEvals = await this.evaluationRepo.findAllByWindow(w, {
          includeTest,
        });
        evaluations.push(...windowEvals);
      }
      // Sort by created_at desc
      evaluations.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedEvals = evaluations.slice(start, start + pageSize);

    return buildDashboardSuccess(
      paginatedEvals,
      buildPaginationMetadata(evaluations.length, page, pageSize),
    );
  }

  /**
   * Get a specific evaluation by ID
   */
  private async handleGet(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Evaluation ID is required');
    }

    const evaluation = await this.evaluationService.getEvaluationById(id);

    if (!evaluation) {
      return buildDashboardError('NOT_FOUND', `Evaluation not found: ${id}`);
    }

    return buildDashboardSuccess(evaluation);
  }

  /**
   * Get evaluations for a subject
   */
  private async handleGetBySubject(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const subjectId = params?.subjectId as string | undefined;
    const limit = (params?.limit as number | undefined) ?? 20;

    if (!subjectId) {
      return buildDashboardError(
        'MISSING_SUBJECT_ID',
        'Subject ID is required',
      );
    }

    const evaluations =
      await this.evaluationService.getEvaluationsForSubject(subjectId);
    const limitedEvals = evaluations.slice(0, limit);

    // Group by window for summary
    const byWindow: Record<string, number> = {};
    for (const eval_ of evaluations) {
      byWindow[eval_.evaluation_window] =
        (byWindow[eval_.evaluation_window] || 0) + 1;
    }

    return buildDashboardSuccess(limitedEvals, {
      totalCount: evaluations.length,
      message: `Found ${evaluations.length} evaluations across windows: ${JSON.stringify(byWindow)}`,
    });
  }

  /**
   * Get evaluations for a composite score
   */
  private async handleGetByScore(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const compositeScoreId = params?.compositeScoreId as string | undefined;

    if (!compositeScoreId) {
      return buildDashboardError(
        'MISSING_SCORE_ID',
        'Composite score ID is required',
      );
    }

    const evaluations =
      await this.evaluationRepo.findByCompositeScore(compositeScoreId);

    return buildDashboardSuccess(evaluations, {
      totalCount: evaluations.length,
    });
  }

  /**
   * Get accuracy metrics (aggregate statistics)
   */
  private async handleMetrics(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    try {
      const metrics =
        await this.evaluationService.calculateAccuracyMetrics(scopeId);

      // Format metrics for display
      const formattedMetrics = {
        overallAccuracy: `${(metrics.overallAccuracy * 100).toFixed(1)}%`,
        calibrationScore: `${(metrics.calibrationScore * 100).toFixed(1)}%`,
        brierScore: metrics.brierScore.toFixed(3),
        byWindow: Object.fromEntries(
          Object.entries(metrics.byWindow).map(([w, data]) => [
            w,
            {
              count: data.count,
              accuracy: `${(data.accuracy * 100).toFixed(1)}%`,
            },
          ]),
        ),
        byDimension: Object.fromEntries(
          Object.entries(metrics.byDimension).map(([d, data]) => [
            d,
            {
              count: data.count,
              helpfulRate: `${(data.accuracy * 100).toFixed(1)}%`,
            },
          ]),
        ),
        raw: metrics, // Include raw numbers for frontend calculations
      };

      return buildDashboardSuccess(formattedMetrics, {
        message: `Overall accuracy: ${formattedMetrics.overallAccuracy}, Calibration: ${formattedMetrics.calibrationScore}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to calculate metrics: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'METRICS_FAILED',
        error instanceof Error ? error.message : 'Failed to calculate metrics',
      );
    }
  }

  /**
   * Get evaluations grouped by window
   */
  private async handleByWindow(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const window = params?.window as '7d' | '30d' | '90d' | undefined;

    if (!window) {
      return buildDashboardError(
        'MISSING_WINDOW',
        'Window is required (7d, 30d, or 90d)',
      );
    }

    const validWindows = ['7d', '30d', '90d'];
    if (!validWindows.includes(window)) {
      return buildDashboardError(
        'INVALID_WINDOW',
        `Window must be one of: ${validWindows.join(', ')}`,
      );
    }

    const evaluations = await this.evaluationRepo.findAllByWindow(window);
    const avgAccuracy =
      await this.evaluationRepo.calculateAverageAccuracy(window);

    // Calculate additional stats
    const accuracies = evaluations
      .filter((e) => e.score_accuracy !== null)
      .map((e) => e.score_accuracy!);

    const calibrationErrors = evaluations
      .filter((e) => e.calibration_error !== null)
      .map((e) => e.calibration_error!);

    const avgCalibrationError =
      calibrationErrors.length > 0
        ? calibrationErrors.reduce((a, b) => a + b, 0) /
          calibrationErrors.length
        : 0;

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedEvals = evaluations.slice(start, start + pageSize);

    return buildDashboardSuccess(
      {
        window,
        evaluations: paginatedEvals,
        stats: {
          count: evaluations.length,
          avgAccuracy:
            avgAccuracy !== null ? `${(avgAccuracy * 100).toFixed(1)}%` : 'N/A',
          avgCalibrationError: avgCalibrationError.toFixed(1),
          accuracyRange:
            accuracies.length > 0
              ? {
                  min: `${(Math.min(...accuracies) * 100).toFixed(1)}%`,
                  max: `${(Math.max(...accuracies) * 100).toFixed(1)}%`,
                }
              : null,
        },
      },
      buildPaginationMetadata(evaluations.length, page, pageSize),
    );
  }
}
