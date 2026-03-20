/**
 * compose-api.service.spec.ts
 *
 * Unit tests for composeApiService.
 * All fetch calls are mocked — no real network traffic.
 *
 * Tests verify:
 * - Correct URLs and HTTP methods
 * - JSON-RPC 2.0 request envelope for sendMessage
 * - ExecutionContext is forwarded in request bodies
 * - Auth token is read from localStorage and sent as Authorization header
 * - Non-OK responses throw real errors (no silent failures)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// ─── Fixture ExecutionContext ─────────────────────────────────────────────────

const ctx: ExecutionContext = {
  orgSlug: 'acme',
  userId: 'user-001',
  conversationId: 'conv-abc',
  taskId: 'task-abc',
  planId: '00000000-0000-0000-0000-000000000000',
  deliverableId: '00000000-0000-0000-0000-000000000000',
  agentSlug: 'my-agent',
  agentType: 'compose',
  provider: 'openai',
  model: 'gpt-4o',
};

// ─── Mock fetch ───────────────────────────────────────────────────────────────

function makeOkResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function makeErrorResponse(status: number, statusText: string, body = '') {
  return Promise.resolve(
    new Response(body, {
      status,
      statusText,
    }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('composeApiService', () => {
  let fetchSpy: MockInstance<[input: string | URL | Request, init?: RequestInit], Promise<Response>>;

  beforeEach(() => {
    vi.resetModules();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      makeOkResponse({}),
    );
    // Clear localStorage token between tests
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function getService() {
    const mod = await import('@/services/compose-api.service');
    return mod.composeApiService;
  }

  // ─── fetchAgents ──────────────────────────────────────────────────────

  describe('fetchAgents', () => {
    it('GETs /agents without orgSlug when not provided', async () => {
      // API returns { status, agents: [...] }
      fetchSpy.mockImplementationOnce(() => makeOkResponse({ status: 'ok', agents: [] }));
      const svc = await getService();
      await svc.fetchAgents();
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/agents$/);
    });

    it('GETs /agents with x-organization-slug header when orgSlug is provided', async () => {
      fetchSpy.mockImplementationOnce(() => makeOkResponse({ status: 'ok', agents: [] }));
      const svc = await getService();
      await svc.fetchAgents('acme');
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      // Service passes orgSlug as header, not query param
      const headers = init.headers as Record<string, string>;
      expect(headers['x-organization-slug']).toBe('acme');
    });

    it('returns the parsed agent list', async () => {
      // API returns { status, agents: [...] } — service maps to ComposeAgent shape
      const rawAgents = [{ id: 'a1', name: 'Alpha', displayName: 'Alpha', type: 'compose', description: 'An agent' }];
      fetchSpy.mockImplementationOnce(() => makeOkResponse({ status: 'ok', agents: rawAgents }));
      const svc = await getService();
      const result = await svc.fetchAgents();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
      expect(result[0].slug).toBe('a1'); // service maps id -> slug
      expect(result[0].agentType).toBe('compose');
    });
  });

  // ─── fetchRunners ─────────────────────────────────────────────────────

  describe('fetchRunners', () => {
    it('GETs /runners', async () => {
      fetchSpy.mockImplementationOnce(() => makeOkResponse([]));
      const svc = await getService();
      await svc.fetchRunners();
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/runners$/);
    });

    it('returns the parsed runner list', async () => {
      const runners = [{ id: 'r1', name: 'Context runner', type: 'context' }];
      fetchSpy.mockImplementationOnce(() => makeOkResponse(runners));
      const svc = await getService();
      const result = await svc.fetchRunners();
      expect(result).toEqual(runners);
    });
  });

  // ─── sendMessage ──────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('POSTs to /agent-to-agent/:orgSlug/:agentSlug/tasks', async () => {
      fetchSpy.mockImplementationOnce(() =>
        makeOkResponse({ jsonrpc: '2.0', id: 'test-id', result: { context: ctx, payload: { content: 'Hi' } } }),
      );
      const svc = await getService();
      await svc.sendMessage('my-agent', {
        userMessage: 'Hello',
        context: ctx,
      });
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      // Service uses A2A endpoint format
      expect(url).toContain('/agent-to-agent/acme/my-agent/tasks');
    });

    it('sends a JSON-RPC 2.0 request envelope', async () => {
      fetchSpy.mockImplementationOnce(() =>
        makeOkResponse({ message: 'Hi', context: ctx }),
      );
      const svc = await getService();
      await svc.sendMessage('my-agent', {
        userMessage: 'Hello there',
        context: ctx,
      });

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);

      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('converse.send');
      expect(body.params.userMessage).toBe('Hello there');
      expect(body.params.context).toEqual(ctx);
      expect(body.params.mode).toBe('converse');
    });

    it('includes optional runners array in the payload when provided', async () => {
      fetchSpy.mockImplementationOnce(() =>
        makeOkResponse({ message: 'Hi', context: ctx }),
      );
      const svc = await getService();
      await svc.sendMessage('my-agent', {
        userMessage: 'Hello',
        context: ctx,
        runners: ['rag-runner', 'api-runner'],
      });

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.params.payload.runners).toEqual(['rag-runner', 'api-runner']);
    });

    it('uses POST method', async () => {
      fetchSpy.mockImplementationOnce(() =>
        makeOkResponse({ message: 'Hi', context: ctx }),
      );
      const svc = await getService();
      await svc.sendMessage('my-agent', { userMessage: 'Hi', context: ctx });

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
    });

    it('sets Content-Type to application/json', async () => {
      fetchSpy.mockImplementationOnce(() =>
        makeOkResponse({ message: 'Hi', context: ctx }),
      );
      const svc = await getService();
      await svc.sendMessage('my-agent', { userMessage: 'Hi', context: ctx });

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  // ─── fetchConversationHistory ─────────────────────────────────────────

  describe('fetchConversationHistory', () => {
    it('POSTs to /conversations/:id/history with the context', async () => {
      fetchSpy.mockImplementationOnce(() =>
        makeOkResponse({ messages: [], context: ctx }),
      );
      const svc = await getService();
      await svc.fetchConversationHistory('conv-001', ctx);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/conversations/conv-001/history');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.context).toEqual(ctx);
    });
  });

  // ─── savePipeline ─────────────────────────────────────────────────────

  describe('savePipeline', () => {
    it('POSTs to /pipelines with pipeline and context', async () => {
      const savedPipeline = { id: 'pipe-1', name: 'My Pipeline', runners: [], createdAt: '' };
      fetchSpy.mockImplementationOnce(() => makeOkResponse(savedPipeline));

      const svc = await getService();
      const pipeline = {
        name: 'My Pipeline',
        runners: [{ runnerId: 'r1' }],
      };
      const result = await svc.savePipeline(pipeline, ctx);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/pipelines');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.pipeline).toEqual(pipeline);
      expect(body.context).toEqual(ctx);
      expect(result).toEqual(savedPipeline);
    });
  });

  // ─── fetchPipelines ───────────────────────────────────────────────────

  describe('fetchPipelines', () => {
    it('GETs /pipelines with orgSlug and userId query params from context', async () => {
      fetchSpy.mockImplementationOnce(() => makeOkResponse([]));
      const svc = await getService();
      await svc.fetchPipelines(ctx);

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('orgSlug=acme');
      expect(url).toContain('userId=user-001');
    });
  });

  // ─── Auth token attachment ────────────────────────────────────────────

  describe('auth token', () => {
    it('attaches Bearer token from localStorage when present', async () => {
      localStorage.setItem('auth_token', 'test-token-123');
      // API returns { status, agents: [...] } shape
      fetchSpy.mockImplementationOnce(() => makeOkResponse({ status: 'ok', agents: [] }));
      const svc = await getService();
      await svc.fetchAgents();

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-token-123');
    });

    it('does not set Authorization header when no token is present', async () => {
      // Both localStorage and sessionStorage are empty
      fetchSpy.mockImplementationOnce(() => makeOkResponse({ status: 'ok', agents: [] }));
      const svc = await getService();
      await svc.fetchAgents();

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws a real Error when the response is non-OK (no silent failure)', async () => {
      fetchSpy.mockImplementationOnce(() => makeErrorResponse(500, 'Internal Server Error', 'DB error'));
      const svc = await getService();

      await expect(svc.fetchAgents()).rejects.toThrow('Compose API error 500');
    });

    it('throws an error containing the status code and body text', async () => {
      fetchSpy.mockImplementationOnce(() =>
        makeErrorResponse(404, 'Not Found', 'Agent not found'),
      );
      const svc = await getService();

      await expect(svc.fetchAgents('nonexistent')).rejects.toThrow('404');
    });
  });
});
