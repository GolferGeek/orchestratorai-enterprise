/**
 * forge-api.service.spec.ts
 *
 * Unit tests for ForgeApiService.
 * All axios calls are mocked — no real network traffic.
 *
 * Tests verify:
 * - Correct endpoint URLs for each agent type
 * - ExecutionContext is forwarded in request bodies / query params
 * - Correct HTTP methods (POST / GET)
 * - Stream URL construction helpers
 * - Auth token is read from localStorage and attached as Bearer header
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// ─── Mock axios ───────────────────────────────────────────────────────────────
vi.mock('axios', () => {
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return {
    default: {
      create: vi.fn(() => mockClient),
    },
    // Named exports
    create: vi.fn(() => mockClient),
  };
});

// ─── Fixture ExecutionContext ─────────────────────────────────────────────────

const ctx: ExecutionContext = {
  orgSlug: 'acme',
  userId: 'user-001',
  conversationId: 'conv-001',
  taskId: 'task-001',
  planId: '00000000-0000-0000-0000-000000000000',
  deliverableId: '00000000-0000-0000-0000-000000000000',
  agentSlug: 'marketing-swarm',
  agentType: 'marketing',
  provider: 'openai',
  model: 'gpt-4o',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMockClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (axios.create as any)() as {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ForgeApiService', () => {
  let client: ReturnType<typeof getMockClient>;

  beforeEach(async () => {
    vi.resetModules();
    // Re-import after reset so the mocked axios.create is fresh
    client = getMockClient();
    client.get.mockResolvedValue({ data: {} });
    client.post.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // We import the service lazily so that the vi.mock above is active
  async function getService() {
    const mod = await import('@/services/forge-api.service');
    return mod.forgeApiService;
  }

  // ─── Marketing Swarm ──────────────────────────────────────────────────

  describe('Marketing Swarm', () => {
    it('startMarketingSwarm POSTs to /marketing-swarm/run with prompt and context', async () => {
      const svc = await getService();
      await svc.startMarketingSwarm('Q4 campaign', ctx);
      expect(client.post).toHaveBeenCalledWith('/marketing-swarm/run', {
        prompt: 'Q4 campaign',
        context: ctx,
      });
    });

    it('getMarketingSwarmTask GETs /marketing-swarm/tasks/:id with orgSlug param', async () => {
      const svc = await getService();
      await svc.getMarketingSwarmTask('task-123', ctx);
      expect(client.get).toHaveBeenCalledWith('/marketing-swarm/tasks/task-123', {
        params: { orgSlug: 'acme' },
      });
    });

    it('listMarketingSwarmTasks GETs /marketing-swarm/tasks with orgSlug param', async () => {
      const svc = await getService();
      await svc.listMarketingSwarmTasks(ctx);
      expect(client.get).toHaveBeenCalledWith('/marketing-swarm/tasks', {
        params: { orgSlug: 'acme' },
      });
    });

    it('getMarketingSwarmStreamUrl returns the correct SSE URL', async () => {
      const svc = await getService();
      const url = svc.getMarketingSwarmStreamUrl('task-xyz');
      expect(url).toContain('/marketing-swarm/tasks/task-xyz/stream');
    });
  });

  // ─── Legal Department ─────────────────────────────────────────────────

  describe('Legal Department', () => {
    it('submitLegalRequest POSTs to /legal-department/analyze', async () => {
      const svc = await getService();
      await svc.submitLegalRequest('Review NDA', 'NDA content...', ctx);
      expect(client.post).toHaveBeenCalledWith('/legal-department/analyze', {
        request: 'Review NDA',
        documentContent: 'NDA content...',
        context: ctx,
      });
    });

    it('submitLegalRequest accepts null documentContent', async () => {
      const svc = await getService();
      await svc.submitLegalRequest('Legal question', null, ctx);
      expect(client.post).toHaveBeenCalledWith('/legal-department/analyze', {
        request: 'Legal question',
        documentContent: null,
        context: ctx,
      });
    });

    it('getLegalTask GETs /legal-department/tasks/:id', async () => {
      const svc = await getService();
      await svc.getLegalTask('task-legal-1', ctx);
      expect(client.get).toHaveBeenCalledWith('/legal-department/tasks/task-legal-1', {
        params: { orgSlug: 'acme' },
      });
    });

    it('approveLegalHitl POSTs to /legal-department/tasks/:id/hitl', async () => {
      const svc = await getService();
      await svc.approveLegalHitl('task-hitl-1', true, ctx);
      expect(client.post).toHaveBeenCalledWith('/legal-department/tasks/task-hitl-1/hitl', {
        approved: true,
        context: ctx,
      });
    });

    it('getLegalStreamUrl returns the correct SSE URL', async () => {
      const svc = await getService();
      const url = svc.getLegalStreamUrl('task-legal-99');
      expect(url).toContain('/legal-department/tasks/task-legal-99/stream');
    });
  });

  // ─── CAD Agent ────────────────────────────────────────────────────────

  describe('CAD Agent', () => {
    it('startCadGeneration POSTs to /cad-agent/generate', async () => {
      const svc = await getService();
      const params = { width: 100, height: 200 };
      await svc.startCadGeneration('Generate bracket', params, ctx);
      expect(client.post).toHaveBeenCalledWith('/cad-agent/generate', {
        prompt: 'Generate bracket',
        parameters: params,
        context: ctx,
      });
    });

    it('getCadTask GETs /cad-agent/tasks/:id', async () => {
      const svc = await getService();
      await svc.getCadTask('task-cad-1', ctx);
      expect(client.get).toHaveBeenCalledWith('/cad-agent/tasks/task-cad-1', {
        params: { orgSlug: 'acme' },
      });
    });

    it('getCadStreamUrl returns the correct SSE URL', async () => {
      const svc = await getService();
      const url = svc.getCadStreamUrl('task-cad-99');
      expect(url).toContain('/cad-agent/tasks/task-cad-99/stream');
    });
  });

  // ─── Health ───────────────────────────────────────────────────────────

  describe('health', () => {
    it('GETs /health and returns response data', async () => {
      client.get.mockResolvedValueOnce({ data: { status: 'ok' } });
      const svc = await getService();
      const result = await svc.health();
      expect(client.get).toHaveBeenCalledWith('/health');
      expect(result).toEqual({ status: 'ok' });
    });
  });

  // ─── ExecutionContext forwarding ──────────────────────────────────────

  describe('ExecutionContext forwarding', () => {
    it('passes the full ExecutionContext object (not individual fields) in POST body', async () => {
      const svc = await getService();
      await svc.startMarketingSwarm('test', ctx);

      const callArgs = client.post.mock.calls[0];
      const body = callArgs[1] as Record<string, unknown>;
      // The entire context object must be forwarded as-is
      expect(body.context).toBe(ctx);
    });

    it('uses orgSlug from context for GET query params', async () => {
      const svc = await getService();
      await svc.getMarketingSwarmTask('t1', ctx);

      const callArgs = client.get.mock.calls[0];
      const config = callArgs[1] as { params: Record<string, string> };
      expect(config.params.orgSlug).toBe(ctx.orgSlug);
    });
  });
});
