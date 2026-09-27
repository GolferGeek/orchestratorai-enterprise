import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ImprovementRequestsPanel from './ImprovementRequestsPanel.vue';

const fetchImprovements = vi.fn();
const decideImprovement = vi.fn();
vi.mock('@/modules/workflows/services/workflows-api.service', () => ({
  workflowsApiService: {
    fetchImprovements: (...a: unknown[]) => fetchImprovements(...a),
    decideImprovement: (...a: unknown[]) => decideImprovement(...a),
  },
}));

const request = {
  requestId: 'ir-1',
  workflowSlug: 'decision-risk',
  runId: 'r1',
  traceReviewId: 'tr-1',
  kind: 'context',
  status: 'open',
  title: 'Cite the residual score',
  description: 'Ask the writer to cite it.',
  requestedBy: 'u1',
  adminNotes: null,
  decidedBy: null,
  createdAt: '2026-09-27T10:00:00Z',
  updatedAt: '2026-09-27T10:00:00Z',
};

describe('ImprovementRequestsPanel', () => {
  it('lists open requests and accepts one with notes', async () => {
    fetchImprovements.mockResolvedValue([request]);
    decideImprovement.mockResolvedValue({ ...request, status: 'accepted' });
    const wrapper = mount(ImprovementRequestsPanel, { props: { org: 'corporate' } });
    await flushPromises();
    expect(fetchImprovements).toHaveBeenCalledWith('open');
    expect(wrapper.find('.request').text()).toContain('Cite the residual score');

    await wrapper.find('.decide input').setValue('Updating the prompt');
    await wrapper.findAll('.decide ion-button')[0]!.trigger('click');
    await flushPromises();
    expect(decideImprovement).toHaveBeenCalledWith('ir-1', 'accepted', 'Updating the prompt');
    expect(fetchImprovements).toHaveBeenCalledTimes(2);
  });

  it('shows why the queue could not be read', async () => {
    fetchImprovements.mockRejectedValue(new Error('Select an organization to manage its improvement requests'));
    const wrapper = mount(ImprovementRequestsPanel, { props: { org: 'corporate' } });
    await flushPromises();
    expect(wrapper.find('.problem').text()).toContain('Select an organization');
  });
});
