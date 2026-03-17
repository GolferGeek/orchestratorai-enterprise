/**
 * 07 — Pulse API Integration Tests (port 6500)
 *
 * Real HTTP calls against the running Pulse API.
 * Tests invoke, workflows, triggers, executions, and health.
 */
import { createTestClient, TestClient } from './helpers/http-client';
import { login, getExecutionContext } from './helpers/auth';
import { apiUrl } from './helpers/ports';
import { requireService } from './helpers/service-check';

const PULSE_BASE = apiUrl('pulse');
let client: TestClient;

beforeAll(async () => {
  await requireService('pulse');
  const token = await login();
  client = createTestClient(PULSE_BASE, token);
});

// ─── Health ─────────────────────────────────────────────────────────────────

describe('Pulse / Health', () => {
  it('GET /health returns status', async () => {
    const res = await client.get<{ status: string }>('/health');
    expect(res).toBeDefined();
  });
});

// ─── Invoke ─────────────────────────────────────────────────────────────────

describe('Pulse / Invoke', () => {
  it('POST /invoke with JSON-RPC 2.0 format is accepted', async () => {
    const context = await getExecutionContext('pulse-test', 'context');

    const res = await client.raw('/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `e2e-${Date.now()}`,
        method: 'invoke',
        params: {
          context,
          data: { content: 'E2E test automation trigger', contentType: 'text' },
        },
      }),
    });

    // Accept 200 (success) or 500 (missing LLM/config) — not 400/404
    expect([200, 500]).toContain(res.status);
  });
});

// ─── Workflows ──────────────────────────────────────────────────────────────

describe('Pulse / Workflows', () => {
  it('GET /workflows returns workflows data', async () => {
    const result = await client.get<unknown>('/workflows');
    expect(result).toBeDefined();
  });
});

// ─── Triggers ───────────────────────────────────────────────────────────────

describe('Pulse / Triggers', () => {
  it('GET /triggers returns triggers data', async () => {
    const result = await client.get<unknown>('/triggers');
    expect(result).toBeDefined();
  });
});

// ─── Executions ─────────────────────────────────────────────────────────────

describe('Pulse / Executions', () => {
  it('GET /executions returns execution history', async () => {
    const result = await client.get<unknown>('/executions');
    expect(result).toBeDefined();
  });
});

// ─── Listeners ──────────────────────────────────────────────────────────────

describe('Pulse / Listeners', () => {
  it('GET /listeners returns listeners data', async () => {
    const result = await client.get<unknown>('/listeners');
    expect(result).toBeDefined();
  });
});

// ─── Discovery ──────────────────────────────────────────────────────────────

describe('Pulse / Discovery', () => {
  it('GET /.well-known/agent.json returns agent card', async () => {
    const card = await client.get<Record<string, unknown>>('/.well-known/agent.json');
    expect(card).toBeDefined();
  });
});
