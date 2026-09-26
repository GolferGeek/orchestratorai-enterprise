/**
 * Model profiles against the real table. Set WORKFLOW_RUNS_TEST_DATABASE_URL
 * to run it (skipped otherwise). It writes under a random workflow slug and
 * removes its rows.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { MissingModelProfileError } from './model-profile.types';
import { ModelProfilesRepository, UnknownModelError } from './model-profiles.repository';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('model profiles against Postgres', () => {
  const workflowSlug = `it-models-${randomUUID().slice(0, 8)}`;
  const org = 'marketing';
  let db: PostgresqlDatabaseService;
  let repo: ModelProfilesRepository;
  let userId: string;

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    repo = new ModelProfilesRepository(db);
    const { data } = await db.rawQuery(`SELECT id FROM auth.users ORDER BY created_at LIMIT 1`);
    userId = String((data as Array<{ id: string }>)[0]?.id);
  });

  afterAll(async () => {
    await db.rawQuery(`DELETE FROM workflows.model_profiles WHERE workflow_slug = $1`, [workflowSlug]);
  });

  it('saves one profile per role, replacing it on a second save', async () => {
    const base = { organizationSlug: org, workflowSlug, role: 'drafter', updatedBy: userId };
    await repo.upsert({ ...base, provider: 'ollama', model: 'qwen3:8b' });
    await repo.upsert({ ...base, provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' });
    const listed = await repo.list(org, workflowSlug);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' });
  });

  it('refuses a model the platform does not know', async () => {
    await expect(
      repo.upsert({
        organizationSlug: org,
        workflowSlug,
        role: 'critic',
        provider: 'openrouter',
        model: 'not/a-model',
        updatedBy: userId,
      }),
    ).rejects.toBeInstanceOf(UnknownModelError);
  });

  it('snapshots configured roles and names every missing one', async () => {
    expect(await repo.snapshot(org, workflowSlug, ['drafter'])).toEqual({
      drafter: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
    });
    await expect(repo.snapshot(org, workflowSlug, ['drafter', 'critic', 'judge'])).rejects.toEqual(
      new MissingModelProfileError(workflowSlug, org, ['critic', 'judge']),
    );
    await expect(repo.snapshot('finance', workflowSlug, ['drafter'])).rejects.toBeInstanceOf(
      MissingModelProfileError,
    );
  });

  it('deletes only within the org', async () => {
    const [row] = await repo.list(org, workflowSlug);
    expect(await repo.delete('finance', row!.id)).toBe(false);
    expect(await repo.delete(org, row!.id)).toBe(true);
  });
});
