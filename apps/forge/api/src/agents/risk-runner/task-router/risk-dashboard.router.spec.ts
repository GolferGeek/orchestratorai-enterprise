/**
 * Unit tests for RiskDashboardRouter
 *
 * Tests:
 * - route() parses action strings and dispatches to correct handler
 * - route() returns error response for invalid action format
 * - route() returns error response for unknown entity
 * - route() wraps handler errors as HANDLER_ERROR responses
 * - getSupportedEntities() returns the full entity list
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { RiskDashboardRouter } from './risk-dashboard.router';
import { ScopeHandler } from './handlers/scope.handler';
import { SubjectHandler } from './handlers/subject.handler';
import { DimensionHandler } from './handlers/dimension.handler';
import { CompositeScoreHandler } from './handlers/composite-score.handler';
import { AssessmentHandler } from './handlers/assessment.handler';
import { DebateHandler } from './handlers/debate.handler';
import { LearningQueueHandler } from './handlers/learning-queue.handler';
import { EvaluationHandler } from './handlers/evaluation.handler';
import { AlertHandler } from './handlers/alert.handler';
import { CorrelationHandler } from './handlers/correlation.handler';
import { PortfolioHandler } from './handlers/portfolio.handler';
import { AnalyticsHandler } from './handlers/analytics.handler';
import { AdvancedAnalyticsHandler } from './handlers/advanced-analytics.handler';
import { SimulationHandler } from './handlers/simulation.handler';

// Build a minimal mock for any IDashboardHandler
function makeHandler(name: string) {
  return {
    execute: jest
      .fn()
      .mockResolvedValue({ success: true, data: [{ id: `${name}-item` }] }),
    getSupportedActions: jest.fn().mockReturnValue(['list', 'get']),
  };
}

describe('RiskDashboardRouter', () => {
  let router: RiskDashboardRouter;

  let mockScopeHandler: ReturnType<typeof makeHandler>;
  let mockSubjectHandler: ReturnType<typeof makeHandler>;
  let mockDimensionHandler: ReturnType<typeof makeHandler>;
  let mockCompositeScoreHandler: ReturnType<typeof makeHandler>;
  let mockAssessmentHandler: ReturnType<typeof makeHandler>;
  let mockDebateHandler: ReturnType<typeof makeHandler>;
  let mockLearningQueueHandler: ReturnType<typeof makeHandler>;
  let mockEvaluationHandler: ReturnType<typeof makeHandler>;
  let mockAlertHandler: ReturnType<typeof makeHandler>;
  let mockCorrelationHandler: ReturnType<typeof makeHandler>;
  let mockPortfolioHandler: ReturnType<typeof makeHandler>;
  let mockAnalyticsHandler: ReturnType<typeof makeHandler>;
  let mockAdvancedAnalyticsHandler: ReturnType<typeof makeHandler>;
  let mockSimulationHandler: ReturnType<typeof makeHandler>;

  const mockContext = createMockExecutionContext({ orgSlug: 'acme' });
  const basePayload = {
    entity: 'scopes',
    action: 'list',
    params: {},
    filters: {},
  };

  beforeEach(() => {
    mockScopeHandler = makeHandler('scope');
    mockSubjectHandler = makeHandler('subject');
    mockDimensionHandler = makeHandler('dimension');
    mockCompositeScoreHandler = makeHandler('composite-score');
    mockAssessmentHandler = makeHandler('assessment');
    mockDebateHandler = makeHandler('debate');
    mockLearningQueueHandler = makeHandler('learning-queue');
    mockEvaluationHandler = makeHandler('evaluation');
    mockAlertHandler = makeHandler('alert');
    mockCorrelationHandler = makeHandler('correlation');
    mockPortfolioHandler = makeHandler('portfolio');
    mockAnalyticsHandler = makeHandler('analytics');
    mockAdvancedAnalyticsHandler = makeHandler('advanced-analytics');
    mockSimulationHandler = makeHandler('simulation');

    router = new RiskDashboardRouter(
      mockScopeHandler as unknown as ScopeHandler,
      mockSubjectHandler as unknown as SubjectHandler,
      mockDimensionHandler as unknown as DimensionHandler,
      mockCompositeScoreHandler as unknown as CompositeScoreHandler,
      mockAssessmentHandler as unknown as AssessmentHandler,
      mockDebateHandler as unknown as DebateHandler,
      mockLearningQueueHandler as unknown as LearningQueueHandler,
      mockEvaluationHandler as unknown as EvaluationHandler,
      mockAlertHandler as unknown as AlertHandler,
      mockCorrelationHandler as unknown as CorrelationHandler,
      mockPortfolioHandler as unknown as PortfolioHandler,
      mockAnalyticsHandler as unknown as AnalyticsHandler,
      mockAdvancedAnalyticsHandler as unknown as AdvancedAnalyticsHandler,
      mockSimulationHandler as unknown as SimulationHandler,
    );
  });

  // ─── Action routing ──────────────────────────────────────────────────────

  it('routes "scopes.list" to ScopeHandler', async () => {
    const result = await router.route('scopes.list', basePayload, mockContext);

    expect(mockScopeHandler.execute).toHaveBeenCalledWith(
      'list',
      basePayload,
      mockContext,
    );
    expect(result.success).toBe(true);
    expect(result.content).toEqual([{ id: 'scope-item' }]);
  });

  it('routes "subjects.get" to SubjectHandler', async () => {
    await router.route('subjects.get', basePayload, mockContext);

    expect(mockSubjectHandler.execute).toHaveBeenCalledWith(
      'get',
      basePayload,
      mockContext,
    );
  });

  it('routes "alerts.list" to AlertHandler', async () => {
    await router.route('alerts.list', basePayload, mockContext);

    expect(mockAlertHandler.execute).toHaveBeenCalledWith(
      'list',
      basePayload,
      mockContext,
    );
  });

  // ─── Invalid / unknown actions ──────────────────────────────────────────

  it('returns error response for invalid action format (no dot)', async () => {
    const result = await router.route('invalid', basePayload, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ACTION');
  });

  it('returns error response for unknown entity', async () => {
    const result = await router.route(
      'unicorns.list',
      basePayload,
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_ENTITY');
  });

  it('wraps handler exceptions as HANDLER_ERROR response', async () => {
    mockScopeHandler.execute.mockRejectedValue(new Error('DB timeout'));

    const result = await router.route('scopes.list', basePayload, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('HANDLER_ERROR');
    expect(result.error?.message).toBe('DB timeout');
  });

  // ─── getSupportedEntities ────────────────────────────────────────────────

  it('returns all supported entities', () => {
    const entities = router.getSupportedEntities();

    expect(entities).toContain('scopes');
    expect(entities).toContain('subjects');
    expect(entities).toContain('alerts');
    expect(entities).toContain('composite-scores');
    expect(entities.length).toBeGreaterThan(5);
  });
});
