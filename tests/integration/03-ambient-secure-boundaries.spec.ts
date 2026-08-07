import { createTestClient, TestClient } from './helpers/http-client';
import { getExecutionContext, login } from './helpers/auth';
import { apiUrl } from './helpers/ports';
import { requireService } from './helpers/service-check';

const BASE_URL = apiUrl('platform');
let authenticated: TestClient;
let anonymous: TestClient;

beforeAll(async () => {
  await requireService('platform');
  anonymous = createTestClient(BASE_URL);
  authenticated = createTestClient(BASE_URL, await login());
});

describe('Ambient and Secure Conversations HTTP boundaries', () => {
  it.each([
    '/ambient/.well-known/agent.json',
    '/secure-conversations/.well-known/agent.json',
    '/secure-conversations/health',
  ])('keeps intended discovery or health endpoint public: %s', async (path) => {
    const response = await anonymous.raw(path);
    expect(response.status).toBe(200);
  });

  it.each([
    '/ambient/streaming/events',
    '/secure-conversations/stream/status',
    '/secure-conversations/registry/agents',
    '/secure-conversations/a2a/messages',
  ])('requires authentication: %s', async (path) => {
    const response = await anonymous.raw(path);
    expect(response.status).toBe(401);
  });

  it('allows an authenticated caller to read stream status', async () => {
    const context = await getExecutionContext();
    const response = await authenticated.raw(
      `/secure-conversations/stream/status?organizationSlug=${encodeURIComponent(context.orgSlug)}`,
    );
    expect(response.status).toBe(200);
  });

  it('does not allow an unscoped authenticated stream subscription', async () => {
    const response = await authenticated.raw(
      '/secure-conversations/stream/status',
    );
    expect([400, 403]).toContain(response.status);
  });

  it.each(['/ambient/invoke', '/secure-conversations/invoke'])(
    'returns stable JSON-RPC validation errors for malformed authenticated invokes: %s',
    async (path) => {
      const response = await authenticated.raw(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32602 },
      });
    },
  );

  it.each(['/ambient/invoke', '/secure-conversations/invoke'])(
    'rejects a context for another user: %s',
    async (path) => {
      const context = await getExecutionContext();
      const response = await authenticated.raw(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Slug': context.orgSlug,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'identity-spoof',
          method: 'invoke',
          params: {
            context: { ...context, userId: 'another-user' },
            data: { content: 'hello' },
          },
        }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: -32602,
          message: expect.stringContaining('authenticated user'),
        },
      });
    },
  );

  it('rejects malformed public A2A requests without routing', async () => {
    const response = await anonymous.raw(
      '/secure-conversations/a2a/tasks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: -32600 },
    });
  });

  it('rejects an untrusted A2A origin without reflecting the origin', async () => {
    const response = await anonymous.raw(
      '/secure-conversations/a2a/tasks',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://sensitive-attacker-origin.example',
          'X-Agent-Id': 'attacker',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'origin-probe',
          method: 'invoke',
          params: {},
        }),
      },
    );
    const result = (await response.json()) as {
      error: { code: number; message: string };
    };
    expect(result.error.code).toBe(-32003);
    expect(result.error.message).not.toContain('sensitive-attacker-origin');
  });

  it.each(['telegram', 'whatsapp'])(
    'fails closed for an unsigned %s webhook',
    async (channel) => {
      const response = await anonymous.raw(
        `/secure-conversations/webhooks/${channel}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      expect([401, 503]).toContain(response.status);
    },
  );

  it('blocks loopback agent discovery unless private networks are explicitly enabled', async () => {
    if (process.env.SECURE_CONVERSATIONS_ALLOW_PRIVATE_NETWORKS === 'true') {
      return;
    }
    const context = await getExecutionContext();
    const response = await authenticated.raw(
      '/secure-conversations/registry/agents/discover',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Slug': context.orgSlug,
        },
        body: JSON.stringify({ url: 'http://127.0.0.1:6700' }),
      },
    );
    expect(response.status).toBe(503);
  });
});
