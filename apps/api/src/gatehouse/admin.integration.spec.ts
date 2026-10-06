/**
 * The Gatehouse pages' data against the real tables: A2A agents created,
 * edited and retired through the admin service (checked by the loader's own
 * parser), the outbound call log, admin reads of inbound tasks, and removing
 * a caller only while it has no history. Set WORKFLOW_RUNS_TEST_DATABASE_URL
 * to run it. Everything it creates is named spec-*<run> and removed after.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import { A2AAgentRefused, A2AAgentsService } from './a2a-agents.service';
import { CallersRepository } from './callers.repository';
import { OutboundCallsRepository } from './outbound-calls.repository';
import { TasksRepository } from './tasks.repository';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

const refusal = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof A2AAgentRefused) return `${error.reason}: ${error.message}`;
    throw error;
  }
  throw new Error('expected an A2AAgentRefused');
};

describeWithDb('the Gatehouse admin against Postgres', () => {
  const run = randomUUID().slice(0, 8);
  const slug = `spec-a2a-${run}`;
  const org = `spec-org-${run}`;
  let db: PostgresqlDatabaseService;
  let definitions: AgentDefinitionService;
  let agents: A2AAgentsService;
  let callers: CallersRepository;
  let tasks: TasksRepository;
  let outbound: OutboundCallsRepository;

  beforeAll(() => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    definitions = new AgentDefinitionService(db);
    agents = new A2AAgentsService(db, definitions, { getRequired: () => 'https://enterprise.example' } as never);
    callers = new CallersRepository(db);
    tasks = new TasksRepository(db);
    outbound = new OutboundCallsRepository(db);
  });

  afterAll(async () => {
    await db.rawQuery(`DELETE FROM gatehouse.outbound_calls WHERE org_slug = $1`, [org]);
    await db.rawQuery(`DELETE FROM gatehouse.tasks WHERE org_slug = $1`, [org]);
    await db.rawQuery(`DELETE FROM gatehouse.callers WHERE card_url LIKE $1`, [`https://spec-%${run}.example/%`]);
    await db.rawQuery(`DELETE FROM public.agents WHERE slug = $1`, [slug]);

    await db.onModuleDestroy();
  });

  it('creates an A2A agent disabled, refuses a bad target, and publishes it by status', async () => {
    const a2a = { target: { kind: 'ambient', event: 'invoice.received' } };
    expect(await refusal(agents.create(org, slug, { name: 'Spec', description: 'd', a2a: { target: { kind: 'ambient', event: 'Not An Event' } } }))).toMatch(/^invalid: .*lowercase words/);
    expect(await refusal(agents.create(org, 'Bad Slug', { name: 'Spec', description: 'd', a2a }))).toMatch(/^invalid: slug/);
    expect(await refusal(agents.create('*', slug, { name: 'Spec', description: 'd', a2a }))).toMatch(/^invalid: Choose the organization/);

    const created = await agents.create(org, slug, { name: 'Spec intake', description: 'Takes invoices', a2a });
    expect(created).toMatchObject({
      slug,
      orgSlug: org,
      status: 'disabled',
      published: false,
      version: '1.0.0',
      cardUrl: `https://enterprise.example/api/a2a/${slug}/.well-known/agent-card.json`,
      a2a: { target: { kind: 'ambient', event: 'invoice.received' }, callers: 'any' },
    });
    expect(await refusal(agents.create(org, slug, { name: 'Again', description: 'd', a2a }))).toMatch(/^exists: /);
    // Disabled: not published to callers.
    expect(await definitions.resolvePublishedA2A(slug)).toBeNull();

    expect((await agents.setStatus(slug, org, 'active')).published).toBe(true);
    expect((await definitions.resolvePublishedA2A(slug))?.a2a?.target).toEqual({ kind: 'ambient', event: 'invoice.received' });
    expect(await refusal(agents.setStatus(slug, org, 'deleted'))).toMatch(/^invalid: status must be/);
  });

  it('edits the target and callers, moves the version on, and keeps the agent in its org', async () => {
    const updated = await agents.update(slug, org, {
      name: 'Spec intake',
      description: 'Takes invoices from two partners',
      a2a: { target: { kind: 'workflow', workflowSlug: 'invoice-review', textField: 'invoiceText' }, callers: { allow: [`https://spec-partner-${run}.example/card`] } },
    });
    expect(updated).toMatchObject({ version: '1.0.1', status: 'active', a2a: { callers: { allow: [`https://spec-partner-${run}.example/card`] } } });
    expect((await agents.list(org)).map((a) => a.slug)).toEqual([slug]);
    expect(await refusal(agents.get(slug, 'finance'))).toMatch(/^not-found: /);
    expect((await agents.setStatus(slug, org, 'archived')).published).toBe(false);
  });

  it('logs outbound calls, answered and failed, newest first, per org', async () => {
    const answered = await outbound.start({ orgSlug: org, agentSlug: slug, kind: 'call' }, 'https://partner.example/card', 'ctx-1');
    await outbound.finish(answered, { state: 'answered', remoteName: 'Partner', remoteState: 'completed', remoteTaskId: 't-9', durationMs: 120 });
    const failed = await outbound.start({ orgSlug: org, agentSlug: slug, kind: 'call' }, 'https://partner.example/card', undefined);
    await outbound.finish(failed, { state: 'failed', error: 'Partner returned HTTP 502', durationMs: 40 });

    const calls = await outbound.list(org, 10);
    expect(calls.map((c) => c.id)).toEqual([failed, answered]);
    expect(calls[1]).toMatchObject({ state: 'answered', remoteName: 'Partner', remoteState: 'completed', remoteTaskId: 't-9', contextId: 'ctx-1', durationMs: 120 });
    expect(calls[0]).toMatchObject({ state: 'failed', remoteName: null, error: 'Partner returned HTTP 502' });
    expect(calls[0]?.finishedAt).toEqual(expect.any(String));
    expect((await outbound.list('finance', 500)).some((c) => c.orgSlug === org)).toBe(false);
  });

  it('removes a caller only while it has no tasks or replies', async () => {
    const quiet = await callers.upsert({ name: 'Quiet', cardUrl: `https://spec-quiet-${run}.example/card`, jwksUrl: null, jwks: { keys: [] }, registeredBy: 'spec' });
    const busy = await callers.upsert({ name: 'Busy', cardUrl: `https://spec-busy-${run}.example/card`, jwksUrl: null, jwks: { keys: [] }, registeredBy: 'spec' });
    await tasks.create({ id: randomUUID(), agentSlug: slug, orgSlug: org, callerId: busy.id, grantRef: null, contextId: 'c', target: 'ambient' });

    expect(await tasks.anyForCaller(quiet.id)).toBe(false);
    expect(await tasks.anyForCaller(busy.id)).toBe(true);
    expect(await callers.delete(quiet.id)).toBe(true);
    expect(await callers.byId(quiet.id)).toBeNull();

    const listed = await tasks.listForAdmin(org, { agentSlug: slug }, 10);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ callerId: busy.id, state: 'working', error: null });
    expect(await tasks.getForAdmin(String(listed[0]?.id), 'finance')).toBeNull();
    expect(await tasks.listForAdmin(org, { state: 'completed' }, 10)).toEqual([]);
  });
});
