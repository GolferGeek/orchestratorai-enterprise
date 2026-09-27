import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { RunTrace } from '@orchestrator-ai/transport-types';
import TraceView from './TraceView.vue';

const getTrace = vi.fn();
vi.mock('./workflowRunsClient', () => ({
  workflowRunsClient: { getTrace: (...a: unknown[]) => getTrace(...a), getParticipant: vi.fn() },
}));

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
});
