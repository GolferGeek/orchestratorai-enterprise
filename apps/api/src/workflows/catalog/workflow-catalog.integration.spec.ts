/**
 * The catalog tables against Postgres: settings, groups and the
 * transactional layout replace, in two throwaway organizations (a layout
 * replace clears the org's whole layout). It never calls syncRegistry: a
 * sync with only test workflows would mark every live workflow inactive. Set WORKFLOW_RUNS_TEST_DATABASE_URL to
 * run it (skipped otherwise). Rows use a random tag and are removed.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { CatalogChangeError, WorkflowCatalogRepository } from './workflow-catalog.repository';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('workflow catalog tables against Postgres', () => {
  const tag = randomUUID().slice(0, 8);
  const slugs = [`it-a-${tag}`, `it-b-${tag}`];
  const org = `it-org-${tag}`;
  const otherOrg = `it-other-${tag}`;
  let db: PostgresqlDatabaseService;
  let repo: WorkflowCatalogRepository;
  let userId: string;


  async function sql(text: string, params: unknown[] = []) {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    repo = new WorkflowCatalogRepository(db);
    userId = String((await sql(`SELECT id FROM auth.users ORDER BY created_at LIMIT 1`))[0]?.id);
    await sql(`INSERT INTO public.organizations (slug, name) VALUES ($1, 'Spec org'), ($2, 'Spec other org')`, [
      org,
      otherOrg,
    ]);
    // Only upsert the spec's own rows: a full sync would deactivate live ones.
    for (const slug of slugs) {
      await sql(
        `INSERT INTO workflows.registry (slug, name, icon, default_group, default_lifecycle, hitl, data_classification, entry_kind, organization_slugs)
         VALUES ($1, $1, 'flow', 'Spec', 'dev', false, 'internal', 'rest', '{corporate}')`,
        [slug],
      );
    }
  });

  afterAll(async () => {
    await sql(`DELETE FROM public.organizations WHERE slug = ANY($1::text[])`, [[org, otherOrg]]);
    await sql(`DELETE FROM workflows.registry WHERE slug = ANY($1::text[])`, [slugs]);
  });

  it('saves and reads an org setting', async () => {
    await repo.saveSetting(org, { workflowSlug: slugs[0]!, enabled: false, lifecycle: 'test', note: 'n' }, userId);
    expect((await repo.settings(org)).find((s) => s.workflowSlug === slugs[0])).toEqual({
      workflowSlug: slugs[0],
      enabled: false,
      lifecycle: 'test',
      note: 'n',
    });
  });

  it('replaces the layout atomically, and rolls it all back on a bad group', async () => {
    const one = await repo.createGroup(org, `One ${tag}`);
    const two = await repo.createGroup(org, `Two ${tag}`);
    await expect(repo.createGroup(org, `One ${tag}`)).rejects.toBeInstanceOf(CatalogChangeError);

    await repo.replaceLayout(org, [
      { groupId: two.id, workflowSlugs: [slugs[1]!] },
      { groupId: one.id, workflowSlugs: [slugs[0]!] },
    ]);
    const mine = (await repo.groups(org)).filter((g) => g.name.endsWith(tag));
    expect(mine.map((g) => [g.name, g.workflowSlugs])).toEqual([
      [`Two ${tag}`, [slugs[1]]],
      [`One ${tag}`, [slugs[0]]],
    ]);

    const marketingGroup = await repo.createGroup(otherOrg, `Theirs ${tag}`);
    await expect(
      repo.replaceLayout(org, [
        { groupId: one.id, workflowSlugs: slugs },
        { groupId: marketingGroup.id, workflowSlugs: [] },
      ]),
    ).rejects.toBeInstanceOf(CatalogChangeError);
    const unchanged = (await repo.groups(org)).filter((g) => g.name.endsWith(tag));
    expect(unchanged.map((g) => g.workflowSlugs)).toEqual([[slugs[1]], [slugs[0]]]);
  });

  it('refuses to place a workflow in another org\'s group, whatever the caller does', async () => {
    await repo.replaceLayout(org, []);
    const theirs = (await repo.groups(otherOrg)).find((g) => g.name === `Theirs ${tag}`)!;
    await expect(
      sql(
        `INSERT INTO workflows.group_items (group_id, organization_slug, workflow_slug, position) VALUES ($1, $3, $2, 0)`,
        [theirs.id, slugs[0], org],
      ),
    ).rejects.toThrow('group_items_group_in_org');
  });
});
