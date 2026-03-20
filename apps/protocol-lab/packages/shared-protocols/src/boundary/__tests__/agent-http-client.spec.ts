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

    const endpoint: AgentEndpoint = { baseUrl: 'http://localhost:6407', agent: 'prairie-ridge' };
    const client = new AgentHttpClient(endpoint);

    const result = await client.call('/prairie-ridge/services');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:6407/prairie-ridge/services',
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

    const endpoint: AgentEndpoint = { baseUrl: 'http://localhost:6408', agent: 'buildwell' };
    const client = new AgentHttpClient(endpoint);

    const body = { batchNumber: 'BN-2026-0221' };
    await client.call('/alloytech/quality/inspect', 'POST', body);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:6408/alloytech/quality/inspect',
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

    const endpoint: AgentEndpoint = { baseUrl: 'http://localhost:6407', agent: 'prairie-ridge' };
    const client = new AgentHttpClient(endpoint);

    await expect(client.call('/prairie-ridge/missing-endpoint')).rejects.toThrow(
      'Agent HTTP call failed: 404 http://localhost:6407/prairie-ridge/missing-endpoint',
    );
  });

  it('AgentEndpoint: prairieRidge resolves to port 6407', () => {
    const endpoint = AGENT_ENDPOINTS['prairie-ridge'];
    expect(endpoint).toBeDefined();
    expect(endpoint.baseUrl).toBe('http://localhost:6407');
    expect(endpoint.agent).toBe('prairie-ridge');
  });

  it('AgentEndpoint: buildwell resolves to port 6408', () => {
    const endpoint = AGENT_ENDPOINTS['buildwell'];
    expect(endpoint).toBeDefined();
    expect(endpoint.baseUrl).toBe('http://localhost:6408');
    expect(endpoint.agent).toBe('buildwell');
  });
});
