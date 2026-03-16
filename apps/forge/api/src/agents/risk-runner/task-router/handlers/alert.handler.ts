/**
 * Alert Handler for Risk Dashboard
 *
 * Handles dashboard actions for alert management:
 * - list: Get all alerts (optionally filtered by scope or subject)
 * - get: Get a specific alert by ID
 * - getBySubject: Get alerts for a specific subject
 * - getUnacknowledged: Get all unacknowledged alerts
 * - acknowledge: Mark an alert as acknowledged
 * - countBySeverity: Get counts of unacknowledged alerts by severity
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
import { RiskAlertService } from '../../services/risk-alert.service';
import {
  AlertRepository,
  AlertFilter,
} from '../../repositories/alert.repository';
import { AssessmentRepository } from '../../repositories/assessment.repository';
import { DimensionRepository } from '../../repositories/dimension.repository';

@Injectable()
export class AlertHandler implements IDashboardHandler {
  private readonly logger = new Logger(AlertHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'getBySubject',
    'getUnacknowledged',
    'acknowledge',
    'countBySeverity',
    'getWithContext',
  ];

  constructor(
    private readonly alertService: RiskAlertService,
    private readonly alertRepo: AlertRepository,
    private readonly assessmentRepo: AssessmentRepository,
    private readonly dimensionRepo: DimensionRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing alert action: ${action}`);

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(payload);
      case 'get':
        return this.handleGet(payload);
      case 'getbysubject':
        return this.handleGetBySubject(payload);
      case 'getunacknowledged':
        return this.handleGetUnacknowledged(payload);
      case 'acknowledge':
        return this.handleAcknowledge(payload, context);
      case 'countbyseverity':
        return this.handleCountBySeverity(payload);
      case 'getwithcontext':
      case 'get-with-context':
        return this.handleGetWithContext(payload);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported alert action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  /**
   * List alerts with optional filtering
   */
  private async handleList(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const subjectId = params?.subjectId as string | undefined;
    const includeTest = (params?.includeTest as boolean) ?? false;
    const testScenarioId = params?.testScenarioId as string | undefined;

    const filter: AlertFilter = {
      includeTest,
      testScenarioId,
    };

    let alerts;
    if (subjectId) {
      alerts = await this.alertService.getAlertsBySubject(subjectId, filter);
    } else {
      // If no subject specified, get unacknowledged (most useful default)
      alerts = await this.alertService.getUnacknowledgedAlerts(filter);
    }

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedAlerts = alerts.slice(start, start + pageSize);

    return buildDashboardSuccess(
      paginatedAlerts,
      buildPaginationMetadata(alerts.length, page, pageSize),
    );
  }

  /**
   * Get a specific alert by ID
   */
  private async handleGet(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Alert ID is required');
    }

    const alert = await this.alertService.getAlertById(id);

    if (!alert) {
      return buildDashboardError('NOT_FOUND', `Alert not found: ${id}`);
    }

    return buildDashboardSuccess(alert);
  }

  /**
   * Get alerts for a specific subject
   */
  private async handleGetBySubject(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const subjectId = params?.subjectId as string | undefined;
    const includeAcknowledged =
      (params?.includeAcknowledged as boolean) ?? true;
    const includeTest = (params?.includeTest as boolean) ?? false;

    if (!subjectId) {
      return buildDashboardError(
        'MISSING_SUBJECT_ID',
        'Subject ID is required',
      );
    }

    const filter: AlertFilter = {
      includeTest,
    };

    let alerts;
    if (includeAcknowledged) {
      alerts = await this.alertService.getAlertsBySubject(subjectId, filter);
    } else {
      alerts = await this.alertService.getUnacknowledgedBySubject(
        subjectId,
        filter,
      );
    }

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedAlerts = alerts.slice(start, start + pageSize);

    return buildDashboardSuccess(
      paginatedAlerts,
      buildPaginationMetadata(alerts.length, page, pageSize),
    );
  }

  /**
   * Get all unacknowledged alerts (includes subject/scope info via view)
   */
  private async handleGetUnacknowledged(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const includeTest = (params?.includeTest as boolean) ?? false;

    const filter: AlertFilter = {
      includeTest,
    };

    const alerts = await this.alertService.getUnacknowledgedAlerts(filter);

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedAlerts = alerts.slice(start, start + pageSize);

    return buildDashboardSuccess(
      paginatedAlerts,
      buildPaginationMetadata(alerts.length, page, pageSize),
    );
  }

  /**
   * Acknowledge an alert
   */
  private async handleAcknowledge(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Alert ID is required');
    }

    try {
      const alert = await this.alertService.acknowledgeAlert(
        id,
        context.userId,
      );
      return buildDashboardSuccess(alert, {
        message: 'Alert acknowledged successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return buildDashboardError('NOT_FOUND', `Alert not found: ${id}`);
      }
      throw error;
    }
  }

  /**
   * Get count of unacknowledged alerts by severity
   */
  private async handleCountBySeverity(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const includeTest = (params?.includeTest as boolean) ?? false;

    const filter: AlertFilter = {
      includeTest,
    };

    const counts =
      await this.alertService.countUnacknowledgedBySeverity(filter);

    return buildDashboardSuccess(counts, {
      totalCount: counts.critical + counts.warning + counts.info,
    });
  }

  /**
   * Get an alert with related assessment context (reasoning, signals)
   * This provides the "why" behind an alert by fetching the assessment data
   */
  private async handleGetWithContext(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const alertId = params?.alertId as string | undefined;

    if (!alertId) {
      return buildDashboardError('MISSING_ID', 'Alert ID is required');
    }

    // Get the alert
    const alert = await this.alertService.getAlertById(alertId);
    if (!alert) {
      return buildDashboardError('NOT_FOUND', `Alert not found: ${alertId}`);
    }

    // Build context based on alert type
    const context: {
      assessment?: {
        dimension_slug: string;
        dimension_name: string;
        score: number;
        confidence: number;
        reasoning: string | null;
        signals: unknown[];
        evidence: string[];
      };
      previousAssessment?: {
        score: number;
        reasoning: string | null;
        signals: unknown[];
      };
    } = {};

    // For dimension_spike alerts, get the specific dimension's assessment
    if (
      alert.alert_type === 'dimension_spike' &&
      alert.details?.dimension_slug
    ) {
      const dimensionSlug = alert.details.dimension_slug;

      // Get dimensions for this subject's scope to find the dimension ID
      const assessments = await this.assessmentRepo.findBySubject(
        alert.subject_id,
      );

      // Find the assessment for this dimension (most recent)
      const dimensionAssessment = assessments.find(
        (a) => a.dimension_slug === dimensionSlug,
      );

      if (dimensionAssessment) {
        context.assessment = {
          dimension_slug: dimensionAssessment.dimension_slug || dimensionSlug,
          dimension_name: dimensionAssessment.dimension_name || dimensionSlug,
          score: dimensionAssessment.score,
          confidence: dimensionAssessment.confidence,
          reasoning: dimensionAssessment.reasoning,
          signals: dimensionAssessment.signals || [],
          evidence: dimensionAssessment.evidence || [],
        };

        // Try to find the previous assessment for comparison
        const previousAssessments = assessments.filter(
          (a) =>
            a.dimension_slug === dimensionSlug &&
            a.id !== dimensionAssessment.id,
        );
        const prev = previousAssessments[0];
        if (prev) {
          context.previousAssessment = {
            score: prev.score,
            reasoning: prev.reasoning,
            signals: prev.signals || [],
          };
        }
      }
    }

    // For rapid_change and threshold_breach, get all recent dimension assessments
    if (
      alert.alert_type === 'rapid_change' ||
      alert.alert_type === 'threshold_breach'
    ) {
      // Get the most recent assessments to provide context on what's driving the score
      const assessments = await this.assessmentRepo.findRecentBySubject(
        alert.subject_id,
        6, // Get top 6 (one per dimension typically)
      );

      // Find the highest scoring dimension as the primary driver
      const sortedByScore = [...assessments].sort((a, b) => b.score - a.score);
      const topRiskDimension = sortedByScore[0];

      if (topRiskDimension) {
        context.assessment = {
          dimension_slug: topRiskDimension.dimension_slug || 'unknown',
          dimension_name: topRiskDimension.dimension_name || 'Top Risk Driver',
          score: topRiskDimension.score,
          confidence: topRiskDimension.confidence,
          reasoning: topRiskDimension.reasoning,
          signals: topRiskDimension.signals || [],
          evidence: topRiskDimension.evidence || [],
        };
      }
    }

    return buildDashboardSuccess({
      alert,
      context,
    });
  }
}
