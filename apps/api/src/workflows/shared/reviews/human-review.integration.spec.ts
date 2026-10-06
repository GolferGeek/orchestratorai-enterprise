/**
 * A human gate end to end against the real tables: the worker runs a graph to
 * its gate and parks the run, two people answer at once (one wins, one gets a
 * conflict), the run resumes from the Postgres checkpointer and completes,
 * and re-running the gate node on resume creates no second review or task.
 * An event gate parks a run the same way, ignores other events, and resumes
 * once when its event arrives twice at once. A checklist gate records each
 * tick, and of two people ticking its last lines at once exactly one resumes
 * the run.
 *
 * Set HUMAN_REVIEW_TEST_DATABASE_URL to run it (skipped otherwise). A live
 * worker on the same database leaves its run alone (it has no handler for
 * the spec's random slug). Rows are removed through their
 * conversations (runs and reviews cascade).
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Annotation, Command, END, START, StateGraph } from '@langchain/langgraph';
import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createExecutionContext, type ExecutionContext, type HumanReviewEvent } from '@orchestrator-ai/transport-types';
import type { ConfigProvider } from '@orchestratorai/planes/config';
import { createCheckpointSaver } from '@orchestratorai/planes/checkpointer';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { PostgresDatabaseJobQueueService } from '@orchestratorai/planes/database/postgres-database-job-queue.service';
import type { WorkTaskSink } from '@orchestratorai/planes/work-routing';
import type { ObservabilityService } from '../services/observability.service';
import { WorkflowHandlerRegistry } from '../runs/workflow-handler.registry';
import { WorkflowRunsRepository } from '../runs/workflow-runs.repository';
import { WorkflowWorkerService } from '../runs/workflow-worker.service';
import { awaitEvent, awaitHumanReview } from './await-human-review';
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

const pickup: Extract<HumanGate, { kind: 'event' }> = {
  slug: 'pickup',
  kind: 'event',
  event: 'carrier.pickup',
  waitingFor: 'carrier pickup',
};

const packing: HumanGate = { slug: 'packing', kind: 'checklist', taskTitle: 'Pack order 1042' };
const packingLines = {
  orderId: '1042',
  items: [
    { itemId: 'line-1', label: 'Pack 2 x anti-GFAP (cold)' },
    { itemId: 'ice', label: 'Ice packed properly' },
    { itemId: 'pickup', label: 'Call FedEx for pickup' },
  ],
};

const PackingState = Annotation.Root({
  executionContext: Annotation<ExecutionContext>(),
  response: Annotation<HumanReviewResponse | null>(),
});

const PickupState = Annotation.Root({
  executionContext: Annotation<ExecutionContext>(),
  event: Annotation<HumanReviewEvent | null>(),
});

const State = Annotation.Root({
  executionContext: Annotation<ExecutionContext>(),
  draft: Annotation<string>(),
  response: Annotation<HumanReviewResponse | null>(),
  round: Annotation<number>(),
});

describeWithDb('human gate against Postgres', () => {
  const slug = `it-gate-${randomUUID().slice(0, 8)}`;
  const pickupSlug = `it-wait-${randomUUID().slice(0, 8)}`;
  const packingSlug = `it-pack-${randomUUID().slice(0, 8)}`;
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
      emitStarted: jest.fn(async () => undefined),
      emitProgress: jest.fn(async () => undefined),
      emitCompleted: jest.fn(async () => undefined),
      emitRetrying: jest.fn(async () => undefined),
      emitCanceled: jest.fn(async () => undefined),
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

    const pickupGraph = new StateGraph(PickupState)
      .addNode('wait', async (state) => ({
        event: await awaitEvent(reviews, state.executionContext, pickup, 0, { tracking: '1Z999' }),
      }))
      .addEdge(START, 'wait')
      .addEdge('wait', END)
      .compile({ checkpointer: saver });

    const packingGraph = new StateGraph(PackingState)
      .addNode('pack', async (state) => ({
        response: await awaitHumanReview(reviews, state.executionContext, packing, 0, packingLines),
      }))
      .addEdge(START, 'pack')
      .addEdge('pack', END)
      .compile({ checkpointer: saver });

    const handlers = new WorkflowHandlerRegistry();
    handlers.register({
      slug: packingSlug,
      run: async ({ run }) => {
        const config = { configurable: { thread_id: run.id } };
        const resume = run.pendingAction as ReviewResumeAction | null;
        await packingGraph.invoke(
          resume ? new Command({ resume: resume.response }) : { executionContext: run.executionContext, response: null },
          config,
        );
        const snapshot = await packingGraph.getState(config);
        if (snapshot.next.length > 0) return { kind: 'awaiting_review' };
        return { kind: 'completed', result: { response: snapshot.values.response } };
      },
    });
    handlers.register({
      slug: pickupSlug,
      run: async ({ run }) => {
        const config = { configurable: { thread_id: run.id } };
        const resume = run.pendingAction as ReviewResumeAction | null;
        await pickupGraph.invoke(
          resume ? new Command({ resume: resume.response }) : { executionContext: run.executionContext, event: null },
          config,
        );
        const snapshot = await pickupGraph.getState(config);
        if (snapshot.next.length > 0) return { kind: 'awaiting_review' };
        return { kind: 'completed', result: { event: snapshot.values.event } };
      },
    });
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

    await db.onModuleDestroy();
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

  async function queueRun(workflowSlug: string): Promise<ExecutionContext> {
    const conversationId = randomUUID();
    created.push(conversationId);
    await sql(
      `INSERT INTO public.conversations
         (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'workflow', $4, now(), now(), now())`,
      [conversationId, userId, workflowSlug, org],
    );
    const context = createExecutionContext({
      orgSlug: org,
      userId,
      conversationId,
      agentSlug: workflowSlug,
      agentType: 'workflow',
      provider: 'ollama',
      model: 'qwen3:8b',
    });
    await runs.insertQueued({
      context,
      input: {},
      documents: [],
      modelProfile: {},
      accessControl: { mode: 'owner' },
      maxAttempts: 1,
    });
    return context;
  }

  it('pauses at the gate, takes exactly one of two answers, and resumes to completion', async () => {
    const context = await queueRun(slug);
    const { conversationId } = context;

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

  it('waits at an event gate until its event, which resumes the run once', async () => {
    const context = await queueRun(pickupSlug);
    const { conversationId } = context;
    const tasksBefore = tasksCreated.length;

    await processUntil(conversationId, 'awaiting_review');
    const waiting = await reviews.getWaiting(conversationId);
    expect(waiting).toMatchObject({
      kind: 'event',
      gateSlug: 'pickup',
      payload: { event: 'carrier.pickup', waitingFor: 'carrier pickup', detail: { tracking: '1Z999' } },
    });
    expect(tasksCreated).toHaveLength(tasksBefore);

    // Nobody answers it, and another event leaves it waiting.
    await expect(
      reviews.respond(context, waiting!.id, { kind: 'answer', answer: { text: 'picked up', turn: 0 } }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(await reviews.deliverEvent(context, { name: 'carrier.delivered', payload: {} })).toEqual({
      resumed: false,
      reason: 'the run waits for carrier.pickup, not carrier.delivered',
    });

    const pickedUp = { name: 'carrier.pickup', payload: { tracking: '1Z999', at: '2026-10-06T15:00:00Z' } };
    const deliveries = await Promise.all([reviews.deliverEvent(context, pickedUp), reviews.deliverEvent(context, pickedUp)]);
    expect(deliveries.filter((d) => d.resumed)).toHaveLength(1);

    const finished = await processUntil(conversationId, 'completed');
    expect(finished.result).toEqual({ event: pickedUp });
    const [row] = await sql(`SELECT responded_by FROM workflows.human_reviews WHERE id = $1`, [waiting!.id]);
    expect(row?.responded_by).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('records each tick, and of two last ticks at once exactly one resumes the run', async () => {
    const context = await queueRun(packingSlug);
    const { conversationId } = context;

    await processUntil(conversationId, 'awaiting_review');
    const waiting = await reviews.getWaiting(conversationId);
    expect(waiting).toMatchObject({ kind: 'checklist', ticks: {} });

    expect(await reviews.tick(context, waiting!.id, 'line-1', true)).toEqual({ resumed: false });
    expect(await reviews.tick(context, waiting!.id, 'ice', true)).toEqual({ resumed: false });
    expect(await reviews.tick(context, waiting!.id, 'ice', false)).toEqual({ resumed: false });
    const partway = await reviews.getWaiting(conversationId);
    expect(Object.keys(partway!.ticks)).toEqual(['line-1']);
    expect(partway!.ticks['line-1']).toMatchObject({ by: userId, at: expect.any(String) });

    const lastTwo = await Promise.all([
      reviews.tick(context, waiting!.id, 'ice', true),
      reviews.tick(context, waiting!.id, 'pickup', true),
    ]);
    expect(lastTwo.filter((t) => t.resumed)).toHaveLength(1);
    await expect(reviews.tick(context, waiting!.id, 'ice', false)).rejects.toMatchObject({ code: 'conflict' });

    const finished = await processUntil(conversationId, 'completed');
    const response = (finished.result as { response: { kind: string; ticks: Array<{ itemId: string; by: string }> } }).response;
    expect(response.kind).toBe('checklist');
    expect(response.ticks.map((t) => t.itemId)).toEqual(['line-1', 'ice', 'pickup']);
    expect(response.ticks.every((t) => t.by === userId)).toBe(true);
  });
});
