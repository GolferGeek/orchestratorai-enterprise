/**
 * The marketing swarm end to end against the real tables: the seeded
 * writers, editors, evaluators, facets and weights, the swarm-writer and
 * swarm-coach definitions, work units, the pick gate, the Postgres
 * checkpointer and the worker. The model and Jev are scripted: a draft
 * containing GOOD scores well on every facet, anything else badly.
 *
 * Set HUMAN_REVIEW_TEST_DATABASE_URL to run it. It runs under a random
 * workflow slug, so the live worker never claims it; everything is removed
 * through the conversation.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createExecutionContext } from '@orchestrator-ai/transport-types';
import type { ConfigProvider } from '@orchestratorai/planes/config';
import { createCheckpointSaver } from '@orchestratorai/planes/checkpointer';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { PostgresDatabaseJobQueueService } from '@orchestratorai/planes/database/postgres-database-job-queue.service';
import type { WorkTaskSink } from '@orchestratorai/planes/work-routing';
import type { DecisionsService } from '../../../decisions';
import { AgentDefinitionsRepository, WorkflowAgentRuntime } from '../../shared/agents';
import type { RoleCallRequest, RunModelScope, WorkflowLlmClient } from '../../shared/models';
import { IssueLedgerService } from '../../shared/ledger';
import { IssueLedgerRepository } from '../../shared/ledger/issue-ledger.repository';
import { WorkflowRestartService } from '../../shared/restarts';
import { HumanReviewService } from '../../shared/reviews';
import { HumanReviewsRepository } from '../../shared/reviews/human-reviews.repository';
import { WorkflowHandlerRegistry, WorkflowRunsRepository, createGraphHandler } from '../../shared/runs';
import { WorkflowWorkerService } from '../../shared/runs/workflow-worker.service';
import type { ObservabilityService } from '../../shared/services/observability.service';
import { WorkUnitService } from '../../shared/work-units';
import { WorkUnitTraceReader } from '../../shared/work-units/work-unit-trace.reader';
import { WorkUnitsRepository } from '../../shared/work-units/work-units.repository';
import { createSwarmGraph } from '../swarm.graph';
import { parseSwarmInput } from '../swarm.input';
import { swarmResult, type SwarmResult } from '../swarm.result';
import type { SwarmState } from '../swarm.state';
import { SwarmStoreService } from '../swarm-store.service';

const url = process.env.HUMAN_REVIEW_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('marketing swarm pilot against Postgres', () => {
  const tag = randomUUID().slice(0, 8);
  const slug = `it-swarm-${tag}`;
  const conversationId: string = randomUUID();
  const calls: string[] = [];
  const models: string[] = [];
  const checked: string[] = [];
  let db: PostgresqlDatabaseService;
  let saver: PostgresSaver;
  let runs: WorkflowRunsRepository;
  let reviews: HumanReviewService;
  let worker: WorkflowWorkerService;
  let reader: WorkUnitTraceReader;

  async function sql(text: string, params: unknown[] = []) {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    runs = new WorkflowRunsRepository(db);
    const noEvents = new Proxy({}, { get: () => async () => undefined }) as unknown as ObservabilityService;
    const tasks = {
      createTask: async () => ({ id: randomUUID(), title: 't', provider: 'flow' as const }),
      updateTaskStatus: async () => undefined,
    } as unknown as WorkTaskSink;
    const config = {
      getRequired: (key: string) =>
        ({ PUBLIC_WEB_URL: 'https://app.example', CHECKPOINTER_PROVIDER: 'postgres', WORKFLOW_WORKER_ENABLED: 'false', WORKFLOW_PROVIDER_CONCURRENCY: '{"openrouter":4}' })[key] ??
        (() => {
          throw new Error(`Missing ${key}`);
        })(),
      getSecret: async () => url,
      getNumber: (key: string) => ({ WORKFLOW_WORKER_POLL_MS: 1000, WORKFLOW_WORKER_MAX_CONCURRENT: 1, WORKFLOW_WORKER_LEASE_SECONDS: 120 })[key],
    } as unknown as ConfigProvider;
    reviews = new HumanReviewService(new HumanReviewsRepository(db), tasks, noEvents, config);
    saver = (await createCheckpointSaver(config)) as PostgresSaver;

    // The creative writer's first draft is weak; its rewrite and the technical writer's draft are GOOD.
    const llm = {
      callForRole: async (scope: RunModelScope, role: string, request: RoleCallRequest) => {
        calls.push(`${role}:${request.callerName}`);
        models.push(`${request.callerName}=${scope.modelProfile[role]!.provider}/${scope.modelProfile[role]!.model}`);
        let content: string;
        if (request.callerName === 'agent:swarm-writer') {
          const creative = request.systemPrompt.includes('creative marketing writer');
          const revising = !request.userMessage.includes('"revision": null');
          content = creative && !revising ? 'A draft about cloud costs.' : `GOOD draft by ${creative ? 'creative' : 'technical'}${revising ? ' (revised)' : ''}.`;
        } else if (request.callerName === 'agent:swarm-coach') {
          content = '{"feedback": "Open with the reader\'s own problem and name the trial."}';
        } else {
          throw new Error(`No scripted answer for ${request.callerName}`);
        }
        return { content, provider: 'openrouter', model: 'scripted', requestId: `it-${tag}-${calls.length}`, usage: { inputTokens: 10, outputTokens: 5 }, thinking: null };
      },
    } as unknown as WorkflowLlmClient;
    const decisions = {
      check: async (rubric: string, inputs: Record<string, unknown>) => {
        const text = String(inputs.draft ?? inputs.copy);
        checked.push(rubric);
        const good = text.includes('GOOD');
        const question = rubric === 'claims-substantiated' ? 'unsupported' : 'meets';
        const p = question === 'unsupported' ? (good ? 0.05 : 0.8) : good ? 0.9 : 0.2;
        return { rubric, version: 1, decision: good ? 'pass' : 'block', answers: { [question]: { type: 'noul', noul: p } }, model: 'scripted', usage: { input_tokens: 1, output_tokens: 0 } };
      },
    } as unknown as DecisionsService;
    const units = new WorkUnitService(new WorkUnitsRepository(db), new WorkflowAgentRuntime(new AgentDefinitionsRepository(db), llm), reviews, noEvents, decisions);
    const graph = createSwarmGraph({ units, store: new SwarmStoreService(db), checkpointer: saver });
    const handlers = new WorkflowHandlerRegistry();
    handlers.register(
      createGraphHandler<SwarmState>({
        slug,
        graph,
        restarts: new WorkflowRestartService(new IssueLedgerService(new IssueLedgerRepository(db))),
        start: (run) => ({ input: parseSwarmInput(run.input) }),
        result: swarmResult,
      }),
    );
    worker = new WorkflowWorkerService(new PostgresDatabaseJobQueueService(db), runs, handlers, noEvents, config);
    reader = new WorkUnitTraceReader(db);

    const userId = String((await sql(`SELECT id FROM auth.users ORDER BY created_at LIMIT 1`))[0]?.id);
    await sql(
      `INSERT INTO public.conversations (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'workflow', 'marketing', now(), now(), now())`,
      [conversationId, userId, slug],
    );
    await runs.insertQueued({
      context: createExecutionContext({ orgSlug: 'marketing', userId, conversationId, agentSlug: slug, agentType: 'workflow', provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' }),
      input: {
        contentType: 'linkedin-post',
        brief: { topic: `Spendline launch ${tag}`, audience: 'CFOs at SaaS companies', goal: 'Book a demo', keyPoints: ['free 14-day trial'], brandVoice: 'warm, direct', keywords: ['cloud cost'] },
        evidence: null,
        writers: ['writer-creative', 'writer-technical'],
        editors: ['editor-brand', 'editor-engagement'],
        evaluators: ['evaluator-quality', 'evaluator-creativity'],
        maxEditCycles: 1,
      },
      documents: [],
      modelProfile: { coach: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' } },
      accessControl: { mode: 'org' },
      maxAttempts: 1,
    });
  });

  afterAll(async () => {
    await sql(`DELETE FROM public.conversations WHERE id = $1`, [conversationId]);
    await saver.deleteThread(conversationId);
    await saver.end();

    await db.onModuleDestroy();
  });

  async function processUntil(status: string) {
    let last = null;
    for (let i = 0; i < 20; i++) {
      await worker.tick();
      await worker.drain();
      last = await runs.getForOrg('marketing', conversationId);
      if (last?.status === status) return last;
    }
    throw new Error(`Run never reached ${status}; last ${last?.status}: ${last?.error ?? ''}`);
  }

  it('drafts, scores, coaches the weak draft once, ranks, and waits for a person to pick', async () => {
    const waiting = await processUntil('awaiting_review');

    // Each writer on its own model; the coach on the run's coach model.
    expect(models).toEqual(
      expect.arrayContaining([
        'agent:swarm-writer=openai/gpt-4o',
        'agent:swarm-writer=xai/grok-3',
        'agent:swarm-coach=openrouter/google/gemini-2.5-flash-lite',
      ]),
    );
    expect(calls.filter((c) => c.endsWith('swarm-writer'))).toHaveLength(3);
    expect(calls.filter((c) => c.endsWith('swarm-coach'))).toHaveLength(1);
    // Length is measured in code; every other facet went to Jev, per draft version (3 versions).
    expect(checked).toHaveLength(3 * 12);
    expect(checked).not.toContain('right-length');

    const trace = await reader.units(conversationId);
    expect(trace.map((u) => [u.slug, u.pattern, u.status])).toEqual(
      expect.arrayContaining([
        ['write', 'panel', 'completed'],
        ['check-0-writer-creative', 'check', 'completed'],
        ['check-0-writer-technical', 'check', 'completed'],
        ['coach-0', 'panel', 'completed'],
        ['rewrite-1', 'panel', 'completed'],
        ['check-1-writer-creative', 'check', 'completed'],
      ]),
    );

    // The board the page shows while it waits.
    const live = waiting.live as { drafts: Array<{ writer: string; version: number; status: string }>; standings: unknown[] };
    expect(live.drafts.map((d) => [d.writer, d.version, d.status])).toEqual([
      ['writer-creative', 2, 'final'],
      ['writer-technical', 1, 'final'],
    ]);
    expect(live.standings).toHaveLength(2);

    const review = (await reviews.getWaiting(conversationId))!;
    const items = (review.payload as { items: Array<{ itemId: string; place: number; text: string }> }).items;
    expect(items.map((i) => i.place)).toEqual([1, 2]);
    expect(items.every((i) => i.text.startsWith('GOOD'))).toBe(true);

    // Keep the runner-up, rewritten: drop the leader.
    await reviews.respond(waiting.executionContext, review.id, {
      kind: 'decision',
      decision: { type: 'modify', items: [{ itemId: items[0]!.itemId, decision: 'reject' }, { itemId: items[1]!.itemId, decision: 'modify', replacement: 'Polished by a person.' }] },
    });
    const done = await processUntil('completed');
    const result = done.result as unknown as SwarmResult;
    expect(result.winner).toEqual({ writer: items[1]!.itemId, text: 'Polished by a person.', edited: true });
    expect(result.drafts.find((d) => d.writer === 'writer-creative')!.versions.map((v) => [v.n, v.feedback !== null])).toEqual([
      [1, true],
      [2, false],
    ]);
    // Resuming ran no model again; the pick is on the trace.
    expect(calls).toHaveLength(4);
    expect((await reader.units(conversationId)).map((u) => [u.slug, u.status])).toContainEqual(['pick-winner', 'completed']);
  });
});
