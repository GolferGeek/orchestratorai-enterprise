import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import type { A2AClientService } from './a2a-client.service';
import { PartnerCallsService } from './partner-calls.service';

const CARD = 'https://partner.example/.well-known/agent-card.json';
const agent = (target: NonNullable<AgentDefinition['a2a']>['target'], agentType: AgentDefinition['agentType'] = 'a2a'): AgentDefinition => ({
  id: 'vendor-registry', slug: 'vendor-registry', name: 'Vendor registry', version: '1.0.0', updatedAt: '2026-10-01T00:00:00.000Z',
  agentType, status: 'active', outputType: 'json', a2a: { target, callers: 'any' },
});

describe('PartnerCallsService', () => {
  const context = createMockExecutionContext({ orgSlug: 'finance', agentSlug: 'invoice-review' });
  const client = { sendMessage: jest.fn() };
  const definitions = { resolve: jest.fn() };
  const partners = new PartnerCallsService(client as unknown as A2AClientService, definitions as unknown as AgentDefinitionService);

  beforeEach(() => jest.clearAllMocks());

  it('is available only for an active A2A agent that forwards to a partner', async () => {
    definitions.resolve.mockResolvedValueOnce(agent({ kind: 'a2a', cardUrl: CARD, send: 'all' }));
    expect(await partners.available(context, 'vendor-registry')).toBe(true);
    definitions.resolve.mockResolvedValueOnce(agent({ kind: 'ambient', event: 'x.y' }));
    expect(await partners.available(context, 'vendor-registry')).toBe(false);
    definitions.resolve.mockResolvedValueOnce(null);
    expect(await partners.available(context, 'vendor-registry')).toBe(false);
    expect(definitions.resolve).toHaveBeenCalledWith('vendor-registry', 'finance');
  });

  it('sends through the agent, logged under it, and returns the completed answer', async () => {
    definitions.resolve.mockResolvedValue(agent({ kind: 'a2a', cardUrl: CARD, send: 'all' }));
    client.sendMessage.mockResolvedValue({ card: { name: 'Registry' }, reply: { state: 'completed', parts: [{ data: { status: 'approved' } }], taskId: 't1' } });
    expect(await partners.ask(context, 'vendor-registry', [{ data: { vendor: 'ACME' } }])).toEqual({ partner: 'Registry', parts: [{ data: { status: 'approved' } }], taskId: 't1' });
    expect(client.sendMessage).toHaveBeenCalledWith({ orgSlug: 'finance', agentSlug: 'vendor-registry', kind: 'call' }, { cardUrl: CARD }, [{ data: { vendor: 'ACME' } }]);
  });

  it('refuses a missing agent, a non-partner target, and an answer that did not complete', async () => {
    definitions.resolve.mockResolvedValueOnce(null);
    await expect(partners.ask(context, 'vendor-registry', [{ text: 'x' }])).rejects.toThrow('no active A2A agent vendor-registry in finance');
    definitions.resolve.mockResolvedValueOnce(agent({ kind: 'ambient', event: 'x.y' }));
    await expect(partners.ask(context, 'vendor-registry', [{ text: 'x' }])).rejects.toThrow('does not forward to a partner');
    definitions.resolve.mockResolvedValueOnce(agent({ kind: 'a2a', cardUrl: CARD, send: 'text' }));
    await expect(partners.ask(context, 'vendor-registry', [{ data: { vendor: 'ACME' } }])).rejects.toThrow('sends text only');
    definitions.resolve.mockResolvedValueOnce(agent({ kind: 'a2a', cardUrl: CARD, send: 'all' }));
    client.sendMessage.mockResolvedValueOnce({ card: { name: 'Registry' }, reply: { state: 'rejected', parts: [{ text: 'Send the vendor name' }] } });
    await expect(partners.ask(context, 'vendor-registry', [{ data: {} }])).rejects.toThrow('Registry: it answered rejected (Send the vendor name)');
  });
});
