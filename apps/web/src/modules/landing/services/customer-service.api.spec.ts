import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A guest session token shaped like the server's (a JWT); only `exp` is read by the client. */
function token(name: string, expiresInSeconds: number): string {
  const payload = btoa(JSON.stringify({ sub: name, exp: Math.floor(Date.now() / 1000) + expiresInSeconds }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${payload}.signature`;
}

const config = { ok: true, status: 200, json: async () => ({ provider: 'anthropic', model: 'claude-sonnet', orgSlug: 'acme' }) };
const sessionReply = (sessionToken: string, conversationId: string) => ({
  ok: true,
  status: 201,
  json: async () => ({ sessionToken, conversationId }),
});
const answer = (message: string) => ({ ok: true, status: 200, json: async () => ({ message }) });
const refused = { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) };

describe('customer service guest context boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    let uuidCounter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`),
    });
  });

  it('creates the complete guest context in the browser before requesting a session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          provider: 'anthropic',
          model: 'claude-sonnet',
          orgSlug: 'acme',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionToken: token('guest-1', 86400),
          conversationId: '00000000-0000-4000-8000-000000000003',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Welcome' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { sendCustomerServiceMessage } = await import('./customer-service.api');
    const result = await sendCustomerServiceMessage('Hello');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/customer-service/config');
    const sessionRequest = fetchMock.mock.calls[1];
    expect(sessionRequest[0]).toBe('/api/customer-service/session');
    expect(JSON.parse((sessionRequest[1] as RequestInit).body as string)).toEqual({
      context: {
        orgSlug: 'acme',
        userId: '00000000-0000-4000-8000-000000000002',
        conversationId: '00000000-0000-4000-8000-000000000003',
        agentSlug: 'customer-service',
        agentType: 'langgraph',
        provider: 'anthropic',
        model: 'claude-sonnet',
      },
    });
    expect(result).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      content: 'Welcome',
      sessionId: '00000000-0000-4000-8000-000000000003',
    });
  });

  it('fails closed when the server config names no organization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ provider: 'anthropic', model: 'claude-sonnet' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { sendCustomerServiceMessage } = await import('./customer-service.api');

    await expect(sendCustomerServiceMessage('Hello')).rejects.toThrow(
      'Customer service context config was malformed',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the server context route is malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ provider: 'anthropic' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { sendCustomerServiceMessage } = await import('./customer-service.api');

    await expect(sendCustomerServiceMessage('Hello')).rejects.toThrow(
      'Customer service context config was malformed',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replaces an expired stored session instead of sending it', async () => {
    localStorage.setItem(
      'oai_customer_service_session',
      JSON.stringify({ sessionToken: token('old', -60), conversationId: 'old-conversation', expiresAt: Date.now() - 60_000 }),
    );
    const fresh = token('new', 86400);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(sessionReply(fresh, 'new-conversation'))
      .mockResolvedValueOnce(answer('Hi again'));
    vi.stubGlobal('fetch', fetchMock);

    const { sendCustomerServiceMessage } = await import('./customer-service.api');
    const result = await sendCustomerServiceMessage('Hello');

    expect(result.sessionId).toBe('new-conversation');
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).toMatchObject({ Authorization: `GuestSession ${fresh}` });
    expect(JSON.parse(localStorage.getItem('oai_customer_service_session') as string).sessionToken).toBe(fresh);
  });

  it('drops a session stored by an older widget (no expiry) and starts a new one', async () => {
    localStorage.setItem('oai_customer_service_session', JSON.stringify({ sessionToken: 'opaque', conversationId: 'old-conversation' }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(sessionReply(token('new', 86400), 'new-conversation'))
      .mockResolvedValueOnce(answer('Hello'));
    vi.stubGlobal('fetch', fetchMock);

    const { sendCustomerServiceMessage } = await import('./customer-service.api');
    expect((await sendCustomerServiceMessage('Hello')).sessionId).toBe('new-conversation');
  });

  it('starts a new session once when the server refuses the current one (401)', async () => {
    localStorage.setItem(
      'oai_customer_service_session',
      JSON.stringify({ sessionToken: token('stale', 86400), conversationId: 'stale-conversation', expiresAt: Date.now() + 86_400_000 }),
    );
    const fresh = token('new', 86400);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(refused)
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(sessionReply(fresh, 'new-conversation'))
      .mockResolvedValueOnce(answer('Back again'));
    vi.stubGlobal('fetch', fetchMock);

    const { sendCustomerServiceMessage } = await import('./customer-service.api');
    const result = await sendCustomerServiceMessage('Hello');

    expect(result).toMatchObject({ content: 'Back again', sessionId: 'new-conversation' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('reports a second refusal instead of retrying forever', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(sessionReply(token('a', 86400), 'conversation-a'))
      .mockResolvedValueOnce(refused)
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(sessionReply(token('b', 86400), 'conversation-b'))
      .mockResolvedValueOnce(refused);
    vi.stubGlobal('fetch', fetchMock);

    const { sendCustomerServiceMessage } = await import('./customer-service.api');
    await expect(sendCustomerServiceMessage('Hello')).rejects.toThrow('Customer service request failed: 401');
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('tells the guest plainly when the organization has not set up customer service (503)', async () => {
    const notSetUp = {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ statusCode: 503, code: 'customer_service_not_configured', message: "This organization hasn't set up customer service yet." }),
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(sessionReply(token('a', 86400), 'conversation-a'))
      .mockResolvedValueOnce(notSetUp);
    vi.stubGlobal('fetch', fetchMock);

    const { sendCustomerServiceMessage, CustomerServiceNotSetUpError } = await import('./customer-service.api');
    const sent = sendCustomerServiceMessage('Hello');
    await expect(sent).rejects.toBeInstanceOf(CustomerServiceNotSetUpError);
    await expect(sent).rejects.toThrow("This organization hasn't set up customer service yet.");
  });

  it('still reports any other 503 as a failure', async () => {
    const down = { ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({ message: 'busy' }) };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(sessionReply(token('a', 86400), 'conversation-a'))
      .mockResolvedValueOnce(down);
    vi.stubGlobal('fetch', fetchMock);

    const { sendCustomerServiceMessage } = await import('./customer-service.api');
    await expect(sendCustomerServiceMessage('Hello')).rejects.toThrow('Customer service request failed: 503');
  });
});
