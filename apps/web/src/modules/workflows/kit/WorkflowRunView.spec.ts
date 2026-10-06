import { describe, expect, it } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { createMockExecutionContext, type HumanReviewRequest, type WorkflowRunView as Run } from '@orchestrator-ai/transport-types';
import WorkflowRunView from './WorkflowRunView.vue';

function run(review: HumanReviewRequest): Run {
  return {
    runId: 'c1',
    workflowSlug: 'fulfillment',
    context: createMockExecutionContext({ orgSlug: 'acme', conversationId: 'c1', agentSlug: 'fulfillment', agentType: 'workflow' }),
    status: 'awaiting_review',
    currentStep: 'pickup',
    progress: 60,
    lastMessage: null,
    error: null,
    input: {},
    documents: [],
    result: null,
    live: null,
    review,
    restart: null,
    attempt: 0,
    maxAttempts: 1,
    queuedAt: 't',
    startedAt: 't',
    completedAt: null,
  };
}

const base = { runId: 'c1', workflowSlug: 'fulfillment', status: 'waiting', allowItemDecisions: false, createdAt: 't' } as const;

function mountWith(review: HumanReviewRequest) {
  return shallowMount(WorkflowRunView, { props: { run: run(review), events: [], busy: false, error: null, title: 'Order' } });
}

describe('WorkflowRunView', () => {
  it('shows a run at an event gate as waiting for that event, with nothing for a person to answer', () => {
    const wrapper = mountWith({
      ...base,
      reviewId: 'r1',
      gateSlug: 'pickup',
      kind: 'event',
      allowedDecisions: [],
      payload: { event: 'carrier.pickup', waitingFor: 'carrier pickup', detail: {} },
    });
    expect(wrapper.find('.status').text()).toBe('Waiting for carrier pickup');
    expect(wrapper.find('.progress-text').text()).toBe('Waiting for carrier pickup');
    expect(wrapper.find('.dot').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'ReviewPanel' }).exists()).toBe(false);
  });

  it('opens a person\'s review on the Review tab', () => {
    const wrapper = mountWith({
      ...base,
      reviewId: 'r2',
      gateSlug: 'shipping-review',
      kind: 'approval',
      allowedDecisions: ['approve', 'reject'],
      payload: {},
    });
    expect(wrapper.find('.status').text()).toBe('Waiting for you');
    expect(wrapper.find('.dot').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ReviewPanel' }).exists()).toBe(true);
  });
});
