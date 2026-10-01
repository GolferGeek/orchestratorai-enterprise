import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify } from 'jose';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import type { A2AClientService } from './a2a-client.service';
import type { CallersRepository } from './callers.repository';
import { GatehouseKeysService } from './gatehouse-keys.service';
import { GatehouseReplyService, ReplyRefused } from './reply.service';

const PARTNER_CARD = 'https://partner.example/.well-known/agent-card.json';
const origin = { via: 'send-invoice', callerId: 'caller-1', contextId: 'their-ctx', taskId: 'task-1' };
const via = (callers: NonNullable<AgentDefinition['a2a']>['callers'] = 'any'): AgentDefinition => ({
  id: 'send-invoice', slug: 'send-invoice', name: 'Send invoice', version: '1.0.0', updatedAt: '2026-09-28T00:00:00.000Z', agentType: 'a2a', status: 'active', outputType: 'json',
  orgSlug: 'finance', a2a: { target: { kind: 'ambient', event: 'invoice.received' }, callers },
});

describe('a reply to a Gatehouse caller', () => {
  const callers = { byId: jest.fn() };
  const client = { sendMessage: jest.fn() };
  let keys: GatehouseKeysService;
  let replies: GatehouseReplyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    const jwk = JSON.stringify({ ...(await exportJWK(privateKey)), kid: 'g1' });
    keys = new GatehouseKeysService({ getRequired: () => jwk } as never);
    await keys.onModuleInit();
    replies = new GatehouseReplyService(callers as unknown as CallersRepository, client as unknown as A2AClientService, keys, {
      getRequired: () => 'https://enterprise.example',
    } as never);
    callers.byId.mockResolvedValue({ id: 'caller-1', name: 'Partner', cardUrl: PARTNER_CARD, status: 'active' });
  });

  it('is signed as the agent it came in on, continues their conversation and names their task', async () => {
    client.sendMessage.mockResolvedValue({ card: { name: 'Partner' }, reply: { state: 'completed', parts: [], taskId: 'their-task' } });
    expect(await replies.send(via(), 'finance', origin, [{ text: 'Approved' }])).toEqual({ caller: 'Partner', state: 'completed', taskId: 'their-task' });

    const [from, remote, parts, options] = client.sendMessage.mock.calls[0] as [unknown, { cardUrl: string }, unknown, { signAs: (aud: string) => Promise<string>; contextId: string; referenceTaskIds: string[] }];
    expect(from).toEqual({ orgSlug: 'finance', agentSlug: 'send-invoice', kind: 'reply', callerId: 'caller-1' });
    expect(remote).toEqual({ cardUrl: PARTNER_CARD });
    expect(parts).toEqual([{ text: 'Approved' }]);
    expect(options).toMatchObject({ contextId: 'their-ctx', referenceTaskIds: ['task-1'] });
    const token = await options.signAs('https://partner.example/a2a');
    const { payload, protectedHeader } = await jwtVerify(token, createLocalJWKSet(keys.jwks()), { audience: 'https://partner.example/a2a' });
    expect(payload.iss).toBe('https://enterprise.example/api/a2a/send-invoice/.well-known/agent-card.json');
    expect(protectedHeader.jku).toBe('https://enterprise.example/api/gatehouse/jwks.json');
  });

  it('refuses another agent, a caller gone or suspended, and one the agent no longer admits', async () => {
    await expect(replies.send({ ...via(), slug: 'other-agent' }, 'finance', origin, [{ text: 'x' }])).rejects.toThrow(ReplyRefused);
    callers.byId.mockResolvedValueOnce(null);
    await expect(replies.send(via(), 'finance', origin, [{ text: 'x' }])).rejects.toThrow('no longer registered');
    callers.byId.mockResolvedValueOnce({ id: 'caller-1', name: 'Partner', cardUrl: PARTNER_CARD, status: 'suspended' });
    await expect(replies.send(via(), 'finance', origin, [{ text: 'x' }])).rejects.toThrow('suspended');
    await expect(replies.send(via({ allow: ['https://someone-else.example/card'] }), 'finance', origin, [{ text: 'x' }])).rejects.toThrow('no longer takes calls');
    expect(client.sendMessage).not.toHaveBeenCalled();
  });
});
