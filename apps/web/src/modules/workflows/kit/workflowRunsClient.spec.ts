import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

const apiFetch = vi.fn();
vi.mock('@/modules/workflows/services/workflows-api.service', () => ({
  API_BASE_URL: '/api',
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { workflowRunsClient } from './workflowRunsClient';

const context: ExecutionContext = {
  orgSlug: 'corporate',
  userId: 'u1',
  conversationId: 'c1',
  agentSlug: 'decision-risk',
  agentType: 'workflow',
  provider: 'openrouter',
  model: 'google/gemini-2.5-flash-lite',
};

describe('workflowRunsClient.invoke', () => {
  beforeEach(() => apiFetch.mockReset());

  it('sends the action as json content with the whole context, to the context org', async () => {
    apiFetch.mockResolvedValue({ result: { success: true, output: { content: { runId: 'c1', status: 'queued' } }, context } });
    await expect(workflowRunsClient.invoke(context, { action: 'start', input: { proposition: 'x' } })).resolves.toEqual({
      runId: 'c1',
      status: 'queued',
    });
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(path).toBe('/workflows/invoke');
    expect(init.headers['x-organization-slug']).toBe('corporate');
    expect(JSON.parse(init.body as string).params).toEqual({
      context,
      data: { contentType: 'json', content: { action: 'start', input: { proposition: 'x' } } },
    });
  });

  it('refuses a response whose context differs from the one sent', async () => {
    apiFetch.mockResolvedValue({
      result: { success: true, output: { content: { runId: 'c1', status: 'queued' } }, context: { ...context, model: 'other' } },
    });
    await expect(workflowRunsClient.invoke(context, { action: 'cancel', runId: 'c1' })).rejects.toThrow(
      'different ExecutionContext',
    );
  });

  it("surfaces the workflow's error message", async () => {
    apiFetch.mockResolvedValue({ error: { code: -32600, message: 'An administrator has to choose the models' } });
    await expect(workflowRunsClient.invoke(context, { action: 'cancel', runId: 'c1' })).rejects.toThrow(
      'An administrator has to choose the models',
    );
  });
});
