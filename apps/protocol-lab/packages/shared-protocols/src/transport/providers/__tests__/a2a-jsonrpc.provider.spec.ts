import { A2AJsonRpcTransportProvider } from '../a2a-jsonrpc.provider';

describe('A2AJsonRpcTransportProvider', () => {
  it('sends A2A v0.3 headers and normalizes task states', async () => {
    const provider = new A2AJsonRpcTransportProvider();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: '1',
        result: { taskState: 'in_progress' },
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
      expect(options.headers['X-A2A-Version']).toBe('0.3');
      expect(options.headers['X-A2A-gRPC-Interop']).toBe('enabled');
      expect(response.result?.taskState).toBe('working');
      expect(response.result?.originalTaskState).toBe('in_progress');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
