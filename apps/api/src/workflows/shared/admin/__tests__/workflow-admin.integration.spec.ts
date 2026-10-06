/**
 * The admin's database side: agent overrides with history, and Decision
 * Risk's sections on a throwaway scope. Set WORKFLOW_RUNS_TEST_DATABASE_URL.
 * Everything created is removed afterwards.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { AgentDefinitionsRepository } from '../../agents';
import { DecisionRiskAdmin } from '../../../decision-risk/decision-risk.admin';
import { AgentOverridesRepository } from '../agent-overrides.repository';
import type { WorkflowAdminSection } from '../workflow-admin-section';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('workflow admin against Postgres', () => {
  const org = 'legal';
  const agent = 'risk-executive-summary';
  const riskOrg = `it-admin-${randomUUID().slice(0, 8)}`;
  let db: PostgresqlDatabaseService;
  let userId: string;
  const sql = async (text: string, params: unknown[] = []) => {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  };

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    userId = String((await sql(`SELECT id FROM auth.users WHERE email = 'admin-user@orchestratorai.io'`))[0]?.id);
    const scope = await sql(
      `INSERT INTO risk.scopes (organization_slug, agent_slug, name, domain, thresholds, is_active) VALUES ($1, 'decision-risk', 'IT scope', 'business', '{"flagged": 60, "debate": 65, "alert": 80, "keep": 1}', true) RETURNING id`,
      [riskOrg],
    );
    // Weights must add up at commit, so both dimensions go in one transaction.
    await db.transaction(async (tx) => {
      for (const [i, slug] of ['legal', 'market'].entries()) {
        const dim = await tx.rawQuery(`INSERT INTO risk.dimensions (scope_id, slug, name, weight, display_order, is_active) VALUES ($1, $2, $3, 0.5, $4, true) RETURNING id`, [scope[0]!.id, slug, slug, i]);
        if (dim.error) throw new Error(dim.error.message);
        const ctx = await tx.rawQuery(`INSERT INTO risk.dimension_contexts (dimension_id, version, system_prompt, is_active) VALUES ($1, 1, $2, true)`, [(dim.data as Array<{ id: string }>)[0]!.id, `Assess ${slug}.`]);
        if (ctx.error) throw new Error(ctx.error.message);
      }
    });
  });

  afterAll(async () => {
    await sql(`DELETE FROM workflows.agent_definition_org_overrides WHERE agent_slug = $1 AND organization_slug = $2`, [agent, org]);
    await sql(`DELETE FROM workflows.agent_definition_override_history WHERE agent_slug = $1 AND organization_slug = $2`, [agent, org]);
    await sql(`DELETE FROM risk.scopes WHERE organization_slug = $1`, [riskOrg]);

    await db.onModuleDestroy();
  });

  it("overrides an agent's instructions for one org, records each change, and resets", async () => {
    const overrides = new AgentOverridesRepository(db);
    const definitions = new AgentDefinitionsRepository(db);
    const before = (await overrides.forWorkflow('decision-risk', org)).find((a) => a.slug === agent)!;
    expect(before).toMatchObject({ overrideInstructions: null, purpose: 'step', modelRole: 'writer' });

    await overrides.save(agent, org, 'Lead with the recommendation. Under 200 words.', userId);
    expect((await definitions.getForOrg(agent, org))!.instructions).toBe('Lead with the recommendation. Under 200 words.');
    expect((await definitions.getForOrg(agent, 'corporate'))!.instructions).toBe(before.defaultInstructions);

    await overrides.save(agent, org, null, userId);
    expect((await definitions.getForOrg(agent, org))!.instructions).toBe(before.defaultInstructions);
    expect((await overrides.history(agent, org)).map((c) => c.instructions)).toEqual([null, 'Lead with the recommendation. Under 200 words.']);
  });

  it("edits Decision Risk's thresholds and dimensions, versioning a changed prompt", async () => {
    const sections = new DecisionRiskAdmin(db).sections();
    const get = (key: string) => sections.find((s) => s.key === key) as WorkflowAdminSection;

    const thresholds = get('thresholds');
    const [t] = await thresholds.list!(riskOrg);
    expect(t).toMatchObject({ flagged: 60, debate: 65, alert: 80 });
    await expect(thresholds.update!(riskOrg, 'thresholds', { flagged: 90, debate: 65, alert: 80 }, userId)).rejects.toThrow(/not be above the alert/);
    await thresholds.update!(riskOrg, 'thresholds', { flagged: 55, debate: 70, alert: 85 }, userId);
    expect((await sql(`SELECT thresholds FROM risk.scopes WHERE organization_slug = $1`, [riskOrg]))[0]!.thresholds).toEqual({ flagged: 55, debate: 70, alert: 85, keep: 1 });

    const dims = get('dimensions');
    const legal = { name: 'Legal', description: null, order: 0, prompt: 'Assess legal.' };
    expect(await dims.update!(riskOrg, 'legal', legal, userId)).toMatchObject({ name: 'Legal', weight: 0.5, version: 1 });
    expect(await dims.update!(riskOrg, 'legal', { ...legal, prompt: 'Assess legal, citing statutes.' }, userId)).toMatchObject({ prompt: 'Assess legal, citing statutes.', version: 2 });
    const versions = await sql(
      `SELECT c.version, c.is_active FROM risk.dimension_contexts c JOIN risk.dimensions d ON d.id = c.dimension_id JOIN risk.scopes s ON s.id = d.scope_id WHERE s.organization_slug = $1 AND d.slug = 'legal' ORDER BY c.version`,
      [riskOrg],
    );
    expect(versions).toEqual([{ version: 1, is_active: false }, { version: 2, is_active: true }]);

    // Weights move together: 0.7 + 0.3 saves; 0.7 + 0.5 is refused before the database sees it.
    const weights = dims.bulk!;
    const saved = await weights.save(riskOrg, [{ id: 'legal', row: { weight: 0.7, active: true } }, { id: 'market', row: { weight: 0.3, active: true } }], userId);
    expect(saved.map((d) => [d.slug, d.weight])).toEqual([['legal', 0.7], ['market', 0.3]]);
    await expect(weights.save(riskOrg, [{ id: 'market', row: { weight: 0.5, active: true } }], userId)).rejects.toThrow(/add up to 1.20/);
    await expect(weights.save(riskOrg, [{ id: 'legal', row: { weight: 0.7, active: false } }, { id: 'market', row: { weight: 0.3, active: false } }], userId)).rejects.toThrow(/At least one dimension/);
    // Deactivating one hands it all to the other.
    await weights.save(riskOrg, [{ id: 'legal', row: { weight: 1, active: true } }, { id: 'market', row: { weight: 0.3, active: false } }], userId);
  });
});
