/**
 * Prediction Dashboard Router
 *
 * Routes dashboard mode requests to appropriate handlers based on entity and action.
 * All UI data access for the prediction system uses this router via A2A dashboard mode.
 *
 * Request format:
 * - method: 'dashboard.<entity>.<operation>'
 * - params.mode: 'dashboard'
 * - payload.action: '<entity>.<operation>'
 *
 * Example:
 * {
 *   method: 'dashboard.universes.list',
 *   params: {
 *     mode: 'dashboard',
 *     payload: { action: 'universes.list', filters: { domain: 'stocks' } },
 *     context: ExecutionContext
 *   }
 * }
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import {
  DashboardActionResult,
  buildDashboardError,
} from './dashboard-handler.interface';

// Import entity handlers
import { UniverseHandler } from './handlers/universe.handler';
import { TargetHandler } from './handlers/target.handler';
import { PredictionHandler } from './handlers/prediction.handler';
import { AnalystHandler } from './handlers/analyst.handler';
import { LearningHandler } from './handlers/learning.handler';
import { LearningQueueHandler } from './handlers/learning-queue.handler';
import { ReviewQueueHandler } from './handlers/review-queue.handler';
import { StrategyHandler } from './handlers/strategy.handler';
import { MissedOpportunityHandler } from './handlers/missed-opportunity.handler';
import { ToolRequestHandler } from './handlers/tool-request.handler';
// Phase 5 - Learning Promotion Workflow
import { LearningPromotionHandler } from './handlers/learning-promotion.handler';
// Phase 4 - Test Data Builder UI
import { TestScenarioHandler } from './handlers/test-scenario.handler';
// Phase 3 - Test Data Management UI
import { TestArticleHandler } from './handlers/test-article.handler';
import { TestPriceDataHandler } from './handlers/test-price-data.handler';
import { TestTargetMirrorHandler } from './handlers/test-target-mirror.handler';
// Phase 6.2 - Analytics API Endpoints
import { AnalyticsHandler } from './handlers/analytics.handler';
// Sprint 4 - Signals Dashboard
import { SignalsHandler } from './handlers/signals.handler';
// Phase 3 - Agent Activity (HITL Notifications)
import { AgentActivityHandler } from './handlers/agent-activity.handler';
// Phase 5 - Learning Session (Bidirectional Learning)
import { LearningSessionHandler } from './handlers/learning-session.handler';
// Manual Runner Triggers
import { RunnerHandler } from './handlers/runner.handler';
// Source Subscriptions
import { SourceHandler } from './handlers/source.handler';
import { DailyReportHandler } from './handlers/daily-report.handler';

/**
 * Supported dashboard entities
 */
export type DashboardEntity =
  | 'universes'
  | 'targets'
  | 'predictions'
  | 'analysts'
  | 'learnings'
  | 'learning-queue'
  | 'review-queue'
  | 'strategies'
  | 'missed-opportunities'
  | 'tool-requests'
  | 'learning-promotion'
  | 'test-scenarios'
  | 'test-articles'
  | 'test-price-data'
  | 'test-target-mirrors'
  | 'analytics'
  | 'signals' // DEPRECATED - signals have been removed
  | 'articles' // New: unified article → predictor flow
  | 'agent-activity'
  | 'learning-session'
  | 'runner'
  | 'sources'
  | 'daily-reports';

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
export class PredictionDashboardRouter {
  private readonly logger = new Logger(PredictionDashboardRouter.name);

  constructor(
    private readonly universeHandler: UniverseHandler,
    private readonly targetHandler: TargetHandler,
    private readonly predictionHandler: PredictionHandler,
    private readonly analystHandler: AnalystHandler,
    private readonly learningHandler: LearningHandler,
    private readonly learningQueueHandler: LearningQueueHandler,
    private readonly reviewQueueHandler: ReviewQueueHandler,
    private readonly strategyHandler: StrategyHandler,
    private readonly missedOpportunityHandler: MissedOpportunityHandler,
    private readonly toolRequestHandler: ToolRequestHandler,
    // Phase 5 - Learning Promotion Workflow
    private readonly learningPromotionHandler: LearningPromotionHandler,
    // Phase 4 - Test Data Builder UI
    private readonly testScenarioHandler: TestScenarioHandler,
    // Phase 3 - Test Data Management UI
    private readonly testArticleHandler: TestArticleHandler,
    private readonly testPriceDataHandler: TestPriceDataHandler,
    private readonly testTargetMirrorHandler: TestTargetMirrorHandler,
    // Phase 6.2 - Analytics API Endpoints
    private readonly analyticsHandler: AnalyticsHandler,
    // Sprint 4 - Signals Dashboard
    private readonly signalsHandler: SignalsHandler,
    // Phase 3 - Agent Activity (HITL Notifications)
    private readonly agentActivityHandler: AgentActivityHandler,
    // Phase 5 - Learning Session (Bidirectional Learning)
    private readonly learningSessionHandler: LearningSessionHandler,
    // Manual Runner Triggers
    private readonly runnerHandler: RunnerHandler,
    // Source Subscriptions
    private readonly sourceHandler: SourceHandler,
    // Daily Postmortem Reports
    private readonly dailyReportHandler: DailyReportHandler,
  ) {}

  /**
   * Route a dashboard request to the appropriate handler
   *
   * @param action - Action string in format '<entity>.<operation>' (e.g., 'universes.list')
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
      `[DASHBOARD-ROUTER] Routing action: ${action} for org: ${context.orgSlug}`,
    );

    // Parse action into entity and operation
    const { entity, operation } = this.parseAction(action);

    if (!entity || !operation) {
      this.logger.warn(`[DASHBOARD-ROUTER] Invalid action format: ${action}`);
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
        `[DASHBOARD-ROUTER] Error handling ${action}: ${error instanceof Error ? error.message : String(error)}`,
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
   */
  private parseAction(action: string): {
    entity: string | null;
    operation: string | null;
  } {
    if (!action || typeof action !== 'string') {
      return { entity: null, operation: null };
    }

    const parts = action.split('.');

    // Handle nested operations like 'learning-queue.respond'
    if (parts.length === 2) {
      return { entity: parts[0] ?? null, operation: parts[1] ?? null };
    }

    // Handle simple actions (shouldn't happen in practice)
    if (parts.length === 1) {
      return { entity: null, operation: parts[0] ?? null };
    }

    // Handle longer paths (e.g., 'dashboard.universes.list' - extract last two parts)
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
      case 'universes':
      case 'universe':
        return this.universeHandler.execute(operation, payload, context);

      case 'targets':
      case 'target':
        return this.targetHandler.execute(operation, payload, context);

      case 'predictions':
      case 'prediction':
        return this.predictionHandler.execute(operation, payload, context);

      case 'analysts':
      case 'analyst':
        return this.analystHandler.execute(operation, payload, context);

      case 'learnings':
      case 'learning':
        return this.learningHandler.execute(operation, payload, context);

      case 'learning-queue':
      case 'learningqueue':
        return this.learningQueueHandler.execute(operation, payload, context);

      case 'review-queue':
      case 'reviewqueue':
        return this.reviewQueueHandler.execute(operation, payload, context);

      case 'strategies':
      case 'strategy':
        return this.strategyHandler.execute(operation, payload, context);

      case 'missed-opportunities':
      case 'missedopportunities':
      case 'missed-opportunity':
        return this.missedOpportunityHandler.execute(
          operation,
          payload,
          context,
        );

      case 'tool-requests':
      case 'toolrequests':
      case 'tool-request':
        return this.toolRequestHandler.execute(operation, payload, context);

      // Phase 5 - Learning Promotion Workflow
      case 'learning-promotion':
      case 'learningpromotion':
        return this.learningPromotionHandler.execute(
          operation,
          payload,
          context,
        );

      // Phase 4 - Test Data Builder UI
      case 'test-scenarios':
      case 'testscenarios':
      case 'test-scenario':
        return this.testScenarioHandler.execute(operation, payload, context);

      // Phase 3 - Test Data Management UI
      case 'test-articles':
      case 'testarticles':
      case 'test-article':
        return this.testArticleHandler.execute(operation, payload, context);

      case 'test-price-data':
      case 'testpricedata':
      case 'test-price':
        return this.testPriceDataHandler.execute(operation, payload, context);

      case 'test-target-mirrors':
      case 'testtargetmirrors':
      case 'test-target-mirror':
        return this.testTargetMirrorHandler.execute(
          operation,
          payload,
          context,
        );

      // Phase 6.2 - Analytics API Endpoints
      case 'analytics':
        return this.analyticsHandler.execute(operation, payload, context);

      // Sprint 4 - Signals Dashboard (DEPRECATED - signals have been removed)
      // The signalsHandler is kept for backward compatibility but may not work
      case 'signals':
      case 'signal':
        return this.signalsHandler.execute(operation, payload, context);

      // Article Processing - New unified flow (articles → predictors directly)
      case 'articles':
      case 'article':
        // Route to runnerHandler with 'processArticles' as the operation
        return this.runnerHandler.execute('processArticles', payload, context);

      // Phase 3 - Agent Activity (HITL Notifications)
      case 'agent-activity':
      case 'agentactivity':
        return this.agentActivityHandler.execute(operation, payload, context);

      // Phase 5 - Learning Session (Bidirectional Learning)
      case 'learning-session':
      case 'learningsession':
        return this.learningSessionHandler.execute(operation, payload, context);

      // Source Subscriptions (bridges crawler.sources to prediction pipeline)
      case 'sources':
      case 'source':
        return this.sourceHandler.execute(operation, payload, context);

      case 'daily-reports':
      case 'dailyreports':
      case 'daily-report':
        return this.dailyReportHandler.execute(operation, payload, context);

      // Manual Runner Triggers
      case 'runner':
      case 'runners':
        return this.runnerHandler.execute(operation, payload, context);

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
   * Get list of supported entities
   */
  getSupportedEntities(): DashboardEntity[] {
    return [
      'universes',
      'targets',
      'predictions',
      'analysts',
      'learnings',
      'learning-queue',
      'review-queue',
      'strategies',
      'missed-opportunities',
      'tool-requests',
      'learning-promotion',
      'test-scenarios',
      'test-articles',
      'test-price-data',
      'test-target-mirrors',
      'analytics',
      'signals',
      'agent-activity',
      'runner',
      'sources',
      'daily-reports',
    ];
  }

  /**
   * Get supported actions for an entity
   */
  getSupportedActions(entity: DashboardEntity): string[] {
    switch (entity) {
      case 'universes':
        return this.universeHandler.getSupportedActions();
      case 'targets':
        return this.targetHandler.getSupportedActions();
      case 'predictions':
        return this.predictionHandler.getSupportedActions();
      case 'analysts':
        return this.analystHandler.getSupportedActions();
      case 'learnings':
        return this.learningHandler.getSupportedActions();
      case 'learning-queue':
        return this.learningQueueHandler.getSupportedActions();
      case 'review-queue':
        return this.reviewQueueHandler.getSupportedActions();
      case 'strategies':
        return this.strategyHandler.getSupportedActions();
      case 'missed-opportunities':
        return this.missedOpportunityHandler.getSupportedActions();
      case 'tool-requests':
        return this.toolRequestHandler.getSupportedActions();
      case 'learning-promotion':
        return this.learningPromotionHandler.getSupportedActions();
      case 'test-scenarios':
        return this.testScenarioHandler.getSupportedActions();
      case 'test-articles':
        return this.testArticleHandler.getSupportedActions();
      case 'test-price-data':
        return this.testPriceDataHandler.getSupportedActions();
      case 'test-target-mirrors':
        return this.testTargetMirrorHandler.getSupportedActions();
      case 'analytics':
        return this.analyticsHandler.getSupportedActions();
      case 'signals':
        return this.signalsHandler.getSupportedActions();
      case 'agent-activity':
        return this.agentActivityHandler.getSupportedActions();
      case 'learning-session':
        return this.learningSessionHandler.getSupportedActions();
      case 'runner':
        return this.runnerHandler.getSupportedActions();
      case 'sources':
        return this.sourceHandler.getSupportedActions();
      case 'daily-reports':
        return this.dailyReportHandler.getSupportedActions();
      default:
        return [];
    }
  }
}
