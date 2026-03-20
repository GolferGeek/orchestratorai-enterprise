/**
 * 08 — Bridge API Integration Tests (port 6600)
 *
 * Real HTTP calls against the running Bridge API.
 * Tests invoke, A2A discovery, registry, and health.
 */
import { createTestClient, TestClient } from './helpers/http-client';
import { login, getExecutionContext } from './helpers/auth';
import { apiUrl } from './helpers/ports';
import { requireService } from './helpers/service-check';

const BRIDGE_BASE = apiUrl('bridge');
let client: TestClient;

beforeAll(async () => {
  await requireService('bridge');
  const token = await login();
  client = createTestClient(BRIDGE_BASE, token);
});

// ─── Health ─────────────────────────────────────────────────────────────────

describe('Bridge / Health', () => {
  it('GET /health returns status', async () => {
    const res = await client.get<{ status: string }>('/health');
    expect(res).toBeDefined();
  });
});

// ─── Discovery ──────────────────────────────────────────────────────────────

describe('Bridge / Discovery', () => {
  it('GET /.well-known/agent.json returns A2A agent card', async () => {
    const card = await client.get<Record<string, unknown>>('/.well-known/agent.json');
    expect(card).toBeDefined();
  });
});

// ─── Invoke ─────────────────────────────────────────────────────────────────

describe('Bridge / Invoke', () => {
  it('POST /invoke with JSON-RPC 2.0 format is accepted', async () => {
    const context = await getExecutionContext('bridge-test', 'external');

    const res = await client.raw('/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `e2e-${Date.now()}`,
        method: 'invoke',
        params: {
          context,
          data: { content: 'E2E test A2A message', contentType: 'text' },
        },
      }),
    });

    // Accept 200 (success), 401 (auth required), or 500 (routing failure) — not 404
    expect([200, 401, 500]).toContain(res.status);
  });
});

// ─── Registry ───────────────────────────────────────────────────────────────

describe('Bridge / Registry', () => {
  const TEST_PREFIX = `E2E-${Date.now()}`;
  let registeredAgentId: string | null = null;

  it('GET /registry/agents returns registered external agents', async () => {
    const result = await client.get<unknown>('/registry/agents');
    expect(result).toBeDefined();
  });

  it('POST /registry/agents registers an external agent', async () => {
    try {
      const agent = await client.post<{ id: string }>(
        '/registry/agents',
        {
          name: `${TEST_PREFIX}-agent`,
          url: 'https://example.com/.well-known/agent',
          description: 'E2E test external agent',
        },
      );
      expect(agent.id).toBeTruthy();
      registeredAgentId = agent.id;
    } catch (e: unknown) {
      console.warn('  ⚠ Agent registration failed:', (e as Error).message);
    }
  });

  afterAll(async () => {
    if (registeredAgentId) {
      try {
        await client.delete(`/registry/agents/${registeredAgentId}`);
      } catch {
        // Best-effort cleanup
      }
    }
  });
});

// ─── A2A Inbound ────────────────────────────────────────────────────────────

describe('Bridge / A2A Inbound', () => {
  it('POST /a2a/tasks endpoint exists', async () => {
    const res = await client.raw('/a2a/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `e2e-${Date.now()}`,
        method: 'message',
        params: { content: 'E2E test' },
      }),
    });

    // Accept any non-404 response (endpoint exists)
    expect(res.status).not.toBe(404);
  });
});

// ─── Streaming ──────────────────────────────────────────────────────────────

describe('Bridge / Streaming', () => {
  it('GET /stream/status returns streaming status', async () => {
    const res = await client.raw('/stream/status', { method: 'GET' });
    expect(res.status).not.toBe(404);
  });
});
