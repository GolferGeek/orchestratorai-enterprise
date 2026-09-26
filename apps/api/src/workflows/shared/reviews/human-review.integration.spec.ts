/**
 * A human gate end to end against the real tables: the worker runs a graph to
 * its gate and parks the run, two people answer at once (one wins, one gets a
 * conflict), the run resumes from the Postgres checkpointer and completes,
 * and re-running the gate node on resume creates no second review or task.
 *
 * Set HUMAN_REVIEW_TEST_DATABASE_URL to run it (skipped otherwise). Point it
 * at a database with no live workflow worker, or accept the small race the
 * runs integration spec describes. Rows are removed through their
 * conversations (runs and reviews cascade).
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Annotation, Command, END, START, StateGraph } from '@langchain/langgraph';
import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createExecutionContext, type ExecutionContext } from '@orchestrator-ai/transport-types';
import type { ConfigProvider } from '@orchestratorai/planes/config';
import { createCheckpointSaver } from '@orchestratorai/planes/checkpointer';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { PostgresDatabaseJobQueueService } from '@orchestratorai/planes/database/postgres-database-job-queue.service';
import type { WorkTaskSink } from '@orchestratorai/planes/work-routing';
import type { ObservabilityService } from '../services/observability.service';
import { WorkflowHandlerRegistry } from '../runs/workflow-handler.registry';
import { WorkflowRunsRepository } from '../runs/workflow-runs.repository';
import { WorkflowWorkerService } from '../runs/workflow-worker.service';
import { awaitHumanReview } from './await-human-review';
import { HumanReviewService } from './human-review.service';
import { HumanReviewsRepository } from './human-reviews.repository';
import type { HumanGate, HumanReviewResponse, ReviewResumeAction } from './human-review.types';

const url = process.env.HUMAN_REVIEW_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

const gate: HumanGate = {
  slug: 'approve-draft',
  kind: 'approval',
  allowedDecisions: ['approve', 'reject'],
  allowItemDecisions: false,
  onReject: 'rerun_stage',
  taskTitle: 'Approve the draft',
};

const State = Annotation.Root({
  executionContext: Annotation<ExecutionContext>(),
  draft: Annotation<string>(),
  response: Annotation<HumanReviewResponse | null>(),
  round: Annotation<number>(),
});

describeWithDb('human gate against Postgres', () => {
  const slug = `it-gate-${randomUUID().slice(0, 8)}`;
  const org = 'marketing';
  const created: string[] = [];
  const writes: string[] = [];
  const tasksCreated: string[] = [];
  const tasksClosed: string[] = [];
  let db: PostgresqlDatabaseService;
  let runs: WorkflowRunsRepository;
  let reviewsRepo: HumanReviewsRepository;
  let reviews: HumanReviewService;
  let saver: PostgresSaver;
  let worker: WorkflowWorkerService;
  let userId: string;

  async function sql(text: string, params: unknown[] = []) {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    runs = new WorkflowRunsRepository(db);
    reviewsRepo = new HumanReviewsRepository(db);
    const observability = {
      emitHitlWaiting: jest.fn(async () => undefined),
      emitHitlResumed: jest.fn(async () => undefined),
      emitFailed: jest.fn(async () => undefined),
    } as unknown as ObservabilityService;
    const tasks = {
      createTask: jest.fn(async () => {
        const id = randomUUID();
        tasksCreated.push(id);
        return { id, title: gate.taskTitle, provider: 'flow' as const };
      }),
      updateTaskStatus: jest.fn(async ({ taskId }: { taskId: string }) => {
        tasksClosed.push(taskId);
      }),
    } as unknown as WorkTaskSink;
    const config = {
      getRequired: (key: string) =>
        ({ PUBLIC_WEB_URL: 'https://app.example', CHECKPOINTER_PROVIDER: 'postgres' })[key] ??
        (() => {
          throw new Error(`Missing ${key}`);
        })(),
      getSecret: async () => url,
      getNumber: (key: string) =>
        ({
          WORKFLOW_WORKER_POLL_MS: 1000,
          WORKFLOW_WORKER_MAX_CONCURRENT: 1,
          WORKFLOW_WORKER_LEASE_SECONDS: 60,
        })[key],
    } as unknown as ConfigProvider;
    reviews = new HumanReviewService(reviewsRepo, tasks, observability, config);
    saver = (await createCheckpointSaver(config)) as PostgresSaver;

    const graph = new StateGraph(State)
      .addNode('write', () => {
        writes.push('write');
        return { draft: 'Q3 digest v1' };
      })
      .addNode('gate', async (state) => ({
        response: await awaitHumanReview(reviews, state.executionContext, gate, state.round, {
          draft: state.draft,
        }),
        round: state.round + 1,
      }))
      .addEdge(START, 'write')
      .addEdge('write', 'gate')
      .addEdge('gate', END)
      .compile({ checkpointer: saver });

    const handlers = new WorkflowHandlerRegistry();
    handlers.register({
      slug,
      run: async ({ run }) => {
        const config = { configurable: { thread_id: run.id } };
        const resume = run.pendingAction as ReviewResumeAction | null;
        await graph.invoke(
          resume
            ? new Command({ resume: resume.response })
            : { executionContext: run.executionContext, draft: '', response: null, round: 0 },
          config,
        );
        const snapshot = await graph.getState(config);
        if (snapshot.next.length > 0) return { kind: 'awaiting_review' };
        return { kind: 'completed', result: { response: snapshot.values.response } };
      },
    });
    worker = new WorkflowWorkerService(
      new PostgresDatabaseJobQueueService(db),
      runs,
      handlers,
      observability,
      {
        ...config,
        getRequired: (key: string) =>
          ({ WORKFLOW_WORKER_ENABLED: 'false', WORKFLOW_PROVIDER_CONCURRENCY: '{"ollama":2}' })[key] ??
          (() => {
            throw new Error(`Missing ${key}`);
          })(),
      } as unknown as ConfigProvider,
    );

    const users = await sql(`SELECT id FROM auth.users ORDER BY created_at LIMIT 1`);
    userId = String(users[0]?.id);
  });

  afterAll(async () => {
    if (created.length > 0) {
      await sql(`DELETE FROM public.conversations WHERE id = ANY($1::uuid[])`, [created]);
      await Promise.all(created.map((id) => saver.deleteThread(id)));
    }
    await saver?.end();
  });

  async function processUntil(runId: string, status: string) {
    let last = null;
    for (let i = 0; i < 20; i++) {
      await worker.tick();
      await worker.drain();
      last = await runs.getForOrg(org, runId);
      if (last?.status === status) return last;
    }
    throw new Error(
      `Run ${runId} never reached ${status}; last ${last?.status ?? 'missing'}: ${last?.error ?? ''}`,
    );
  }

  it('pauses at the gate, takes exactly one of two answers, and resumes to completion', async () => {
    const conversationId = randomUUID();
    created.push(conversationId);
    await sql(
      `INSERT INTO public.conversations
         (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'workflow', $4, now(), now(), now())`,
      [conversationId, userId, slug, org],
    );
    const context = createExecutionContext({
      orgSlug: org,
      userId,
      conversationId,
      agentSlug: slug,
      agentType: 'workflow',
      provider: 'ollama',
      model: 'qwen3:8b',
    });
    await runs.insertQueued({
      context,
      input: {},
      documents: [],
      accessControl: { mode: 'owner' },
      maxAttempts: 1,
    });

    await processUntil(conversationId, 'awaiting_review');
    const waiting = await reviews.getWaiting(conversationId);
    expect(waiting).toMatchObject({ gateSlug: gate.slug, round: 0, status: 'waiting' });
    expect(tasksCreated).toHaveLength(1);
    expect(writes).toEqual(['write']);

    // Another org cannot see or answer it.
    expect(await reviewsRepo.getForOrg('finance', waiting!.id)).toBeNull();
    await expect(
      reviews.respond({ ...context, orgSlug: 'finance' }, waiting!.id, {
        kind: 'decision',
        decision: { type: 'approve' },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });

    const outcomes = await Promise.allSettled([
      reviews.respond(context, waiting!.id, { kind: 'decision', decision: { type: 'approve' } }),
      reviews.respond(context, waiting!.id, {
        kind: 'decision',
        decision: { type: 'reject', feedback: 'Too long' },
      }),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const lost = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: 'conflict' });

    const requeued = await runs.getForOrg(org, conversationId);
    expect(requeued).toMatchObject({ status: 'queued', attempt: 0 });

    const finished = await processUntil(conversationId, 'completed');
    const answered = await reviewsRepo.getForOrg(org, waiting!.id);
    expect(finished.result).toEqual({ response: answered!.response });
    expect(writes).toEqual(['write']);
    expect(tasksCreated).toHaveLength(1);
    expect(tasksClosed).toEqual(tasksCreated);
    const all = await sql(`SELECT id FROM workflows.human_reviews WHERE run_id = $1`, [conversationId]);
    expect(all).toHaveLength(1);
  });
});
