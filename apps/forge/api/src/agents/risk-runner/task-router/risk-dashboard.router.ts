/**
 * Risk Dashboard Router
 *
 * Routes dashboard mode requests to appropriate handlers based on entity and action.
 * All UI data access for the risk system uses this router via A2A dashboard mode.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '../../shared/types/forge-types';
import {
  DashboardActionResult,
  buildDashboardError,
  buildDashboardSuccess,
} from './dashboard-handler.interface';

// Import entity handlers
import { ScopeHandler } from './handlers/scope.handler';
import { SubjectHandler } from './handlers/subject.handler';
import { DimensionHandler } from './handlers/dimension.handler';
import { CompositeScoreHandler } from './handlers/composite-score.handler';
import { AssessmentHandler } from './handlers/assessment.handler';
import { DebateHandler } from './handlers/debate.handler';
import { LearningQueueHandler } from './handlers/learning-queue.handler';
import { EvaluationHandler } from './handlers/evaluation.handler';
import { AlertHandler } from './handlers/alert.handler';
// Phase 5: Advanced features
import { CorrelationHandler } from './handlers/correlation.handler';
import { PortfolioHandler } from './handlers/portfolio.handler';
// Phase 6: Analytics features
import { AnalyticsHandler } from './handlers/analytics.handler';
// Phase 7: AI-Powered features
import { AdvancedAnalyticsHandler } from './handlers/advanced-analytics.handler';
// Phase 8: Advanced Simulation
import { SimulationHandler } from './handlers/simulation.handler';

/**
 * Supported dashboard entities
 */
export type RiskDashboardEntity =
  | 'scopes'
  | 'subjects'
  | 'dimensions'
  | 'composite-scores'
  | 'assessments'
  | 'debates'
  | 'learning-queue'
  | 'evaluations'
  | 'alerts'
  | 'correlations'
  | 'portfolio'
  | 'analytics'
  | 'advanced-analytics'
  | 'simulations'
  | 'data-sources';

/**
 * Dashboard router response
 */
export interface DashboardRouterResponse {
  success: boolean;
  content?: unknown;
  metadata?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Injectable()
export class RiskDashboardRouter {
  private readonly logger = new Logger(RiskDashboardRouter.name);

  constructor(
    private readonly scopeHandler: ScopeHandler,
    private readonly subjectHandler: SubjectHandler,
    private readonly dimensionHandler: DimensionHandler,
    private readonly compositeScoreHandler: CompositeScoreHandler,
    private readonly assessmentHandler: AssessmentHandler,
    private readonly debateHandler: DebateHandler,
    private readonly learningQueueHandler: LearningQueueHandler,
    private readonly evaluationHandler: EvaluationHandler,
    private readonly alertHandler: AlertHandler,
    // Phase 5: Advanced features
    private readonly correlationHandler: CorrelationHandler,
    private readonly portfolioHandler: PortfolioHandler,
    // Phase 6: Analytics features
    private readonly analyticsHandler: AnalyticsHandler,
    // Phase 7: AI-Powered features
    private readonly advancedAnalyticsHandler: AdvancedAnalyticsHandler,
    // Phase 8: Advanced Simulation
    private readonly simulationHandler: SimulationHandler,
  ) {}

  /**
   * Route a dashboard request to the appropriate handler
   *
   * @param action - Action string in format '<entity>.<operation>' (e.g., 'scopes.list')
   * @param payload - Dashboard request payload with params, filters, pagination
   * @param context - ExecutionContext capsule
   * @returns Dashboard response
   */
  async route(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardRouterResponse> {
    this.logger.debug(
      `[RISK-DASHBOARD-ROUTER] Routing action: ${action} for org: ${context.orgSlug}`,
    );

    // Parse action into entity and operation
    const { entity, operation } = this.parseAction(action);

    if (!entity || !operation) {
      this.logger.warn(
        `[RISK-DASHBOARD-ROUTER] Invalid action format: ${action}`,
      );
      return this.buildErrorResponse(
        'INVALID_ACTION',
        `Invalid action format: ${action}. Expected format: '<entity>.<operation>'`,
      );
    }

    // Route to appropriate handler
    try {
      const result = await this.routeToHandler(
        entity,
        operation,
        payload,
        context,
      );
      return this.buildResponse(result);
    } catch (error) {
      this.logger.error(
        `[RISK-DASHBOARD-ROUTER] Error handling ${action}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return this.buildErrorResponse(
        'HANDLER_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Parse action string into entity and operation
   *
   * Dashboard-level aggregate actions use format 'dashboard.<operation>' (e.g. 'dashboard.subject-detail').
   * Entity-level actions use format '<entity>.<operation>' (e.g. 'scopes.list', 'subjects.get').
   */
  private parseAction(action: string): {
    entity: string | null;
    operation: string | null;
  } {
    if (!action || typeof action !== 'string') {
      return { entity: null, operation: null };
    }

    const parts = action.split('.');

    // Dashboard-level compound operations: dashboard.subject-detail, dashboard.stats, etc.
    if (parts.length >= 2 && parts[0]?.toLowerCase() === 'dashboard') {
      return {
        entity: 'dashboard',
        operation: parts.slice(1).join('.') ?? null,
      };
    }

    if (parts.length === 2) {
      return { entity: parts[0] ?? null, operation: parts[1] ?? null };
    }

    if (parts.length > 2) {
      return {
        entity: parts[parts.length - 2] ?? null,
        operation: parts[parts.length - 1] ?? null,
      };
    }

    return { entity: null, operation: null };
  }

  /**
   * Route to the appropriate handler based on entity
   */
  private async routeToHandler(
    entity: string,
    operation: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const normalizedEntity = entity.toLowerCase();

    switch (normalizedEntity) {
      case 'scopes':
      case 'scope':
        return this.scopeHandler.execute(operation, payload, context);

      case 'subjects':
      case 'subject':
        return this.subjectHandler.execute(operation, payload, context);

      case 'dimensions':
      case 'dimension':
        return this.dimensionHandler.execute(operation, payload, context);

      case 'composite-scores':
      case 'compositescores':
      case 'composite-score':
        return this.compositeScoreHandler.execute(operation, payload, context);

      case 'assessments':
      case 'assessment':
        return this.assessmentHandler.execute(operation, payload, context);

      case 'debates':
      case 'debate':
        return this.debateHandler.execute(operation, payload, context);

      case 'learning-queue':
      case 'learningqueue':
      case 'learnings':
        return this.learningQueueHandler.execute(operation, payload, context);

      case 'evaluations':
      case 'evaluation':
        return this.evaluationHandler.execute(operation, payload, context);

      case 'alerts':
      case 'alert':
        return this.alertHandler.execute(operation, payload, context);

      // Phase 5: Advanced features
      case 'correlations':
      case 'correlation':
        return this.correlationHandler.execute(operation, payload, context);

      case 'portfolio':
      case 'portfolios':
        return this.portfolioHandler.execute(operation, payload, context);

      // Phase 6: Analytics features
      case 'analytics':
        return this.analyticsHandler.execute(operation, payload, context);

      // Phase 7: AI-Powered features
      case 'advanced-analytics':
      case 'advancedanalytics':
        return this.advancedAnalyticsHandler.execute(
          operation,
          payload,
          context,
        );

      // Phase 8: Advanced Simulation
      case 'simulations':
      case 'simulation':
        return this.simulationHandler.execute(operation, payload, context);

      case 'data-sources':
      case 'datasources':
      case 'sources':
        return this.simulationHandler.execute(operation, payload, context);

      // Dashboard-level aggregate operations
      case 'dashboard':
        return this.handleDashboardOperation(operation, payload, context);

      default:
        return buildDashboardError(
          'UNKNOWN_ENTITY',
          `Unknown dashboard entity: ${entity}`,
          { supportedEntities: this.getSupportedEntities() },
        );
    }
  }

  /**
   * Build success response from handler result
   */
  private buildResponse(
    result: DashboardActionResult,
  ): DashboardRouterResponse {
    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      content: result.data,
      metadata: result.metadata,
    };
  }

  /**
   * Build error response
   */
  private buildErrorResponse(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ): DashboardRouterResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details,
      },
    };
  }

  /**
   * Handle dashboard-level aggregate operations (stats, subject-detail)
   */
  private async handleDashboardOperation(
    operation: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;

    switch (operation.toLowerCase()) {
      case 'stats': {
        // Return aggregate stats for the scope
        const scopeId = params?.scopeId as string | undefined;

        // Fetch all data in parallel for stats computation
        const [scoresResult, subjectsResult, alertsResult, learningsResult] =
          await Promise.all([
            this.compositeScoreHandler.execute(
              'list-active',
              { ...payload, params: { scopeId } },
              context,
            ),
            this.subjectHandler.execute(
              'list',
              { ...payload, params: { scopeId, isActive: true } },
              context,
            ),
            this.alertHandler.execute(
              'list',
              { ...payload, params: { scopeId, unacknowledgedOnly: true } },
              context,
            ),
            this.learningQueueHandler.execute(
              'list',
              { ...payload, params: { scopeId, status: 'pending' } },
              context,
            ),
          ]);

        if (!scoresResult.success) {
          return scoresResult;
        }

        const scores = scoresResult.data as Array<{
          score?: number;
          overall_score?: number;
          created_at?: string;
        }>;
        const subjects = (
          subjectsResult.success ? subjectsResult.data : []
        ) as unknown[];
        const alerts = (
          alertsResult.success ? alertsResult.data : []
        ) as Array<{
          severity?: string;
        }>;
        const learnings = (
          learningsResult.success ? learningsResult.data : []
        ) as unknown[];

        const totalSubjects = subjects.length;
        const analyzedSubjects = scores.length;
        const avgScore =
          analyzedSubjects > 0
            ? scores.reduce((sum, s) => {
                const scoreVal = s.score ?? (s.overall_score ?? 0) / 100;
                return sum + scoreVal;
              }, 0) / analyzedSubjects
            : 0;

        // Count critical and warning alerts
        const criticalAlerts = alerts.filter(
          (a) => a.severity === 'critical',
        ).length;
        const warningAlerts = alerts.filter(
          (a) => a.severity === 'warning',
        ).length;

        // Count stale assessments (older than 7 days = 168 hours)
        const staleThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const staleAssessments = scores.filter((s) => {
          if (!s.created_at) return false;
          return new Date(s.created_at).getTime() < staleThreshold;
        }).length;

        return buildDashboardSuccess({
          totalSubjects,
          analyzedSubjects,
          averageScore: avgScore,
          criticalAlerts,
          warningAlerts,
          pendingLearnings: learnings.length,
          staleAssessments,
          // Keep legacy fields for backwards compatibility
          highRisk: scores.filter(
            (s) => (s.score ?? (s.overall_score ?? 0) / 100) >= 0.7,
          ).length,
          mediumRisk: scores.filter((s) => {
            const score = s.score ?? (s.overall_score ?? 0) / 100;
            return score >= 0.4 && score < 0.7;
          }).length,
          lowRisk: scores.filter(
            (s) => (s.score ?? (s.overall_score ?? 0) / 100) < 0.4,
          ).length,
        });
      }

      case 'subject-detail': {
        const subjectId = params?.subjectId as string | undefined;
        if (!subjectId) {
          return buildDashboardError(
            'MISSING_SUBJECT_ID',
            'Subject ID is required',
          );
        }

        // Fetch all data in parallel
        const [subjectResult, assessmentsResult, alertsResult] =
          await Promise.all([
            this.subjectHandler.execute(
              'get',
              { ...payload, params: { id: subjectId } },
              context,
            ),
            this.assessmentHandler.execute(
              'list',
              { ...payload, params: { subjectId } },
              context,
            ),
            this.alertHandler.execute(
              'list',
              { ...payload, params: { subjectId } },
              context,
            ),
          ]);

        // Get composite score for the subject
        const compositeResult = await this.compositeScoreHandler.execute(
          'list-active',
          payload,
          context,
        );
        const scores =
          (compositeResult.data as Array<{
            subject_id?: string;
            subjectId?: string;
          }>) || [];
        const compositeScore = scores.find(
          (s) => s.subject_id === subjectId || s.subjectId === subjectId,
        );

        // Try to get latest debate
        let debate = null;
        try {
          const debateResult = await this.debateHandler.execute(
            'latest',
            { ...payload, params: { subjectId } },
            context,
          );
          if (debateResult.success) {
            debate = debateResult.data;
          }
        } catch {
          // Debate may not exist
        }

        return buildDashboardSuccess({
          subject: subjectResult.success ? subjectResult.data : null,
          compositeScore: compositeScore || null,
          assessments: assessmentsResult.success ? assessmentsResult.data : [],
          debate,
          alerts: alertsResult.success ? alertsResult.data : [],
          evaluations: [],
        });
      }

      default:
        return buildDashboardError(
          'UNSUPPORTED_DASHBOARD_ACTION',
          `Unsupported dashboard operation: ${operation}`,
          { supportedOperations: ['stats', 'subject-detail'] },
        );
    }
  }

  /**
   * Get list of supported entities
   */
  getSupportedEntities(): RiskDashboardEntity[] {
    return [
      'scopes',
      'subjects',
      'dimensions',
      'composite-scores',
      'assessments',
      'debates',
      'learning-queue',
      'evaluations',
      'alerts',
      'correlations',
      'portfolio',
      'analytics',
      'advanced-analytics',
      'simulations',
      'data-sources',
    ];
  }

  /**
   * Get supported actions for an entity
   */
  getSupportedActions(entity: RiskDashboardEntity): string[] {
    switch (entity) {
      case 'scopes':
        return this.scopeHandler.getSupportedActions();
      case 'subjects':
        return this.subjectHandler.getSupportedActions();
      case 'dimensions':
        return this.dimensionHandler.getSupportedActions();
      case 'composite-scores':
        return this.compositeScoreHandler.getSupportedActions();
      case 'assessments':
        return this.assessmentHandler.getSupportedActions();
      case 'debates':
        return this.debateHandler.getSupportedActions();
      case 'learning-queue':
        return this.learningQueueHandler.getSupportedActions();
      case 'evaluations':
        return this.evaluationHandler.getSupportedActions();
      case 'alerts':
        return this.alertHandler.getSupportedActions();
      case 'correlations':
        return this.correlationHandler.getSupportedActions();
      case 'portfolio':
        return this.portfolioHandler.getSupportedActions();
      case 'analytics':
        return this.analyticsHandler.getSupportedActions();
      case 'advanced-analytics':
        return this.advancedAnalyticsHandler.getSupportedActions();
      case 'simulations':
      case 'data-sources':
        return this.simulationHandler.getSupportedActions();
      default:
        return [];
    }
  }
}
