/**
 * The decision-risk pilot end to end against the real tables: the corporate
 * risk scope, the risk-* agent definitions, work units, the mitigation gate,
 * the Postgres checkpointer and the worker, with a scripted model in place of
 * a provider (every answer is valid for its agent's contract).
 *
 * Set HUMAN_REVIEW_TEST_DATABASE_URL to run it (skipped otherwise). It runs
 * under a random workflow slug, so the live worker never claims its run, and
 * a tagged proposition, so its risk rows are its own; everything is removed
 * through the conversation and the risk subject.
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
import { AgentDefinitionsRepository, WorkflowAgentRuntime } from '../../shared/agents';
import type { RoleCallRequest, RunModelScope, WorkflowLlmClient } from '../../shared/models';
import { HumanReviewService } from '../../shared/reviews';
import { HumanReviewsRepository } from '../../shared/reviews/human-reviews.repository';
import { WorkflowHandlerRegistry, WorkflowRunsRepository } from '../../shared/runs';
import { WorkflowWorkerService } from '../../shared/runs/workflow-worker.service';
import type { ObservabilityService } from '../../shared/services/observability.service';
import { WorkUnitService } from '../../shared/work-units';
import { WorkUnitTraceReader } from '../../shared/work-units/work-unit-trace.reader';
import { WorkUnitsRepository } from '../../shared/work-units/work-units.repository';
import { IssueLedgerRepository } from '../../shared/ledger/issue-ledger.repository';
import { IssueLedgerService } from '../../shared/ledger';
import { createDecisionRiskGraph } from '../decision-risk.graph';
import { createDecisionRiskHandler } from '../decision-risk.handler';
import { RiskStoreService } from '../risk-store.service';

const url = process.env.HUMAN_REVIEW_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

/** A valid answer for each agent, by its llm_usage caller name. */
const ANSWERS: Record<string, string> = {
  'agent:risk-dimension-assessor': '{"score": 70, "confidence": 0.7, "reasoning": "Material exposure.", "evidence": ["the proposition"]}',
  'agent:risk-debate-defender': '{"summary": "Mostly sound.", "strongest_points": ["independent scores"], "conceded": []}',
  'agent:risk-debate-challenger': '{"challenges": [{"dimension": "legal", "claim": "Overstated.", "severity": "minor"}], "missed_risks": []}',
  'agent:risk-debate-arbiter': '{"final_score": 66, "adjustment": -4, "rationale": "Legal is overstated.", "would_change_my_mind": "A signed lease."}',
  'agent:risk-mitigation-proposer': '{"proposal": "Pilot with one client first.", "rationale": "Limits exposure.", "effort": "medium", "residual_score": 45}',
  'agent:risk-executive-summary': 'Proceed with conditions: the pilot reduces the main exposures.',
};

describeWithDb('decision-risk pilot against Postgres', () => {
  const tag = randomUUID().slice(0, 8);
  const slug = `it-decision-risk-${tag}`;
  const proposition = `Open a Berlin office in Q3 (spec ${tag})`;
  const conversationId = randomUUID();
  const calls: string[] = [];
  let db: PostgresqlDatabaseService;
  let saver: PostgresSaver;
  let runs: WorkflowRunsRepository;
  let reviews: HumanReviewService;
  let worker: WorkflowWorkerService;
  let ledger: IssueLedgerService;
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
        ({
          PUBLIC_WEB_URL: 'https://app.example',
          CHECKPOINTER_PROVIDER: 'postgres',
          WORKFLOW_WORKER_ENABLED: 'false',
          WORKFLOW_PROVIDER_CONCURRENCY: '{"openrouter":4}',
        })[key] ??
        (() => {
          throw new Error(`Missing ${key}`);
        })(),
      getSecret: async () => url,
      getNumber: (key: string) =>
        ({ WORKFLOW_WORKER_POLL_MS: 1000, WORKFLOW_WORKER_MAX_CONCURRENT: 1, WORKFLOW_WORKER_LEASE_SECONDS: 120 })[key],
    } as unknown as ConfigProvider;
    reviews = new HumanReviewService(new HumanReviewsRepository(db), tasks, noEvents, config);
    saver = (await createCheckpointSaver(config)) as PostgresSaver;
    const llm = {
      callForRole: async (_scope: RunModelScope, role: string, request: RoleCallRequest) => {
        calls.push(`${role}:${request.callerName}`);
        const content = ANSWERS[request.callerName];
        if (content === undefined) throw new Error(`No scripted answer for ${request.callerName}`);
        return {
          content,
          provider: 'openrouter',
          model: 'google/gemini-2.5-flash-lite',
          requestId: `it-${tag}-${calls.length}`,
          usage: { inputTokens: 10, outputTokens: 5 },
          thinking: null,
        };
      },
    } as unknown as WorkflowLlmClient;
    const units = new WorkUnitService(
      new WorkUnitsRepository(db),
      new WorkflowAgentRuntime(new AgentDefinitionsRepository(db), llm),
      reviews,
      noEvents,
    );
    ledger = new IssueLedgerService(new IssueLedgerRepository(db));
    const graph = createDecisionRiskGraph({ units, store: new RiskStoreService(db), ledger, checkpointer: saver });
    const handlers = new WorkflowHandlerRegistry();
    handlers.register({ ...createDecisionRiskHandler(graph), slug });
    worker = new WorkflowWorkerService(new PostgresDatabaseJobQueueService(db), runs, handlers, noEvents, config);
    reader = new WorkUnitTraceReader(db);

    const userId = String((await sql(`SELECT id FROM auth.users ORDER BY created_at LIMIT 1`))[0]?.id);
    await sql(
      `INSERT INTO public.conversations (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'workflow', 'corporate', now(), now(), now())`,
      [conversationId, userId, slug],
    );
    await runs.insertQueued({
      context: createExecutionContext({
        orgSlug: 'corporate',
        userId,
        conversationId,
        agentSlug: slug,
        agentType: 'workflow',
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash-lite',
      }),
      input: { proposition, background: '' },
      documents: [],
      modelProfile: {
        analyst: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
        red_team: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
        writer: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
      },
      accessControl: { mode: 'owner' },
      maxAttempts: 1,
    });
  });

  afterAll(async () => {
    await sql(
      `DELETE FROM risk.subjects WHERE id IN (SELECT subject_id FROM risk.assessments WHERE task_id = $1)`,
      [conversationId],
    );
    await sql(`DELETE FROM public.conversations WHERE id = $1`, [conversationId]);
    await saver.deleteThread(conversationId);
    await saver.end();
  });

  async function processUntil(status: string) {
    let last = null;
    for (let i = 0; i < 20; i++) {
      await worker.tick();
      await worker.drain();
      last = await runs.getForOrg('corporate', conversationId);
      if (last?.status === status) return last;
    }
    throw new Error(`Run never reached ${status}; last ${last?.status}: ${last?.error ?? ''}`);
  }

  it('assesses, debates, waits for the mitigation review, then finishes with the approved set', async () => {
    await processUntil('awaiting_review');
    const review = await reviews.getWaiting(conversationId);
    expect(review).toMatchObject({ gateSlug: 'approve-mitigations', kind: 'approval' });
    const items = (review!.payload as { items: Array<{ itemId: string }> }).items;
    expect(items).toHaveLength(10);
    const callsBeforeReview = calls.length;
    const raised = await ledger.view(conversationId);
    expect(raised.summary).toMatchObject({ total: 10, open: 10, byStatus: { identified: 10 } });
    expect(raised.issues.every((i) => i.stageSlug === 'risk-radar' && i.issueKey.startsWith('dimension:'))).toBe(true);

    const run = await runs.getForOrg('corporate', conversationId);
    await reviews.respond(run!.executionContext, review!.id, {
      kind: 'decision',
      decision: {
        type: 'modify',
        items: [
          { itemId: items[0]!.itemId, decision: 'reject' },
          { itemId: items[1]!.itemId, decision: 'modify', replacement: 'Insure the lease.' },
        ],
      },
    });

    const finished = await processUntil('completed');
    const result = finished.result as {
      overallScore: number;
      mitigations: Array<{ dimensionSlug: string; proposal: string }>;
      executiveSummary: string;
      debate: { originalScore: number; finalScore: number };
    };
    expect(result.debate).toEqual({ originalScore: 70, finalScore: 66, adjustment: -4 });
    expect(result.overallScore).toBe(66);
    expect(result.mitigations).toHaveLength(9);
    expect(result.mitigations.find((m) => m.dimensionSlug === items[1]!.itemId)?.proposal).toBe('Insure the lease.');
    expect(result.executiveSummary).toContain('Proceed with conditions');

    // Resuming ran only the summary: nothing before the gate ran twice.
    expect(calls.slice(callsBeforeReview)).toEqual(['writer:agent:risk-executive-summary']);
    expect(calls.filter((c) => c.startsWith('analyst:agent:risk-dimension-assessor'))).toHaveLength(10);

    const trace = await reader.units(conversationId);
    expect(trace.map((u) => [u.slug, u.pattern, u.status, u.participants.length])).toEqual([
      ['assess-dimensions', 'panel', 'completed', 10],
      ['red-team', 'red_blue', 'completed', 3],
      ['propose-mitigations', 'panel', 'completed', 10],
      ['review-mitigations', 'human', 'completed', 0],
      ['executive-summary', 'solo', 'completed', 1],
    ]);
    const stored = await sql(
      `SELECT count(*)::int AS n FROM risk.mitigations m JOIN risk.assessments a ON a.id = m.assessment_id WHERE a.task_id = $1`,
      [conversationId],
    );
    expect(stored[0]?.n).toBe(9);

    // The review settled every flagged dimension on the ledger.
    const settled = await ledger.view(conversationId);
    expect(settled.summary).toMatchObject({ total: 10, open: 9, byStatus: { accepted: 9, not_addressed: 1 } });
    const dropped = settled.issues.find((i) => i.status === 'not_addressed');
    expect(dropped?.issueKey).toBe(`dimension:${items[0]!.itemId}`);
    const events = await sql(
      `SELECT DISTINCT actor FROM workflows.issue_ledger_events WHERE run_id = $1 AND from_status IS NOT NULL`,
      [conversationId],
    );
    expect(events).toEqual([{ actor: 'review:approve-mitigations#0' }]);
  });
});
