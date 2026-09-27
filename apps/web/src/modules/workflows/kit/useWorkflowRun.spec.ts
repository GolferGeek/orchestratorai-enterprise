import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const invoke = vi.fn();
const getRun = vi.fn();
const streamUrl = vi.fn();
const upload = vi.fn();
vi.mock('./workflowRunsClient', () => ({
  workflowRunsClient: {
    invoke: (...a: unknown[]) => invoke(...a),
    getRun: (...a: unknown[]) => getRun(...a),
    streamUrl: (...a: unknown[]) => streamUrl(...a),
    upload: (...a: unknown[]) => upload(...a),
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

  it('restarts as a new conversation, sending the instruction only when there is one', async () => {
    const flow = useWorkflowRun();
    const source = { runId: 'parent-run', workUnitRunId: 'wu-1' };
    const child = await flow.restart(target, source, '  Weigh timing heavily. ');
    await flow.restart(target, source, '   ');

    const [context, action] = invoke.mock.calls[0] as [{ conversationId: string }, unknown];
    expect(context.conversationId).toBe(child);
    expect(child).not.toBe('parent-run');
    expect(action).toEqual({ action: 'restart', source, overrides: { instruction: 'Weigh timing heavily.' } });
    expect(invoke.mock.calls[1]![1]).toEqual({ action: 'restart', source });
  });

  it('opens a run started by someone else (the system) as the viewer', async () => {
    const systemContext = { ...target, userId: '00000000-0000-0000-0000-000000000000', conversationId: 'run-9', agentSlug: 'decision-risk', agentType: 'system', provider: 'openrouter', model: 'm' };
    getRun.mockResolvedValueOnce({ runId: 'run-9', status: 'completed', review: null, context: systemContext });
    const flow = useWorkflowRun();
    await flow.open('decision-risk', 'run-9', 'corporate', 'viewer-1');
    expect(flow.context.value).toMatchObject({ userId: 'viewer-1', agentType: 'workflow', conversationId: 'run-9', orgSlug: 'corporate' });
  });

  it('uploads into the next run conversation and starts that same run', async () => {
    upload.mockImplementation(async (ctx: { conversationId: string }) => ({ ref: `finance/${ctx.conversationId}/x-inv.pdf`, filename: 'inv.pdf', mimeType: 'application/pdf' }));
    const flow = useWorkflowRun();
    const ref = await flow.upload(target, new File(['x'], 'inv.pdf'));
    const runId = await flow.start(target, { poNumber: 'PO-4471' }, [ref!]);
    const [uploadContext] = upload.mock.calls[0] as [{ conversationId: string }];
    expect(runId).toBe(uploadContext.conversationId);
    expect(invoke.mock.calls[0]![1]).toEqual({ action: 'start', input: { poNumber: 'PO-4471' }, documents: [ref] });
    // The next start is a new conversation again.
    expect(await flow.start(target, {})).not.toBe(runId);
  });

  it('reports a refused start instead of throwing, and holds no run', async () => {
    invoke.mockRejectedValueOnce(new Error('An administrator has to choose the models'));
    const flow = useWorkflowRun();
    await expect(flow.start(target, {})).resolves.toBeUndefined();
    expect(flow.error.value).toBe('An administrator has to choose the models');
    expect(flow.run.value).toBeNull();
  });
});
