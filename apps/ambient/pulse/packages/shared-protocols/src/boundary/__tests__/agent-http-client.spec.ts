import { AgentHttpClient, AgentEndpoint, AGENT_ENDPOINTS } from '../agent-http-client';

describe('AgentHttpClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET request: correct URL construction', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'result' }),
    });
    global.fetch = mockFetch as typeof fetch;

    const endpoint: AgentEndpoint = { baseUrl: 'http://localhost:4007', agent: 'sunstream' };
    const client = new AgentHttpClient(endpoint);

    const result = await client.call('/sunstream/services');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4007/sunstream/services',
      expect.objectContaining({
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: undefined,
      }),
    );
    expect(result).toEqual({ data: 'result' });
  });

  it('POST request: sends JSON body', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accepted: true }),
    });
    global.fetch = mockFetch as typeof fetch;

    const endpoint: AgentEndpoint = { baseUrl: 'http://localhost:4008', agent: 'ascentek' };
    const client = new AgentHttpClient(endpoint);

    const body = { batchNumber: 'BN-2026-0221' };
    await client.call('/lube-tech/quality/inspect', 'POST', body);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4008/lube-tech/quality/inspect',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  });

  it('Error: non-ok response throws with status and URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    global.fetch = mockFetch as typeof fetch;

    const endpoint: AgentEndpoint = { baseUrl: 'http://localhost:4007', agent: 'sunstream' };
    const client = new AgentHttpClient(endpoint);

    await expect(client.call('/sunstream/missing-endpoint')).rejects.toThrow(
      'Agent HTTP call failed: 404 http://localhost:4007/sunstream/missing-endpoint',
    );
  });

  it('AgentEndpoint: sunstream resolves to port 4007', () => {
    const endpoint = AGENT_ENDPOINTS['sunstream'];
    expect(endpoint).toBeDefined();
    expect(endpoint.baseUrl).toBe('http://localhost:4007');
    expect(endpoint.agent).toBe('sunstream');
  });

  it('AgentEndpoint: ascentek resolves to port 4008', () => {
    const endpoint = AGENT_ENDPOINTS['ascentek'];
    expect(endpoint).toBeDefined();
    expect(endpoint.baseUrl).toBe('http://localhost:4008');
    expect(endpoint.agent).toBe('ascentek');
  });
});
