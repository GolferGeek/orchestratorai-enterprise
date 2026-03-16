import { A2AJsonRpcTransportProvider } from '../a2a-jsonrpc.provider';

describe('A2AJsonRpcTransportProvider', () => {
  it('sends clean JSON-RPC 2.0 without proprietary extensions', async () => {
    const provider = new A2AJsonRpcTransportProvider();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: '1',
        result: { taskState: 'working' },
      }),
    });
    const originalFetch = global.fetch;
    global.fetch = mockFetch as typeof fetch;

    try {
      const response = await provider.send('http://example.com/a2a', {
        jsonrpc: '2.0',
        id: '1',
        method: 'task.execute',
        params: {},
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body as string);

      // Must NOT inject proprietary __a2a metadata into params
      expect(body.params.__a2a).toBeUndefined();

      // Must NOT add non-standard headers
      expect(options.headers['X-A2A-Version']).toBeUndefined();
      expect(options.headers['X-A2A-gRPC-Interop']).toBeUndefined();
      expect(options.headers['X-A2A-Protocol']).toBeUndefined();

      // Standard Content-Type header must be present
      expect(options.headers['Content-Type']).toBe('application/json');

      // Response is returned as-is (no state normalization)
      expect(response.result?.taskState).toBe('working');
      expect(response.result?.originalTaskState).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns JSON-RPC 2.0 error response on HTTP failure', async () => {
    const provider = new A2AJsonRpcTransportProvider();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });
    const originalFetch = global.fetch;
    global.fetch = mockFetch as typeof fetch;

    try {
      const response = await provider.send('http://example.com/a2a', {
        jsonrpc: '2.0',
        id: '2',
        method: 'task.execute',
        params: {},
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(503);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns JSON-RPC 2.0 error when response is not JSON-RPC 2.0', async () => {
    const provider = new A2AJsonRpcTransportProvider();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.0', data: 'not-jsonrpc' }),
    });
    const originalFetch = global.fetch;
    global.fetch = mockFetch as typeof fetch;

    try {
      const response = await provider.send('http://example.com/a2a', {
        jsonrpc: '2.0',
        id: '3',
        method: 'task.execute',
        params: {},
      });

      expect(response.error?.code).toBe(-32600);
      expect(response.error?.message).toContain('missing jsonrpc "2.0" field');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
