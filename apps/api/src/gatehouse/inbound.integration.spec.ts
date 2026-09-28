/**
 * The inbound Gatehouse end to end against the real agents and gatehouse
 * tables: card, version and caller checks, and every method, with the agent
 * call and the workflow run store faked. Set WORKFLOW_RUNS_TEST_DATABASE_URL to
 * run it. Its agents are spec-a2a-* and its callers https://spec-inbound-*.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import type { InvokeDispatchService } from '../agents/invoke/invoke-dispatch.service';
import type { WorkflowRunsRepository } from '../workflows/shared/runs';
import type { A2AClientService } from './a2a-client.service';
import { CallerAuthService } from './caller-auth.service';
import { CallersRepository } from './callers.repository';
import { GatehouseInboundController } from './inbound.controller';
import { GatehouseInboundService } from './inbound.service';
import { TasksRepository } from './tasks.repository';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;
const BASE = 'https://enterprise.example/api';

describeWithDb('the inbound Gatehouse against Postgres', () => {
  const run = randomUUID().slice(0, 8);
  const ambientAgent = `spec-a2a-ambient-${run}`;
  const workflowAgent = `spec-a2a-workflow-${run}`;
  const privateAgent = `spec-a2a-private-${run}`;
  let db: PostgresqlDatabaseService;
  let controller: GatehouseInboundController;
  const dispatch = { invoke: jest.fn() };
  const runs = { getForOrg: jest.fn(), requestCancel: jest.fn() };
  const config = { getRequired: (key: string) => ({ PUBLIC_WEB_URL: 'https://enterprise.example', DEFAULT_LLM_PROVIDER: 'openrouter', DEFAULT_LLM_MODEL: 'm' })[key]! };
  const callers: Record<'me' | 'other', { key: CryptoKey; cardUrl: string }> = {} as never;

  const sql = async (text: string, params: unknown[] = []) => {
    const { error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
  };
  const addAgent = (slug: string, a2a: Record<string, unknown>) =>
    sql(
      `INSERT INTO public.agents (slug, organization_slug, name, description, agent_type, department, io_schema, capabilities, context, metadata)
       VALUES ($1, ARRAY['finance'], $2, 'Spec agent', 'a2a', 'finance', '{}'::jsonb, ARRAY['a2a'], 'Spec', $3::jsonb)`,
      [slug, `Spec ${slug}`, JSON.stringify({ status: 'active', a2a })],
    );
  const tokenFor = (who: 'me' | 'other', slug: string) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuer(callers[who].cardUrl)
      .setAudience(`${BASE}/a2a/${slug}`)
      .setIssuedAt()
      .setExpirationTime('60s')
      .setJti(randomUUID())
      .sign(callers[who].key);
  const call = async (slug: string, method: string, params: unknown, who: 'me' | 'other' = 'me', version: string | null = '1.0') =>
    controller.rpc(slug, `Bearer ${await tokenFor(who, slug)}`, version ?? undefined, 'application/json', { jsonrpc: '2.0', id: 7, method, params }) as Promise<{
      result?: Record<string, unknown> & { task?: Record<string, unknown> };
      error?: { code: number; message: string };
    }>;
  const send = (slug: string, parts: unknown[], who: 'me' | 'other' = 'me') =>
    call(slug, 'SendMessage', { message: { messageId: randomUUID(), role: 'ROLE_USER', contextId: 'their-ctx', parts } }, who);
  const status = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      if (error instanceof HttpException) return error.getStatus();
      throw error;
    }
    return 200;
  };

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    const callersRepo = new CallersRepository(db);
    const auth = new CallerAuthService(callersRepo, { assertSafe: jest.fn() } as never, {} as A2AClientService);
    for (const who of ['me', 'other'] as const) {
      const { privateKey, publicKey } = await generateKeyPair('ES256');
      const cardUrl = `https://spec-inbound-${who}-${run}.example/.well-known/agent-card.json`;
      await auth.registerByAdmin(`Spec ${who}`, cardUrl, { keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' } as JWK] }, 'spec');
      callers[who] = { key: privateKey, cardUrl };
    }
    await addAgent(ambientAgent, { target: { kind: 'ambient', event: 'invoice.received' } });
    await addAgent(workflowAgent, { target: { kind: 'workflow', workflowSlug: 'invoice-review' } });
    await addAgent(privateAgent, { target: { kind: 'ambient', event: 'x' }, callers: { allow: [callers.other.cardUrl] } });
    const service = new GatehouseInboundService(new TasksRepository(db), dispatch as unknown as InvokeDispatchService, runs as unknown as WorkflowRunsRepository, config as never);
    controller = new GatehouseInboundController(new AgentDefinitionService(db), auth, service, config as never);
  });

  afterAll(async () => {
    await sql(`DELETE FROM public.agents WHERE slug LIKE $1`, [`spec-a2a-%-${run}`]);
    await sql(`DELETE FROM gatehouse.callers WHERE card_url LIKE $1`, [`https://spec-inbound-%-${run}.example/%`]);
  });

  beforeEach(() => jest.clearAllMocks());

  it('publishes a v1.0 card for an a2a agent, cacheable, and nothing for anything else', async () => {
    const served = () => {
      const response = { headers: {} as Record<string, string>, code: 0, body: '' };
      const res = {
        setHeader: (name: string, value: string) => { response.headers[name] = value; },
        status: (code: number) => { response.code = code; return res; },
        type: () => res,
        send: (body: string) => { response.body = body; },
        end: () => undefined,
      };
      return { response, res: res as never };
    };
    const first = served();
    await controller.card(ambientAgent, undefined, first.res);
    expect(first.response.code).toBe(200);
    expect(first.response.headers).toMatchObject({ 'Cache-Control': 'public, max-age=300' });
    expect(first.response.headers.ETag).toMatch(/^"[\w-]+"$/);
    expect(new Date(first.response.headers['Last-Modified'] ?? 'missing').getTime()).not.toBeNaN();
    const again = served();
    await controller.card(ambientAgent, first.response.headers.ETag, again.res);
    expect(again.response.code).toBe(304);
    const card = JSON.parse(first.response.body);
    expect(card).toMatchObject({
      name: `Spec ${ambientAgent}`,
      supportedInterfaces: [{ url: `${BASE}/a2a/${ambientAgent}`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
      capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
      securityRequirements: [{ schemes: { callerJwt: { list: [] } } }],
      skills: [{ id: ambientAgent, tags: ['a2a', 'ambient'] }],
    });
    expect(await status(controller.card('finance-policy-assistant', undefined, served().res))).toBe(404);
    expect(await status(controller.card(`spec-a2a-none-${run}`, undefined, served().res))).toBe(404);
  });

  it('turns away a missing version, an unsigned call, and a caller the agent does not take', async () => {
    expect((await call(ambientAgent, 'GetTask', {}, 'me', null)).error?.code).toBe(-32009);
    expect((await call(ambientAgent, 'GetTask', {}, 'me', '0.3')).error?.code).toBe(-32009);
    expect(await status(controller.rpc(ambientAgent, undefined, '1.0', 'application/json', { jsonrpc: '2.0', id: 1, method: 'GetTask' }))).toBe(401);
    expect(await status(controller.rpc(ambientAgent, `Bearer ${await tokenFor('me', workflowAgent)}`, '1.0', 'application/json', { jsonrpc: '2.0', id: 1, method: 'GetTask' }))).toBe(401);
    expect(await controller.rpc(ambientAgent, undefined, '1.0', 'text/plain', {})).toMatchObject({
      error: { code: -32005, data: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'CONTENT_TYPE_NOT_SUPPORTED', domain: 'a2a-protocol.org' }] },
    });
    expect(await status(call(privateAgent, 'GetTask', {}, 'me'))).toBe(403);
    expect((await controller.rpc(ambientAgent, undefined, '1.0', 'application/json', { id: 1 })) as { error: { code: number } }).toMatchObject({ error: { code: -32600 } });
  });

  it('answers an ambient agent with a completed task, and lets only its caller read it', async () => {
    dispatch.invoke.mockResolvedValue({ content: { status: 'received', eventId: randomUUID(), event: 'invoice.received', duplicate: false }, outputType: 'json' });
    const sent = await send(ambientAgent, [{ text: 'Invoice INV-7' }, { data: { invoiceNumber: 'INV-7' } }]);
    const task = sent.result!.task!;
    expect(task).toMatchObject({ contextId: 'their-ctx', status: { state: 'TASK_STATE_COMPLETED' }, artifacts: [{ parts: [{ data: { status: 'received' } }] }] });

    const [context, data, meta] = dispatch.invoke.mock.calls[0] as [Record<string, unknown>, unknown, Record<string, unknown>];
    expect(context).toMatchObject({ orgSlug: 'finance', agentSlug: ambientAgent, userId: '00000000-0000-0000-0000-000000000000', agentType: 'system', conversationId: task.id });
    expect(data).toEqual({ content: { message: 'Invoice INV-7', invoiceNumber: 'INV-7' }, contentType: 'json' });
    expect(meta).toMatchObject({ source: 'gatehouse', caller: { cardUrl: callers.me.cardUrl }, a2aTask: { id: task.id, contextId: 'their-ctx' } });

    expect((await call(ambientAgent, 'GetTask', { id: task.id })).result).toMatchObject({ id: task.id, status: { state: 'TASK_STATE_COMPLETED' } });
    expect((await call(ambientAgent, 'GetTask', { id: task.id }, 'other')).error?.code).toBe(-32001);
    expect((await call(ambientAgent, 'CancelTask', { id: task.id })).error?.code).toBe(-32002);
    const listed = (await call(ambientAgent, 'ListTasks', { contextId: 'their-ctx' })).result!;
    expect(listed).toMatchObject({ totalSize: 1, pageSize: 50, nextPageToken: '' });
  });

  it('follows a workflow run for the caller, and cancels it', async () => {
    const runId = randomUUID();
    dispatch.invoke.mockResolvedValue({ content: { status: 'queued', workflow: 'invoice-review', runId }, outputType: 'json' });
    const task = (await send(workflowAgent, [{ data: { poNumber: 'PO-4502' } }])).result!.task!;
    expect(task).toMatchObject({ status: { state: 'TASK_STATE_SUBMITTED' } });

    runs.getForOrg.mockResolvedValue({ status: 'awaiting_review', lastMessage: 'Proposed decision', result: null });
    expect((await call(workflowAgent, 'GetTask', { id: task.id })).result).toMatchObject({
      status: { state: 'TASK_STATE_WORKING', message: { parts: [{ text: 'Waiting for review in finance' }] } },
    });
    expect(runs.getForOrg).toHaveBeenCalledWith('finance', runId);

    runs.requestCancel.mockResolvedValue({ status: 'canceled', lastMessage: null, result: null });
    expect((await call(workflowAgent, 'CancelTask', { id: task.id })).result).toMatchObject({ status: { state: 'TASK_STATE_CANCELED' } });
    expect(runs.requestCancel).toHaveBeenCalledWith('finance', runId);
    expect((await call(workflowAgent, 'CancelTask', { id: task.id })).error?.code).toBe(-32002);
  });

  it('records a failure without telling the caller why', async () => {
    dispatch.invoke.mockRejectedValue(new Error('Workflow "invoice-review" is disabled for organization "finance"'));
    const task = (await send(workflowAgent, [{ data: { poNumber: 'PO-1' } }])).result!.task!;
    expect(task).toMatchObject({ status: { state: 'TASK_STATE_FAILED', message: { parts: [{ text: 'The agent could not complete this request' }] } } });
    expect(JSON.stringify(task)).not.toContain('disabled');
  });

  it('answers the methods it does not offer with the spec\'s errors', async () => {
    expect((await call(ambientAgent, 'CreateTaskPushNotificationConfig', {})).error?.code).toBe(-32003);
    expect((await call(ambientAgent, 'ListTaskPushNotificationConfigs', {})).error?.code).toBe(-32003);
    expect((await call(ambientAgent, 'SendStreamingMessage', {})).error?.code).toBe(-32004);
    expect((await call(ambientAgent, 'SubscribeToTask', {})).error?.code).toBe(-32004);
    expect((await call(ambientAgent, 'GetExtendedAgentCard', {})).error?.code).toBe(-32004);
    expect((await call(ambientAgent, 'message/send', {})).error?.code).toBe(-32601);
    expect((await send(ambientAgent, [{ url: 'https://x/f.pdf' }])).error?.code).toBe(-32005);
    expect((await call(ambientAgent, 'GetTask', { id: randomUUID() })).error).toMatchObject({ code: -32001, data: [{ reason: 'TASK_NOT_FOUND' }] });
    expect((await call(ambientAgent, 'GetTask', { id: 'not-a-task' })).error?.code).toBe(-32001);
    expect((await call(ambientAgent, 'CancelTask', { id: 'not-a-task' })).error?.code).toBe(-32001);
    expect((await call(ambientAgent, 'SendMessage', { message: { messageId: 'm', role: 'ROLE_USER', taskId: 'unknown', parts: [{ text: 'x' }] } })).error?.code).toBe(-32001);
    expect(dispatch.invoke).not.toHaveBeenCalled();
  });
});
