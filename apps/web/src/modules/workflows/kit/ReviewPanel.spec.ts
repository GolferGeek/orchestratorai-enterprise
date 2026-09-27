import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { HumanReviewRequest } from '@orchestrator-ai/transport-types';
import ReviewPanel from './ReviewPanel.vue';

const review: HumanReviewRequest = {
  reviewId: 'r1',
  runId: 'c1',
  workflowSlug: 'decision-risk',
  gateSlug: 'approve-mitigations',
  kind: 'approval',
  status: 'waiting',
  allowedDecisions: ['approve', 'modify'],
  allowItemDecisions: true,
  payload: { items: [{ itemId: 'legal', proposal: 'a' }, { itemId: 'security', proposal: 'b' }] },
  createdAt: 't',
};

describe('ReviewPanel', () => {
  it('approves everything', async () => {
    const wrapper = mount(ReviewPanel, { props: { review, busy: false } });
    await wrapper.findAll('ion-button')[0]!.trigger('click');
    expect(wrapper.emitted('decide')).toEqual([[{ type: 'approve' }]]);
  });

  it('sends only the items a person changed, with rewritten text', async () => {
    const wrapper = mount(ReviewPanel, { props: { review, busy: false } });
    await wrapper.find('input[name="decision-legal"][value="reject"]').setValue(true);
    await wrapper.find('input[name="decision-security"][value="modify"]').setValue(true);
    await wrapper.find('textarea.replacement').setValue('  Encrypt the backups  ');
    await wrapper.findAll('ion-button')[1]!.trigger('click');
    expect(wrapper.emitted('decide')).toEqual([
      [
        {
          type: 'modify',
          items: [
            { itemId: 'legal', decision: 'reject' },
            { itemId: 'security', decision: 'modify', replacement: 'Encrypt the backups' },
          ],
        },
      ],
    ]);
  });

  it('asks for the new text instead of sending an empty rewrite, and hides reject when not allowed', async () => {
    const wrapper = mount(ReviewPanel, { props: { review, busy: false } });
    await wrapper.find('input[name="decision-legal"][value="modify"]').setValue(true);
    await wrapper.findAll('ion-button')[1]!.trigger('click');
    expect(wrapper.emitted('decide')).toBeUndefined();
    expect(wrapper.text()).toContain('Write your version');
    expect(wrapper.text()).not.toContain('Reject');
  });

  it('requires feedback to reject, where rejecting is allowed', async () => {
    const wrapper = mount(ReviewPanel, {
      props: { review: { ...review, allowedDecisions: ['approve', 'reject'], allowItemDecisions: false }, busy: false },
    });
    const reject = wrapper.findAll('ion-button').find((b) => b.text() === 'Reject')!;
    await reject.trigger('click');
    expect(wrapper.emitted('decide')).toBeUndefined();
    await wrapper.find('textarea.feedback').setValue('Too risky');
    await reject.trigger('click');
    expect(wrapper.emitted('decide')).toEqual([[{ type: 'reject', feedback: 'Too risky' }]]);
  });
});
