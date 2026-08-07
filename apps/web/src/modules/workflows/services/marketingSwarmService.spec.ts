import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExecutionContextStore } from '@/modules/agents/stores/executionContextStore';
import type { SwarmConfig } from '@/modules/workflows/types/marketing-swarm';

const { getAccessToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}));
vi.mock('@/services/tokenStorageService', () => ({
  tokenStorage: { getAccessToken },
}));

import { marketingSwarmService } from './marketingSwarmService';

const config: SwarmConfig = {
  writers: [
    {
      agentSlug: 'writer',
      llmConfigId: 'ignored-by-transport',
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet',
      displayName: 'Writer',
    },
  ],
  editors: [
    {
      agentSlug: 'editor',
      llmConfigId: 'ignored-by-transport',
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet',
    },
  ],
  evaluators: [
    {
      agentSlug: 'evaluator',
      llmConfigId: 'ignored-by-transport',
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet',
    },
  ],
  maxEditCycles: 2,
  execution: {
    maxLocalConcurrent: 1,
    maxCloudConcurrent: 5,
    maxEditCycles: 2,
    topNForFinalRanking: 1,
    topNForDeliverable: 1,
  },
};

describe('Marketing Swarm web A2A boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('currentOrganization', 'acme');
    getAccessToken.mockResolvedValue('long-lived-access-token');
    setActivePinia(createPinia());
    let uuidCounter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(
        () =>
          `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
      ),
    });
  });

  it('starts the workflow with the strict JSON-RPC invoke contract', async () => {
    const contextStore = useExecutionContextStore();
    contextStore.initialize({
      orgSlug: 'acme',
      userId: 'user-1',
      conversationId: '00000000-0000-4000-8000-000000000099',
      agentSlug: 'marketing-swarm',
      agentType: 'workflow',
      provider: 'anthropic',
      model: 'claude-sonnet',
      taskId: '00000000-0000-4000-8000-000000000098',
    });
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);

    await marketingSwarmService.startSwarmExecution(
      'blog-post',
      {
        topic: 'Security',
        audience: 'Developers',
        goal: 'Explain',
        keyPoints: ['Ownership'],
        tone: 'Direct',
      },
      config,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/workflows/invoke');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual(
      expect.objectContaining({
        jsonrpc: '2.0',
        method: 'invoke',
      }),
    );
    const params = body.params as Record<string, unknown>;
    expect(params.context).toBeDefined();
    const data = params.data as Record<string, unknown>;
    const content = data.content as Record<string, unknown>;
    const sentConfig = content.config as Record<string, unknown>;
    expect(sentConfig).not.toHaveProperty('maxEditCycles');
    expect((sentConfig.writers as Array<Record<string, unknown>>)[0]).toEqual({
      agentSlug: 'writer',
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet',
    });
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer long-lived-access-token');
    expect(headers.get('x-organization-slug')).toBe('acme');
  });

  it('puts only a short-lived stream token in the EventSource URL', async () => {
    const contextStore = useExecutionContextStore();
    contextStore.initialize({
      orgSlug: 'acme',
      userId: 'user-1',
      conversationId: '00000000-0000-4000-8000-000000000099',
      agentSlug: 'marketing-swarm',
      agentType: 'workflow',
      provider: 'anthropic',
      model: 'claude-sonnet',
      taskId: '00000000-0000-4000-8000-000000000098',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'short-lived-stream-token',
        expiresAt: '2026-08-06T12:00:00.000Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const opened: string[] = [];
    class EventSourceMock {
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor(url: string) {
        opened.push(url);
      }
      addEventListener() {}
      removeEventListener() {}
      close() {}
    }
    vi.stubGlobal('EventSource', EventSourceMock);

    await marketingSwarmService.connectToSSEStream(
      '00000000-0000-4000-8000-000000000099',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workflows/stream-token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(opened[0]).toContain('/api/workflows/stream?');
    expect(opened[0]).toContain('short-lived-stream-token');
    expect(opened[0]).not.toContain('long-lived-access-token');
    marketingSwarmService.disconnectSSEStream();
  });
});
