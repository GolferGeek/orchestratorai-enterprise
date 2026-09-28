import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import type { AmbientEventsService } from '../ambient/events/ambient-events.service';
import { A2AClientService } from './a2a-client.service';
import { A2AFamilyRunner, messageParts, replyOutput } from './a2a-family.runner';
import { parseAgentCard, parseSendMessageResponse } from './a2a-v1';

const CARD_URL = 'https://partner.example/.well-known/agent-card.json';
const v1Card = {
  name: 'Partner',
  description: 'A partner agent',
  supportedInterfaces: [
    { url: 'https://partner.example/grpc', protocolBinding: 'GRPC', protocolVersion: '1.0' },
    { url: 'https://partner.example/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
  ],
  skills: [{ id: 'search', name: 'Search', description: 'Searches', tags: [] }],
};
const answer = (id: string, result: unknown) => ({ jsonrpc: '2.0', id, result });

describe('A2A v1.0 parsing', () => {
  it('reads a v1.0 card and picks its JSONRPC interface', () => {
    expect(parseAgentCard(v1Card, CARD_URL)).toEqual({
      name: 'Partner',
      description: 'A partner agent',
      url: 'https://partner.example/a2a',
      skills: [{ id: 'search', name: 'Search' }],
    });
  });

  it('refuses v0.3 cards and plain-http interfaces', () => {
    const v03 = { name: 'Old', description: 'd', url: 'https://old.example/a2a', protocolVersion: '0.3', skills: [] };
    expect(() => parseAgentCard(v03, CARD_URL)).toThrow('only A2A v1.0');
    const http = { ...v1Card, supportedInterfaces: [{ url: 'http://partner.example/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }] };
    expect(() => parseAgentCard(http, CARD_URL)).toThrow('https');
    const v03Only = { ...v1Card, supportedInterfaces: [{ url: 'https://partner.example/a2a', protocolBinding: 'JSONRPC', protocolVersion: '0.3' }] };
    expect(() => parseAgentCard(v03Only, CARD_URL)).toThrow('A2A 1.x');
  });

  it('reads a direct message answer and a task with artifacts', () => {
    expect(parseSendMessageResponse(answer('r1', { message: { contextId: 'c1', parts: [{ data: { total: 2 }, mediaType: 'application/json' }] } }), 'r1', 'P')).toEqual({
      state: 'completed',
      parts: [{ data: { total: 2 }, mediaType: 'application/json' }],
      contextId: 'c1',
    });
    const task = { id: 't1', contextId: 'c1', status: { state: 'TASK_STATE_COMPLETED' }, artifacts: [{ artifactId: 'a', parts: [{ text: 'done' }] }] };
    expect(parseSendMessageResponse(answer('r1', { task }), 'r1', 'P')).toEqual({ state: 'completed', parts: [{ text: 'done' }], taskId: 't1', contextId: 'c1' });
    const asking = { id: 't2', status: { state: 'TASK_STATE_INPUT_REQUIRED', message: { parts: [{ text: 'Which year?' }] } } };
    expect(parseSendMessageResponse(answer('r1', { task: asking }), 'r1', 'P')).toMatchObject({ state: 'input-required', parts: [{ text: 'Which year?' }] });
  });

  it('fails on an error, another request id, an unknown state, or a file part', () => {
    expect(() => parseSendMessageResponse({ jsonrpc: '2.0', id: 'r1', error: { code: -32601, message: 'Method not found' } }, 'r1', 'P')).toThrow('-32601: Method not found');
    expect(() => parseSendMessageResponse(answer('r2', { message: { parts: [] } }), 'r1', 'P')).toThrow('different request id');
    expect(() => parseSendMessageResponse(answer('r1', { task: { id: 't', status: { state: 'done' } } }), 'r1', 'P')).toThrow('unknown task state');
    expect(() => parseSendMessageResponse(answer('r1', { message: { parts: [{ url: 'https://x/f.pdf' }] } }), 'r1', 'P')).toThrow('file parts');
    expect(() => parseSendMessageResponse(answer('r1', {}), 'r1', 'P')).toThrow('neither message nor task');
  });
});

describe('the outbound A2A client', () => {
  const outboundUrls = { assertSafe: jest.fn(async (url: string) => new URL(url)) };
  const config = { getRequired: jest.fn(() => 'tok-1') };
  const fetchMock = jest.fn();
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('checks both URLs, sends SendMessage with the v1.0 header and the named secret, and caches the card', async () => {
    const client = new A2AClientService(outboundUrls as never, config as never);
    fetchMock.mockImplementation(async (url: URL, init?: RequestInit) => {
      if (url.href === CARD_URL) return json(v1Card);
      const body = JSON.parse(String(init?.body)) as { id: string };
      return json(answer(body.id, { message: { parts: [{ text: 'hi' }] } }));
    });
    const remote = { cardUrl: CARD_URL, auth: { type: 'bearer' as const, secret: 'PARTNER_TOKEN' } };

    const { reply } = await client.sendMessage('A2A agent p', remote, [{ text: 'hello' }]);
    await client.sendMessage('A2A agent p', remote, [{ text: 'again' }]);

    expect(reply).toEqual({ state: 'completed', parts: [{ text: 'hi' }] });
    expect(outboundUrls.assertSafe).toHaveBeenCalledWith(CARD_URL);
    expect(outboundUrls.assertSafe).toHaveBeenCalledWith('https://partner.example/a2a');
    expect(fetchMock.mock.calls.filter(([url]) => (url as URL).href === CARD_URL)).toHaveLength(1);
    const [, init] = fetchMock.mock.calls.find(([url]) => (url as URL).href === 'https://partner.example/a2a') as [URL, RequestInit];
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(init.headers).toMatchObject({ 'A2A-Version': '1.0', Authorization: 'Bearer tok-1' });
    expect(JSON.parse(String(init.body))).toMatchObject({ method: 'SendMessage', params: { message: { role: 'ROLE_USER', parts: [{ text: 'hello' }] } } });
    expect(config.getRequired).toHaveBeenCalledWith('PARTNER_TOKEN');
  });

  it('sends nothing when a URL is refused, and reports a non-200 answer', async () => {
    const client = new A2AClientService(outboundUrls as never, config as never);
    outboundUrls.assertSafe.mockRejectedValueOnce(new Error('private network rejected'));
    await expect(client.sendMessage('o', { cardUrl: CARD_URL }, [{ text: 'x' }])).rejects.toThrow('private network rejected');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(json(v1Card)).mockResolvedValueOnce(json({ oops: true }, 502));
    await expect(client.sendMessage('o', { cardUrl: CARD_URL }, [{ text: 'x' }])).rejects.toThrow('Partner returned HTTP 502');
  });
});

describe('the a2a family runner', () => {
  const context = createMockExecutionContext({ orgSlug: 'finance', agentSlug: 'send-invoice', agentType: 'a2a' });
  const definition = (target: NonNullable<AgentDefinition['a2a']>['target']): AgentDefinition => ({
    id: 'send-invoice',
    slug: 'send-invoice',
    name: 'Send invoice',
    agentType: 'a2a',
    status: 'active',
    outputType: 'text',
    a2a: { target },
  });
  const events = { push: jest.fn() };
  const client = { sendMessage: jest.fn() };
  const runner = new A2AFamilyRunner(client as unknown as A2AClientService, events as unknown as AmbientEventsService);

  beforeEach(() => jest.clearAllMocks());

  it('pushes the event for an ambient target and answers only "received"', async () => {
    events.push.mockResolvedValue({ event: { id: 'e-1', name: 'invoice.received' }, duplicate: false });
    const output = await runner.invoke(definition({ kind: 'ambient', event: 'invoice.received' }), context, {
      content: { message: 'Invoice INV-7 attached', invoiceNumber: 'INV-7' },
    });
    expect(events.push).toHaveBeenCalledWith('finance', {
      name: 'invoice.received',
      payload: { message: 'Invoice INV-7 attached', data: { invoiceNumber: 'INV-7' } },
      source: 'a2a:send-invoice',
    });
    expect(output).toMatchObject({ outputType: 'json', content: { status: 'received', eventId: 'e-1', duplicate: false } });
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('returns a remote agent\'s completed answer, and fails on any other state', async () => {
    const target = { kind: 'a2a' as const, cardUrl: CARD_URL };
    client.sendMessage.mockResolvedValueOnce({ card: { name: 'Partner' }, reply: { state: 'completed', parts: [{ data: { total: 1 } }], contextId: 'c1' } });
    expect(await runner.invoke(definition(target), context, { content: 'AE86' })).toEqual({
      content: { total: 1 },
      outputType: 'json',
      metadata: { a2a: { target: 'a2a', agent: 'Partner', state: 'completed', contextId: 'c1' } },
    });
    expect(client.sendMessage).toHaveBeenCalledWith('A2A agent send-invoice', target, [{ text: 'AE86' }]);

    client.sendMessage.mockResolvedValueOnce({ card: { name: 'Partner' }, reply: { state: 'input-required', parts: [{ text: 'Which year?' }] } });
    await expect(runner.invoke(definition(target), context, { content: 'AE86' })).rejects.toThrow('Partner: it answered input-required (Which year?)');
    client.sendMessage.mockResolvedValueOnce({ card: { name: 'Partner' }, reply: { state: 'working', parts: [], taskId: 't' } });
    await expect(runner.invoke(definition(target), context, { content: 'AE86' })).rejects.toThrow('following a task is not supported yet');
  });

  it('builds parts from a message, and refuses attachments or nothing', () => {
    expect(messageParts('a', { content: 'hi' })).toEqual([{ text: 'hi' }]);
    expect(messageParts('a', { content: { message: 'hi', attachments: [] } })).toEqual([{ text: 'hi' }]);
    expect(messageParts('a', { content: { year: 1983 } })).toEqual([{ data: { year: 1983 }, mediaType: 'application/json' }]);
    expect(() => messageParts('a', { content: { message: 'x', attachments: [{ filename: 'f.pdf' }] } })).toThrow('attachments');
    expect(() => messageParts('a', { content: '  ' })).toThrow('needs a message');
    expect(() => messageParts('a', { content: {} })).toThrow('needs a message');
  });

  it('reads text as text and a single data part as its JSON', () => {
    expect(replyOutput([{ text: 'a' }, { text: 'b' }], 'P')).toEqual({ content: 'a\n\nb', outputType: 'text' });
    expect(replyOutput([{ text: 'a' }, { data: 1 }], 'P')).toEqual({ content: { parts: [{ text: 'a' }, { data: 1 }] }, outputType: 'json' });
    expect(() => replyOutput([], 'P')).toThrow('answered with nothing');
  });
});
