/**
 * Unit Tests for PredictionDashboardService
 *
 * Tests the prediction dashboard A2A service layer.
 *
 * Key Testing Areas:
 * - listUniverses / getUniverse - universe CRUD
 * - listTargets / getTarget - target CRUD
 * - listDailyReports / getDailyReport - daily report operations
 * - runDailyReport - trigger a report run
 * - decideDailyReportRecommendation - approve/reject recommendations
 * - getDashboardConversationId / setDashboardConversationId
 * - setAgentSlug / setOrgSlug
 * - getOrgSlug error handling (missing org context)
 * - snake_case -> camelCase transformation
 * - HTTP error handling
 * - JSON-RPC error response handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// ============================================================================
// Hoisted mocks (must be declared before module imports)
// ============================================================================

const { authStoreMock, agentsStoreMock } = vi.hoisted(() => ({
  authStoreMock: {
    currentOrganization: 'test-org',
    token: 'test-bearer-token',
    user: { id: 'user-abc-123' },
  },
  agentsStoreMock: {
    availableAgents: [
      {
        slug: 'us-tech-stocks',
        name: 'US Tech Stocks',
        organizationSlug: 'test-org',
      },
    ],
  },
}));

vi.mock('@/stores/rbacStore', () => ({
  useAuthStore: () => authStoreMock,
}));

vi.mock('@/stores/agentsStore', () => ({
  useAgentsStore: () => agentsStoreMock,
}));

vi.mock('@/utils/securityConfig', () => ({
  getSecureApiBaseUrl: () => 'https://api.test.com',
}));

// ============================================================================
// Import module under test AFTER mocks
// ============================================================================

import { predictionDashboardService } from '@/services/predictionDashboardService';

// ============================================================================
// Helpers
// ============================================================================

const mockUUID = 'mock-uuid-1111-2222-3333-444444444444';

function makeOkResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function makeJsonRpcSuccess<T>(content: T): unknown {
  return {
    result: {
      payload: {
        content,
      },
    },
  };
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();

  // Reset service state between tests
  predictionDashboardService.setAgentSlug('us-tech-stocks');
  predictionDashboardService.setOrgSlug(null);
  predictionDashboardService.resetDashboardConversationId();

  // Mock crypto.randomUUID
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => mockUUID),
  });

  // Default auth store state
  authStoreMock.currentOrganization = 'test-org';
  authStoreMock.token = 'test-bearer-token';
  authStoreMock.user = { id: 'user-abc-123' };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Conversation ID Management
// ============================================================================

describe('Dashboard Conversation ID', () => {
  it('should generate a conversation ID on first call', () => {
    predictionDashboardService.resetDashboardConversationId();
    const id = predictionDashboardService.getDashboardConversationId();
    expect(id).toBe(mockUUID);
  });

  it('should return the same conversation ID on subsequent calls', () => {
    predictionDashboardService.resetDashboardConversationId();
    const id1 = predictionDashboardService.getDashboardConversationId();
    const id2 = predictionDashboardService.getDashboardConversationId();
    expect(id1).toBe(id2);
  });

  it('should use a manually set conversation ID', () => {
    predictionDashboardService.setDashboardConversationId('explicit-conv-id');
    expect(predictionDashboardService.getDashboardConversationId()).toBe('explicit-conv-id');
  });

  it('should generate a new ID after reset', () => {
    predictionDashboardService.setDashboardConversationId('first-id');
    predictionDashboardService.resetDashboardConversationId();
    const newId = predictionDashboardService.getDashboardConversationId();
    expect(newId).toBe(mockUUID);
    expect(newId).not.toBe('first-id');
  });
});

// ============================================================================
// listUniverses
// ============================================================================

describe('listUniverses', () => {
  it('should fetch universes and transform snake_case to camelCase', async () => {
    const apiUniverse = {
      id: 'univ-1',
      name: 'US Tech Stocks',
      domain: 'stocks',
      description: 'Technology stocks',
      organization_slug: 'test-org',
      agent_slug: 'us-tech-stocks',
      strategy_id: 'strat-abc',
      llm_config: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkResponse(makeJsonRpcSuccess([apiUniverse]))),
    );

    const result = await predictionDashboardService.listUniverses();

    expect(result.content).toHaveLength(1);
    const universe = result.content![0];
    expect(universe.id).toBe('univ-1');
    expect(universe.name).toBe('US Tech Stocks');
    expect(universe.organizationSlug).toBe('test-org');
    expect(universe.agentSlug).toBe('us-tech-stocks');
    expect(universe.strategyId).toBe('strat-abc');
    expect(universe.createdAt).toBe('2025-01-01T00:00:00Z');
    expect(universe.updatedAt).toBe('2025-01-02T00:00:00Z');
  });

  it('should return empty array when content is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkResponse(makeJsonRpcSuccess(null))),
    );

    const result = await predictionDashboardService.listUniverses();
    expect(result.content).toEqual([]);
  });

  it('should send a JSON-RPC 2.0 request with dashboard mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.listUniverses();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/agent-to-agent/test-org/us-tech-stocks/tasks');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('dashboard.universes.list');
    expect(body.params.mode).toBe('dashboard');
    expect(body.params.context).toBeDefined();
    expect(body.params.context.orgSlug).toBe('test-org');
    expect(body.params.context.userId).toBe('user-abc-123');
    expect(body.params.context.agentSlug).toBe('us-tech-stocks');
  });

  it('should include Authorization header when token is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.listUniverses();

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer test-bearer-token');
  });

  it('should throw when HTTP response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({ message: 'Unauthorized' }, 401),
      ),
    );

    await expect(predictionDashboardService.listUniverses()).rejects.toThrow('Unauthorized');
  });

  it('should throw when JSON-RPC response contains an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({ error: { message: 'Agent not found' } }),
      ),
    );

    await expect(predictionDashboardService.listUniverses()).rejects.toThrow('Agent not found');
  });

  it('should throw when result.success is false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({
          result: {
            payload: {
              success: false,
              message: 'Universe service unavailable',
            },
          },
        }),
      ),
    );

    await expect(predictionDashboardService.listUniverses()).rejects.toThrow(
      'Universe service unavailable',
    );
  });
});

// ============================================================================
// listTargets
// ============================================================================

describe('listTargets', () => {
  it('should fetch targets and transform snake_case to camelCase', async () => {
    const apiTarget = {
      id: 'target-1',
      universe_id: 'univ-1',
      name: 'Apple Inc',
      symbol: 'AAPL',
      target_type: 'stock',
      context: 'Tech giant',
      llm_config_override: null,
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkResponse(makeJsonRpcSuccess([apiTarget]))),
    );

    const result = await predictionDashboardService.listTargets();

    expect(result.content).toHaveLength(1);
    const target = result.content![0];
    expect(target.id).toBe('target-1');
    expect(target.universeId).toBe('univ-1');
    expect(target.symbol).toBe('AAPL');
    expect(target.targetType).toBe('stock');
    expect(target.active).toBe(true);
    expect(target.createdAt).toBe('2025-01-01T00:00:00Z');
  });

  it('should pass universeId in params when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.listTargets({ universeId: 'univ-filter' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.params.payload.params).toMatchObject({ universeId: 'univ-filter' });
  });
});

// ============================================================================
// listDailyReports
// ============================================================================

describe('listDailyReports', () => {
  it('should fetch and transform daily report runs', async () => {
    const apiRun = {
      id: 'run-1',
      org_slug: 'test-org',
      agent_slug: 'us-tech-stocks',
      run_date: '2025-12-01',
      status: 'completed',
      summary: {
        runDate: '2025-12-01',
        overnightMoveThresholdPct: 2,
        overnightCandidates: 5,
        recommendations: 3,
        actorScorecard: {},
      },
      report_markdown: '# Report',
      report_html: '<html></html>',
      report_json: {},
      created_by: 'user-abc',
      started_at: '2025-12-01T06:00:00Z',
      completed_at: '2025-12-01T06:30:00Z',
      created_at: '2025-12-01T05:00:00Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkResponse(makeJsonRpcSuccess([apiRun]))),
    );

    const result = await predictionDashboardService.listDailyReports(5);

    expect(result.content).toHaveLength(1);
    const run = result.content![0];
    expect(run.id).toBe('run-1');
    expect(run.orgSlug).toBe('test-org');
    expect(run.agentSlug).toBe('us-tech-stocks');
    expect(run.runDate).toBe('2025-12-01');
    expect(run.status).toBe('completed');
    expect(run.reportMarkdown).toBe('# Report');
    expect(run.reportHtml).toBe('<html></html>');
    expect(run.createdBy).toBe('user-abc');
    expect(run.completedAt).toBe('2025-12-01T06:30:00Z');
  });

  it('should request the provided limit in params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.listDailyReports(42);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.params.payload.params).toMatchObject({ limit: 42 });
  });

  it('should default limit to 20', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.listDailyReports();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.params.payload.params).toMatchObject({ limit: 20 });
  });

  it('should handle runs nested under a "runs" key', async () => {
    const apiRun = {
      id: 'run-nested',
      org_slug: 'test-org',
      agent_slug: 'us-tech-stocks',
      run_date: '2025-12-01',
      status: 'completed',
      summary: { runDate: '2025-12-01', overnightMoveThresholdPct: 2, overnightCandidates: 0, recommendations: 0, actorScorecard: {} },
      report_markdown: '',
      report_html: '',
      report_json: {},
      created_by: 'system',
      started_at: '2025-12-01T06:00:00Z',
      completed_at: null,
      created_at: '2025-12-01T05:00:00Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse(makeJsonRpcSuccess({ runs: [apiRun] })),
      ),
    );

    const result = await predictionDashboardService.listDailyReports();

    expect(result.content).toHaveLength(1);
    expect(result.content![0].id).toBe('run-nested');
  });
});

// ============================================================================
// getDailyReport
// ============================================================================

describe('getDailyReport', () => {
  it('should fetch and transform a daily report with recommendations', async () => {
    const apiResponse = {
      run: {
        id: 'run-2',
        org_slug: 'test-org',
        agent_slug: 'us-tech-stocks',
        run_date: '2025-12-02',
        status: 'completed',
        summary: { runDate: '2025-12-02', overnightMoveThresholdPct: 2, overnightCandidates: 1, recommendations: 1, actorScorecard: {} },
        report_markdown: '# Report',
        report_html: '<html></html>',
        report_json: {},
        created_by: 'user-abc',
        started_at: '2025-12-02T06:00:00Z',
        completed_at: '2025-12-02T06:30:00Z',
        created_at: '2025-12-02T05:00:00Z',
      },
      recommendations: [
        {
          id: 'rec-1',
          run_id: 'run-2',
          recommendation_type: 'context_update',
          scope_level: 'instrument_context',
          target_id: 'target-1',
          target_symbol: 'AAPL',
          title: 'Update AI context',
          rationale: 'Strong evidence',
          proposed_change: { context_section: 'ai', new_value: 'bullish' },
          confidence: 0.92,
          status: 'pending',
          action_source: null,
          action_note: null,
          actioned_by: null,
          actioned_at: null,
          created_at: '2025-12-02T07:00:00Z',
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkResponse(makeJsonRpcSuccess(apiResponse))),
    );

    const result = await predictionDashboardService.getDailyReport('run-2');

    expect(result.content).toBeDefined();
    const { run, recommendations } = result.content!;

    expect(run.id).toBe('run-2');
    expect(run.orgSlug).toBe('test-org');
    expect(run.runDate).toBe('2025-12-02');

    expect(recommendations).toHaveLength(1);
    const rec = recommendations[0];
    expect(rec.id).toBe('rec-1');
    expect(rec.runId).toBe('run-2');
    expect(rec.recommendationType).toBe('context_update');
    expect(rec.scopeLevel).toBe('instrument_context');
    expect(rec.targetId).toBe('target-1');
    expect(rec.targetSymbol).toBe('AAPL');
    expect(rec.confidence).toBe(0.92);
    expect(rec.status).toBe('pending');
    expect(rec.actionNote).toBeNull();
  });

  it('should pass runId in params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess({ run: null, recommendations: [] })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.getDailyReport('run-xyz').catch(() => {
      // null run causes no crash in this test, we only care about the request
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.params.payload.params).toMatchObject({ runId: 'run-xyz' });
  });
});

// ============================================================================
// runDailyReport
// ============================================================================

describe('runDailyReport', () => {
  it('should trigger a report run and return the run ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse(makeJsonRpcSuccess({ runId: 'new-run-id' })),
      ),
    );

    const result = await predictionDashboardService.runDailyReport();

    expect(result.content).toMatchObject({ runId: 'new-run-id' });
  });

  it('should pass optional params when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess({ runId: 'run-3' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.runDailyReport({
      runDate: '2025-12-03',
      overnightMoveThresholdPct: 3,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.params.payload.params).toMatchObject({
      runDate: '2025-12-03',
      overnightMoveThresholdPct: 3,
    });
  });
});

// ============================================================================
// decideDailyReportRecommendation
// ============================================================================

describe('decideDailyReportRecommendation', () => {
  it('should post a decision and return the updated recommendation', async () => {
    const apiRec = {
      id: 'rec-1',
      run_id: 'run-2',
      recommendation_type: 'context_update',
      scope_level: 'instrument_context',
      target_id: 'target-1',
      target_symbol: 'AAPL',
      title: 'Update',
      rationale: 'r',
      proposed_change: {},
      confidence: 0.9,
      status: 'approved',
      action_source: 'dashboard',
      action_note: null,
      actioned_by: 'user-abc',
      actioned_at: '2025-12-02T08:00:00Z',
      created_at: '2025-12-02T07:00:00Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkResponse(makeJsonRpcSuccess(apiRec))),
    );

    const result = await predictionDashboardService.decideDailyReportRecommendation({
      recommendationId: 'rec-1',
      decision: 'approve',
      actionSource: 'dashboard',
    });

    expect(result.content).toBeDefined();
    expect(result.content!.id).toBe('rec-1');
    expect(result.content!.status).toBe('approved');
    expect(result.content!.recommendationType).toBe('context_update');
    expect(result.content!.actionedAt).toBe('2025-12-02T08:00:00Z');
  });

  it('should include note and escalateTo in params when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess(null)),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.decideDailyReportRecommendation({
      recommendationId: 'rec-99',
      decision: 'escalate',
      note: 'Needs domain review',
      escalateTo: 'domain_context',
    }).catch(() => {
      // null content may cause downstream issues but we test the request shape only
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.params.payload.params).toMatchObject({
      recommendationId: 'rec-99',
      decision: 'escalate',
      note: 'Needs domain review',
      escalateTo: 'domain_context',
    });
  });
});

// ============================================================================
// Org / Agent slug resolution
// ============================================================================

describe('setAgentSlug and setOrgSlug', () => {
  it('should use explicitly set org slug for requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    predictionDashboardService.setOrgSlug('explicit-org');

    await predictionDashboardService.listUniverses();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/agent-to-agent/explicit-org/');
  });

  it('should use explicitly set agent slug for requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    predictionDashboardService.setAgentSlug('crypto-predictions');

    await predictionDashboardService.listUniverses();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/crypto-predictions/tasks');
  });

  it('should fall back to agent store org when auth org is global (*)', async () => {
    authStoreMock.currentOrganization = '*';
    predictionDashboardService.setOrgSlug(null);

    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.listUniverses();

    const [url] = fetchMock.mock.calls[0];
    // Should use org from agent store: 'test-org'
    expect(url).toContain('/agent-to-agent/test-org/');
  });

  it('should throw when no org context is available and auth org is global (*)', async () => {
    authStoreMock.currentOrganization = '*';
    predictionDashboardService.setOrgSlug('*');
    agentsStoreMock.availableAgents = [];

    await expect(predictionDashboardService.listUniverses()).rejects.toThrow(
      'Global organization (*) is not supported',
    );
  });
});

// ============================================================================
// ExecutionContext flow validation (execution-context-skill compliance)
// ============================================================================

describe('ExecutionContext in dashboard requests', () => {
  it('should include a complete ExecutionContext in every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.listUniverses();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const ctx = body.params.context;

    expect(ctx.orgSlug).toBeTruthy();
    expect(ctx.userId).toBe('user-abc-123');
    expect(ctx.conversationId).toBeTruthy();
    expect(ctx.taskId).toBeTruthy();
    expect(ctx.planId).toBe('00000000-0000-0000-0000-000000000000');
    expect(ctx.deliverableId).toBe('00000000-0000-0000-0000-000000000000');
    expect(ctx.agentSlug).toBeTruthy();
    expect(ctx.agentType).toBe('prediction');
    expect(ctx.provider).toBe('anthropic');
    expect(ctx.model).toBeTruthy();
  });

  it('should use a stable conversationId within a session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse(makeJsonRpcSuccess([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await predictionDashboardService.listUniverses();
    await predictionDashboardService.listUniverses();

    const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(body1.params.context.conversationId).toBe(
      body2.params.context.conversationId,
    );
  });
});
