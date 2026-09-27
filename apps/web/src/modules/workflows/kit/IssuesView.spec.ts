import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { IssueLedgerView } from '@orchestrator-ai/transport-types';
import IssuesView from './IssuesView.vue';

const getIssues = vi.fn();
vi.mock('./workflowRunsClient', () => ({
  workflowRunsClient: { getIssues: (...a: unknown[]) => getIssues(...a) },
}));

const ledger: IssueLedgerView = {
  runId: 'c1',
  issues: [
    {
      issueId: 'i1',
      stageSlug: 'risk-radar',
      issueKey: 'dimension:legal',
      source: 'risk-radar',
      status: 'accepted',
      severity: 'critical',
      category: 'legal',
      title: 'Legal risk scores 82',
      finding: 'Two pending suits.',
      recommendedAction: null,
      subject: null,
      lastChange: { actor: 'review:approve-mitigations#0', rationale: 'Mitigation: Settle the suits', at: 't' },
      createdAt: 't',
      updatedAt: 't',
    },
  ],
  summary: {
    total: 1,
    open: 1,
    byStatus: { identified: 0, accepted: 1, rejected: 0, addressed: 0, not_addressed: 0, report_only: 0 },
    bySeverity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
  },
};

describe('IssuesView', () => {
  it("shows each issue with its status and why it got there, and reloads when the run moves", async () => {
    getIssues.mockResolvedValue(ledger);
    const wrapper = mount(IssuesView, { props: { slug: 'decision-risk', runId: 'c1', orgSlug: 'corporate', version: 1 } });
    await flushPromises();
    expect(getIssues).toHaveBeenCalledWith('decision-risk', 'c1', 'corporate');
    expect(wrapper.find('.summary').text()).toContain('1 issue, 1 open');
    expect(wrapper.find('.issue').text()).toContain('Legal risk scores 82');
    expect(wrapper.find('.status').text()).toBe('Accepted');
    expect(wrapper.find('.change').text()).toBe('Mitigation: Settle the suits');

    await wrapper.setProps({ version: 2 });
    await flushPromises();
    expect(getIssues).toHaveBeenCalledTimes(2);
  });

  it('shows a failed read instead of an empty ledger', async () => {
    getIssues.mockRejectedValue(new Error('Run not found'));
    const wrapper = mount(IssuesView, { props: { slug: 'decision-risk', runId: 'c1', orgSlug: 'corporate', version: 1 } });
    await flushPromises();
    expect(wrapper.find('.problem').text()).toBe('Run not found');
    expect(wrapper.find('.issue').exists()).toBe(false);
  });
});
