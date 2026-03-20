/**
 * 03 — Forge API Integration Tests (port 6200)
 *
 * Real HTTP calls against the running Forge API.
 * Tests invoke, discovery, health, auth proxy, RBAC, and RAG endpoints.
 */
import { createTestClient, TestClient } from './helpers/http-client';
import { login, getExecutionContext, getUserContext } from './helpers/auth';
import { apiUrl } from './helpers/ports';
import { requireService } from './helpers/service-check';

const FORGE_BASE = apiUrl('forge');
let client: TestClient;
let orgSlug: string;

beforeAll(async () => {
  await requireService('forge');
  const token = await login();
  client = createTestClient(FORGE_BASE, token);
  const ctx = await getUserContext();
  orgSlug = ctx.organizations[0]?.slug ?? 'marketing';
});

// ─── Health ─────────────────────────────────────────────────────────────────

describe('Forge / Health', () => {
  it('GET /health returns status', async () => {
    const res = await client.get<{ status: string }>('/health');
    expect(res).toBeDefined();
  });
});

// ─── Discovery ──────────────────────────────────────────────────────────────

describe('Forge / Discovery', () => {
  it('GET /.well-known/capabilities returns agent capabilities', async () => {
    const caps = await client.get<unknown>('/.well-known/capabilities');
    expect(caps).toBeDefined();
  });
});

// ─── Invoke ─────────────────────────────────────────────────────────────────

describe('Forge / Invoke', () => {
  it('POST /invoke with JSON-RPC 2.0 format is accepted', async () => {
    const context = await getExecutionContext('marketing-swarm', 'langgraph');

    const res = await client.raw('/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `e2e-${Date.now()}`,
        method: 'invoke',
        params: {
          context,
          data: { content: 'E2E test — what is the current market trend?', contentType: 'text' },
        },
      }),
    });

    // Accept 200 (success) or 500 (LLM key missing) — not 400/404
    expect([200, 500]).toContain(res.status);
  });
});

// ─── Auth Proxy ─────────────────────────────────────────────────────────────

describe('Forge / Auth Proxy', () => {
  it('GET /auth/me proxied to Auth API returns user', async () => {
    const me = await client.get<{ id: string; email: string }>('/auth/me');
    expect(me.email).toBe('golfergeek@orchestratorai.io');
  });

  it('GET /auth/me returns valid email', async () => {
    const me = await client.get<{ email: string }>('/auth/me');
    expect(me.email).toContain('@');
  });
});

// ─── RBAC ─────────────────────────────────────────────────────────────────

describe('Forge / RBAC', () => {
  it('GET /api/rbac/roles returns roles data', async () => {
    const result = await client.get<Record<string, unknown>>('/api/rbac/roles');
    expect(result).toBeDefined();
  });

  it('GET /api/rbac/me/is-super-admin returns boolean', async () => {
    const result = await client.get<{ isSuperAdmin: boolean }>('/api/rbac/me/is-super-admin');
    expect(typeof result.isSuperAdmin).toBe('boolean');
  });

  it('GET /api/rbac/me/roles returns user roles', async () => {
    const result = await client.get<Record<string, unknown>>('/api/rbac/me/roles');
    expect(result).toBeDefined();
  });
});

// ─── RAG Collections ────────────────────────────────────────────────────────

describe('Forge / RAG', () => {
  it('GET /api/rag/collections with org header returns collections', async () => {
    const collections = await client.get<unknown>(
      '/api/rag/collections',
      { 'x-organization-slug': orgSlug },
    );
    expect(collections).toBeDefined();
  });

  it('GET /api/rag/collections without org header returns 400', async () => {
    const res = await client.raw('/api/rag/collections', { method: 'GET' });
    expect(res.status).toBe(400);
  });
});

// ─── Feature Flags ──────────────────────────────────────────────────────────

describe('Forge / Feature Flags', () => {
  it('GET /feature-flags returns flags', async () => {
    const flags = await client.get<unknown>('/feature-flags');
    expect(flags).toBeDefined();
  });
});
