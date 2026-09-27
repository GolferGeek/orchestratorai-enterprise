import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { RunTrace } from '@orchestrator-ai/transport-types';
import TraceView from './TraceView.vue';

const getTrace = vi.fn();
const getTraceReviews = vi.fn(async (): Promise<unknown[]> => []);
const invoke = vi.fn();
vi.mock('./workflowRunsClient', () => ({
  workflowRunsClient: {
    getTrace: (...a: unknown[]) => getTrace(...a),
    getTraceReviews: (...a: unknown[]) => getTraceReviews(...(a as [])),
    invoke: (...a: unknown[]) => invoke(...a),
    getParticipant: vi.fn(),
  },
}));

const context = {
  orgSlug: 'corporate',
  userId: 'u1',
  conversationId: 'r1',
  agentSlug: 'decision-risk',
  agentType: 'workflow',
  provider: 'openrouter',
  model: 'm',
};

const completedReview = {
  reviewId: 'tr-1',
  runId: 'r1',
  target: { type: 'work_unit', id: 'assess', label: 'assess' },
  reviewerAgent: 'workflow-trace-reviewer',
  notes: 'Too vague',
  status: 'completed',
  result: {
    summary: 'Generic.',
    concerns: ['No numbers'],
    recommendations: [{ kind: 'context', priority: 'high', recommendation: 'Cite the score.', rationale: 'Readers need it.' }],
    restartWorthwhile: true,
    restartInstruction: 'Cite the score.',
    confidence: 0.8,
  },
  error: null,
  requestedBy: 'u1',
  createdAt: 't',
  completedAt: 't',
};

const unit = (workUnitId: string, eligible: boolean) => ({
  workUnitId,
  slug: workUnitId,
  pattern: 'solo',
  status: 'completed',
  error: null,
  startedAt: 't',
  completedAt: 't',
  durationMs: 1000,
  participants: [],
  restart: { eligible, reason: eligible ? null : 'This workflow cannot restart from this step.' },
});

describe('TraceView restart', () => {
  it('offers a restart only on eligible steps and sends the instruction', async () => {
    getTrace.mockResolvedValue({ runId: 'r1', workUnits: [unit('assess', true), unit('summary', false)] } as RunTrace);
    const wrapper = mount(TraceView, { props: { slug: 'decision-risk', runId: 'r1', orgSlug: 'corporate', version: 1 } });
    await flushPromises();
    const links = wrapper.findAll('.restart-link');
    expect(links).toHaveLength(1);

    await links[0]!.trigger('click');
    await wrapper.find('.restart-form textarea').setValue('Weigh timing heavily.');
    await wrapper.find('.restart-form').trigger('submit');
    expect(wrapper.emitted('restart')).toEqual([['assess', 'Weigh timing heavily.']]);
  });

  it('asks the reviewer about a step and shows the review', async () => {
    getTrace.mockResolvedValue({ runId: 'r1', workUnits: [unit('assess', true)] } as RunTrace);
    invoke.mockResolvedValue({ runId: 'r1', status: 'completed', traceReview: completedReview });
    const wrapper = mount(TraceView, { props: { slug: 'decision-risk', runId: 'r1', orgSlug: 'corporate', version: 1, context } });
    await flushPromises();
    await wrapper.findAll('.restart-link').find((b) => b.text() === 'Review this step')!.trigger('click');
    await wrapper.find('.review-form textarea').setValue('Too vague');
    await wrapper.find('.review-form').trigger('submit');
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith(context, {
      action: 'trace.review',
      runId: 'r1',
      target: { type: 'work_unit', id: 'assess' },
      notes: 'Too vague',
    });
    expect(wrapper.find('.review').text()).toContain('Generic.');
  });

  it('files a recommendation as an improvement request, and offers the suggested restart', async () => {
    getTrace.mockResolvedValue({ runId: 'r1', workUnits: [unit('assess', true)] } as RunTrace);
    getTraceReviews.mockResolvedValueOnce([completedReview]);
    invoke.mockResolvedValue({ runId: 'r1', status: 'completed', improvementRequest: { requestId: 'ir-1' } });
    const wrapper = mount(TraceView, { props: { slug: 'decision-risk', runId: 'r1', orgSlug: 'corporate', version: 1, context } });
    await flushPromises();
    await wrapper.findAll('.review .link').find((b) => b.text() === 'Request this improvement')!.trigger('click');
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith(context, expect.objectContaining({
      action: 'improvement.request',
      traceReviewId: 'tr-1',
      kind: 'context',
      title: 'Cite the score.',
    }));
    expect(wrapper.find('.review').text()).toContain('Requested');

    await wrapper.findAll('.review .link').find((b) => b.text() === 'Restart with this instruction')!.trigger('click');
    expect(wrapper.emitted('restart')).toEqual([['assess', 'Cite the score.']]);
  });

  it('keeps the trace read-only without a context', async () => {
    getTrace.mockResolvedValue({ runId: 'r1', workUnits: [unit('assess', true)] } as RunTrace);
    const wrapper = mount(TraceView, { props: { slug: 'decision-risk', runId: 'r1', orgSlug: 'corporate', version: 1 } });
    await flushPromises();
    expect(wrapper.findAll('.restart-link').map((b) => b.text())).toEqual(['Restart from here']);
  });
});
