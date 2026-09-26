/**
 * Agent definitions against the real tables: the version trigger and org
 * overrides. Set WORKFLOW_RUNS_TEST_DATABASE_URL to run it (skipped
 * otherwise). It creates one agent with a random slug and deletes it.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { AgentDefinitionsRepository } from './agent-definitions.repository';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('agent definitions against Postgres', () => {
  const slug = `it-agent-${randomUUID().slice(0, 8)}`;
  let db: PostgresqlDatabaseService;
  let repo: AgentDefinitionsRepository;

  async function sql(text: string, params: unknown[] = []) {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    repo = new AgentDefinitionsRepository(db);
    await sql(
      `INSERT INTO workflows.agent_definitions
         (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
       VALUES ($1, 'Spec agent', 'An agent for the spec', 'Do the thing.', 'analyst', 'json',
               '{"type":"object"}', '{"type":"object"}', 500)`,
      [slug],
    );
  });

  afterAll(async () => {
    await sql(`DELETE FROM workflows.agent_definitions WHERE slug = $1`, [slug]);
  });

  it('archives the previous version on a real change, and not on a no-op', async () => {
    await sql(`UPDATE workflows.agent_definitions SET instructions = 'Do it better.' WHERE slug = $1`, [slug]);
    await sql(`UPDATE workflows.agent_definitions SET instructions = 'Do it better.' WHERE slug = $1`, [slug]);
    const current = await repo.getForOrg(slug, 'corporate');
    expect(current).toMatchObject({ version: 2, instructions: 'Do it better.' });
    const archived = await sql(
      `SELECT version, instructions FROM workflows.agent_definition_versions WHERE agent_slug = $1`,
      [slug],
    );
    expect(archived).toEqual([{ version: 1, instructions: 'Do the thing.' }]);
  });

  it("applies an org's instructions override and its disable, and only for that org", async () => {
    await sql(
      `INSERT INTO workflows.agent_definition_org_overrides (agent_slug, organization_slug, instructions_override, enabled)
       VALUES ($1, 'corporate', 'Corporate wording.', true), ($1, 'marketing', NULL, false)`,
      [slug],
    );
    expect(await repo.getForOrg(slug, 'corporate')).toMatchObject({ instructions: 'Corporate wording.', enabled: true });
    expect(await repo.getForOrg(slug, 'marketing')).toMatchObject({ instructions: 'Do it better.', enabled: false });
    expect(await repo.getForOrg(slug, 'finance')).toMatchObject({ instructions: 'Do it better.', enabled: true });
  });

  it('refuses a JSON agent without an output schema', async () => {
    await expect(
      sql(
        `INSERT INTO workflows.agent_definitions
           (slug, name, description, instructions, model_role, output_format, input_schema, max_tokens)
         VALUES ($1, 'x', 'x', 'x', 'analyst', 'json', '{"type":"object"}', 10)`,
        [`${slug}-bad`],
      ),
    ).rejects.toThrow('agent_definitions_json_has_schema');
  });
});
