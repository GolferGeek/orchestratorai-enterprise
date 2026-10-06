import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { HumanReviewRequest } from '@orchestrator-ai/transport-types';
import ChecklistPanel from './ChecklistPanel.vue';

const review: HumanReviewRequest = {
  reviewId: 'r1',
  runId: 'c1',
  workflowSlug: 'fulfillment',
  gateSlug: 'packing',
  kind: 'checklist',
  status: 'waiting',
  allowedDecisions: [],
  allowItemDecisions: false,
  payload: { items: [{ itemId: 'line-1', label: 'Pack 2 x anti-GFAP' }, { itemId: 'ice', label: 'Ice packed properly' }] },
  createdAt: 't',
  ticks: [{ itemId: 'line-1', by: 'u1', at: '2026-10-06T15:00:00Z' }],
};

describe('ChecklistPanel', () => {
  it('shows each line, ticked or not, and how many are done', () => {
    const wrapper = mount(ChecklistPanel, { props: { review, busy: false } });
    expect(wrapper.find('.hint').text()).toContain('1 of 2 done');
    expect((wrapper.find('input[name="tick-line-1"]').element as HTMLInputElement).checked).toBe(true);
    expect((wrapper.find('input[name="tick-ice"]').element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.findAll('.when')).toHaveLength(1);
  });

  it('ticks and unticks a line', async () => {
    const wrapper = mount(ChecklistPanel, { props: { review, busy: false } });
    await wrapper.find('input[name="tick-ice"]').setValue(true);
    await wrapper.find('input[name="tick-line-1"]').setValue(false);
    expect(wrapper.emitted('tick')).toEqual([['ice', true], ['line-1', false]]);
  });
});
