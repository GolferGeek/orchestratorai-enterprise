import { beforeEach, describe, expect, it, vi } from 'vitest';

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
        json: async () => ({ provider: 'anthropic', model: 'claude-sonnet' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionToken: 'signed-token',
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
        orgSlug: 'public',
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
});
