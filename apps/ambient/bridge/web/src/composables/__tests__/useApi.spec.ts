import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// --- Mocks declared before module imports ---

const mockGetAuthHeaders = vi.fn((): Record<string, string> => ({
  Authorization: 'Bearer test-token',
}));

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    accessToken: 'test-token',
    getAuthHeaders: mockGetAuthHeaders,
  }),
}));

import { useApi } from '../useApi';

// VITE_API_URL is resolved at module load time from the environment.
// The test environment may inject a different base (e.g. the auth port from
// the monorepo .env). Rather than hardcoding a base URL we assert that the
// called URL *ends with* the expected path.

describe('useApi — createClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockGetAuthHeaders.mockReturnValue({ Authorization: 'Bearer test-token' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Helper — builds a successful fetch response
  function okResponse(body: unknown) {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);
  }

  // Helper — builds an error fetch response
  function errorResponse(status: number, message: string) {
    return Promise.resolve({
      ok: false,
      status,
      text: () => Promise.resolve(message),
    } as Response);
  }

  // Helper — empty-body success (e.g. DELETE 204)
  function emptyResponse() {
    return Promise.resolve({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    } as Response);
  }

  describe('get', () => {
    it('makes a GET request whose URL ends with the given path', async () => {
      fetchMock.mockReturnValue(okResponse({ id: 1 }));
      const { bridgeApi } = useApi();

      await bridgeApi.get('/some/path');

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/some\/path$/);
      expect(opts.method).toBe('GET');
    });

    it('includes the Authorization header from authStore', async () => {
      fetchMock.mockReturnValue(okResponse({}));
      const { bridgeApi } = useApi();

      await bridgeApi.get('/path');

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });

    it('includes Content-Type application/json', async () => {
      fetchMock.mockReturnValue(okResponse({}));
      const { bridgeApi } = useApi();

      await bridgeApi.get('/path');

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('does not send a body on GET', async () => {
      fetchMock.mockReturnValue(okResponse({}));
      const { bridgeApi } = useApi();

      await bridgeApi.get('/path');

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(opts.body).toBeUndefined();
    });

    it('returns the parsed JSON response body', async () => {
      const payload = { agents: ['a', 'b'] };
      fetchMock.mockReturnValue(okResponse(payload));
      const { bridgeApi } = useApi();

      const result = await bridgeApi.get('/agents');

      expect(result).toEqual(payload);
    });

    it('returns undefined when the response body is empty', async () => {
      fetchMock.mockReturnValue(emptyResponse());
      const { bridgeApi } = useApi();

      const result = await bridgeApi.get('/empty');

      expect(result).toBeUndefined();
    });

    it('throws an error when response.ok is false', async () => {
      fetchMock.mockReturnValue(errorResponse(404, 'Not Found'));
      const { bridgeApi } = useApi();

      await expect(bridgeApi.get('/missing')).rejects.toThrow('API error 404: Not Found');
    });

    it('throws an error including status code for 500 responses', async () => {
      fetchMock.mockReturnValue(errorResponse(500, 'Internal Server Error'));
      const { bridgeApi } = useApi();

      await expect(bridgeApi.get('/crash')).rejects.toThrow('API error 500: Internal Server Error');
    });
  });

  describe('post', () => {
    it('makes a POST request whose URL ends with the given path', async () => {
      fetchMock.mockReturnValue(okResponse({ created: true }));
      const { bridgeApi } = useApi();

      await bridgeApi.post('/registry/agents/discover', { url: 'http://agent.test' });

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/registry\/agents\/discover$/);
      expect(opts.method).toBe('POST');
    });

    it('serialises the body as JSON', async () => {
      fetchMock.mockReturnValue(okResponse({}));
      const { bridgeApi } = useApi();
      const body = { url: 'http://agent.test', name: 'Test' };

      await bridgeApi.post('/agents', body);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(opts.body).toBe(JSON.stringify(body));
    });

    it('includes the Authorization header', async () => {
      fetchMock.mockReturnValue(okResponse({}));
      const { bridgeApi } = useApi();

      await bridgeApi.post('/agents', {});

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });

    it('works without a body argument', async () => {
      fetchMock.mockReturnValue(okResponse({ ok: true }));
      const { bridgeApi } = useApi();

      await bridgeApi.post('/ping');

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(opts.body).toBeUndefined();
    });

    it('returns the parsed JSON response', async () => {
      const created = { id: 'agent-42', status: 'online' };
      fetchMock.mockReturnValue(okResponse(created));
      const { bridgeApi } = useApi();

      const result = await bridgeApi.post('/agents', { url: 'x' });

      expect(result).toEqual(created);
    });

    it('throws when the server returns an error status', async () => {
      fetchMock.mockReturnValue(errorResponse(422, 'Unprocessable Entity'));
      const { bridgeApi } = useApi();

      await expect(bridgeApi.post('/agents', {})).rejects.toThrow('API error 422: Unprocessable Entity');
    });
  });

  describe('put', () => {
    it('makes a PUT request whose URL ends with the given path', async () => {
      fetchMock.mockReturnValue(okResponse({ updated: true }));
      const { bridgeApi } = useApi();

      await bridgeApi.put('/agents/agent-1', { name: 'Updated' });

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/agents\/agent-1$/);
      expect(opts.method).toBe('PUT');
    });

    it('serialises the body as JSON', async () => {
      fetchMock.mockReturnValue(okResponse({}));
      const { bridgeApi } = useApi();
      const body = { name: 'Updated Agent' };

      await bridgeApi.put('/agents/1', body);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(opts.body).toBe(JSON.stringify(body));
    });

    it('includes Authorization header', async () => {
      fetchMock.mockReturnValue(okResponse({}));
      const { bridgeApi } = useApi();

      await bridgeApi.put('/agents/1', {});

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });

    it('throws when server returns an error', async () => {
      fetchMock.mockReturnValue(errorResponse(409, 'Conflict'));
      const { bridgeApi } = useApi();

      await expect(bridgeApi.put('/agents/1', {})).rejects.toThrow('API error 409: Conflict');
    });
  });

  describe('del', () => {
    it('makes a DELETE request whose URL ends with the given path', async () => {
      fetchMock.mockReturnValue(emptyResponse());
      const { bridgeApi } = useApi();

      await bridgeApi.del('/registry/agents/agent-99');

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/registry\/agents\/agent-99$/);
      expect(opts.method).toBe('DELETE');
    });

    it('does not send a body on DELETE', async () => {
      fetchMock.mockReturnValue(emptyResponse());
      const { bridgeApi } = useApi();

      await bridgeApi.del('/agents/1');

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(opts.body).toBeUndefined();
    });

    it('includes Authorization header', async () => {
      fetchMock.mockReturnValue(emptyResponse());
      const { bridgeApi } = useApi();

      await bridgeApi.del('/agents/1');

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });

    it('returns undefined for empty response', async () => {
      fetchMock.mockReturnValue(emptyResponse());
      const { bridgeApi } = useApi();

      const result = await bridgeApi.del('/agents/1');

      expect(result).toBeUndefined();
    });

    it('throws when server returns an error', async () => {
      fetchMock.mockReturnValue(errorResponse(404, 'Agent not found'));
      const { bridgeApi } = useApi();

      await expect(bridgeApi.del('/agents/missing')).rejects.toThrow('API error 404: Agent not found');
    });
  });

  describe('auth header omitted when no token', () => {
    it('sends no Authorization header when getAuthHeaders returns empty object', async () => {
      mockGetAuthHeaders.mockReturnValue({});
      fetchMock.mockReturnValue(okResponse({}));
      const { bridgeApi } = useApi();

      await bridgeApi.get('/public');

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });
  });
});
