/**
 * The company's MCP endpoint over real HTTP with the API's global settings,
 * driven by the MCP SDK's own client: the 401 that starts OAuth, the tool
 * list, calls that answer at once, work that is followed with get_task, files
 * as resource links, and answers Jev held back.
 */
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CONFIG_PROVIDER_SERVICE } from '@orchestratorai/planes/config';
import { configureApplication } from '../app-bootstrap';
import { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import { GatehouseAuthError } from './caller-auth.service';
import { GatehouseSignInService } from './gatehouse-sign-in.service';
import { GatehouseInboundService } from './inbound.service';
import { GatehouseMcpController } from './mcp.controller';

const agent = (slug: string, kind: 'agent' | 'workflow'): AgentDefinition =>
  ({
    slug, name: slug, description: `The ${slug} agent.`, agentType: 'a2a', orgSlug: 'acme',
    a2a: { target: kind === 'agent' ? { kind, agentSlug: 'x' } : { kind, workflowSlug: 'w' }, callers: 'any' },
  }) as unknown as AgentDefinition;
const grant = { kind: 'key' as const, grant: { id: 'g1', agentName: 'ChatGPT', accountLabel: 'Pat' } };
const task = (id: string, state: string, extra: Record<string, unknown> = {}) => ({ id, contextId: 'c', status: { state, timestamp: 't' }, ...extra });

describe('the MCP endpoint over HTTP', () => {
  let app: INestApplication;
  let base: string;
  const signIn = { signIn: jest.fn(), mayCall: jest.fn() };
  const inbound = { handle: jest.fn() };
  const agents = { listAgents: jest.fn(async () => [agent('catalog', 'agent'), agent('place-order', 'workflow')]) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GatehouseMcpController],
      providers: [
        { provide: AgentDefinitionService, useValue: agents },
        { provide: GatehouseSignInService, useValue: signIn },
        { provide: GatehouseInboundService, useValue: inbound },
        { provide: CONFIG_PROVIDER_SERVICE, useValue: { getRequired: () => 'https://acme.example' } },
      ],
    }).compile();
    const express = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApplication(express);
    app = express;
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    signIn.signIn.mockResolvedValue(grant);
  });

  const connect = async () => {
    const client = new Client({ name: 'spec', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/acme`), { requestInit: { headers: { Authorization: 'Bearer oak_key' } } }));
    return client;
  };

  it('answers 401 with where to log in when no key is sent, and refuses a bad one', async () => {
    const none = await fetch(`${base}/mcp/acme`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://acme.example/.well-known/oauth-protected-resource/api/mcp/acme", scope="agent"',
    );
    signIn.signIn.mockRejectedValueOnce(new GatehouseAuthError('unauthenticated', 'This agent key was revoked'));
    const revoked = await fetch(`${base}/mcp/acme`, { method: 'POST', headers: { Authorization: 'Bearer oak_x', 'Content-Type': 'application/json' }, body: '{}' });
    expect(revoked.status).toBe(401);
    expect(revoked.headers.get('www-authenticate')).toContain('error="invalid_token"');
    expect(await revoked.json()).toEqual({ error: 'This agent key was revoked' });
    expect((await fetch(`${base}/mcp/acme`)).status).toBe(405);
  });

  it('lists the org\'s published agents as tools, plus get_task', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['catalog', 'place-order', 'get_task']);
    expect(tools[1]!.description).toContain('follow it with get_task');
    expect(signIn.signIn).toHaveBeenCalledWith('oak_key', 'https://acme.example/api/mcp/acme', 'acme');
    await client.close();
  });

  it('answers at once, links files, follows long work with get_task, and reports a held-back answer as an error', async () => {
    const client = await connect();
    inbound.handle.mockResolvedValueOnce({
      task: task('11111111-1111-4111-8111-111111111111', 'TASK_STATE_COMPLETED', {
        artifacts: [{ parts: [{ text: 'Two kits in stock.' }, { url: 'https://acme.example/assets/storage/media/a.png', mediaType: 'image/png', filename: 'a.png' }] }],
      }),
    });
    const answered = await client.callTool({ name: 'catalog', arguments: { message: 'Do you have the kit?' } });
    expect(answered.content).toEqual([
      { type: 'text', text: 'Two kits in stock.' },
      { type: 'resource_link', uri: 'https://acme.example/assets/storage/media/a.png', name: 'a.png', mimeType: 'image/png' },
    ]);
    const [method, params, called, principal] = inbound.handle.mock.calls[0] as [string, { message: { parts: unknown[] } }, AgentDefinition, unknown];
    expect([method, called.slug, principal]).toEqual(['SendMessage', 'catalog', grant]);
    expect(params.message.parts).toEqual([{ text: 'Do you have the kit?' }]);
    expect(signIn.mayCall).toHaveBeenCalledWith(grant, expect.objectContaining({ slug: 'catalog' }));

    const id = '22222222-2222-4222-8222-222222222222';
    inbound.handle.mockResolvedValueOnce({ task: task(id, 'TASK_STATE_SUBMITTED') });
    const started = await client.callTool({ name: 'place-order', arguments: { message: 'Two kits', data: { po: 'PO-7' } } });
    expect(started.structuredContent).toEqual({ taskId: id, state: 'submitted' });
    expect((started.content as Array<{ text: string }>)[0]!.text).toContain(`get_task: agent "place-order", task_id "${id}"`);

    inbound.handle.mockResolvedValueOnce(
      task(id, 'TASK_STATE_REJECTED', { status: { state: 'TASK_STATE_REJECTED', message: { parts: [{ text: 'A Jev check (claims-substantiated) blocked this answer: unsubstantiated claim' }] } } }),
    );
    const followed = await client.callTool({ name: 'get_task', arguments: { agent: 'place-order', task_id: id } });
    expect(inbound.handle.mock.calls[2]!.slice(0, 2)).toEqual(['GetTask', { id }]);
    expect(followed.isError).toBe(true);
    expect((followed.content as Array<{ text: string }>)[0]!.text).toContain('blocked this answer');

    const bad = await client.callTool({ name: 'get_task', arguments: { agent: 'catalog', task_id: 'nope' } });
    expect(bad.isError).toBe(true);
    await client.close();
  });
});
