import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const invoke = vi.fn();
const getRun = vi.fn();
const streamUrl = vi.fn();
vi.mock('./workflowRunsClient', () => ({
  workflowRunsClient: {
    invoke: (...a: unknown[]) => invoke(...a),
    getRun: (...a: unknown[]) => getRun(...a),
    streamUrl: (...a: unknown[]) => streamUrl(...a),
    getEvents: vi.fn(async () => []),
  },
}));

class FakeEventSource {
  onmessage: ((m: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  close() {}
}
vi.stubGlobal('EventSource', FakeEventSource);

import { useWorkflowRun } from './useWorkflowRun';
import { useExecutionContextStore } from '@/modules/agents/stores/executionContextStore';

const target = {
  slug: 'decision-risk',
  orgSlug: 'corporate',
  userId: 'u1',
  contextModel: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
};

describe('useWorkflowRun.start', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    streamUrl.mockResolvedValue('/api/workflows/stream?token=t');
    invoke.mockImplementation(async (ctx: { conversationId: string }) => ({ runId: ctx.conversationId, status: 'queued' }));
    getRun.mockImplementation(async (_s: string, runId: string) => ({ runId, status: 'queued', review: null }));
  });

  it('starts each run in a new conversation with a whole workflow context, following it live', async () => {
    const flow = useWorkflowRun();
    const first = await flow.start(target, { proposition: 'x' });
    const second = await flow.start(target, { proposition: 'y' });

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
    const [context, action] = invoke.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(context).toEqual({
      orgSlug: 'corporate',
      userId: 'u1',
      conversationId: first,
      agentSlug: 'decision-risk',
      agentType: 'workflow',
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(action).toEqual({ action: 'start', input: { proposition: 'x' } });
    expect(streamUrl).toHaveBeenCalledWith(context);
    expect(useExecutionContextStore().current.conversationId).toBe(second);
  });

  it('reports a refused start instead of throwing, and holds no run', async () => {
    invoke.mockRejectedValueOnce(new Error('An administrator has to choose the models'));
    const flow = useWorkflowRun();
    await expect(flow.start(target, {})).resolves.toBeUndefined();
    expect(flow.error.value).toBe('An administrator has to choose the models');
    expect(flow.run.value).toBeNull();
  });
});
