import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { IonicVue } from '@ionic/vue';
import DailyReportView from '../DailyReportView.vue';

const { serviceMock, routeMock } = vi.hoisted(() => ({
  serviceMock: {
    listDailyReports: vi.fn(),
    getDailyReport: vi.fn(),
    runDailyReport: vi.fn(),
    getDailyReportArtifact: vi.fn(),
    decideDailyReportRecommendation: vi.fn(),
    setAgentSlug: vi.fn(),
    setOrgSlug: vi.fn(),
  },
  routeMock: {
    query: {},
    params: {},
    path: '/prediction/daily-report',
    name: 'daily-report',
    matched: [],
    fullPath: '/prediction/daily-report',
    hash: '',
    redirectedFrom: undefined,
    meta: {},
  },
}));

vi.mock('@/services/predictionDashboardService', () => ({
  predictionDashboardService: serviceMock,
}));

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/stores/rbacStore', () => ({
  useAuthStore: () => ({
    currentOrganization: 'test-org',
    userId: 'test-user',
  }),
}));

vi.mock('@/stores/agentsStore', () => ({
  useAgentsStore: () => ({
    availableAgents: [
      { slug: 'us-tech-stocks', name: 'US Tech Stocks', organizationSlug: 'test-org' },
    ],
  }),
}));

describe('DailyReportView', () => {
  const runSummary = {
    overnightMoveThresholdPct: 2,
    overnightCandidates: 2,
    recommendations: 2,
  };

  const runPayload = {
    id: 'run-1',
    runDate: '2026-02-17',
    status: 'completed',
    summary: runSummary,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('domain_context'));
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal(
      'requestAnimationFrame',
      ((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      }) as unknown as typeof requestAnimationFrame,
    );
  });

  const createWrapper = () =>
    mount(DailyReportView, {
      global: {
        plugins: [IonicVue],
      },
    });

  it('loads runs on mount and defaults recommendation filter to pending', async () => {
    serviceMock.listDailyReports.mockResolvedValue({
      content: [
        {
          id: 'run-1',
          runDate: '2026-02-17',
          status: 'completed',
          summary: {
            overnightMoveThresholdPct: 2,
            overnightCandidates: 2,
            recommendations: 2,
          },
        },
      ],
    });
    serviceMock.getDailyReport.mockResolvedValue({
      content: {
        run: {
          id: 'run-1',
          runDate: '2026-02-17',
          status: 'completed',
          summary: {
            overnightMoveThresholdPct: 2,
            overnightCandidates: 2,
            recommendations: 2,
          },
          reportHtml: '<html><body>ok</body></html>',
        },
        recommendations: [
          {
            id: 'rec-pending',
            title: 'Pending rec',
            rationale: 'test',
            recommendationType: 'context_update',
            scopeLevel: 'instrument_context',
            confidence: 0.8,
            status: 'pending',
            proposedChange: { context_section: 'ai' },
            actionNote: null,
            actionedAt: null,
          },
          {
            id: 'rec-approved',
            title: 'Approved rec',
            rationale: 'test',
            recommendationType: 'source_candidate',
            scopeLevel: 'instrument_context',
            confidence: 0.9,
            status: 'approved',
            proposedChange: {},
            actionNote: null,
            actionedAt: null,
          },
        ],
      },
    });

    const wrapper = createWrapper();
    await flushPromises();

    expect(serviceMock.listDailyReports).toHaveBeenCalledWith(20);
    expect(serviceMock.getDailyReport).toHaveBeenCalledWith('run-1');
    expect(wrapper.text()).toContain('Next Best Action');
    expect(wrapper.text()).toContain('Review Pending (1)');
  });

  it('runs report and reloads selected run', async () => {
    serviceMock.listDailyReports
      .mockResolvedValueOnce({
        content: [
          {
            id: 'run-old',
            runDate: '2026-02-16',
            status: 'completed',
            summary: {
              overnightMoveThresholdPct: 2,
              overnightCandidates: 1,
              recommendations: 1,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            id: 'run-new',
            runDate: '2026-02-17',
            status: 'completed',
            summary: {
              overnightMoveThresholdPct: 2,
              overnightCandidates: 3,
              recommendations: 4,
            },
          },
        ],
      });
    serviceMock.getDailyReport.mockResolvedValue({
      content: {
        run: {
          id: 'run-new',
          runDate: '2026-02-17',
          status: 'completed',
          summary: {
            overnightMoveThresholdPct: 2,
            overnightCandidates: 3,
            recommendations: 4,
          },
          reportHtml: '<html><body>ok</body></html>',
        },
        recommendations: [],
      },
    });
    serviceMock.runDailyReport.mockResolvedValue({
      content: { runId: 'run-new' },
    });

    const wrapper = createWrapper();
    await flushPromises();

    const runButton = wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('Run Daily Report'));
    expect(runButton).toBeTruthy();

    await runButton!.trigger('click');
    await flushPromises();

    expect(serviceMock.runDailyReport).toHaveBeenCalled();
    expect(serviceMock.getDailyReport).toHaveBeenCalledWith('run-new');
  });

  it('bulk approves pending context updates and records failures', async () => {
    serviceMock.listDailyReports.mockResolvedValue({
      content: [
        {
          id: 'run-1',
          runDate: '2026-02-17',
          status: 'completed',
          summary: {
            overnightMoveThresholdPct: 2,
            overnightCandidates: 2,
            recommendations: 2,
          },
        },
      ],
    });
    serviceMock.getDailyReport.mockResolvedValue({
      content: {
        run: {
          id: 'run-1',
          runDate: '2026-02-17',
          status: 'completed',
          summary: {
            overnightMoveThresholdPct: 2,
            overnightCandidates: 2,
            recommendations: 2,
          },
          reportHtml: '<html><body>ok</body></html>',
        },
        recommendations: [
          {
            id: 'rec-ok',
            title: 'rec ok',
            rationale: 'r',
            recommendationType: 'context_update',
            scopeLevel: 'instrument_context',
            confidence: 0.81,
            status: 'pending',
            proposedChange: { context_section: 'ai' },
            actionNote: null,
            actionedAt: null,
          },
          {
            id: 'rec-fail',
            title: 'rec fail',
            rationale: 'r',
            recommendationType: 'context_update',
            scopeLevel: 'instrument_context',
            confidence: 0.78,
            status: 'pending',
            proposedChange: { context_section: 'ai' },
            actionNote: null,
            actionedAt: null,
          },
        ],
      },
    });
    serviceMock.decideDailyReportRecommendation
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('failed'));

    const wrapper = createWrapper();
    await flushPromises();

    const button = wrapper
      .findAll('button')
      .find((btn) =>
        btn.text().includes('Approve Pending Context Updates'),
      );
    expect(button).toBeTruthy();

    await button!.trigger('click');
    await flushPromises();

    expect(serviceMock.decideDailyReportRecommendation).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Approved 1/2 pending context updates');
    expect(wrapper.text()).toContain('View failures (1)');
  });

  it('defaults recommendation filter to all when there are no pending recs', async () => {
    serviceMock.listDailyReports.mockResolvedValue({
      content: [runPayload],
    });
    serviceMock.getDailyReport.mockResolvedValue({
      content: {
        run: { ...runPayload, reportHtml: '<html><body>ok</body></html>' },
        recommendations: [
          {
            id: 'rec-approved-only',
            title: 'Approved only',
            rationale: 'r',
            recommendationType: 'context_update',
            scopeLevel: 'instrument_context',
            confidence: 0.88,
            status: 'approved',
            proposedChange: { context_section: 'ai' },
            actionNote: null,
            actionedAt: null,
          },
        ],
      },
    });

    const wrapper = createWrapper();
    await flushPromises();

    const allFilter = wrapper
      .findAll('button')
      .find((btn) => btn.text().trim() === 'all');
    expect(allFilter).toBeTruthy();
    expect(allFilter!.classes()).toContain('active');
    expect(wrapper.text()).toContain('Approved only');
  });

  it('validates invalid escalate scope and blocks decision call', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('bad_scope'));
    vi.stubGlobal('alert', alertSpy);

    serviceMock.listDailyReports.mockResolvedValue({
      content: [runPayload],
    });
    serviceMock.getDailyReport.mockResolvedValue({
      content: {
        run: { ...runPayload, reportHtml: '<html><body>ok</body></html>' },
        recommendations: [
          {
            id: 'rec-escalate',
            title: 'Escalate me',
            rationale: 'r',
            recommendationType: 'context_update',
            scopeLevel: 'instrument_context',
            confidence: 0.8,
            status: 'pending',
            proposedChange: { context_section: 'ai' },
            actionNote: null,
            actionedAt: null,
          },
        ],
      },
    });

    const wrapper = createWrapper();
    await flushPromises();

    const escalateButton = wrapper
      .findAll('button')
      .find((btn) => btn.text().trim() === 'Escalate');
    expect(escalateButton).toBeTruthy();
    await escalateButton!.trigger('click');
    await flushPromises();

    expect(alertSpy).toHaveBeenCalledOnce();
    expect(serviceMock.decideDailyReportRecommendation).not.toHaveBeenCalled();
  });

  it('renders replay metadata from action notes', async () => {
    serviceMock.listDailyReports.mockResolvedValue({
      content: [runPayload],
    });
    serviceMock.getDailyReport.mockResolvedValue({
      content: {
        run: { ...runPayload, reportHtml: '<html><body>ok</body></html>' },
        recommendations: [
          {
            id: 'rec-replay',
            title: 'Replay rec',
            rationale: 'r',
            recommendationType: 'replay_experiment',
            scopeLevel: 'prediction_global_context',
            confidence: 0.9,
            status: 'approved',
            proposedChange: {},
            actionNote:
              'replay_test_id=test-42; replay_accuracy_pct=71.5; original_accuracy_pct=64.2',
            actionedAt: '2026-02-17T12:00:00.000Z',
          },
        ],
      },
    });

    const wrapper = createWrapper();
    await flushPromises();

    expect(wrapper.text()).toContain('Replay:');
    expect(wrapper.text()).toContain('test test-42');
    expect(wrapper.text()).toContain('original 64.2%');
    expect(wrapper.text()).toContain('replay 71.5%');
  });

  it('retries failed recommendation using last bulk decision', async () => {
    const recommendation = {
      id: 'rec-apply-fail',
      title: 'Apply rec',
      rationale: 'r',
      recommendationType: 'context_update',
      scopeLevel: 'instrument_context',
      confidence: 0.92,
      status: 'approved',
      proposedChange: { context_section: 'ai' },
      actionNote: null,
      actionedAt: null,
    };

    serviceMock.listDailyReports.mockResolvedValue({
      content: [runPayload],
    });
    serviceMock.getDailyReport.mockResolvedValue({
      content: {
        run: { ...runPayload, reportHtml: '<html><body>ok</body></html>' },
        recommendations: [recommendation],
      },
    });
    serviceMock.decideDailyReportRecommendation.mockRejectedValue(
      new Error('bulk apply failure'),
    );

    const wrapper = createWrapper();
    await flushPromises();

    const applyAllButton = wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('Apply Approved AI Instrument Updates'));
    expect(applyAllButton).toBeTruthy();
    await applyAllButton!.trigger('click');
    await flushPromises();

    const retryButton = wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('Retry apply'));
    expect(retryButton).toBeTruthy();

    serviceMock.decideDailyReportRecommendation.mockResolvedValue({});
    await retryButton!.trigger('click');
    await flushPromises();

    expect(serviceMock.decideDailyReportRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        recommendationId: 'rec-apply-fail',
        decision: 'apply',
        note: 'retry-failed: apply',
      }),
    );
  });
});
