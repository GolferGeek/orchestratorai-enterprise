import { JevMcpClient, JevMcpError } from './jev-mcp.client';

const result = { rubric: 'citation-in-record', version: 2, decision: 'pass', answers: {}, model: 'readout/corroborate-poe', usage: { input_tokens: 10, output_tokens: 0 } };
const envelope = (text: string, isError = false) => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { isError, content: [{ text }] } });

describe('JevMcpClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls jev_check with the bearer token and reads a JSON or SSE answer', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(envelope(JSON.stringify(result))));
    const client = new JevMcpClient({ url: 'http://jev/mcp', token: 't' });
    await expect(client.check('citation-in-record', { claim: 'a', record: 'b' })).resolves.toEqual(result);
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer t');
    expect(JSON.parse(init!.body as string).params).toEqual({ name: 'jev_check', arguments: { rubric: 'citation-in-record', inputs: { claim: 'a', record: 'b' } } });
    expect(JevMcpClient.parse(`event: message\ndata: ${envelope('{"ok":true}')}\n`)).toEqual({ ok: true });
    // A tool error from Jev itself says so, rather than passing on a bare "fetch failed".
    expect(() => JevMcpClient.parse(envelope('fetch failed', true))).toThrow('Jev failed: fetch failed');
    expect(() => JevMcpClient.parse(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'Unknown tool' } }))).toThrow('Jev MCP error: Unknown tool');
  });

  it('surfaces a tool error, an HTTP error and an unreachable server', async () => {
    const client = new JevMcpClient({ url: 'http://jev/mcp', token: 't' });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(envelope('Unknown rubric', true)));
    await expect(client.check('nope', {})).rejects.toThrow('Unknown rubric');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    await expect(client.check('x', {})).rejects.toMatchObject({ status: 401 });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(envelope('{"decision":"maybe"}')));
    await expect(client.check('x', {})).rejects.toThrow('unreadable verdict');
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(client.check('x', {})).rejects.toBeInstanceOf(JevMcpError);
  });
});
