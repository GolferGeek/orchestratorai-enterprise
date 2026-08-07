import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

const getAccessToken = vi.fn();

vi.mock('@/services/tokenStorageService', () => ({
  tokenStorage: { getAccessToken },
}));

const context: ExecutionContext = Object.freeze({
  orgSlug: 'acme',
  userId: 'user-1',
  conversationId: 'conversation-1',
  agentSlug: 'writer',
  agentType: 'context',
  provider: 'anthropic',
  model: 'claude-sonnet',
});

describe('Agents API context and authentication boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('currentOrganization', 'acme');
    getAccessToken.mockResolvedValue('access-token');
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'request-1'),
    });
  });

  it('sends the canonical token and preserves the frontend context', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (_url, init: RequestInit) => {
        const request = JSON.parse(init.body as string) as { id: string };
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              success: true,
              output: { content: 'done', outputType: 'text' },
              context,
            },
          }),
        };
      });
    vi.stubGlobal('fetch', fetchMock);
    const { agentsApiService } = await import('./agents-api.service');

    const result = await agentsApiService.sendMessage('writer', {
      userMessage: 'hello',
      context,
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('x-organization-slug')).toBe('acme');
    expect(result.context).toBe(context);
  });

  it('rejects a response that attempts to replace the context capsule', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 'request-1',
          result: {
            success: true,
            output: { content: 'done', outputType: 'text' },
            context: { ...context, orgSlug: 'other-org' },
          },
        }),
      }),
    );
    const { agentsApiService } = await import('./agents-api.service');

    await expect(
      agentsApiService.sendMessage('writer', { userMessage: 'hello', context }),
    ).rejects.toThrow('attempted to replace ExecutionContext');
  });

  it('does not call protected endpoints without a canonical access token', async () => {
    getAccessToken.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { agentsApiService } = await import('./agents-api.service');

    await expect(agentsApiService.fetchAgents('acme')).rejects.toThrow(
      'Authentication is required',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves pipelines through the strict A2A invoke contract', async () => {
    const createdAt = '2026-08-06T12:00:00.000Z';
    const fetchMock = vi
      .fn()
      .mockImplementation(async (_url, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as {
          id: string;
          params: { context: ExecutionContext };
        };
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              success: true,
              output: {
                content: {
                  id: '10000000-0000-4000-8000-000000000001',
                  name: 'Research pipeline',
                  runners: [{ runnerId: 'context' }],
                  createdAt,
                },
                outputType: 'json',
              },
              context: body.params.context,
            },
          }),
        };
      });
    vi.stubGlobal('fetch', fetchMock);
    const { agentsApiService } = await import('./agents-api.service');

    await expect(
      agentsApiService.savePipeline(
        { name: 'Research pipeline', runners: [{ runnerId: 'context' }] },
        context,
      ),
    ).resolves.toMatchObject({
      id: '10000000-0000-4000-8000-000000000001',
      createdAt,
    });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/pipelines/invoke');
    const request = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(request).toEqual({
      jsonrpc: '2.0',
      id: 'request-1',
      method: 'invoke',
      params: {
        context,
        data: {
          content: {
            name: 'Research pipeline',
            runners: [{ runnerId: 'context' }],
          },
          contentType: 'json',
        },
      },
    });
  });

  it('never sends caller-controlled owner query parameters for pipeline lists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal('fetch', fetchMock);
    const { agentsApiService } = await import('./agents-api.service');

    await agentsApiService.fetchPipelines();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/pipelines');
  });
});
