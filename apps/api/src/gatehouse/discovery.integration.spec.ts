/**
 * How outside agents find a company, against the real organizations and
 * agents tables: the front door chosen per org, the company card, and the
 * catalog. Set WORKFLOW_RUNS_TEST_DATABASE_URL to run it. Its org is spec-disc-*.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import { GatehouseDiscoveryController } from './discovery.controller';
import { CATALOG_SCHEMA, GatehouseDiscoveryService } from './discovery.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('company discovery against Postgres', () => {
  const run = randomUUID().slice(0, 8);
  const org = `spec-disc-${run}`;
  let db: PostgresqlDatabaseService;
  let discovery: GatehouseDiscoveryService;
  let controller: GatehouseDiscoveryController;
  const config = { getRequired: () => 'https://acme.example' };
  const response = { setHeader: jest.fn() };

  const sql = async (text: string, params: unknown[] = []) => {
    const { error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
  };
  const addAgent = (slug: string, status: string, target: Record<string, unknown>) =>
    sql(
      `INSERT INTO public.agents (slug, organization_slug, name, description, agent_type, department, io_schema, capabilities, context, metadata)
       VALUES ($1, ARRAY[$2], $3, $4, 'a2a', 'sales', '{}'::jsonb, ARRAY['a2a'], 'Spec', $5::jsonb)`,
      [slug, org, `Spec ${slug}`, `What ${slug} does.`, JSON.stringify({ status, a2a: { target } })],
    );

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    discovery = new GatehouseDiscoveryService(db, new AgentDefinitionService(db), config as never);
    controller = new GatehouseDiscoveryController(discovery);
    await sql(`INSERT INTO public.organizations (slug, name, url) VALUES ($1, 'Acme Labs', 'https://acme.example')`, [org]);
    await addAgent(`${org}-front`, 'active', { kind: 'ambient', event: 'request.received' });
    await addAgent(`${org}-orders`, 'active', { kind: 'workflow', workflowSlug: 'invoice-review' });
    await addAgent(`${org}-draft`, 'disabled', { kind: 'agent', agentSlug: 'general-assistant' });
  });

  afterAll(async () => {
    await sql(`DELETE FROM public.agents WHERE slug LIKE $1`, [`${org}-%`]);
    await sql(`DELETE FROM public.organizations WHERE slug = $1`, [org]);
    await db.onModuleDestroy();
  });

  it('lists every published agent, the MCP endpoint and how to sign in, front door or not', async () => {
    const catalog = await controller.catalog(org, response as never);
    expect(catalog).toMatchObject({
      schema: CATALOG_SCHEMA,
      organization: { slug: org, name: 'Acme Labs', url: 'https://acme.example' },
      frontDoor: null,
      mcp: { url: `https://acme.example/api/mcp/${org}`, transport: 'streamable-http' },
      auth: { oauthAuthorizationServer: 'https://acme.example/api/gatehouse/oauth/metadata' },
    });
    expect(catalog.agents.map((a) => [a.slug, a.route, a.streaming])).toEqual([
      [`${org}-front`, 'ambient', false],
      [`${org}-orders`, 'workflow', true],
    ]);
    expect(catalog.agents[0]).toMatchObject({ cardUrl: `https://acme.example/api/a2a/${org}-front/.well-known/agent-card.json`, a2aEndpoint: `https://acme.example/api/a2a/${org}-front` });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300');
  });

  it('serves the front door\'s card as the company card once one is chosen', async () => {
    await expect(controller.card(org, response as never)).rejects.toThrow(NotFoundException);
    await expect(discovery.setFrontDoor(org, `${org}-draft`)).rejects.toThrow('is not a published A2A agent');
    await discovery.setFrontDoor(org, `${org}-front`);
    const card = await controller.card(org, response as never);
    expect(card).toMatchObject({
      name: `Spec ${org}-front`,
      provider: { organization: 'Acme Labs', url: 'https://acme.example' },
      documentationUrl: `https://acme.example/api/gatehouse/orgs/${org}/agents.json`,
      supportedInterfaces: [{ url: `https://acme.example/api/a2a/${org}-front`, protocolBinding: 'JSONRPC' }],
    });
    expect((await controller.catalog(org, response as never)).frontDoor).toBe(`https://acme.example/api/a2a/${org}-front/.well-known/agent-card.json`);
    await discovery.setFrontDoor(org, null);
    await expect(controller.card(org, response as never)).rejects.toThrow('has not chosen a front door');
  });

  it('knows no organization it does not have', async () => {
    await expect(controller.catalog(`no-such-${run}`, response as never)).rejects.toThrow(NotFoundException);
  });
});
