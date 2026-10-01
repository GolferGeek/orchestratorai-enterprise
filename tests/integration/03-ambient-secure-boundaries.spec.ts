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

describe('Ambient and messaging HTTP boundaries', () => {
  it('keeps the ambient agent card public', async () => {
    const response = await anonymous.raw('/ambient/.well-known/agent.json');
    expect(response.status).toBe(200);
  });

  it('requires authentication for the ambient event stream', async () => {
    const response = await anonymous.raw('/ambient/streaming/events');
    expect(response.status).toBe(401);
  });

  it('returns stable JSON-RPC validation errors for a malformed authenticated invoke', async () => {
    const response = await authenticated.raw('/ambient/invoke', {
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
  });

  it('rejects a context for another user', async () => {
    const context = await getExecutionContext();
    const response = await authenticated.raw('/ambient/invoke', {
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
  });

  it.each(['telegram', 'whatsapp'])(
    'fails closed for an unsigned %s webhook',
    async (channel) => {
      const response = await anonymous.raw(`/messaging/webhooks/${channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect([401, 503]).toContain(response.status);
    },
  );
});
