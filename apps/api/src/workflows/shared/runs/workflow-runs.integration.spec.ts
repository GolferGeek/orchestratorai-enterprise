/**
 * The run runtime against the real workflows.runs table: repository guards,
 * cancel, and a full worker pass through the database-plane job queue.
 *
 * Set WORKFLOW_RUNS_TEST_DATABASE_URL to run it (skipped otherwise, never
 * reported as passing). Rows it creates are removed through their
 * conversations (runs cascade).
 *
 * Point it at a database with no running workflow worker (or run it with the
 * API's WORKFLOW_WORKER_ENABLED=false): a live worker competes for queued
 * rows and would claim these, failing them for lack of a handler.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { createExecutionContext, type ExecutionContext } from '@orchestrator-ai/transport-types';
import type { ConfigProvider } from '@orchestratorai/planes/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { PostgresDatabaseJobQueueService } from '@orchestratorai/planes/database/postgres-database-job-queue.service';
import type { ObservabilityService } from '../services/observability.service';
import { WorkflowHandlerRegistry } from './workflow-handler.registry';
import { WorkflowRunsRepository, WorkflowRunTransitionError } from './workflow-runs.repository';
import { WorkflowWorkerService } from './workflow-worker.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('workflow runs against Postgres', () => {
  const slug = `it-${randomUUID().slice(0, 8)}`;
  const org = 'marketing';
  const created: string[] = [];
  let db: PostgresqlDatabaseService;
  let repo: WorkflowRunsRepository;
  let userId: string;

  async function sql(text: string, params: unknown[] = []) {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  }

  async function newContext(): Promise<ExecutionContext> {
    const conversationId = randomUUID();
    created.push(conversationId);
    await sql(
      `INSERT INTO public.conversations
         (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'workflow', $4, now(), now(), now())`,
      [conversationId, userId, slug, org],
    );
    return createExecutionContext({
      orgSlug: org,
      userId,
      conversationId,
      agentSlug: slug,
      agentType: 'workflow',
      provider: 'ollama',
      model: 'qwen3:8b',
    });
  }

  function queue(context: ExecutionContext) {
    return repo.insertQueued({
      context,
      input: { question: 'what changed' },
      documents: [],
      modelProfile: {},
      accessControl: { mode: 'org' },
      maxAttempts: 2,
    });
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    repo = new WorkflowRunsRepository(db);
    const users = await sql(`SELECT id FROM auth.users ORDER BY created_at LIMIT 1`);
    userId = String(users[0]?.id);
  });

  afterAll(async () => {
    if (created.length > 0) {
      await sql(`DELETE FROM public.conversations WHERE id = ANY($1::uuid[])`, [created]);
    }
  });

  it('queues a run with the context stored whole and consistent', async () => {
    const context = await newContext();
    const run = await queue(context);
    expect(run.status).toBe('queued');
    expect(run.executionContext).toEqual(context);
    expect(await repo.getForOrg('finance', run.id)).toBeNull();
  });

  it('refuses a guarded write from a worker that does not hold the run', async () => {
    const run = await queue(await newContext());
    await expect(repo.markCompleted(run, 'nobody', { ok: true })).rejects.toBeInstanceOf(
      WorkflowRunTransitionError,
    );
  });

  it('cancels a queued run immediately', async () => {
    const run = await queue(await newContext());
    const canceled = await repo.requestCancel(org, run.id);
    expect(canceled.status).toBe('canceled');
    expect(canceled.completedAt).not.toBeNull();
  });

  it('lists only runs the reader may see, and deletes only finished owned runs', async () => {
    const mine = await queue(await newContext());
    const reader = { userId, organizationSlug: org };

    const listed = await repo.listVisible(slug, reader, 50);
    expect(listed.map((r) => r.id)).toContain(mine.id);
    expect(await repo.listVisible(slug, { userId, organizationSlug: 'finance' }, 50)).toEqual([]);
    expect(await repo.getReadable(mine.id, reader)).not.toBeNull();
    expect(await repo.getReadable(mine.id, { userId, organizationSlug: 'finance' })).toBeNull();

    expect(await repo.deleteOwned(slug, mine.id, reader)).toEqual({ status: 'active' });
    await repo.requestCancel(org, mine.id);
    expect(
      await repo.deleteOwned(slug, mine.id, { userId: randomUUID(), organizationSlug: org }),
    ).toEqual({ status: 'not_found' });
    expect(await repo.deleteOwned(slug, mine.id, reader)).toEqual({
      status: 'deleted',
      run: expect.objectContaining({ id: mine.id, organizationSlug: org }),
    });
    expect(await repo.getForOrg(org, mine.id)).toBeNull();
  });

  it('executes a queued run end to end through the worker', async () => {
    const run = await queue(await newContext());
    const handlers = new WorkflowHandlerRegistry();
    const seen: string[] = [];
    handlers.register({
      slug,
      run: async ({ run: claimed, reportProgress }) => {
        seen.push(claimed.id);
        await reportProgress({ step: 'summarize', progress: 50, message: 'Halfway' });
        return { kind: 'completed', result: { summary: 'done' } };
      },
    });
    const config = {
      getRequired: (key: string) =>
        ({
          WORKFLOW_WORKER_ENABLED: 'false',
          WORKFLOW_PROVIDER_CONCURRENCY: '{"ollama":2}',
        })[key] ?? (() => { throw new Error(`Missing ${key}`); })(),
      getNumber: (key: string) =>
        ({
          WORKFLOW_WORKER_POLL_MS: 1000,
          WORKFLOW_WORKER_MAX_CONCURRENT: 1,
          WORKFLOW_WORKER_LEASE_SECONDS: 60,
        })[key] ?? (() => { throw new Error(`Missing ${key}`); })(),
    } as unknown as ConfigProvider;
    const worker = new WorkflowWorkerService(
      new PostgresDatabaseJobQueueService(db),
      repo,
      handlers,
      { emitFailed: jest.fn() } as unknown as ObservabilityService,
      config,
    );

    // Other queued rows (from earlier tests or real use) may be claimed first;
    // tick until ours has been processed.
    for (let i = 0; i < 20 && !seen.includes(run.id); i++) {
      await worker.tick();
      await worker.drain();
    }

    const finished = await repo.getForOrg(org, run.id);
    expect(finished?.status).toBe('completed');
    expect(finished?.result).toEqual({ summary: 'done' });
    expect(finished?.attempt).toBe(1);
    expect(finished?.workerId).toBeNull();
    expect(finished?.currentStep).toBe('summarize');
  });
});
