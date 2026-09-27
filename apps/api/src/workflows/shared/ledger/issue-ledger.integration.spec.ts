/**
 * The issue ledger against the real tables. Set WORKFLOW_RUNS_TEST_DATABASE_URL
 * to run it (skipped otherwise). Its run is removed through its conversation.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { createExecutionContext } from '@orchestrator-ai/transport-types';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import type { RunModelScope } from '../models';
import { WorkflowRunsRepository } from '../runs';
import { IssueLedgerRepository, IssueNotFoundError, IssueTransitionError, type RaisedIssue } from './issue-ledger.repository';
import { IssueLedgerService } from './issue-ledger.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

const issue = (key: string, overrides: Partial<RaisedIssue> = {}): RaisedIssue => ({
  issueKey: key,
  source: 'radar',
  severity: 'high',
  category: 'risk',
  title: `Title ${key}`,
  finding: `Finding ${key}`,
  ...overrides,
});

describeWithDb('issue ledger against Postgres', () => {
  const conversationId = randomUUID();
  let db: PostgresqlDatabaseService;
  let ledger: IssueLedgerService;
  let scope: RunModelScope;

  async function sql(text: string, params: unknown[] = []) {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    ledger = new IssueLedgerService(new IssueLedgerRepository(db));
    const userId = String((await sql(`SELECT id FROM auth.users ORDER BY created_at LIMIT 1`))[0]?.id);
    await sql(
      `INSERT INTO public.conversations (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
       VALUES ($1, $2, 'it-ledger', 'workflow', 'marketing', now(), now(), now())`,
      [conversationId, userId],
    );
    const context = createExecutionContext({
      orgSlug: 'marketing',
      userId,
      conversationId,
      agentSlug: 'it-ledger',
      agentType: 'workflow',
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
    });
    await new WorkflowRunsRepository(db).insertQueued({
      context,
      input: {},
      documents: [],
      modelProfile: {},
      accessControl: { mode: 'owner' },
      maxAttempts: 1,
    });
    scope = { executionContext: context, modelProfile: {} };
  });

  afterAll(async () => {
    await sql(`DELETE FROM public.conversations WHERE id = $1`, [conversationId]);
  });

  const statusOf = async (stage: string, key: string) =>
    (await ledger.view(conversationId)).issues.find((i) => i.stageSlug === stage && i.issueKey === key)?.status;

  it('keeps the same key in two stages apart', async () => {
    await ledger.raise(scope, 'radar', [issue('dimension:security'), issue('dimension:legal')]);
    await ledger.raise(scope, 'red-team', [issue('dimension:security', { source: 'red_team', severity: 'critical' })]);
    const view = await ledger.view(conversationId);
    expect(view.issues.map((i) => `${i.stageSlug}/${i.issueKey}`)).toEqual([
      'red-team/dimension:security',
      'radar/dimension:security',
      'radar/dimension:legal',
    ]);
    expect(view.summary).toMatchObject({ total: 3, open: 3 });
  });

  it("keeps a person's decision when the stage runs again, and drops what it no longer raises", async () => {
    await ledger.move(scope, [{ stageSlug: 'radar', issueKey: 'dimension:security', status: 'accepted' }], 'human:u1');
    await ledger.raise(scope, 'radar', [issue('dimension:security', { finding: 'Reworded' })]);
    const view = await ledger.view(conversationId);
    const security = view.issues.find((i) => i.stageSlug === 'radar' && i.issueKey === 'dimension:security');
    expect(security).toMatchObject({ status: 'accepted', finding: 'Reworded' });
    expect(view.issues.some((i) => i.issueKey === 'dimension:legal')).toBe(false);
  });

  it('refuses a move the status model forbids, or for an unknown issue, and applies none of the batch', async () => {
    await expect(
      ledger.move(
        scope,
        [
          { stageSlug: 'radar', issueKey: 'dimension:security', status: 'addressed' },
          { stageSlug: 'radar', issueKey: 'dimension:security', status: 'identified' },
        ],
        'stage:final',
      ),
    ).rejects.toBeInstanceOf(IssueTransitionError);
    expect(await statusOf('radar', 'dimension:security')).toBe('accepted');

    await expect(
      ledger.move(scope, [{ stageSlug: 'radar', issueKey: 'dimension:brand', status: 'accepted' }], 'human:u1'),
    ).rejects.toBeInstanceOf(IssueNotFoundError);
  });

  it('records every status change as an event', async () => {
    await ledger.move(
      scope,
      [{ stageSlug: 'radar', issueKey: 'dimension:security', status: 'addressed', rationale: 'Pilot ran' }],
      'stage:final',
    );
    const events = await sql(
      `SELECT e.from_status, e.to_status, e.actor, e.rationale
         FROM workflows.issue_ledger_events e JOIN workflows.issue_ledger i ON i.id = e.issue_id
        WHERE i.run_id = $1 AND i.stage_slug = 'radar' AND i.issue_key = 'dimension:security' ORDER BY e.id`,
      [conversationId],
    );
    const moved = (await ledger.view(conversationId)).issues.find((i) => i.issueKey === 'dimension:security' && i.stageSlug === 'radar');
    expect(moved?.lastChange).toMatchObject({ actor: 'stage:final', rationale: 'Pilot ran' });
    expect(events).toEqual([
      { from_status: null, to_status: 'identified', actor: 'stage:radar', rationale: null },
      { from_status: 'identified', to_status: 'accepted', actor: 'human:u1', rationale: null },
      { from_status: 'accepted', to_status: 'addressed', actor: 'stage:final', rationale: 'Pilot ran' },
    ]);
  });

  it('refuses a stage that raises one key twice', async () => {
    await expect(ledger.raise(scope, 'radar', [issue('dimension:x'), issue('dimension:x')])).rejects.toThrow('twice');
  });
});
