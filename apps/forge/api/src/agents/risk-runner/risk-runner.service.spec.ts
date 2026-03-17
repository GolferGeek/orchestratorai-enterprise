/**
 * Unit tests for RiskRunnerService (Forge dashboard adapter)
 *
 * Tests:
 * - process() in dashboard mode routes to RiskDashboardRouter
 * - process() without dashboard mode returns agent info
 * - process() propagates router errors as failed results
 * - ExecutionContext is passed whole to dashboardRouter.route()
 * - getSupportedEntities() is included in default response
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { RiskRunnerService } from './risk-runner.service';
import { RiskDashboardRouter } from './task-router/risk-dashboard.router';

describe('RiskRunnerService', () => {
  let service: RiskRunnerService;
  let mockDashboardRouter: jest.Mocked<
    Pick<RiskDashboardRouter, 'route' | 'getSupportedEntities'>
  >;

  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    agentSlug: 'risk-runner',
    agentType: 'workflow',
  });

  beforeEach(() => {
    mockDashboardRouter = {
      route: jest.fn(),
      getSupportedEntities: jest.fn().mockReturnValue(['scopes', 'subjects', 'alerts']),
    };

    service = new RiskRunnerService(
      mockDashboardRouter as unknown as RiskDashboardRouter,
    );
  });

  // ─── Dashboard mode ──────────────────────────────────────────────────────

  it('routes dashboard mode requests to RiskDashboardRouter', async () => {
    mockDashboardRouter.route.mockResolvedValue({
      success: true,
      content: [{ id: 'scope-1' }],
    });

    const result = await service.process({
      context: mockContext,
      mode: 'dashboard',
      action: 'scopes.list',
      payload: { entity: 'scopes', action: 'list', params: {} },
    });

    expect(mockDashboardRouter.route).toHaveBeenCalledTimes(1);
    expect(mockDashboardRouter.route).toHaveBeenCalledWith(
      'scopes.list',
      expect.objectContaining({ params: {} }),
      mockContext,
    );
    expect(result.status).toBe('completed');
    expect(result.response).toEqual([{ id: 'scope-1' }]);
  });

  it('returns failed status when dashboard router reports failure', async () => {
    mockDashboardRouter.route.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Scope not found' },
    });

    const result = await service.process({
      context: mockContext,
      mode: 'dashboard',
      action: 'scopes.get',
      payload: { entity: 'scopes', action: 'get', params: { id: 'missing-id' } },
    });

    expect(result.status).toBe('failed');
    expect(result.response).toBeUndefined();
    expect(result.error).toBe('Scope not found');
  });

  it('passes ExecutionContext whole — does not destructure', async () => {
    mockDashboardRouter.route.mockResolvedValue({ success: true, content: [] });

    await service.process({
      context: mockContext,
      mode: 'dashboard',
      action: 'subjects.list',
      payload: { entity: 'subjects', action: 'list', params: {} },
    });

    const passedContext = mockDashboardRouter.route.mock.calls[0]![2];
    expect(passedContext).toBe(mockContext);
    expect(passedContext.orgSlug).toBe('test-org');
    expect(passedContext.agentSlug).toBe('risk-runner');
  });

  // ─── Default mode (no dashboard action) ────────────────────────────────

  it('returns agent info when no mode is provided', async () => {
    const result = await service.process({ context: mockContext });

    expect(mockDashboardRouter.route).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
    expect(result.response).toMatchObject({
      agent: 'investment-risk-agent',
      capabilities: expect.arrayContaining(['dashboard']),
    });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('includes supported entities in default response', async () => {
    const result = await service.process({ context: mockContext });

    const response = result.response as Record<string, unknown>;
    expect(response.dashboardEntities).toEqual(['scopes', 'subjects', 'alerts']);
  });

  // ─── Error handling ─────────────────────────────────────────────────────

  it('returns failed status when dashboardRouter.route throws', async () => {
    mockDashboardRouter.route.mockRejectedValue(new Error('DB connection lost'));

    const result = await service.process({
      context: mockContext,
      mode: 'dashboard',
      action: 'alerts.list',
      payload: { entity: 'alerts', action: 'list', params: {} },
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBe('DB connection lost');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
